"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  Handle,
  Position,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Save,
  Play,
  Loader2,
  Check,
  X as XIcon,
  Type as TypeIcon,
  Image as ImageIcon,
  Film,
  FileImage,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type NodeData = Record<string, unknown>;
interface ModelOpt {
  id: string;
  name: string;
}

const NODE_COLOR: Record<string, string> = {
  prompt: "#22D3EE",
  refImage: "#F97316",
  imageGen: "#A78BFA",
  videoGen: "#3B82F6",
  output: "#4ADE80",
};

function StatusDot({ status }: { status?: string }) {
  if (status === "running")
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#A78BFA]" />;
  if (status === "done") return <Check className="h-3.5 w-3.5 text-[#4ADE80]" />;
  if (status === "failed") return <XIcon className="h-3.5 w-3.5 text-[#FCA5A5]" />;
  return null;
}

function NodeShell({
  color,
  title,
  children,
  selected,
  status,
}: {
  color: string;
  title: string;
  children?: React.ReactNode;
  selected?: boolean;
  status?: string;
}) {
  return (
    <div
      className="w-[210px] rounded-xl border bg-[#161618] text-left shadow-lg transition-colors"
      style={{ borderColor: selected ? color : "#2A2A2E" }}
    >
      <div
        className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-xs font-semibold"
        style={{ backgroundColor: `${color}22`, color }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="flex-1">{title}</span>
        <StatusDot status={status} />
      </div>
      <div className="px-3 py-2 text-[11px] text-[#B8B8C0]">{children}</div>
    </div>
  );
}

function ResultThumb({ data }: { data: NodeData }) {
  const url = data.__result as string | undefined;
  if (!url) return null;
  const isVideo = /\.(mp4|mov|webm)(\?|$)/i.test(url);
  return isVideo ? (
    <video src={url} muted playsInline className="mt-2 h-24 w-full rounded object-cover" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="result" className="mt-2 h-24 w-full rounded object-cover" />
  );
}

function PromptNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <NodeShell color={NODE_COLOR.prompt} title="Prompt" selected={selected} status={d.__status as string}>
      <p className="line-clamp-3 min-h-[32px] whitespace-pre-wrap">
        {(d.text as string) || "Escreva o prompt no painel à direita…"}
      </p>
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.prompt }} />
    </NodeShell>
  );
}

function RefImageNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  const url = (d.url as string) || "";
  return (
    <NodeShell color={NODE_COLOR.refImage} title="Reference Image" selected={selected} status={d.__status as string}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="ref" className="h-20 w-full rounded object-cover" />
      ) : (
        <p className="text-[#777]">Cole a URL da imagem no painel.</p>
      )}
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.refImage }} />
    </NodeShell>
  );
}

function ImageGenNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <NodeShell color={NODE_COLOR.imageGen} title="Image Generator" selected={selected} status={d.__status as string}>
      <p>Modelo: <span className="text-white">{(d.modelName as string) || "— escolha —"}</span></p>
      <p>AR: {(d.aspectRatio as string) || "1:1"} · x{(d.count as number) || 1}</p>
      <ResultThumb data={d} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: "30%", background: "#22D3EE" }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: "60%", background: "#F97316" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.imageGen }} />
    </NodeShell>
  );
}

function VideoGenNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <NodeShell color={NODE_COLOR.videoGen} title="Video Generator" selected={selected} status={d.__status as string}>
      <p>Modelo: <span className="text-white">{(d.modelName as string) || "— escolha —"}</span></p>
      <p>{(d.duration as number) || 8}s · {(d.resolution as string) || "720p"} · {(d.aspectRatio as string) || "9:16"}</p>
      <ResultThumb data={d} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: "30%", background: "#22D3EE" }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: "60%", background: "#F97316" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.videoGen }} />
    </NodeShell>
  );
}

function OutputNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <NodeShell color={NODE_COLOR.output} title="Output" selected={selected} status={d.__status as string}>
      {d.__result ? <ResultThumb data={d} /> : <p>{(d.label as string) || "Resultado final do fluxo"}</p>}
      <Handle type="target" position={Position.Left} id="in" style={{ background: NODE_COLOR.output }} />
    </NodeShell>
  );
}

const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  refImage: RefImageNode,
  imageGen: ImageGenNode,
  videoGen: VideoGenNode,
  output: OutputNode,
};

