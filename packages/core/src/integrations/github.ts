import { Octokit } from '@octokit/rest';
import { exec, shellQuote, APP_DIR } from '../lib/sandbox';
import { requireIntegration, type RunRuntime } from '../lib/runtime';

function client(runtime: RunRuntime) {
  const gh = requireIntegration(runtime, 'github');
  return { octokit: new Octokit({ auth: gh.secret }), token: gh.secret, owner: gh.config.owner };
}

/** Assistant d'identification Git qui lit le jeton dans l'environnement : il n'apparaît jamais dans les commandes. */
const CREDENTIAL_HELPER = `-c credential.helper='!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f'`;

export async function git(runtime: RunRuntime, args: string) {
  const { token } = client(runtime);
  return exec(runtime, `git ${CREDENTIAL_HELPER} ${args}`, { env: { GH_TOKEN: token } });
}

/**
 * Prépare le dépôt : clone un dépôt existant (projet existant) ou crée un dépôt privé.
 * Renvoie l'URL HTML du dépôt.
 */
export async function ensureRepository(runtime: RunRuntime, opts: { sourceRepo?: string; description: string }) {
  const { octokit, token, owner } = client(runtime);
  let fullName = opts.sourceRepo;
  let htmlUrl: string;

  if (fullName) {
    const [o, r] = fullName.split('/');
    const { data } = await octokit.repos.get({ owner: o!, repo: r! });
    htmlUrl = data.html_url;
  } else {
    const { data: me } = await octokit.users.getAuthenticated();
    const name = runtime.projectSlug;
    const target = owner && owner !== me.login ? owner : undefined;
    const { data } = target
      ? await octokit.repos.createInOrg({ org: target, name, private: true, description: opts.description, auto_init: true })
      : await octokit.repos.createForAuthenticatedUser({ name, private: true, description: opts.description, auto_init: true });
    fullName = data.full_name;
    htmlUrl = data.html_url;
  }

  const cloneUrl = `https://github.com/${fullName}.git`;
  const script = [
    `mkdir -p ${APP_DIR}`,
    `cd ${APP_DIR}`,
    `if [ ! -d .git ]; then git ${CREDENTIAL_HELPER} clone ${shellQuote(cloneUrl)} . ; fi`,
    `git config user.name "MasterAI"`,
    `git config user.email "bot@masterai.local"`,
  ].join(' && ');
  const res = await exec(runtime, script, { cwd: '/vercel/sandbox', env: { GH_TOKEN: token } });
  if (res.exitCode !== 0) throw new Error(`Clonage du dépôt impossible : ${res.stderr}`);
  return { fullName: fullName!, htmlUrl };
}

export async function commitAndPush(runtime: RunRuntime, message: string, branch: string) {
  const res = await git(
    runtime,
    `checkout -B ${shellQuote(branch)} && git add -A && (git diff --cached --quiet || git commit -m ${shellQuote(message)}) && git ${CREDENTIAL_HELPER} push -u origin ${shellQuote(branch)}`,
  );
  if (res.exitCode !== 0) throw new Error(`Push impossible : ${res.stderr.slice(-2000)}`);
}

export async function openOrUpdatePullRequest(
  runtime: RunRuntime,
  fullName: string,
  { head, base, title, body }: { head: string; base: string; title: string; body: string },
) {
  const { octokit } = client(runtime);
  const [owner, repo] = fullName.split('/') as [string, string];
  const existing = await octokit.pulls.list({ owner, repo, head: `${owner}:${head}`, state: 'open' });
  if (existing.data[0]) {
    await octokit.pulls.update({ owner, repo, pull_number: existing.data[0].number, body });
    return existing.data[0].html_url;
  }
  const { data } = await octokit.pulls.create({ owner, repo, head, base, title, body });
  return data.html_url;
}

export async function commentOnPullRequest(runtime: RunRuntime, prUrl: string, body: string) {
  const { octokit } = client(runtime);
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return;
  await octokit.issues.createComment({ owner: match[1]!, repo: match[2]!, issue_number: Number(match[3]), body });
}

export async function mergePullRequest(runtime: RunRuntime, prUrl: string) {
  const { octokit } = client(runtime);
  const match = prUrl.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) throw new Error(`URL de PR invalide : ${prUrl}`);
  await octokit.pulls.merge({ owner: match[1]!, repo: match[2]!, pull_number: Number(match[3]), merge_method: 'squash' });
}
