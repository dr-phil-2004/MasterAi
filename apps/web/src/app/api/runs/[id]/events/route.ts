import { getDb, getRun, listRunEvents } from '@masterai/db';
import { sessionOrResponse } from '@/lib/session';

export const runtime = 'nodejs';
export const maxDuration = 300;

/** Flux SSE du journal d'une exécution, pour le suivi en temps réel dans l'UI. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await sessionOrResponse();
  if (session instanceof Response) return session;
  const ctx = session;
  const db = getDb();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let cursor: Date | undefined;
      let closed = false;

      const tick = async () => {
        if (closed) return;
        try {
          const events = await listRunEvents(db, id, cursor);
          for (const e of events) send('log', e);
          if (events.length) cursor = events.at(-1)!.createdAt;
          const run = await getRun(db, ctx.tenantId, id);
          if (run) send('run', run);
          if (run && ['succeeded', 'failed', 'cancelled'].includes(run.status)) {
            send('done', { status: run.status });
            closed = true;
            controller.close();
            return;
          }
        } catch (error) {
          send('error', { message: (error as Error).message });
        }
        if (!closed) setTimeout(tick, 2000);
      };
      await tick();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive' },
  });
}
