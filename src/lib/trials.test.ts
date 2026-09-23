// GROWTH-02 — Testes do helper de entitlement (trials.ts) contra um mock de
// SupabaseClient. Runner-agnóstico (assert-at-import). Complementa a prova em
// Postgres real das RPCs (claim atômico/concorrência/ACL/lifecycle).

import {
  normalizeEmail,
  claimFreeImageTrial,
  releaseFreeImageTrial,
  markFreeImageTrialUsed,
  getFreeImageTrialStatus,
} from "./trials";
import { test } from "vitest";

test("trials.test.ts", async () => {
const failures: string[] = [];
function check(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

type RpcCall = { name: string; params: Record<string, unknown> };

// Mock mínimo: registra rpc() e permite programar retorno; from().select().eq().maybeSingle().
function makeService(opts: {
  rpcData?: unknown;
  rpcError?: unknown;
  selectRow?: unknown;
  selectError?: unknown;
}) {
  const calls: RpcCall[] = [];
  const svc = {
    calls,
    rpc(name: string, params: Record<string, unknown>) {
      calls.push({ name, params });
      return Promise.resolve({ data: opts.rpcData ?? null, error: opts.rpcError ?? null });
    },
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle() {
                  return Promise.resolve({ data: opts.selectRow ?? null, error: opts.selectError ?? null });
                },
              };
            },
          };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return svc as any;
}

// ── normalizeEmail ────────────────────────────────────────────────────────────
check("normalize trims+lowercases", normalizeEmail("  User@X.COM ") === "user@x.com");
check("normalize null → ''", normalizeEmail(null) === "");

// ── claim: 'claimed' → {ok,claimed:true} ─────────────────────────────────────
{
  const svc = makeService({ rpcData: "claimed" });
  const r = await claimFreeImageTrial(svc, "A@x.com", "u1", "g1");
  check("claim claimed → claimed:true", r.ok === true && r.claimed === true);
  check("claim passes normalized email + ids", svc.calls[0].name === "claim_free_image_trial" &&
    svc.calls[0].params.p_email === "a@x.com" &&
    svc.calls[0].params.p_generation_id === "g1");
}
// ── claim: 'denied' → claimed:false ──────────────────────────────────────────
{
  const svc = makeService({ rpcData: "denied" });
  const r = await claimFreeImageTrial(svc, "a@x.com", "u1", "g1");
  check("claim denied → claimed:false", r.ok === true && r.claimed === false);
}
// ── claim: RPC error → fail-closed (ok:false, claimed:false) ──────────────────
{
  const svc = makeService({ rpcError: { message: "function does not exist" } });
  const r = await claimFreeImageTrial(svc, "a@x.com", "u1", "g1");
  check("claim rpc error → fail-closed", r.ok === false && r.claimed === false);
}
// ── claim: empty email → no rpc call, not claimed ────────────────────────────
{
  const svc = makeService({ rpcData: "claimed" });
  const r = await claimFreeImageTrial(svc, "   ", "u1", "g1");
  check("claim empty email → claimed:false", r.claimed === false);
  check("claim empty email → no rpc invoked", svc.calls.length === 0);
}
// ── release / markUsed call the right RPC with generation_id ──────────────────
{
  const svc = makeService({});
  await releaseFreeImageTrial(svc, "gen-9");
  check("release rpc name+arg", svc.calls[0].name === "release_free_image_trial" && svc.calls[0].params.p_generation_id === "gen-9");
}
{
  const svc = makeService({});
  await markFreeImageTrialUsed(svc, "gen-9");
  check("used rpc name+arg", svc.calls[0].name === "mark_free_image_trial_used" && svc.calls[0].params.p_generation_id === "gen-9");
}
// ── status: no row → 'available'; used → 'used'; error → 'unknown' ────────────
{
  check("status no row → available", (await getFreeImageTrialStatus(makeService({ selectRow: null }), "a@x.com")) === "available");
  check("status used → used", (await getFreeImageTrialStatus(makeService({ selectRow: { status: "used" } }), "a@x.com")) === "used");
  check("status error → unknown", (await getFreeImageTrialStatus(makeService({ selectError: { message: "no table" } }), "a@x.com")) === "unknown");
  check("status empty email → unknown", (await getFreeImageTrialStatus(makeService({}), "")) === "unknown");
}

if (failures.length > 0) {
  throw new Error(`trials.test falhou:\n - ${failures.join("\n - ")}`);
} else {
  console.log("trials.test: OK (todas as assertivas passaram)");
}
});
