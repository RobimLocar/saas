// Prova de banco: monta um Postgres 17 descartável SÓ com supabase/migrations
// (o que um Preview/staging montaria) e verifica as invariantes que já
// quebraram em produção:
//   • todas as migrations aplicam do zero;
//   • concorrência de débito/estorno não gera saldo negativo nem estorno duplo;
//   • grants do Stripe creditam 1× mesmo com o evento entregue em paralelo;
//   • o usuário (chave pública) não cria nem recupera créditos via generations;
//   • os fluxos legítimos das rotas continuam funcionando.
// Uso: cd scripts/db-verify && npm install && npm run verify
// Sai com código 1 se qualquer verificação falhar.
import EmbeddedPostgres from "embedded-postgres";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = path.resolve(HERE, "..", "..", "supabase", "migrations");
const DATA = path.join(HERE, ".pgdata");
const PORT = Number(process.env.DB_VERIFY_PORT || 55440);

const results = [];
function check(name, pass, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

fs.rmSync(DATA, { recursive: true, force: true });
const db = new EmbeddedPostgres({
  databaseDir: DATA, user: "postgres", password: "pw", port: PORT, persistent: false,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
});
await db.initialise();
await db.start();
const pool = new pg.Pool({ host: "localhost", port: PORT, user: "postgres", password: "pw", database: "postgres", max: 60 });
const q = (sql, params) => pool.query(sql, params);

async function newUser(credits = 0, email) {
  const id = randomUUID();
  await q("insert into auth.users(id, email) values ($1, $2)", [id, email || `${id.slice(0, 8)}@verify.dev`]);
  if (credits) await q("update public.profiles set credits_balance = $2 where id = $1", [id, credits]);
  return id;
}
const balance = async (id) => (await q("select credits_balance from public.profiles where id = $1", [id])).rows[0]?.credits_balance;
const ledger = async (id) => Number((await q("select coalesce(sum(amount), 0) s from public.credit_transactions where user_id = $1", [id])).rows[0].s);

// Executa como o PostgREST faria com o JWT do usuário (papel authenticated).
async function asUser(uid, sql, params) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)", [uid]);
    await c.query("set local role authenticated");
    const r = await c.query(sql, params);
    await c.query("commit");
    return { ok: true, r };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return { ok: false, err: e.message };
  } finally {
    c.release();
  }
}

