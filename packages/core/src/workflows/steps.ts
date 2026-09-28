import { Agent } from '@mastra/core/agent';
import { getDb, updateProject, updateRun } from '@masterai/db';
import { buildAgent, customAgentsForPhase, loadAgentConfigs, type ResolvedAgentConfig } from '../agents/factory';
import type { Phase } from '../agents/roles';
import { evaluateGates } from '../gates/evaluate';
import {
  applyEscalation,
  decideNext,
  DEFAULT_LOOP_POLICY,
  type LoopState,
} from '../gates/loop-policy';
import { installScanners, runCodeChecks, runStagingChecks } from '../gates/runner';
import { DEFAULT_QUALITY_POLICY, type CheckResult } from '../gates/types';
import { loadFigmaTools } from '../integrations/figma';
import { commitAndPush, ensureRepository, openOrUpdatePullRequest } from '../integrations/github';
import { notify } from '../integrations/notify';
import { deployProduction, deployStaging, ensureVercelProject, healthCheck, rollbackProduction, setEnvVars } from '../integrations/vercel';
import { provisionDatabase } from '../integrations/neon';
import { emit, loadRuntime, requestContextFor, type RunRuntime } from '../lib/runtime';
import { pickTools } from '../tools';
import type { ChainData } from './schemas';
import { planSchema, reviewSchema, specSchema } from './schemas';

const WORK_BRANCH = 'masterai/build';

async function setupContext(data: ChainData): Promise<{ runtime: RunRuntime; configs: Map<string, ResolvedAgentConfig> }> {
  const runtime = await loadRuntime(data.tenantId, data.runId);
  const configs = await loadAgentConfigs(data.tenantId);
  return { runtime, configs };
}

function agentFor(
  configs: Map<string, ResolvedAgentConfig>,
  slug: string,
  runtime: RunRuntime,
  opts: Parameters<typeof buildAgent>[2] = {},
): Agent {
  const config = configs.get(slug);
  if (!config) throw new Error(`Agent « ${slug} » introuvable.`);
  return buildAgent(config, runtime, opts);
}

async function log(runtime: RunRuntime, phase: Phase, message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info', agent?: string) {
  await emit(runtime.runId, phase, message, { level, agent });
}

// --- Étape 1 : analyse -----------------------------------------------------

export async function analyzeSpec(data: ChainData): Promise<ChainData> {
  const { runtime, configs } = await setupContext(data);
  await updateRun(getDb(), data.runId, { status: 'running', phase: 'analyse', startedAt: new Date() });
  await log(runtime, 'analyse', "Analyse du cahier des charges", 'info', 'analyst');
  const agent = agentFor(configs, 'analyst', runtime);
  const { object } = await agent.generate(
    [{ role: 'user', content: `Cahier des charges :\n\n${data.specText}` }],
    { requestContext: requestContextFor(data.runId), structuredOutput: { schema: specSchema, errorStrategy: 'strict' }, maxSteps: 4 },
  );
  const spec = object!;
  await log(runtime, 'analyse', `${spec.userStories.length} user stories, cibles : ${spec.targets.join(', ')}`, 'success', 'analyst');
  return { ...data, spec, operations: [...data.operations, `Analyse : ${spec.userStories.length} user stories.`] };
}

// --- Étape 2 : architecture ------------------------------------------------

export async function planArchitecture(data: ChainData): Promise<ChainData> {
  const { runtime, configs } = await setupContext(data);
  await updateRun(getDb(), data.runId, { phase: 'architecture' });
  await log(runtime, 'architecture', "Conception de l'architecture", 'info', 'architect');
  const agent = agentFor(configs, 'architect', runtime);
  const { object } = await agent.generate(
    [{ role: 'user', content: `Spécifications :\n${JSON.stringify(data.spec, null, 2)}` }],
    { requestContext: requestContextFor(data.runId), structuredOutput: { schema: planSchema, errorStrategy: 'strict' }, maxSteps: 4 },
  );
  const plan = object!;
  await log(runtime, 'architecture', `${plan.tasks.length} tâches planifiées`, 'success', 'architect');
  return { ...data, plan, operations: [...data.operations, `Architecture : ${plan.tasks.length} tâches.`] };
}

// --- Étape 3 : dépôt + base + design --------------------------------------

