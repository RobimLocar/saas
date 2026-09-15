import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";
import { drainWebhookEvents } from "@/lib/webhooks/processor";
import { auditLog, newRequestId } from "@/lib/audit-log";

// FLUXYRA-PRODUCTION-CLOSE-01 §5 — Gatilho do processor/drainer do inbox de webhooks.
// RUNNABLE via scheduler (Vercel Cron chama com Authorization: Bearer <CRON_SECRET>,
// ou ?secret=). Fail-closed: sem CRON_SECRET → 503. Postgres-only; sem serviço externo.
// O claim/lease atômico garante que rodadas concorrentes não reprocessem o mesmo evento.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function authorized(req: NextRequest): { ok: boolean; configured: boolean } {
  const secret = process.env.CRON_SECRET;
  if (!secret) return { ok: false, configured: false };
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const q = req.nextUrl.searchParams.get("secret") || "";
  const provided = bearer || q;
  if (provided && safeEqual(provided, secret)) return { ok: true, configured: true };
  return { ok: false, configured: true };
}

async function handle(req: NextRequest) {
  const requestId = newRequestId();
  const auth = authorized(req);
  if (!auth.configured) {
    return NextResponse.json({ error: "Cron não configurado" }, { status: 503 });
  }
  if (!auth.ok) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const result = await drainWebhookEvents(service, { limit: 25, requestId });
  auditLog("api.cron.drain", "drenado", requestId, { ...result });
  return NextResponse.json({ ok: true, ...result });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
