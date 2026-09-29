import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getDb, listProviderCredentials } from '@masterai/db';
import {
  getBuiltinAgent,
  listPalette,
  loadAgentConfigs,
  PHASES,
  TOOL_DESCRIPTIONS,
  type ResolvedAgentConfig,
} from '@masterai/core';
import { getSessionContextSafe } from '@/lib/session';
import { SetupNotice } from '@/components/setup-notice';
import { AgentEditor, type EditorAgent } from './editor';

export const dynamic = 'force-dynamic';

const EMPTY_AGENT: EditorAgent = {
  slug: '',
  role: 'custom',
  name: '',
  description: '',
  instructions: '',
  models: ['anthropic/claude-sonnet-5'],
  tools: [],
  phases: ['review'],
  temperature: null,
  enabled: true,
  isBuiltin: false,
};

function toEditor(config: ResolvedAgentConfig): EditorAgent {
  return {
    slug: config.slug,
    role: config.role,
    name: config.name,
    description: config.description,
    instructions: config.instructions,
    models: config.models,
    tools: config.tools,
    phases: config.phases,
    temperature: config.temperature ?? null,
    enabled: config.enabled,
    isBuiltin: config.role !== 'custom',
  };
}

export default async function AgentPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const session = await getSessionContextSafe();
  if (!session.ok) return <SetupNotice reason={session.reason} message={session.message} />;

  const isNew = slug === 'new';
  const configs = await loadAgentConfigs(session.ctx.tenantId);
  const config = isNew ? undefined : configs.get(slug);
  if (!isNew && !config) notFound();

  const credentials = await listProviderCredentials(getDb(), session.ctx);
  const palette = listPalette(credentials).map((p) => ({ id: p.id, name: p.name, models: p.models, configured: p.configured }));
  const builtin = config ? getBuiltinAgent(config.slug) : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <Link href="/agents" className="muted" style={{ fontSize: 13 }}>
            ← Agents
          </Link>
          <h1>{isNew ? 'Nouvel agent' : config!.name}</h1>
          <div className="sub">
            {isNew
              ? 'Un agent personnalisé intervient en complément des rôles prédéfinis, dans les phases choisies.'
              : config!.role === 'custom'
                ? 'Agent personnalisé.'
                : `Rôle prédéfini « ${config!.role} » — modifiable, réinitialisable à tout moment.`}
          </div>
        </div>
      </div>
      <AgentEditor
        initial={config ? toEditor(config) : EMPTY_AGENT}
        isNew={isNew}
        builtinDefault={builtin ? toEditor({ ...builtin, enabled: true }) : undefined}
        palette={palette}
        tools={Object.entries(TOOL_DESCRIPTIONS).map(([id, label]) => ({ id, label }))}
        phases={[...PHASES]}
        takenSlugs={[...configs.keys()]}
      />
    </>
  );
}