export async function bootstrapProject(data: ChainData): Promise<ChainData> {
  const { runtime, configs } = await setupContext(data);
  const db = getDb();
  await updateRun(db, data.runId, { phase: 'setup' });
  await log(runtime, 'setup', 'Préparation du dépôt et de la base de données', 'info', 'devops');

  const repo = await ensureRepository(runtime, {
    sourceRepo: data.sourceRepo,
    description: data.spec?.summary.slice(0, 300) ?? data.projectName,
  });
  const database = await provisionDatabase(runtime);
  const vercel = await ensureVercelProject(runtime);
  await setEnvVars(runtime, vercel.id, [
    { key: 'DATABASE_URL', value: database.productionUrl, target: ['production'] },
    { key: 'DATABASE_URL', value: database.stagingUrl, target: ['preview', 'development'] },
  ]);
  runtime.stagingUrl = undefined;

  await updateProject(db, data.runId ? data.projectId : data.projectId, { repoUrl: repo.htmlUrl, status: 'running' });
  await log(runtime, 'setup', `Dépôt ${repo.fullName} et base Neon prêts`, 'success', 'devops');

  // Design UX/UI (avec Figma si connecté).
  await updateRun(db, data.runId, { phase: 'design' });
  const figma = await loadFigmaTools(runtime);
  await log(runtime, 'design', figma ? 'Maquettes Figma' : 'Design system dans le dépôt', 'info', 'uxui');
  const designer = agentFor(configs, 'uxui', runtime, { extraTools: figma?.tools });
  await designer.generate(
    [{ role: 'user', content: `Conçois l'UX/UI pour :\n${JSON.stringify(data.spec, null, 2)}\n\nÉcris les fichiers dans design/ puis commite sur la branche ${WORK_BRANCH}.` }],
    { requestContext: requestContextFor(data.runId), maxSteps: 30 },
  );
  await figma?.close();
  await log(runtime, 'design', 'Design terminé', 'success', 'uxui');

  return {
    ...data,
    repo,
    vercelProject: vercel.name,
    operations: [...data.operations, `Dépôt ${repo.fullName}, base Neon, design.`],
  };
}

// --- Étape 4 : construction initiale (supervisor) --------------------------

export async function buildProject(data: ChainData): Promise<ChainData> {
  const { runtime, configs } = await setupContext(data);
  await updateRun(getDb(), data.runId, { phase: 'build' });
  await log(runtime, 'build', 'Développement des tâches', 'info', 'orchestrator');

  const targets = new Set(data.spec?.targets ?? ['web']);
  const subSlugs = ['backend', 'frontend', 'fullstack', ...(targets.has('mobile') ? ['mobile'] : [])];
  const subAgents = Object.fromEntries(subSlugs.map((s) => [s, agentFor(configs, s, runtime)]));
  for (const custom of customAgentsForPhase(configs, 'build')) subAgents[custom.slug] = agentFor(configs, custom.slug, runtime);

  const orchestrator = agentFor(configs, 'orchestrator', runtime, {
    subAgents,
    extraTools: pickTools(['sandbox_exec', 'sandbox_read_file', 'sandbox_list_files']),
  });
  await orchestrator.generate(
    [
      {
        role: 'user',
        content:
          `Implémente le projet selon ce plan. Délègue chaque tâche au bon agent, dans l'ordre des dépendances. ` +
          `Chaque agent écrit du code ET ses tests, puis commite sur la branche ${WORK_BRANCH}. ` +
          `Le dépôt doit respecter le contrat (scripts pnpm, couverture ≥ 90 %).\n\n${JSON.stringify(data.plan, null, 2)}`,
      },
    ],
    { requestContext: requestContextFor(data.runId), maxSteps: 120 },
  );

  const prUrl = await openOrUpdatePullRequest(runtime, data.repo!.fullName, {
    head: WORK_BRANCH,
    base: 'main',
    title: `MasterAI : ${data.projectName}`,
    body: `Généré automatiquement par MasterAI.\n\n${data.spec?.summary ?? ''}`,
  });
  await log(runtime, 'build', `PR ouverte : ${prUrl}`, 'success', 'orchestrator');
  return { ...data, repo: { ...data.repo!, prUrl }, operations: [...data.operations, 'Construction initiale, PR ouverte.'] };
}

// --- Étape 5 : boucle de correction (code) ---------------------------------

function toLoopState(data: ChainData): LoopState {
  return { iteration: data.loop.iteration, signatures: data.loop.signatures, escalationLevel: data.loop.escalationLevel };
}

function serialize(checks: CheckResult[]) {
  return checks.map((c) => ({ id: c.id, passed: c.passed, summary: c.summary, details: c.details }));
}

