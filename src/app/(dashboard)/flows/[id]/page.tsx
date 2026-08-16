"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
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
  Play,
  Loader2,
  Check,
  X as XIcon,
  Trash2,
  Type as TypeIcon,
  Image as ImageIcon,
  Film,
  FileImage,
  CircleDot,
  Workflow,
  Crosshair,
  Eraser,
  Plus,
  Maximize2,
  Minus,
  Upload,
  Sparkles,
  Music,
} from "lucide-react";
import { toast } from "sonner";
import { TTS_VOICES } from "@/lib/tts-voices";

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
  audioGen: "#F472B6",
  output: "#4ADE80",
};

const ModelsCtx = createContext<{ image: ModelOpt[]; video: ModelOpt[]; audio: ModelOpt[] }>({
  image: [],
  video: [],
  audio: [],
});

const fieldCls =
  "nodrag w-full rounded-lg border border-[#2A2A2E] bg-[#0f0f11] px-2 py-1.5 text-[11px] text-[#F5F5F5] outline-none focus:border-[#7C3AED]";

function StatusDot({ status }: { status?: string }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#A78BFA]" />;
  if (status === "done") return <Check className="h-3.5 w-3.5 text-[#4ADE80]" />;
  if (status === "failed") return <XIcon className="h-3.5 w-3.5 text-[#FCA5A5]" />;
  return null;
}

function ResultThumb({ url }: { url?: string }) {
  if (!url) return null;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(url))
    return <video src={url} muted playsInline controls className="nodrag mt-2 h-28 w-full rounded-lg object-cover" />;
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url))
    return <audio src={url} controls className="nodrag mt-2 w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="result" className="mt-2 h-28 w-full rounded-lg object-cover" />;
}

function NodeCard({
  id,
  color,
  icon: Icon,
  title,
  hint,
  status,
  selected,
  children,
}: {
  id: string;
  color: string;
  icon: typeof TypeIcon;
  title: string;
  hint?: string;
  status?: string;
  selected?: boolean;
  children?: React.ReactNode;
}) {
  const rf = useReactFlow();
  return (
    <div
      className="w-[262px] rounded-2xl border bg-[#161618]/95 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur transition-colors"
      style={{ borderColor: selected ? color : "#26262b" }}
      title={hint}
    >
      <div className="flex items-center gap-2 rounded-t-2xl border-b border-[#242428] px-3 py-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${color}22`, color }}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="flex-1 text-xs font-semibold" style={{ color }}>{title}</span>
        <StatusDot status={status} />
        <button
          type="button"
          className="nodrag flex h-6 w-6 items-center justify-center rounded-md text-[#666] transition hover:bg-[#2A1313] hover:text-[#FCA5A5]"
          onClick={() => rf.deleteElements({ nodes: [{ id }] })}
          title="Excluir nó"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="px-3 py-2.5">{children}</div>
    </div>
  );
}

