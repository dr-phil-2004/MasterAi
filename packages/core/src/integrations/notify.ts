import type { RunRuntime } from '../lib/runtime';

/** Notifications de fin d'exécution : Slack (webhook entrant) et e-mail (Resend). */
export async function notify(runtime: RunRuntime, { subject, text }: { subject: string; text: string }) {
  const tasks: Promise<unknown>[] = [];

  const slack = runtime.integrations.slack;
  if (slack?.secret) {
    tasks.push(
      fetch(slack.secret, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `*${subject}*\n${text.slice(0, 2900)}` }),
      }),
    );
  }

  const email = runtime.integrations.email;
  if (email?.secret && email.config.to) {
    tasks.push(
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${email.secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: email.config.from || 'MasterAI <onboarding@resend.dev>',
          to: email.config.to.split(',').map((s) => s.trim()),
          subject,
          text,
        }),
      }),
    );
  }

  const results = await Promise.allSettled(tasks);
  return results.filter((r) => r.status === 'rejected').length === 0;
}
