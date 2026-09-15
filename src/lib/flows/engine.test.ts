// FLUXYRA-AI-PRODUCTION-02 §12 — ASSERTIONS reais sobre o núcleo do motor de Flow
// (o MESMO código que runFlow usa). Sem browser: planejamento + dado cruzando edges.
import { planFlowExecution, resolveNodeInputs, type FlowNodeLite, type FlowEdgeLite } from "@/lib/flows/engine";
import { test } from "vitest";

test("engine.test.ts", async () => {

const failures: string[] = [];
const check = (n: string, c: boolean) => { if (!c) failures.push(n); };
const idx = (arr: string[], id: string) => arr.indexOf(id);

function run() {
  // Grafo canônico: Prompt → Image (I2I) → Video (I2V)
  const nodes: FlowNodeLite[] = [
    { id: "p", type: "prompt" }, { id: "img", type: "imageGen" }, { id: "vid", type: "videoGen" },
  ];
  const edges: FlowEdgeLite[] = [
    { source: "p", target: "img", targetHandle: "prompt" },
    { source: "img", target: "vid", targetHandle: "reference" },
  ];

  // 1) Ordem topológica
  const plan = planFlowExecution(nodes, edges);
  check("plan ok", plan.ok === true);
  if (plan.ok) {
    check("ordem: p<img<vid", idx(plan.runOrder, "p") < idx(plan.runOrder, "img") && idx(plan.runOrder, "img") < idx(plan.runOrder, "vid"));
    check("todos os nós na ordem", plan.runOrder.length === 3);
  }

  // 2) DADO CRUZA AS EDGES: prompt vira texto; imagem-URL vira ref do vídeo (I2V)
  const inImg = resolveNodeInputs("img", edges, new Map([["p", "a calico cat"]]));
  check("img recebe prompt como texto", inImg.promptText === "a calico cat" && inImg.refs.length === 0);
  const inVid = resolveNodeInputs("vid", edges, new Map([["img", "https://cdn/x.png"]]));
  check("vid recebe imagem gerada como reference (I2V)", inVid.refs.length === 1 && inVid.refs[0] === "https://cdn/x.png" && inVid.promptText === "");

  // 3) Prompt → Video T2V (texto, sem ref)
  const t2vEdges: FlowEdgeLite[] = [{ source: "p", target: "vid", targetHandle: "prompt" }];
  const inT2V = resolveNodeInputs("vid", t2vEdges, new Map([["p", "sunset over sea"]]));
  check("T2V: prompt texto, sem refs", inT2V.promptText === "sunset over sea" && inT2V.refs.length === 0);

  // 4) Image asset → Video I2V (URL direto vira ref mesmo sem handle 'reference')
  const assetEdges: FlowEdgeLite[] = [{ source: "asset", target: "vid", targetHandle: null }];
  const inAsset = resolveNodeInputs("vid", assetEdges, new Map([["asset", "https://cdn/asset.jpg"]]));
  check("Image asset → ref por ser URL", inAsset.refs.length === 1 && inAsset.refs[0] === "https://cdn/asset.jpg");

  // 5) Dubbing handle: URL vai p/ dubbingAudio (não refs)
  const dubEdges: FlowEdgeLite[] = [{ source: "aud", target: "vid", targetHandle: "dubbing" }];
  const inDub = resolveNodeInputs("vid", dubEdges, new Map([["aud", "https://cdn/voice.mp3"]]));
  check("dubbing URL → dubbingAudio, não refs", inDub.dubbingAudio === "https://cdn/voice.mp3" && inDub.refs.length === 0);

  // 6) Nós paralelos independentes
  const par: FlowNodeLite[] = [{ id: "a" }, { id: "b" }, { id: "i1" }, { id: "i2" }];
  const parE: FlowEdgeLite[] = [{ source: "a", target: "i1" }, { source: "b", target: "i2" }];
  const pplan = planFlowExecution(par, parE);
  check("paralelo: 4 nós planejados", pplan.ok && pplan.runOrder.length === 4);
  if (pplan.ok) check("paralelo: a<i1 e b<i2", idx(pplan.runOrder, "a") < idx(pplan.runOrder, "i1") && idx(pplan.runOrder, "b") < idx(pplan.runOrder, "i2"));

  // 7) Middle-node failure: downstream vem DEPOIS (abortar img interrompe vid)
  if (plan.ok) check("middle-fail: vid depende de img (vem depois)", idx(plan.runOrder, "vid") > idx(plan.runOrder, "img"));

  // 8) Retry de node = subgrafo de ANCESTRAIS (não reexecuta descendentes)
  const retryVid = planFlowExecution(nodes, edges, "vid");
  check("retry vid → inclui ancestrais p,img,vid", retryVid.ok && retryVid.runOrder.length === 3);
  const retryImg = planFlowExecution(nodes, edges, "img");
  check("retry img → NÃO inclui descendente vid", retryImg.ok && retryImg.runOrder.includes("img") && !retryImg.runOrder.includes("vid"));

  // 9) Ciclo detectado
  const cyc = planFlowExecution([{ id: "a" }, { id: "b" }], [{ source: "a", target: "b" }, { source: "b", target: "a" }]);
  check("ciclo → ok=false reason=cycle", !cyc.ok && cyc.ok === false && (cyc as { reason: string }).reason === "cycle");

  // 10) Vazio
  const empty = planFlowExecution([], []);
  check("vazio → ok=false reason=empty", !empty.ok && (empty as { reason: string }).reason === "empty");

  // 11) Save→reload→rerun = determinístico (mesma ordem)
  const p2 = planFlowExecution(nodes, edges);
  check("rerun determinístico", plan.ok && p2.ok && JSON.stringify(plan.runOrder) === JSON.stringify(p2.runOrder));

  // 12) Output incompatível: handle 'reference' força ref mesmo com valor não-URL
  //     (o node downstream então valida/erra — routing fiel ao runFlow).
  const incompat = resolveNodeInputs("vid", [{ source: "p", target: "vid", targetHandle: "reference" }], new Map([["p", "not-a-url"]]));
  check("reference handle força ref (downstream valida)", incompat.refs.length === 1 && incompat.refs[0] === "not-a-url");

  if (failures.length) throw new Error("engine.test falhou:\n - " + failures.join("\n - "));
  console.log("engine.test: OK (12 grupos de asserções)");
}

run();
});