const PALETTE = [
  { type: "prompt", label: "Prompt", Icon: TypeIcon, defaults: { label: "Prompt", text: "" } },
  { type: "refImage", label: "Imagem de referência", Icon: FileImage, defaults: { label: "Reference Image", url: "" } },
  { type: "imageGen", label: "Gerador de imagem", Icon: ImageIcon, defaults: { label: "Image Generator", model: "", modelName: "", aspectRatio: "1:1", count: 1 } },
  { type: "videoGen", label: "Gerador de vídeo", Icon: Film, defaults: { label: "Video Generator", model: "", modelName: "", duration: 8, resolution: "720p", aspectRatio: "9:16" } },
  { type: "output", label: "Saída", Icon: CircleDot, defaults: { label: "Output" } },
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Editor() {
  const params = useParams();
  const flowId = String(params?.id || "");
  const rf = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [name, setName] = useState("Novo Flow");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageModels, setImageModels] = useState<ModelOpt[]>([]);
  const [videoModels, setVideoModels] = useState<ModelOpt[]>([]);
  const counter = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const [im, vm] = await Promise.all([
          fetch("/api/models?type=image", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
          fetch("/api/models?type=video", { cache: "no-store" }).then((r) => r.json()).catch(() => null),
        ]);
        setImageModels(Array.isArray(im?.models) ? im.models.map((m: ModelOpt) => ({ id: m.id, name: m.name })) : []);
        setVideoModels(Array.isArray(vm?.models) ? vm.models.map((m: ModelOpt) => ({ id: m.id, name: m.name })) : []);
      } catch {
        // silencioso
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/flows/${flowId}`, { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error(data?.error || "Falha ao carregar flow.");
        if (!alive) return;
        setName(data.flow.name || "Novo Flow");
        const def = data.flow.definition || {};
        setNodes(Array.isArray(def.nodes) ? def.nodes : []);
        setEdges(Array.isArray(def.edges) ? def.edges : []);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar flow.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [flowId, setNodes, setEdges]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#7C3AED" } }, eds)),
    [setEdges]
  );

  function addNode(item: (typeof PALETTE)[number]) {
    counter.current += 1;
    const idx = nodes.length;
    const nid = `${item.type}_${Date.now()}_${counter.current}`;
    const defaults: NodeData = { ...item.defaults };
    if (item.type === "imageGen" && imageModels[0]) {
      defaults.model = imageModels[0].id;
      defaults.modelName = imageModels[0].name;
    }
    if (item.type === "videoGen" && videoModels[0]) {
      defaults.model = videoModels[0].id;
      defaults.modelName = videoModels[0].name;
    }
    const newNode: Node = {
      id: nid,
      type: item.type,
      position: { x: 80 + (idx % 4) * 260, y: 60 + Math.floor(idx / 4) * 200 },
      data: defaults,
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedId(nid);
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  const patchData = useCallback(
    (patch: NodeData) => {
      if (!selectedId) return;
      setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [selectedId, setNodes]
  );

  const setNodeState = useCallback(
    (id: string, patch: NodeData) => {
      setNodes((nds) => nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)));
    },
    [setNodes]
  );

  async function save() {
    setSaving(true);
    try {
      const obj = rf.toObject();
      // limpa campos de runtime antes de salvar
      const cleanNodes = obj.nodes.map((n) => {
        const d = { ...(n.data as NodeData) };
        delete d.__status;
        delete d.__result;
        return { ...n, data: d };
      });
      const res = await fetch(`/api/flows/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, definition: { ...obj, nodes: cleanNodes } }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "Falha ao salvar flow.");
      }
      toast.success("Flow salvo ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar flow.");
    } finally {
      setSaving(false);
    }
  }

  async function pollGeneration(genId: string): Promise<string> {
    for (let i = 0; i < 120; i++) {
      await sleep(3000);
      const res = await fetch(`/api/generate/status?id=${genId}`, { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (data?.status === "completed" && data.result_url) return data.result_url as string;
      if (data?.status === "failed") throw new Error(data.error_message || "Geração falhou.");
    }
    throw new Error("Tempo esgotado aguardando a geração.");
  }

  async function runFlow() {
    // snapshot atual
    const snapNodes = rf.getNodes();
    const snapEdges = rf.getEdges();
    if (snapNodes.length === 0) {
      toast.error("Adicione nós ao fluxo antes de rodar.");
      return;
    }

    // ordenação topológica (Kahn)
    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    snapNodes.forEach((n) => {
      indeg.set(n.id, 0);
      adj.set(n.id, []);
    });
    snapEdges.forEach((e) => {
      adj.get(e.source)?.push(e.target);
      indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
    });
    const queue = snapNodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
    const order: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      for (const t of adj.get(id) || []) {
        indeg.set(t, (indeg.get(t) || 0) - 1);
        if ((indeg.get(t) || 0) === 0) queue.push(t);
      }
    }
    if (order.length !== snapNodes.length) {
      toast.error("O fluxo tem um ciclo — remova ligações em loop.");
      return;
    }

    const nodeById = new Map(snapNodes.map((n) => [n.id, n]));
    const outputs = new Map<string, string>();

    // limpa status anterior
    setNodes((nds) => nds.map((n) => ({ ...n, data: { ...n.data, __status: undefined, __result: undefined } })));
    setRunning(true);

    try {
      for (const id of order) {
        const node = nodeById.get(id)!;
        const d = node.data as NodeData;
        // resolve entradas
        const incoming = snapEdges.filter((e) => e.target === id);
        let promptText = "";
        const refUrls: string[] = [];
        for (const e of incoming) {
          const val = outputs.get(e.source);
          if (!val) continue;
          if (e.targetHandle === "reference") refUrls.push(val);
          else promptText = promptText ? `${promptText} ${val}` : val;
        }

        if (node.type === "prompt") {
          outputs.set(id, (d.text as string) || "");
          continue;
        }
        if (node.type === "refImage") {
          outputs.set(id, (d.url as string) || "");
          continue;
        }
        if (node.type === "output") {
          const val = incoming.map((e) => outputs.get(e.source)).find(Boolean) || "";
          outputs.set(id, val);
          setNodeState(id, { __status: val ? "done" : "failed", __result: val || undefined });
          continue;
        }

        // nós de geração
        if (node.type === "imageGen" || node.type === "videoGen") {
          if (!d.model) {
            setNodeState(id, { __status: "failed" });
            throw new Error(`Selecione um modelo no nó "${node.type === "imageGen" ? "Image Generator" : "Video Generator"}".`);
          }
          if (!promptText.trim()) {
            setNodeState(id, { __status: "failed" });
            throw new Error("Conecte um nó Prompt ao gerador.");
          }
          setNodeState(id, { __status: "running", __result: undefined });

          const isImage = node.type === "imageGen";
          const body: Record<string, unknown> = {
            prompt: promptText,
            model_uuid: d.model,
            aspect_ratio: d.aspectRatio,
            quality: "high",
          };
          if (refUrls.length > 0) {
            body.reference_images = refUrls;
            body.reference_image_url = refUrls[0];
          }
          if (isImage) {
            body.resolution = "720p";
          } else {
            body.duration = d.duration;
            body.resolution = d.resolution;
          }

          const res = await fetch(`/api/generate/${isImage ? "image" : "video"}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const data = await res.json().catch(() => null);
          if (!res.ok) {
            setNodeState(id, { __status: "failed" });
            throw new Error(data?.error || "Falha ao iniciar a geração.");
          }
          let url = data?.result_url as string | undefined;
          if (data?.status !== "completed" || !url) {
            url = await pollGeneration(String(data.generation_id));
          }
          outputs.set(id, url);
          setNodeState(id, { __status: "done", __result: url });
        }
      }
      toast.success("Fluxo executado ✓");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao executar o fluxo.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[560px] flex-col">
      <style>{`
        .react-flow__controls-button{background:#161618;border-bottom:1px solid #242428;color:#B8B8C0;}
        .react-flow__controls-button:hover{background:#242428;}
        .react-flow__controls-button svg{fill:#B8B8C0;}
      `}</style>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[#242428] px-4 py-2.5">
        <Link
          href="/flows"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A2A2A] text-[#B8B8C0] hover:bg-white/5"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-[#F5F5F5] outline-none hover:border-[#2A2A2A] focus:border-[#7C3AED]"
        />
        <Button
          onClick={() => void runFlow()}
          disabled={running || loading}
          variant="outline"
          className="border-[#2A2A2A] text-[#F5F5F5]"
        >
          {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Play className="mr-1 h-4 w-4" />}
          {running ? "Rodando..." : "Run"}
        </Button>
        <Button
          onClick={() => void save()}
          disabled={saving || loading}
          className="rounded-full bg-[#7C3AED] text-white hover:bg-[#6D28D9]"
        >
          <Save className="mr-1 h-4 w-4" />
          {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Paleta */}
        <div className="w-[190px] shrink-0 space-y-1.5 border-r border-[#242428] bg-[#101012] p-3">
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-[#666]">Adicionar nó</p>
          {PALETTE.map((item) => (
            <button
              key={item.type}
              type="button"
              onClick={() => addNode(item)}
              className="flex w-full items-center gap-2 rounded-lg border border-[#242428] bg-[#161618] px-2.5 py-2 text-left text-xs text-[#E5E5E5] transition hover:border-[#7C3AED]/50 hover:bg-white/5"
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-md"
                style={{ backgroundColor: `${NODE_COLOR[item.type]}22`, color: NODE_COLOR[item.type] }}
              >
                <item.Icon className="h-3.5 w-3.5" />
              </span>
              {item.label}
            </button>
          ))}
          <p className="mt-3 px-1 text-[10px] leading-relaxed text-[#666]">
            Ligue os nós arrastando dos pontos coloridos. Prompt → Gerador → Saída. Clique em Run pra executar.
          </p>
        </div>

        {/* Canvas */}
        <div className="relative min-w-0 flex-1 bg-[#0d0d0f]">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_e, n) => setSelectedId(n.id)}
            onPaneClick={() => setSelectedId(null)}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#242428" gap={18} />
            <Controls />
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) => NODE_COLOR[n.type || "output"] || "#666"}
              maskColor="rgba(0,0,0,0.6)"
              style={{ background: "#101012" }}
            />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <div className="w-[240px] shrink-0 border-l border-[#242428] bg-[#101012] p-3">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[#666]">Propriedades</p>
          {!selectedNode ? (
            <p className="px-1 text-xs text-[#666]">Selecione um nó para editar.</p>
          ) : (
            <Inspector node={selectedNode} onPatch={patchData} imageModels={imageModels} videoModels={videoModels} />
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-[11px] text-[#9a9aa3]">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-[#2A2A2A] bg-[#161618] px-2 py-1.5 text-xs text-[#F5F5F5] outline-none focus:border-[#7C3AED]";

function Inspector({
  node,
  onPatch,
  imageModels,
  videoModels,
}: {
  node: Node;
  onPatch: (p: NodeData) => void;
  imageModels: ModelOpt[];
  videoModels: ModelOpt[];
}) {
  const d = node.data as NodeData;
  if (node.type === "prompt") {
    return (
      <Field label="Texto do prompt">
        <textarea value={(d.text as string) || ""} onChange={(e) => onPatch({ text: e.target.value })} rows={6} className={inputCls} placeholder="Descreva o que gerar…" />
      </Field>
    );
  }
  if (node.type === "refImage") {
    return (
      <Field label="URL da imagem">
        <input value={(d.url as string) || ""} onChange={(e) => onPatch({ url: e.target.value })} className={inputCls} placeholder="https://…" />
      </Field>
    );
  }
  if (node.type === "imageGen") {
    return (
      <>
        <Field label="Modelo">
          <select
            value={(d.model as string) || ""}
            onChange={(e) => {
              const m = imageModels.find((x) => x.id === e.target.value);
              onPatch({ model: e.target.value, modelName: m?.name || "" });
            }}
            className={inputCls}
          >
            <option value="">— escolha —</option>
            {imageModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Proporção">
          <select value={(d.aspectRatio as string) || "1:1"} onChange={(e) => onPatch({ aspectRatio: e.target.value })} className={inputCls}>
            {["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </>
    );
  }
  if (node.type === "videoGen") {
    return (
      <>
        <Field label="Modelo">
          <select
            value={(d.model as string) || ""}
            onChange={(e) => {
              const m = videoModels.find((x) => x.id === e.target.value);
              onPatch({ model: e.target.value, modelName: m?.name || "" });
            }}
            className={inputCls}
          >
            <option value="">— escolha —</option>
            {videoModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </Field>
        <Field label="Duração (s)">
          <input type="number" min={4} max={30} value={(d.duration as number) || 8} onChange={(e) => onPatch({ duration: Number(e.target.value) })} className={inputCls} />
        </Field>
        <Field label="Resolução">
          <select value={(d.resolution as string) || "720p"} onChange={(e) => onPatch({ resolution: e.target.value })} className={inputCls}>
            {["480p", "720p", "1080p"].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Proporção">
          <select value={(d.aspectRatio as string) || "9:16"} onChange={(e) => onPatch({ aspectRatio: e.target.value })} className={inputCls}>
            {["9:16", "16:9", "1:1", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
      </>
    );
  }
  return <p className="px-1 text-xs text-[#666]">Este nó não tem configurações.</p>;
}

export default function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