/** Un tour de boucle : exécuter les contrôles de code, corriger si besoin. */
export async function codeQualityIteration(data: ChainData): Promise<ChainData> {
  const { runtime, configs } = await setupContext(data);
  await updateRun(getDb(), data.runId, { phase: 'review', iteration: data.loop.iteration + 1 });
  if (data.loop.iteration === 0) await installScanners(runtime);

  await log(runtime, 'review', `Contrôles qualité (itération ${data.loop.iteration + 1})`, 'info', 'reviewer');
  const checks = await runCodeChecks(runtime, DEFAULT_QUALITY_POLICY);

  // Revue de code par l'agent (remarques bloquantes ajoutées aux contrôles).
  const reviewer = agentFor(configs, 'reviewer', runtime);
  const { object: review } = await reviewer.generate(
    [{ role: 'user', content: `Relis le diff de la branche ${WORK_BRANCH} par rapport à main (utilise sandbox_exec « git diff main...HEAD »).` }],
    { requestContext: requestContextFor(data.runId), structuredOutput: { schema: reviewSchema, errorStrategy: 'fallback', fallbackValue: { findings: [] } }, maxSteps: 12 },
  );
  const reviewFindings = (review?.findings ?? []).map((f) => ({ source: 'review' as const, severity: f.severity, title: `${f.file}${f.line ? `:${f.line}` : ''} ${f.title}`, detail: f.fix }));
  checks.push({
    id: 'review',
    passed: !reviewFindings.some((f) => DEFAULT_QUALITY_POLICY.blockingReviewSeverities.includes(f.severity)),
    summary: reviewFindings.length ? `${reviewFindings.length} remarque(s) de revue.` : 'Revue sans remarque bloquante.',
    findings: reviewFindings,
  });

  const evaluation = evaluateGates(checks, DEFAULT_QUALITY_POLICY);
  let loop = { ...data.loop, iteration: data.loop.iteration + 1, signatures: [...data.loop.signatures, evaluation.signature] };
  const decision = decideNext(toLoopState({ ...data, loop }), evaluation, DEFAULT_LOOP_POLICY);

  if (decision.action === 'done') {
    await log(runtime, 'review', 'Toutes les portes qualité sont vertes', 'success', 'reviewer');
    return { ...data, loop: { ...loop, done: true }, lastChecks: serialize(checks) };
  }
  if (decision.action === 'abort') {
    await log(runtime, 'review', `Arrêt de la boucle : ${decision.reason}`, 'error', 'reviewer');
    return { ...data, loop: { ...loop, done: true, aborted: decision.reason }, lastChecks: serialize(checks) };
  }

  let escalationLevel = data.loop.escalationLevel;
  if (decision.action === 'escalate') {
    const st = applyEscalation(toLoopState({ ...data, loop }), decision.escalationLevel);
    escalationLevel = st.escalationLevel;
    loop = { ...loop, signatures: st.signatures, escalationLevel };
    await log(runtime, 'review', decision.reason, 'warning', 'orchestrator');
  }

  // Correction : l'orchestrateur délègue selon la nature des échecs.
  const failures = evaluation.failures
    .map((f) => `- [${f.id}] ${f.summary}${f.details ? `\n${f.details.slice(0, 2000)}` : ''}${(f.findings ?? []).map((x) => `\n  · ${x.severity} ${x.title}${x.detail ? ` → ${x.detail}` : ''}`).join('')}`)
    .join('\n');
  await log(runtime, 'build', `Correction de ${evaluation.failures.length} échec(s)`, 'info', 'orchestrator');

  const subSlugs = ['backend', 'frontend', 'fullstack', 'qa', ...(data.spec?.targets.includes('mobile') ? ['mobile'] : [])];
  const subAgents = Object.fromEntries(subSlugs.map((s) => [s, agentFor(configs, s, runtime, { escalationLevel })]));
  const orchestrator = agentFor(configs, 'orchestrator', runtime, {
    escalationLevel,
    subAgents,
    extraTools: pickTools(['sandbox_exec', 'sandbox_read_file', 'sandbox_list_files']),
  });
  await orchestrator.generate(
    [{ role: 'user', content: `Les portes qualité suivantes échouent. Délègue les corrections aux bons agents, qui corrigent le code et les tests puis commitent sur ${WORK_BRANCH}. Interdit d'affaiblir un test.\n\n${failures}` }],
    { requestContext: requestContextFor(data.runId), maxSteps: 100 },
  );

  return { ...data, loop, lastChecks: serialize(checks) };
}

// --- Étape 6 : staging + déploiement production ----------------------------

