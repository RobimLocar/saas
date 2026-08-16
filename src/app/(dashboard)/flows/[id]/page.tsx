"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
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
  Plus,
  Type as TypeIcon,
  Image as ImageIcon,
  Film,
  FileImage,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// ── Cores por tipo de nó ────────────────────────────────────────────────────
const NODE_COLOR: Record<string, string> = {
  prompt: "#22D3EE",
  refImage: "#F97316",
  imageGen: "#A78BFA",
  videoGen: "#3B82F6",
  output: "#4ADE80",
};

function NodeShell({
  color,
  title,
  children,
  selected,
}: {
  color: string;
  title: string;
  children?: React.ReactNode;
  selected?: boolean;
}) {
  return (
    <div
      className="w-[210px] rounded-xl border bg-[#161618] text-left shadow-lg transition-colors"
      style={{ borderColor: selected ? color : "#2A2A2E" }}
    >
      <div
        className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-xs font-semibold text-white"
        style={{ backgroundColor: `${color}22`, color }}
      >
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
        {title}
      </div>
      <div className="px-3 py-2 text-[11px] text-[#B8B8C0]">{children}</div>
    </div>
  );
}

type NodeData = Record<string, unknown>;

function PromptNode({ data, selected }: NodeProps) {
  return (
    <NodeShell color={NODE_COLOR.prompt} title="Prompt" selected={selected}>
      <p className="line-clamp-3 min-h-[32px] whitespace-pre-wrap">
        {(data.text as string) || "Escreva o prompt no painel à direita…"}
      </p>
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.prompt }} />
    </NodeShell>
  );
}

function RefImageNode({ data, selected }: NodeProps) {
  const url = (data.url as string) || "";
  return (
    <NodeShell color={NODE_COLOR.refImage} title="Reference Image" selected={selected}>
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
  return (
    <NodeShell color={NODE_COLOR.imageGen} title="Image Generator" selected={selected}>
      <p>Modelo: <span className="text-white">{(data.model as string) || "gpt-image-2"}</span></p>
      <p>AR: {(data.aspectRatio as string) || "1:1"} · x{(data.count as number) || 1}</p>
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: "35%", background: "#22D3EE" }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: "65%", background: "#F97316" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.imageGen }} />
    </NodeShell>
  );
}

function VideoGenNode({ data, selected }: NodeProps) {
  return (
    <NodeShell color={NODE_COLOR.videoGen} title="Video Generator" selected={selected}>
      <p>Modelo: <span className="text-white">{(data.model as string) || "seedance-2.5"}</span></p>
      <p>{(data.duration as number) || 8}s · {(data.resolution as string) || "720p"} · {(data.aspectRatio as string) || "9:16"}</p>
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: "35%", background: "#22D3EE" }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: "65%", background: "#F97316" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.videoGen }} />
    </NodeShell>
  );
}

function OutputNode({ data, selected }: NodeProps) {
  return (
    <NodeShell color={NODE_COLOR.output} title="Output" selected={selected}>
      <p>{(data.label as string) || "Resultado final do fluxo"}</p>
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
  { type: "imageGen", label: "Gerador de imagem", Icon: ImageIcon, defaults: { label: "Image Generator", model: "gpt-image-2", aspectRatio: "1:1", count: 1 } },
  { type: "videoGen", label: "Gerador de vídeo", Icon: Film, defaults: { label: "Video Generator", model: "seedance-2.5", duration: 8, resolution: "720p", aspectRatio: "9:16" } },
  { type: "output", label: "Saída", Icon: CircleDot, defaults: { label: "Output" } },
] as const;

function Editor() {
  const params = useParams();
  const router = useRouter();
  const flowId = String(params?.id || "");
  const rf = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [name, setName] = useState("Novo Flow");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const counter = useRef(0);

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
    const nid = `${item.type}_${Date.now()}_${counter.current}`;
    const newNode: Node = {
      id: nid,
      type: item.type,
      position: { x: 120 + Math.random() * 260, y: 100 + Math.random() * 220 },
      data: { ...item.defaults },
    };
    setNodes((nds) => [...nds, newNode]);
    setSelectedId(nid);
  }

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) || null, [nodes, selectedId]);

  const patchData = useCallback(
    (patch: NodeData) => {
      if (!selectedId) return;
      setNodes((nds) =>
        nds.map((n) => (n.id === selectedId ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [selectedId, setNodes]
  );

  async function save() {
    setSaving(true);
    try {
      const obj = rf.toObject();
      const res = await fetch(`/api/flows/${flowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, definition: obj }),
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

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-[560px] flex-col">
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
          <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-[#666]">
            Adicionar nó
          </p>
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
            Clique para adicionar. Ligue os nós arrastando dos pontos coloridos. Selecione um nó
            para editar à direita.
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
            <Controls className="!bg-[#161618] !text-white" />
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
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-[#666]">
            Propriedades
          </p>
          {!selectedNode ? (
            <p className="px-1 text-xs text-[#666]">Selecione um nó para editar.</p>
          ) : (
            <Inspector node={selectedNode} onPatch={patchData} />
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

function Inspector({ node, onPatch }: { node: Node; onPatch: (p: NodeData) => void }) {
  const d = node.data as NodeData;
  if (node.type === "prompt") {
    return (
      <Field label="Texto do prompt">
        <textarea
          value={(d.text as string) || ""}
          onChange={(e) => onPatch({ text: e.target.value })}
          rows={6}
          className={inputCls}
          placeholder="Descreva o que gerar…"
        />
      </Field>
    );
  }
  if (node.type === "refImage") {
    return (
      <Field label="URL da imagem">
        <input
          value={(d.url as string) || ""}
          onChange={(e) => onPatch({ url: e.target.value })}
          className={inputCls}
          placeholder="https://…"
        />
      </Field>
    );
  }
  if (node.type === "imageGen") {
    return (
      <>
        <Field label="Modelo">
          <select value={(d.model as string) || "gpt-image-2"} onChange={(e) => onPatch({ model: e.target.value })} className={inputCls}>
            <option value="gpt-image-2">GPT Image 2</option>
            <option value="nano-banana-pro">Nano Banana Pro</option>
            <option value="nano-banana">Nano Banana</option>
            <option value="qwen-image">Qwen Image</option>
          </select>
        </Field>
        <Field label="Proporção">
          <select value={(d.aspectRatio as string) || "1:1"} onChange={(e) => onPatch({ aspectRatio: e.target.value })} className={inputCls}>
            {["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>
        <Field label="Quantidade">
          <input type="number" min={1} max={4} value={(d.count as number) || 1} onChange={(e) => onPatch({ count: Number(e.target.value) })} className={inputCls} />
        </Field>
      </>
    );
  }
  if (node.type === "videoGen") {
    return (
      <>
        <Field label="Modelo">
          <select value={(d.model as string) || "seedance-2.5"} onChange={(e) => onPatch({ model: e.target.value })} className={inputCls}>
            <option value="seedance-2.5">Seedance 2.5</option>
            <option value="seedance-2.0">Seedance 2.0</option>
            <option value="kling-3.0">Kling 3.0</option>
            <option value="veo-3.1-quality">Veo 3.1</option>
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