try {
  // ── Migrations do zero ────────────────────────────────────────────────────
  await q(fs.readFileSync(path.join(HERE, "supabase-shim.sql"), "utf8"));
  const files = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort();
  let applied = 0;
  for (const f of files) {
    try { await q(fs.readFileSync(path.join(MIGRATIONS, f), "utf8")); applied++; }
    catch (e) { check(`migration ${f}`, false, e.message.split("\n")[0]); }
  }
  check("todas as migrations aplicam num Postgres limpo", applied === files.length, `${applied}/${files.length}`);

  // ── Concorrência de créditos ──────────────────────────────────────────────
  {
    const u = await newUser(100);
    const rs = await Promise.all(Array.from({ length: 50 }, () =>
      q("select public.debit_credits($1, 7, $2) r", [u, randomUUID()]).then((x) => String(x.rows[0].r))));
    const applied = rs.filter((r) => r.startsWith("APPLIED")).length;
    check("50 débitos simultâneos respeitam o saldo", applied === 14 && (await balance(u)) === 2, `aplicados=${applied} saldo=${await balance(u)}`);
  }
  {
    const users = await Promise.all(Array.from({ length: 20 }, () => newUser(500)));
    await Promise.all(users.flatMap((u) => Array.from({ length: 25 }, async () => {
      const job = randomUUID();
      await q("select public.debit_credits($1, $2, $3)", [u, 1 + Math.floor(Math.random() * 40), job]);
      if (Math.random() < 0.4) await Promise.all([1, 2, 3].map(() => q("select public.refund_generation_credits($1, $2, null)", [u, job])));
    })));
    let drift = 0, negative = 0;
    for (const u of users) {
      const b = await balance(u);
      if (b !== 500 + (await ledger(u))) drift++;
      if (b < 0) negative++;
    }
    const dup = Number((await q("select count(*) c from (select related_job_id from public.credit_transactions where reason = 'refund' group by 1 having count(*) > 1) x")).rows[0].c);
    check("20 usuários × 25 gerações paralelas: saldo = extrato", drift === 0, `divergentes=${drift}`);
    check("estorno triplo simultâneo vira 1 só", dup === 0, `duplicados=${dup}`);
    check("nenhum saldo negativo", negative === 0);
  }
  {
    const email = "trial@verify.dev";
    const u = await newUser(0, email);
    const rs = await Promise.all(Array.from({ length: 10 }, () =>
      q("select public.claim_free_image_trial($1, $2, $3, 60) r", [email, u, randomUUID()]).then((x) => String(x.rows[0].r))));
    check("teste grátis: 10 pedidos simultâneos, 1 concedido", rs.filter((r) => r === "claimed").length === 1, JSON.stringify([...new Set(rs)]));
  }

  // ── Stripe ────────────────────────────────────────────────────────────────
  {
    const u = await newUser(0);
    const sess = "cs_" + randomUUID();
    await Promise.all(Array.from({ length: 10 }, () => q("select public.grant_topup_credits($1, 200, 799, $2)", [u, sess]).catch((e) => e.message)));
    check("top-up entregue 10× em paralelo credita 1×", (await balance(u)) === 200, `saldo=${await balance(u)}`);
    const inv = "in_" + randomUUID();
    await Promise.all(Array.from({ length: 10 }, () => q("select public.grant_subscription_credits($1, 1000, 'starter', $2)", [u, inv]).catch((e) => e.message)));
    check("fatura de assinatura entregue 10× em paralelo credita 1×", (await balance(u)) === 1200, `saldo=${await balance(u)}`);
  }

  // ── RLS: o que um usuário consegue com a chave pública ────────────────────
  const attacker = await newUser(20);
  const victim = await newUser(500);
  {
    await asUser(attacker, "update public.profiles set credits_balance = 999999 where id = $1", [attacker]);
    check("usuário não edita o próprio saldo", (await balance(attacker)) === 20);
    const led = await asUser(attacker, "insert into public.credit_transactions(user_id, amount, reason) values ($1, 999999, 'bonus')", [attacker]);
    check("usuário não escreve no extrato", !led.ok);
    const peek = await asUser(attacker, "select count(*) c from public.generations where user_id = $1", [victim]);
    check("usuário não lê gerações de outro", peek.ok && Number(peek.r.rows[0].c) === 0);
    const call = await asUser(attacker, "select public.refund_generation_credits($1, $2, 999999)", [attacker, randomUUID()]);
    check("usuário não chama o RPC de estorno", !call.ok);
  }
  {
    // A: linha forjada + estorno da rota de status (service role, fallback = credits_used)
    const gid = randomUUID();
    await asUser(attacker, "insert into public.generations(id, user_id, type, prompt, status, credits_used) values ($1, $2, 'image', 'x', 'pending', 999999)", [gid, attacker]);
    await q("select public.refund_generation_credits($1, $2, 999999)", [attacker, gid]);
    check("geração forjada não gera crédito", (await balance(attacker)) === 20, `saldo=${await balance(attacker)}`);

    const internal = await asUser(attacker, "insert into public.generations(user_id, type, prompt, status, credits_used) values ($1, 'image', 'x', 'submission_unknown', 5)", [attacker]);
    check("usuário não insere em status interno", !internal.ok);

    // B: reabrir geração entregue para receber o estorno do débito real
    const g2 = randomUUID();
    await q("insert into public.generations(id, user_id, type, prompt, status, credits_used, provider_task_id) values ($1, $2, 'image', 'x', 'completed', 10, 't-2')", [g2, attacker]);
    await q("select public.debit_credits($1, 10, $2)", [attacker, g2]);
    const reopen = await asUser(attacker, "update public.generations set status = 'submission_unknown', provider_task_id = null where id = $1", [g2]);
    check("usuário não reabre geração entregue", !reopen.ok);
    const toFailed = await asUser(attacker, "update public.generations set status = 'failed' where id = $1", [g2]);
    check("usuário não troca completed → failed", !toFailed.ok);

    const g3 = randomUUID();
    await q("insert into public.generations(id, user_id, type, prompt, status, credits_used, provider_task_id) values ($1, $2, 'video', 'x', 'processing', 50, 't-3')", [g3, attacker]);
    const wipe = await asUser(attacker, "update public.generations set provider_task_id = null where id = $1", [g3]);
    check("usuário não apaga provider_task_id", !wipe.ok);
  }
  {
    // Fluxos legítimos que as rotas fazem com o cliente do usuário
    const g = randomUUID();
    const s1 = await asUser(attacker, "insert into public.generations(id, user_id, type, prompt, status, credits_used) values ($1, $2, 'image', 'gato', 'pending', 4)", [g, attacker]);
    const s2 = await asUser(attacker, "update public.generations set provider_task_id = 't-9', status = 'processing' where id = $1", [g]);
    const s3 = await asUser(attacker, "update public.generations set status = 'completed', result_url = 'https://x/y.png', updated_at = now() where id = $1", [g]);
    check("rota: pending → processing → completed pelo cliente", s1.ok && s2.ok && s3.ok, [s1, s2, s3].map((x) => (x.ok ? "ok" : x.err)).join(" | "));
    const gf = randomUUID();
    await asUser(attacker, "insert into public.generations(id, user_id, type, prompt, status, credits_used) values ($1, $2, 'image', 'gato', 'pending', 4)", [gf, attacker]);
    const f = await asUser(attacker, "update public.generations set status = 'failed', error_message = 'provider' where id = $1", [gf]);
    check("rota: marcar falha pelo cliente", f.ok, f.ok ? "" : f.err);
    const fav = await asUser(attacker, "update public.generations set params = coalesce(params, '{}'::jsonb) || '{\"is_favorite\": true}'::jsonb where id = $1", [g]);
    check("favoritar continua funcionando", fav.ok && fav.r.rowCount === 1, fav.ok ? "" : fav.err);
    const del = await asUser(attacker, "delete from public.generations where id = $1", [gf]);
    check("apagar a própria geração continua funcionando", del.ok && del.r.rowCount === 1, del.ok ? "" : del.err);
    const u = await newUser(100);
    const job = randomUUID();
    await q("select public.debit_credits($1, 30, $2)", [u, job]);
    await Promise.all([1, 2, 3, 4, 5].map(() => q("select public.refund_generation_credits($1, $2, null)", [u, job])));
    check("estorno real devolve exatamente 1× o débito", (await balance(u)) === 100, `saldo=${await balance(u)}`);
  }
} catch (e) {
  check("execução do verificador", false, e.stack || String(e));
} finally {
  await pool.end().catch(() => {});
  await db.stop().catch(() => {});
  fs.rmSync(DATA, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} verificações passaram`);
process.exit(failed ? 1 : 0);
