// P4f-fix — Smoke test do bootstrap. Prova que, após `import "./register"`, o
// registry REAL resolve "piapi" e "atlas". Runner-agnóstico (padrão P2b/P3b):
// assertivas no import; clients mockados por alias esbuild (zero rede/env/API).
// NÃO testa submit/getStatus/payload/billing — só registration.

import "./register";
import { getProvider, listProviderIds } from "./registry";
import { test } from "vitest";

test("register.test.ts", async () => {

const fails: string[] = [];
const chk = (name: string, cond: boolean): void => { if (!cond) fails.push(name); };

// PiAPI registrado (via register.ts → piapi/adapter → registerProvider)
const piapi = getProvider("piapi");
chk("piapi.id", piapi.id === "piapi");
chk("piapi.submit é função", typeof piapi.submit === "function");
chk("piapi.getStatus é função", typeof piapi.getStatus === "function");

// Atlas registrado
const atlas = getProvider("atlas");
chk("atlas.id", atlas.id === "atlas");
chk("atlas.submit é função", typeof atlas.submit === "function");
chk("atlas.getStatus é função", typeof atlas.getStatus === "function");

// Listagem contém ambos (ordem não é contrato)
const ids = listProviderIds();
chk("lista inclui piapi", ids.includes("piapi"));
chk("lista inclui atlas", ids.includes("atlas"));

// Idempotência: registerProvider usa Map.set → uma entrada por id.
chk("piapi aparece 1x", ids.filter((i) => i === "piapi").length === 1);
chk("atlas aparece 1x", ids.filter((i) => i === "atlas").length === 1);

if (fails.length > 0) {
  throw new Error("provider register.test falhou: " + fails.join(", "));
}
console.log("provider register.test: OK (piapi + atlas registrados)");
});
