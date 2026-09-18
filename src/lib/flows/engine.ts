// FLUXYRA-AI-PRODUCTION-02 §12 — núcleo PURO e testável do motor de Flow.
// Extraído de runFlow SEM mudar o comportamento: planejamento (ordem topológica +
// detecção de ciclo + subgrafo de ancestrais para retry) e resolução de inputs de
// um node a partir das arestas (dado cruzando as edges: prompt vs reference vs
// dubbing). A parte de dispatch/fetch/estado React permanece no componente.

export interface FlowNodeLite {
  id: string;
  type?: string;
}
export interface FlowEdgeLite {
  source: string;
  target: string;
  targetHandle?: string | null;
}

export type FlowPlan =
  | { ok: true; runOrder: string[] }
  | { ok: false; reason: "empty" | "cycle" };

const isUrl = (v: string) => /^https?:\/\//i.test(v);

/**
 * Ordem de execução: Kahn (topológica). Ciclo → {ok:false,cycle}. Vazio → empty.
 * Se `targetId`, restringe ao subgrafo de ANCESTRAIS de target (retry de um node
 * reexecuta ele + o que o alimenta), preservando a ordem topológica global.
 */
export function planFlowExecution(
  nodes: FlowNodeLite[],
  edges: FlowEdgeLite[],
  targetId?: string
): FlowPlan {
  if (!nodes.length) return { ok: false, reason: "empty" };
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  nodes.forEach((n) => {
    indeg.set(n.id, 0);
    adj.set(n.id, []);
  });
  edges.forEach((e) => {
    if (!adj.has(e.source) || !indeg.has(e.target)) return;
    adj.get(e.source)!.push(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  });
  const q = nodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
  const order: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const t of adj.get(id) || []) {
      indeg.set(t, (indeg.get(t) || 0) - 1);
      if ((indeg.get(t) || 0) === 0) q.push(t);
    }
  }
  if (order.length !== nodes.length) return { ok: false, reason: "cycle" };

  if (targetId) {
    const radj = new Map<string, string[]>();
    nodes.forEach((n) => radj.set(n.id, []));
    edges.forEach((e) => radj.get(e.target)?.push(e.source));
    const allowed = new Set<string>();
    const s = [targetId];
    while (s.length) {
      const x = s.shift()!;
      if (allowed.has(x)) continue;
      allowed.add(x);
      for (const p of radj.get(x) || []) s.push(p);
    }
    return { ok: true, runOrder: order.filter((id) => allowed.has(id)) };
  }
  return { ok: true, runOrder: order };
}

export interface ResolvedInputs {
  promptText: string;
  refs: string[];
  dubbingAudio: string;
}

/**
 * Resolve os inputs de um node a partir das saídas dos upstreams (`outputs`):
 *  • handle "dubbing" + URL → dubbingAudio;
 *  • handle "reference" OU valor-URL → refs (imagem/vídeo);
 *  • caso contrário → concatena como texto de prompt.
 * Espelho EXATO da lógica inline de runFlow (dado cruzando as edges).
 */
export function resolveNodeInputs(
  nodeId: string,
  edges: FlowEdgeLite[],
  outputs: Map<string, string>
): ResolvedInputs {
  let promptText = "";
  const refs: string[] = [];
  let dubbingAudio = "";
  for (const e of edges) {
    if (e.target !== nodeId) continue;
    const v = outputs.get(e.source);
    if (!v) continue;
    if (e.targetHandle === "dubbing") {
      if (isUrl(v)) dubbingAudio = v;
      continue;
    }
    if (e.targetHandle === "reference" || isUrl(v)) refs.push(v);
    else promptText = promptText ? `${promptText} ${v}` : v;
  }
  return { promptText, refs, dubbingAudio };
}
