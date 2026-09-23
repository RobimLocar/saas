// P10a-CLOSE — Evidência de aceitação do TOCTOU "Atlas-before-debit" do UGC Avatar.
// Runner-agnóstico. NÃO chama providers. Modela EXATAMENTE as expressões da rota
// (segment/route.ts): estimativa pré-TTS = effectiveCost(ceil(rate×clamp(ceil(chars/12))), plano)
// e custo exato = effectiveCost(ceil(rate×clamp(measuredSeconds)), plano).
// Objetivo: provar (A) exact pode exceder a estimativa; (B) requests concorrentes
// passam o mesmo pré-check e cada uma incorre custo Atlas antes do débito; e a
// MITIGAÇÃO já existente: para texto longo a estimativa satura no clamp (120s) e
// vira UPPER BOUND → o exploit de maior valor já está fechado.

import { avatarRawCredits, clampAvatarSeconds } from "./avatar-pricing";
import { effectiveCost } from "@/lib/credits";
import { test } from "vitest";

test("avatar-toctou.test.ts", async () => {

const failures: string[] = [];
function check(name: string, cond: boolean): void {
  if (!cond) failures.push(name);
}

const RATE = 8.4; // cps do catálogo (kling-avatar ativo)

// Espelha a rota:
const estSeconds = (chars: number) => clampAvatarSeconds(Math.ceil(chars / 12));
const estCost = (chars: number, plan: string) =>
  effectiveCost(avatarRawCredits(RATE, estSeconds(chars)), plan);
const exactCost = (measuredSeconds: number, plan: string) =>
  effectiveCost(avatarRawCredits(RATE, measuredSeconds), plan);

// ── A) A estimativa PODE ser menor que o custo exato (janela [est, exact)) ─────
// Texto curto (60 chars) → estSeconds=5. Áudio real de 10s (fala lenta/pausas).
{
  const chars = 60;
  const plan = "free";
  const est = estCost(chars, plan); // ceil(8.4*5)=42 → free ×2 = 84
  const exact = exactCost(10, plan); // ceil(8.4*10)=84 → free ×2 = 168
  check("A: est < exact (janela existe)", est < exact);
  check("A: est=84", est === 84);
  check("A: exact=168", exact === 168);
  // Saldo escolhido DENTRO da janela [est, exact):
  const balance = 84;
  const precheckPasses = balance >= est; // true
  const exactDebitWouldFail = balance < exact; // true
  check("A: pré-check passa", precheckPasses === true);
  check("A: débito exato falharia (Atlas já rodou)", exactDebitWouldFail === true);
}

// ── B) Texto longo: estimativa satura no clamp → UPPER BOUND (exploit fechado) ─
// chars ≥ 1428 → ceil(chars/12) ≥ 119..120 → clamp 120 = máximo cobrável.
{
  const chars = 1600;
  const plan = "free";
  const est = estCost(chars, plan); // estSeconds=120 → ceil(8.4*120)=1008 → ×2=2016
  const exactAtMax = exactCost(130, plan); // measured 130 → clamp 120 → 1008 → ×2=2016
  const exactMid = exactCost(90, plan); // measured 90 → menor que est
  check("B: est satura no máximo", est === effectiveCost(avatarRawCredits(RATE, 120), plan));
  check("B: exact(≥120) NÃO excede est", exactAtMax <= est);
  check("B: exact(<120) NÃO excede est", exactMid <= est);
  // Portanto: para o texto mais caro (≈$0.20 Atlas), NÃO há janela de TTS grátis.
}

// ── C) Concorrência: N requests, UM snapshot de saldo → N chamadas Atlas ───────
// Modela 2 requests paralelas do mesmo usuário contra o mesmo saldo lido.
{
  const plan = "free";
  const chars = 60;
  const measured = 5; // exato: ceil(8.4*5)=42 → ×2 = 84
  const exact = exactCost(measured, plan); // 84
  const est = estCost(chars, plan); // 84
  let balance = 100; // cobre UMA geração (84), não duas (168)
  let atlasCalls = 0;
  let debitsOk = 0;
  let debitsFail = 0;
  // Ambas leem o MESMO saldo (100) e passam o pré-check (100 ≥ 84):
  const snapshot = balance;
  const req = () => {
    const precheckPasses = snapshot >= est; // usa snapshot pré-débito (TOCTOU)
    if (!precheckPasses) return;
    atlasCalls += 1; // Atlas roda ANTES do débito
    // débito atômico serializa (CAS): só desconta se houver saldo real agora.
    if (balance >= exact) {
      balance -= exact;
      debitsOk += 1;
    } else {
      debitsFail += 1;
    }
  };
  req();
  req();
  check("C: 2 chamadas Atlas (uma por request)", atlasCalls === 2);
  check("C: apenas 1 débito bem-sucedido", debitsOk === 1);
  check("C: 1 débito falho (Atlas já gasto)", debitsFail === 1);
  check("C: saldo nunca negativo (CAS)", balance >= 0);
}

if (failures.length > 0) {
  throw new Error(`avatar-toctou.test falhou:\n - ${failures.join("\n - ")}`);
} else {
  console.log("avatar-toctou.test: OK (TOCTOU reproduzido; exploit de maior valor fechado pelo clamp)");
}
});