function EnhanceBtn({ id, modality, value }: { id: string; modality: string; value: string }) {
  const rf = useReactFlow();
  const [busy, setBusy] = useState(false);
  async function go() {
    const cur = (value || "").trim();
    if (!cur) {
      toast.error("Escreva algo no prompt primeiro.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: cur, modality }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao melhorar o prompt.");
      rf.updateNodeData(id, { prompt: data.prompt });
      toast.success("Prompt melhorado ✨");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao melhorar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="nodrag mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#7C3AED]/40 bg-[#7C3AED]/10 py-1.5 text-[11px] font-medium text-[#A78BFA] transition hover:bg-[#7C3AED]/20 disabled:opacity-50"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      Melhorar prompt
    </button>
  );
}

function RefUploader({ id, refs }: { id: string; refs: string[] }) {
  const rf = useReactFlow();
  const [busy, setBusy] = useState(false);
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const got: string[] = [];
    for (const f of Array.from(files).slice(0, 8)) {
      try {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch("/api/upload", { method: "POST", body: fd });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.url) got.push(data.url);
      } catch {
        /* ignora arquivo */
      }
    }
    rf.updateNodeData(id, { refs: [...refs, ...got].slice(0, 8) });
    setBusy(false);
  }
  return (
    <div className="mb-2">
      <label className="nodrag flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#2A2A2E] bg-[#0f0f11] py-2 text-[11px] text-[#888] transition hover:border-[#F97316]/50">
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            void upload(e.target.files);
            e.currentTarget.value = "";
          }}
        />
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        Referências ({refs.length}/8)
      </label>
      {refs.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {refs.map((u, i) => (
            <div key={`${u}-${i}`} className="group relative h-10 w-10 overflow-hidden rounded-md ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => rf.updateNodeData(id, { refs: refs.filter((_, idx) => idx !== i) })}
                className="nodrag absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"
              >
                <XIcon className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PromptNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const d = data as NodeData;
  return (
    <NodeCard id={id} color={NODE_COLOR.prompt} icon={TypeIcon} title="Prompt" hint="Texto reutilizável que alimenta os geradores." status={d.__status as string} selected={selected}>
      <textarea value={(d.text as string) || ""} onChange={(e) => rf.updateNodeData(id, { text: e.target.value })} rows={3} className={fieldCls} placeholder="Escreva o prompt…" />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.prompt, width: 10, height: 10 }} />
    </NodeCard>
  );
}

function RefImageNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const d = data as NodeData;
  const url = (d.url as string) || "";
  return (
    <NodeCard id={id} color={NODE_COLOR.refImage} icon={FileImage} title="Reference Image" hint="Uma imagem de referência (URL) para estilo ou primeiro frame." status={d.__status as string} selected={selected}>
      <input value={url} onChange={(e) => rf.updateNodeData(id, { url: e.target.value })} className={fieldCls} placeholder="Cole a URL da imagem…" />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="ref" className="mt-2 h-24 w-full rounded-lg object-cover" />
      ) : null}
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.refImage, width: 10, height: 10 }} />
    </NodeCard>
  );
}

function ImageGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const models = useContext(ModelsCtx).image;
  const d = data as NodeData;
  const refs = Array.isArray(d.refs) ? (d.refs as string[]) : [];
  return (
    <NodeCard id={id} color={NODE_COLOR.imageGen} icon={ImageIcon} title="Image Generator" hint="Gera imagens do seu prompt. Suba ou conecte referências." status={d.__status as string} selected={selected}>
      <select value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })} className={`${fieldCls} mb-2`}>
        <option value="">— escolha o modelo —</option>
        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <textarea value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} rows={2} className={`${fieldCls} mb-2`} placeholder="Descreva a imagem (ou conecte um Prompt)…" />
      <EnhanceBtn id={id} modality="image" value={(d.prompt as string) || ""} />
      <RefUploader id={id} refs={refs} />
      <div className="flex gap-2">
        <select value={(d.aspectRatio as string) || "1:1"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })} className={fieldCls}>
          {["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={(d.resolution as string) || "720p"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })} className={fieldCls}>
          {["720p", "1080p"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <ResultThumb url={d.__result as string} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: 44, background: "#22D3EE", width: 10, height: 10 }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: 90, background: "#F97316", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.imageGen, width: 10, height: 10 }} />
    </NodeCard>
  );
}

function VideoGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const models = useContext(ModelsCtx).video;
  const d = data as NodeData;
  const refs = Array.isArray(d.refs) ? (d.refs as string[]) : [];
  return (
    <NodeCard id={id} color={NODE_COLOR.videoGen} icon={Film} title="Video Generator" hint="Transforma prompts em vídeos. Conecte/suba uma imagem como primeiro frame." status={d.__status as string} selected={selected}>
      <select value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })} className={`${fieldCls} mb-2`}>
        <option value="">— escolha o modelo —</option>
        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <textarea value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} rows={2} className={`${fieldCls} mb-2`} placeholder="Descreva o vídeo (ou conecte um Prompt)…" />
      <EnhanceBtn id={id} modality="video" value={(d.prompt as string) || ""} />
      <RefUploader id={id} refs={refs} />
      <div className="mb-2 flex items-center gap-2">
        <input type="range" min={4} max={30} value={(d.duration as number) || 8} onChange={(e) => rf.updateNodeData(id, { duration: Number(e.target.value) })} className="nodrag flex-1" />
        <span className="w-8 text-right text-[11px] text-[#B8B8C0]">{(d.duration as number) || 8}s</span>
      </div>
      <div className="flex gap-2">
        <select value={(d.aspectRatio as string) || "9:16"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })} className={fieldCls}>
          {["9:16", "16:9", "1:1", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={(d.resolution as string) || "720p"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })} className={fieldCls}>
          {["480p", "720p", "1080p"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>
      <ResultThumb url={d.__result as string} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: 44, background: "#22D3EE", width: 10, height: 10 }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: 90, background: "#F97316", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.videoGen, width: 10, height: 10 }} />
    </NodeCard>
  );
}

function AudioGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow();
  const models = useContext(ModelsCtx).audio;
  const d = data as NodeData;
  return (
    <NodeCard id={id} color={NODE_COLOR.audioGen} icon={Music} title="Audio Generator" hint="Gera voz (TTS) a partir do texto. Escolha modelo e voz." status={d.__status as string} selected={selected}>
      <select value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })} className={`${fieldCls} mb-2`}>
        <option value="">— escolha o modelo —</option>
        {models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <select value={(d.voice as string) || ""} onChange={(e) => rf.updateNodeData(id, { voice: e.target.value })} className={`${fieldCls} mb-2`}>
        <option value="">— voz —</option>
        {TTS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.accent}</option>)}
      </select>
      <textarea value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} rows={3} className={fieldCls} placeholder="Texto que a voz vai falar…" />
      <ResultThumb url={d.__result as string} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ background: "#22D3EE", width: 10, height: 10 }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: NODE_COLOR.audioGen, width: 10, height: 10 }} />
    </NodeCard>
  );
}

function OutputNode({ id, data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <NodeCard id={id} color={NODE_COLOR.output} icon={CircleDot} title="Output" hint="Coleta o resultado final do fluxo." status={d.__status as string} selected={selected}>
      {d.__result ? <ResultThumb url={d.__result as string} /> : <p className="text-[11px] text-[#888]">O resultado final aparece aqui após o Run.</p>}
      <Handle type="target" position={Position.Left} id="in" style={{ background: NODE_COLOR.output, width: 10, height: 10 }} />
    </NodeCard>
  );
}

const nodeTypes: NodeTypes = {
  prompt: PromptNode,
  refImage: RefImageNode,
  imageGen: ImageGenNode,
  videoGen: VideoGenNode,
  audioGen: AudioGenNode,
  output: OutputNode,
};

