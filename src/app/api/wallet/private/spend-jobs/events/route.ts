import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";

import { createAuthOptions } from "@/lib/server/auth";
import { getPgPool } from "@/lib/server/db";
import { listSpendJobEvents } from "@/lib/server/walletRepository";
import { serializeActivityEvent } from "@/lib/server/spendJobSerialization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function requireUserId() {
  const session = await getServerSession(createAuthOptions());
  const userId = session?.user?.id;
  if (!userId) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      userId: null,
    };
  }
  return { error: null, userId };
}

function encodeSseEvent(input: { id?: string; event: string; data: unknown }) {
  const lines = [`event: ${input.event}`];
  if (input.id) lines.unshift(`id: ${input.id}`);
  lines.push(`data: ${JSON.stringify(input.data)}`);
  lines.push("", "");
  return lines.join("\n");
}

export async function GET(request: Request) {
  const auth = await requireUserId();
  if (auth.error) return auth.error;
  const userId = auth.userId;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const encoder = new TextEncoder();
  let lastEventId = request.headers.get("last-event-id");
  let stopStream = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const stop = () => {
        if (closed) return;
        closed = true;
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        request.signal.removeEventListener("abort", close);
      };
      stopStream = stop;

      const close = () => {
        stop();
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      };
      request.signal.addEventListener("abort", close, { once: true });

      const enqueue = (input: { id?: string; event: string; data: unknown }) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(encodeSseEvent(input)));
          return true;
        } catch {
          stop();
          return false;
        }
      };

      async function tick() {
        if (closed) return;
        try {
          const events = await listSpendJobEvents(getPgPool(), {
            userId,
            afterEventId: lastEventId,
            limit: 100,
          });
          if (events.length === 0) {
            if (
              !enqueue({
                event: "heartbeat",
                data: { now: new Date().toISOString() },
              })
            ) {
              return;
            }
          } else {
            for (const event of events) {
              if (closed) return;
              lastEventId = event.id;
              if (
                !enqueue({
                  id: event.id,
                  event: "wallet_activity",
                  data: serializeActivityEvent(event),
                })
              ) {
                return;
              }
            }
          }
        } catch (error) {
          if (
            !enqueue({
              event: "stream_error",
              data: { error: error instanceof Error ? error.message : String(error) },
            })
          ) {
            return;
          }
        }

        if (!closed) timer = setTimeout(tick, 2500);
      }

      enqueue({
        event: "connected",
        data: { ok: true },
      });
      void tick();
    },
    cancel() {
      stopStream();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