export async function deployAndVerify(data: ChainData): Promise<ChainData> {
  const { runtime } = await setupContext(data);
  const db = getDb();

  if (data.loop.aborted) {
    await updateRun(db, data.runId, { phase: 'deploy' });
    await log(runtime, 'deploy', 'Portes qualité non satisfaites : pas de déploiement', 'error', 'devops');
    return { ...data, outcome: 'failed' };
  }

  await updateRun(db, data.runId, { phase: 'deploy' });
  await commitAndPush(runtime, 'chore: staging deploy', WORK_BRANCH).catch(() => undefined);
  await log(runtime, 'deploy', 'Déploiement en staging', 'info', 'devops');
  const stagingUrl = await deployStaging(runtime, data.vercelProject!);
  runtime.stagingUrl = stagingUrl;
  await updateProject(db, data.projectId, { stagingUrl, status: 'staging' });
  await log(runtime, 'deploy', `Staging en ligne : ${stagingUrl}`, 'success', 'devops');

  // Contrôles sur le staging (santé, Lighthouse si web).
  await updateRun(db, data.runId, { phase: 'security' });
  const hasWeb = data.spec?.targets.includes('web') ?? true;
  const stagingChecks = await runStagingChecks(runtime, DEFAULT_QUALITY_POLICY, { stagingUrl, hasWeb });
  const evaluation = evaluateGates(
    stagingChecks.filter((c) => c.id !== 'smoke' || !c.passed),
    { ...DEFAULT_QUALITY_POLICY, requiredChecks: [] },
  );
  if (!evaluation.passed) {
    await log(runtime, 'security', `Staging non conforme : ${evaluation.failures.map((f) => f.summary).join(' ; ')}`, 'error', 'security');
    await notify(runtime, { subject: `MasterAI — ${data.projectName} bloqué en staging`, text: evaluation.failures.map((f) => f.summary).join('\n') });
    return { ...data, stagingUrl, outcome: 'staging-only', lastChecks: serialize(stagingChecks) };
  }

  // Toutes les barrières vertes → promotion en production, avec rollback si le contrôle de santé échoue.
  await log(runtime, 'deploy', 'Promotion en production', 'info', 'devops');
  const productionUrl = await deployProduction(runtime, data.vercelProject!);
  const health = await healthCheck(productionUrl);
  if (!health.healthy) {
    await rollbackProduction(runtime);
    await log(runtime, 'deploy', `Contrôle de santé échoué (dernier statut ${health.lastStatus}) : rollback effectué`, 'error', 'devops');
    await notify(runtime, { subject: `MasterAI — rollback ${data.projectName}`, text: 'Le contrôle de santé de la production a échoué. Rollback effectué.' });
    return { ...data, stagingUrl, outcome: 'staging-only', lastChecks: serialize(stagingChecks) };
  }
  await updateProject(db, data.projectId, { productionUrl, status: 'production' });
  await log(runtime, 'deploy', `Production en ligne : ${productionUrl}`, 'success', 'devops');
  return { ...data, stagingUrl, productionUrl, outcome: 'production', lastChecks: serialize(stagingChecks) };
}

// --- Étape 7 : rapport -----------------------------------------------------

export async function writeReport(data: ChainData): Promise<ChainData> {
  const { runtime, configs } = await setupContext(data);
  const db = getDb();
  await updateRun(db, data.runId, { phase: 'report' });
  const orchestrator = agentFor(configs, 'orchestrator', runtime);
  const { text } = await orchestrator.generate(
    [
      {
        role: 'user',
        content:
          `Rédige en français un rapport détaillé et factuel de l'exécution (Markdown) : contexte, décisions d'architecture, ` +
          `hypothèses, opérations menées, résultat des portes qualité, sécurité, et liens (dépôt, PR, staging, production).\n\n` +
          `Résultat : ${data.outcome}\nItérations de correction : ${data.loop.iteration}\n` +
          `Dépôt : ${data.repo?.htmlUrl}\nPR : ${data.repo?.prUrl}\nStaging : ${data.stagingUrl ?? '—'}\nProduction : ${data.productionUrl ?? '—'}\n` +
          `Derniers contrôles :\n${data.lastChecks.map((c) => `- ${c.passed ? '✅' : '❌'} ${c.id} : ${c.summary}`).join('\n')}\n` +
          `Opérations :\n${data.operations.map((o) => `- ${o}`).join('\n')}`,
      },
    ],
    { requestContext: requestContextFor(data.runId), maxSteps: 3 },
  );

  const report = text ?? 'Rapport indisponible.';
  const status = data.outcome === 'failed' ? 'failed' : data.outcome === 'production' ? 'succeeded' : 'succeeded';
  await updateRun(db, data.runId, { status, report, finishedAt: new Date() });
  await notify(runtime, {
    subject: `MasterAI — ${data.projectName} : ${data.outcome}`,
    text: `${report.slice(0, 1500)}\n\nDépôt : ${data.repo?.htmlUrl}`,
  });
  await log(runtime, 'report', 'Rapport final rédigé', 'success', 'orchestrator');
  return { ...data, operations: [...data.operations, 'Rapport final.'] };
}