const NODE_DEFS = [
  { type: "imageGen", label: "Image Generator", Icon: ImageIcon, defaults: { prompt: "", model: "", modelName: "", aspectRatio: "1:1", resolution: "720p", refs: [] } },
  { type: "videoGen", label: "Video Generator", Icon: Film, defaults: { prompt: "", model: "", modelName: "", duration: 8, resolution: "720p", aspectRatio: "9:16", refs: [] } },
  { type: "audioGen", label: "Audio Generator", Icon: Music, defaults: { prompt: "", model: "", modelName: "", voice: "" } },
  { type: "prompt", label: "Prompt", Icon: TypeIcon, defaults: { text: "" } },
  { type: "refImage", label: "Reference Image", Icon: FileImage, defaults: { url: "" } },
  { type: "output", label: "Output", Icon: CircleDot, defaults: { label: "Output" } },
] as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Editor() {
  const params = useParams();
  const flowId = String(params?.id || "");
  const rf = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>([]);
  const [name, setName] = useState("Novo Flow");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [imageModels, setImageModels] = useState<ModelOpt[]>([]);
  const [videoModels, setVideoModels] = useState<ModelOpt[]>([]);
  const [audioModels, setAudioModels] = useState<ModelOpt[]>([]);
  const counter = useRef(0);

  const onNodesChange = useCallback((c: Parameters<typeof onNodesChangeRaw>[0]) => { onNodesChangeRaw(c); setDirty(true); }, [onNodesChangeRaw]);
  const onEdgesChange = useCallback((c: Parameters<typeof onEdgesChangeRaw>[0]) => { onEdgesChangeRaw(c); setDirty(true); }, [onEdgesChangeRaw]);

  useEffect(() => {
    (async () => {
      const load = async (t: string) => {
        const r = await fetch(`/api/models?type=${t}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null);
        return Array.isArray(r?.models) ? r.models.map((m: ModelOpt) => ({ id: m.id, name: m.name })) : [];
      };
      const [im, vm, am] = await Promise.all([load("image"), load("video"), load("audio")]);
      setImageModels(im);
      setVideoModels(vm);
      setAudioModels(am);
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
        setDirty(false);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao carregar flow.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [flowId, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => { setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#7C3AED", strokeWidth: 2 } }, eds)); setDirty(true); }, [setEdges]);

  const spawn = useCallback((type: string, position: { x: number; y: number }) => {
    const def = NODE_DEFS.find((d) => d.type === type);
    if (!def) return;
    counter.current += 1;
    const nid = `${type}_${Date.now()}_${counter.current}`;
    const defaults: NodeData = JSON.parse(JSON.stringify(def.defaults));
    if (type === "imageGen" && imageModels[0]) { defaults.model = imageModels[0].id; defaults.modelName = imageModels[0].name; }
    if (type === "videoGen" && videoModels[0]) { defaults.model = videoModels[0].id; defaults.modelName = videoModels[0].name; }
    if (type === "audioGen") { if (audioModels[0]) { defaults.model = audioModels[0].id; defaults.modelName = audioModels[0].name; } if (TTS_VOICES[0]) defaults.voice = TTS_VOICES[0].id; }
    setNodes((nds) => [...nds, { id: nid, type, position, data: defaults }]);
    setDirty(true);
  }, [imageModels, videoModels, audioModels, setNodes]);

  const addAtCenter = useCallback((type: string) => {
    const box = wrapRef.current?.getBoundingClientRect();
    const pos = box ? rf.screenToFlowPosition({ x: box.x + box.width / 2 - 130, y: box.y + box.height / 2 - 80 }) : { x: 200, y: 160 };
    spawn(type, pos);
  }, [rf, spawn]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/flownode");
    if (!type) return;
    spawn(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }, [rf, spawn]);

  const setNodeState = useCallback((id: string, patch: NodeData) => rf.updateNodeData(id, patch), [rf]);

  async function save() {
    setSaving(true);
    try {
      const obj = rf.toObject();
      const cleanNodes = obj.nodes.map((n) => {
        const dd = { ...(n.data as NodeData) };
        delete dd.__status;
        delete dd.__result;
        return { ...n, data: dd };
      });
      const res = await fetch(`/api/flows/${flowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, definition: { ...obj, nodes: cleanNodes } }) });
      if (!res.ok) { const data = await res.json().catch(() => null); throw new Error(data?.error || "Falha ao salvar flow."); }
      setDirty(false);
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
    const snapNodes = rf.getNodes();
    const snapEdges = rf.getEdges();
    if (snapNodes.length === 0) { toast.error("Adicione nós ao fluxo antes de rodar."); return; }

    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    snapNodes.forEach((n) => { indeg.set(n.id, 0); adj.set(n.id, []); });
    snapEdges.forEach((e) => { adj.get(e.source)?.push(e.target); indeg.set(e.target, (indeg.get(e.target) || 0) + 1); });
    const queue = snapNodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id);
    const order: string[] = [];
    while (queue.length) {
      const id = queue.shift()!;
      order.push(id);
      for (const t of adj.get(id) || []) { indeg.set(t, (indeg.get(t) || 0) - 1); if ((indeg.get(t) || 0) === 0) queue.push(t); }
    }
    if (order.length !== snapNodes.length) { toast.error("O fluxo tem um ciclo — remova ligações em loop."); return; }

    const nodeById = new Map(snapNodes.map((n) => [n.id, n]));
    const outputs = new Map<string, string>();
    snapNodes.forEach((n) => rf.updateNodeData(n.id, { __status: undefined, __result: undefined }));
    setRunning(true);
    try {
      for (const id of order) {
        const node = nodeById.get(id)!;
        const d = node.data as NodeData;
        const incoming = snapEdges.filter((e) => e.target === id);
        let promptText = "";
        const connRefs: string[] = [];
        for (const e of incoming) {
          const val = outputs.get(e.source);
          if (!val) continue;
          const isUrl = /^https?:\/\//i.test(val);
          if (e.targetHandle === "reference" || isUrl) connRefs.push(val);
          else promptText = promptText ? `${promptText} ${val}` : val;
        }

        if (node.type === "prompt") { outputs.set(id, (d.text as string) || ""); continue; }
        if (node.type === "refImage") { outputs.set(id, (d.url as string) || ""); continue; }
        if (node.type === "output") {
          const val = incoming.map((e) => outputs.get(e.source)).find(Boolean) || "";
          outputs.set(id, val);
          setNodeState(id, { __status: val ? "done" : "failed", __result: val || undefined });
          continue;
        }

        if (node.type === "audioGen") {
          const text = String(d.prompt || "").trim() || promptText.trim();
          if (!d.model) { setNodeState(id, { __status: "failed" }); throw new Error("Selecione um modelo no Audio Generator."); }
          if (!text) { setNodeState(id, { __status: "failed" }); throw new Error("Escreva o texto no Audio Generator."); }
          setNodeState(id, { __status: "running", __result: undefined });
          const res = await fetch("/api/generate/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, model_uuid: d.model, voice_id: d.voice }) });
          const data = await res.json().catch(() => null);
          if (!res.ok) { setNodeState(id, { __status: "failed" }); throw new Error(data?.error || "Falha ao gerar áudio."); }
          let url = data?.result_url as string | undefined;
          if (data?.status !== "completed" || !url) url = await pollGeneration(String(data.generation_id));
          outputs.set(id, url);
          setNodeState(id, { __status: "done", __result: url });
          continue;
        }

        if (node.type === "imageGen" || node.type === "videoGen") {
          const genLabel = node.type === "imageGen" ? "Image Generator" : "Video Generator";
          const finalPrompt = promptText.trim() || String(d.prompt || "").trim();
          if (!d.model) { setNodeState(id, { __status: "failed" }); throw new Error(`O no "${genLabel}" precisa de um modelo selecionado.`); }
          if (!finalPrompt) { setNodeState(id, { __status: "failed" }); throw new Error(`O no "${genLabel}" precisa de um prompt — escreva nele ou conecte um Prompt.`); }
          setNodeState(id, { __status: "running", __result: undefined });

          const isImage = node.type === "imageGen";
          const uploaded = Array.isArray(d.refs) ? (d.refs as string[]) : [];
          const allRefs = [...connRefs, ...uploaded];
          const body: Record<string, unknown> = { prompt: finalPrompt, model_uuid: d.model, aspect_ratio: d.aspectRatio, quality: "high", resolution: d.resolution || "720p" };
          if (allRefs.length > 0) { body.reference_images = allRefs; body.reference_image_url = allRefs[0]; }
          if (!isImage) body.duration = d.duration;

          const res = await fetch(`/api/generate/${isImage ? "image" : "video"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const data = await res.json().catch(() => null);
          if (!res.ok) { setNodeState(id, { __status: "failed" }); throw new Error(data?.error || "Falha ao iniciar a geração."); }
          let url = data?.result_url as string | undefined;
          if (data?.status !== "completed" || !url) url = await pollGeneration(String(data.generation_id));
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

  function clearAll() {
    if (nodes.length === 0) return;
    if (!window.confirm("Limpar todos os nós deste flow?")) return;
    setNodes([]);
    setEdges([]);
    setDirty(true);
  }

  return (
    <ModelsCtx.Provider value={{ image: imageModels, video: videoModels, audio: audioModels }}>
      <div className="relative flex h-[calc(100vh-4rem)] min-h-[560px] flex-col">
        <style>{`.react-flow__attribution{display:none}`}</style>
        <div className="flex items-center gap-2 border-b border-[#242428] px-4 py-2.5">
          <Link href="/flows" className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#2A2A2A] text-[#B8B8C0] hover:bg-white/5" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Workflow className="h-4 w-4 text-[#7C3AED]" />
          <Link href="/flows" className="text-sm text-[#888] hover:text-white">Flows</Link>
          <span className="text-[#555]">/</span>
          <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-[#F5F5F5] outline-none hover:border-[#2A2A2A] focus:border-[#7C3AED]" />
          <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: dirty ? "#F59E0B22" : "#4ADE8022", color: dirty ? "#FBBF24" : "#4ADE80" }}>
            {saving ? "Salvando…" : dirty ? "Não salvo" : "Salvo ✓"}
          </span>
          <button type="button" onClick={() => void save()} disabled={saving || loading} className="rounded-full bg-[#7C3AED] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#6D28D9] disabled:opacity-50">
            Salvar
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          <div ref={wrapRef} className="relative min-w-0 flex-1 bg-[#0d0d0f]" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView minZoom={0.2} proOptions={{ hideAttribution: true }}>
              <Background color="#242428" gap={20} />
              <MiniMap pannable zoomable nodeColor={(n) => NODE_COLOR[n.type || "output"] || "#666"} maskColor="rgba(0,0,0,0.65)" style={{ background: "#101012", borderRadius: 8 }} />
            </ReactFlow>

            {nodes.length === 0 && !loading && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p className="text-sm text-[#666]">Arraste um nó do painel à direita para começar.</p>
              </div>
            )}

            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[#242428] bg-[#161618]/95 p-1 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur">
              <button type="button" onClick={() => void runFlow()} disabled={running || loading} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition hover:bg-white/90 disabled:opacity-50">
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" fill="currentColor" />}
                {running ? "Rodando…" : "Run Flow"}
              </button>
              <button type="button" onClick={clearAll} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[#B8B8C0] transition hover:bg-white/5"><Eraser className="h-4 w-4" /> Limpar</button>
              <button type="button" onClick={() => rf.fitView({ duration: 300 })} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[#B8B8C0] transition hover:bg-white/5"><Crosshair className="h-4 w-4" /> Centralizar</button>
              <div className="mx-1 h-5 w-px bg-[#2A2A2E]" />
              <button type="button" onClick={() => rf.zoomOut()} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#B8B8C0] hover:bg-white/5"><Minus className="h-4 w-4" /></button>
              <button type="button" onClick={() => rf.zoomIn()} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#B8B8C0] hover:bg-white/5"><Plus className="h-4 w-4" /></button>
              <button type="button" onClick={() => rf.fitView({ duration: 300 })} className="flex h-8 w-8 items-center justify-center rounded-lg text-[#B8B8C0] hover:bg-white/5"><Maximize2 className="h-4 w-4" /></button>
            </div>
          </div>

          <div className="w-[240px] shrink-0 border-l border-[#242428] bg-[#101012] p-3">
            <div className="mb-2 flex items-center gap-2 px-1">
              <Workflow className="h-4 w-4 text-[#A78BFA]" />
              <p className="text-xs font-semibold text-[#F5F5F5]">Nós</p>
            </div>
            <div className="space-y-1.5">
              {NODE_DEFS.map((def) => (
                <button key={def.type} type="button" draggable onDragStart={(e) => { e.dataTransfer.setData("application/flownode", def.type); e.dataTransfer.effectAllowed = "move"; }} onClick={() => addAtCenter(def.type)} className="flex w-full cursor-grab items-center gap-2.5 rounded-xl border border-[#242428] bg-[#161618] px-3 py-2.5 text-left transition hover:border-[#7C3AED]/50 hover:bg-white/5 active:cursor-grabbing">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ backgroundColor: `${NODE_COLOR[def.type]}22`, color: NODE_COLOR[def.type] }}>
                    <def.Icon className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-medium text-[#E5E5E5]">{def.label}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 px-1 text-[10px] leading-relaxed text-[#666]">
              Arraste um nó pro canvas (ou clique). Ligue arrastando dos pontos coloridos: azul = prompt, laranja = referência. Depois clique em <span className="text-white">Run Flow</span>.
            </p>
          </div>
        </div>
      </div>
    </ModelsCtx.Provider>
  );
}

export default function FlowEditorPage() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
