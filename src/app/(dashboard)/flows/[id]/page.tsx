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
  type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Play, Loader2, Check, X as XIcon, Trash2, Info, ChevronDown,
  Type as TypeIcon, Image as ImageIcon, Film, FileImage, CircleDot, Workflow,
  Crosshair, Eraser, Plus, Maximize2, Minus, Upload, Sparkles, Music, Zap,
  PanelRightClose, PanelRightOpen,
} from "lucide-react";
import { toast } from "sonner";
import { TTS_VOICES } from "@/lib/tts-voices";

/* ─── DESIGN TOKENS + primitivos (CSS vars) ─────────────────────────────── */
const FLOW_CSS = `
.flow-root{
  --flow-bg:#08080a; --flow-surface:#141416; --flow-raised:#191a1d; --flow-input:#1c1c20;
  --flow-border:rgba(255,255,255,.09); --flow-border-hover:rgba(255,255,255,.17);
  --flow-text:#F2F2F3; --flow-muted:#9a9aa2; --flow-subtle:#6b6b73;
  --node-radius:12px; --ctrl-radius:9px;
}
.flow-root .react-flow__attribution{display:none}
.flow-root .react-flow__handle{width:11px;height:11px;border:2px solid var(--flow-surface);opacity:.85;transition:opacity .15s,transform .15s}
.flow-root .react-flow__node:hover .react-flow__handle{opacity:1}
.flow-root .react-flow__handle:hover{opacity:1;transform:scale(1.25)}
.flow-root .react-flow__handle::after{content:"";position:absolute;inset:-8px;border-radius:999px}
.flow-ctrl{background:var(--flow-input);border:1px solid var(--flow-border);color:var(--flow-text);border-radius:var(--ctrl-radius);transition:border-color .14s,background .14s;outline:none}
.flow-ctrl:hover{border-color:var(--flow-border-hover)}
.flow-ctrl:focus{border-color:#7C3AED}
.flow-ctrl::placeholder{color:var(--flow-subtle)}
.flow-btn{background:var(--flow-raised);border:1px solid var(--flow-border);color:var(--flow-text);border-radius:var(--ctrl-radius);transition:border-color .14s,background .14s}
.flow-btn:hover{border-color:var(--flow-border-hover);background:#202024}
.flow-up{background:var(--flow-input);border:1px dashed var(--flow-border);color:var(--flow-subtle);border-radius:var(--ctrl-radius);transition:border-color .14s,color .14s}
.flow-up:hover{border-color:var(--flow-border-hover);color:var(--flow-muted)}
.flow-card{background:var(--flow-surface);border:1px solid var(--flow-border);border-radius:var(--node-radius);box-shadow:0 8px 30px rgba(0,0,0,.35);transition:border-color .14s,box-shadow .14s}
.flow-card:hover{border-color:var(--flow-border-hover)}
.flow-item{background:var(--flow-raised);border:1px solid var(--flow-border);border-radius:10px;transition:border-color .14s,background .14s}
.flow-item:hover{border-color:var(--flow-border-hover);background:#202024}
.flow-seg{background:var(--flow-input);border:1px solid var(--flow-border);border-radius:8px}
`;

type NodeData = Record<string, unknown>;
interface ModelOpt { id: string; name: string }

const ACCENT: Record<string, string> = {
  prompt: "#B8B8C0", refImage: "#F97316", imageGen: "#F97316",
  videoGen: "#3B82F6", audioGen: "#A78BFA", output: "#4ADE80",
};

const ModelsCtx = createContext<{ image: ModelOpt[]; video: ModelOpt[]; audio: ModelOpt[] }>({ image: [], video: [], audio: [] });
const ActionsCtx = createContext<{ runNode: (id: string) => void; running: boolean }>({ runNode: () => {}, running: false });

/* ─── PRIMITIVOS DE CONTROLE ────────────────────────────────────────────── */
function NodeSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`flow-ctrl nodrag h-[34px] w-full appearance-none pl-2.5 pr-7 text-xs ${props.className || ""}`} />
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--flow-subtle)]" />
    </div>
  );
}
function NodeTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`flow-ctrl nodrag w-full resize-none px-2.5 py-2 text-xs leading-relaxed ${props.className || ""}`} />;
}
function NodeInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`flow-ctrl nodrag h-[34px] w-full px-2.5 text-xs ${props.className || ""}`} />;
}
function NodeButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...p} className={`flow-btn nodrag flex h-[34px] w-full items-center justify-center gap-1.5 text-xs font-medium disabled:opacity-50 ${p.className || ""}`}>{children}</button>;
}
function NodeField({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      {label ? <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[color:var(--flow-subtle)]">{label}</span> : null}
      {children}
    </div>
  );
}
function NodeTabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flow-seg nodrag mb-2.5 grid p-0.5" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
      {tabs.map((t) => (
        <button key={t} type="button" onClick={() => onChange(t)} className="rounded-[6px] py-1 text-[11px] font-medium transition"
          style={value === t ? { background: "#7C3AED", color: "#fff" } : { color: "var(--flow-muted)" }}>{t}</button>
      ))}
    </div>
  );
}
function NodeSwitch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="flow-item nodrag flex h-[34px] flex-1 items-center justify-between gap-2 px-2.5 text-[11px] text-[color:var(--flow-text)]">
      <span>{label}</span>
      <span className="relative inline-flex h-4 w-7 items-center rounded-full transition" style={{ background: on ? "#7C3AED" : "#3a3a40" }}>
        <span className="absolute h-3 w-3 rounded-full bg-white transition" style={{ left: on ? 14 : 2 }} />
      </span>
    </button>
  );
}
function StatusDot({ status }: { status?: string }) {
  if (status === "running") return <Loader2 className="h-4 w-4 animate-spin text-[#A78BFA]" />;
  if (status === "done") return <Check className="h-4 w-4 text-[#4ADE80]" />;
  if (status === "failed") return <XIcon className="h-4 w-4 text-[#FCA5A5]" />;
  return null;
}
function ResultThumb({ url }: { url?: string }) {
  if (!url) return null;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) return <video src={url} muted playsInline controls className="nodrag mt-2.5 h-32 w-full rounded-[9px] object-cover" />;
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url)) return <audio src={url} controls className="nodrag mt-2.5 w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="result" className="mt-2.5 h-32 w-full rounded-[9px] object-cover" />;
}

/* ─── NODE SHELL / HEADER ────────────────────────────────────────────────── */
function NodeShell({ id, accent, icon: Icon, title, hint, status, selected, runnable, width = 290, children }: {
  id: string; accent: string; icon: typeof TypeIcon; title: string; hint?: string; status?: string; selected?: boolean; runnable?: boolean; width?: number; children?: React.ReactNode;
}) {
  const rf = useReactFlow();
  const { runNode, running } = useContext(ActionsCtx);
  return (
    <div className="flow-card" style={{ width, ...(selected ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}, 0 10px 34px rgba(0,0,0,.45)` } : {}) }}>
      <div className="flex h-[38px] items-center gap-2 border-b px-3" style={{ borderColor: "var(--flow-border)" }}>
        <span className="flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: `${accent}22`, color: accent }}><Icon className="h-3.5 w-3.5" /></span>
        <span className="flex-1 truncate text-[12px] font-semibold" style={{ color: accent }}>{title}</span>
        <StatusDot status={status} />
        {hint ? <span className="nodrag flex h-6 w-6 items-center justify-center rounded-md text-[color:var(--flow-subtle)] transition hover:text-[color:var(--flow-muted)]" title={hint}><Info className="h-3.5 w-3.5" /></span> : null}
        <button type="button" className="nodrag flex h-6 w-6 items-center justify-center rounded-md text-[color:var(--flow-subtle)] transition hover:bg-[#2A1313] hover:text-[#FCA5A5]" onClick={() => rf.deleteElements({ nodes: [{ id }] })} title="Excluir nó"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      <div className="p-3">{children}</div>
      {runnable ? (
        <div className="flex justify-end border-t px-3 py-2" style={{ borderColor: "var(--flow-border)" }}>
          <button type="button" disabled={running} onClick={() => runNode(id)} className="nodrag flex h-8 w-8 items-center justify-center rounded-full bg-white text-[#0A0A0A] transition hover:bg-white/90 disabled:opacity-50" title="Rodar este nó e suas dependências">
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" fill="currentColor" />}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ─── UPLOADS ───────────────────────────────────────────────────────────── */
async function uploadFile(f: File): Promise<string | null> {
  try {
    const fd = new FormData(); fd.append("file", f);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const data = await res.json().catch(() => null);
    return res.ok && data?.url ? (data.url as string) : null;
  } catch { return null; }
}
function MultiUpload({ id, refs }: { id: string; refs: string[] }) {
  const rf = useReactFlow();
  const [busy, setBusy] = useState(false);
  async function go(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const got: string[] = [];
    for (const f of Array.from(files).slice(0, 8)) { const u = await uploadFile(f); if (u) got.push(u); }
    rf.updateNodeData(id, { refs: [...refs, ...got].slice(0, 8) }); setBusy(false);
  }
  return (
    <div className="mb-2.5">
      <label className="flow-up nodrag flex cursor-pointer flex-col items-center justify-center gap-1.5 py-4 text-[11px]">
        <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void go(e.target.files); e.currentTarget.value = ""; }} />
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        Solte imagens ou clique ({refs.length}/8)
      </label>
      {refs.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {refs.map((u, i) => (
            <div key={`${u}-${i}`} className="group relative h-11 w-11 overflow-hidden rounded-lg ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-full w-full object-cover" />
              <button type="button" onClick={() => rf.updateNodeData(id, { refs: refs.filter((_, x) => x !== i) })} className="nodrag absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition group-hover:opacity-100"><XIcon className="h-2.5 w-2.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
function FrameUpload({ id, field, url }: { id: string; field: string; url: string }) {
  const rf = useReactFlow();
  const [busy, setBusy] = useState(false);
  async function go(files: FileList | null) {
    const f = files?.[0]; if (!f) return;
    setBusy(true); const u = await uploadFile(f); if (u) rf.updateNodeData(id, { [field]: u }); setBusy(false);
  }
  return (
    <label className="flow-up nodrag relative flex h-16 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden text-[10px]">
      <input type="file" accept="image/*" className="hidden" onChange={(e) => { void go(e.target.files); e.currentTarget.value = ""; }} />
      {url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <button type="button" onClick={(e) => { e.preventDefault(); rf.updateNodeData(id, { [field]: "" }); }} className="nodrag absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/70 text-white"><XIcon className="h-2.5 w-2.5" /></button>
        </>
      ) : busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Upload className="h-4 w-4" />Solte/clique</>}
    </label>
  );
}

/* ─── NODES ─────────────────────────────────────────────────────────────── */
function PromptNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const d = data as NodeData;
  return (
    <NodeShell id={id} accent={ACCENT.prompt} icon={TypeIcon} title={(d.title as string) || "Prompt"} hint="Texto reutilizável que alimenta os geradores." status={d.__status as string} selected={selected} width={272}>
      <NodeTextarea rows={4} value={(d.text as string) || ""} onChange={(e) => rf.updateNodeData(id, { text: e.target.value })} placeholder="Texto…" />
      <Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.prompt }} />
    </NodeShell>
  );
}
function RefImageNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const d = data as NodeData; const url = (d.url as string) || "";
  return (
    <NodeShell id={id} accent={ACCENT.refImage} icon={FileImage} title={(d.title as string) || "Reference Image"} hint="Imagem de referência (URL)." status={d.__status as string} selected={selected} width={272}>
      <NodeInput value={url} onChange={(e) => rf.updateNodeData(id, { url: e.target.value })} placeholder="Cole a URL da imagem…" />
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="ref" className="mt-2.5 h-28 w-full rounded-[9px] object-cover" />
      ) : null}
      <Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.refImage }} />
    </NodeShell>
  );
}
function WiseEnhanceBtn({ id, modality, value, label }: { id: string; modality: string; value: string; label: string }) {
  const rf = useReactFlow(); const [busy, setBusy] = useState(false);
  async function go() {
    const cur = (value || "").trim(); if (!cur) { toast.error("Escreva algo no prompt primeiro."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: cur, modality }) });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "Falha ao melhorar.");
      rf.updateNodeData(id, { prompt: data.prompt }); toast.success("Prompt melhorado ✨");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); }
  }
  return <div className="mb-2.5"><NodeButton onClick={go} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-[#A78BFA]" />}{label}</NodeButton></div>;
}
function ImageGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx).image; const d = data as NodeData;
  const refs = Array.isArray(d.refs) ? (d.refs as string[]) : [];
  return (
    <NodeShell id={id} accent={ACCENT.imageGen} icon={ImageIcon} title={(d.title as string) || "Image Generator"} hint="Gera imagens do seu prompt." status={d.__status as string} selected={selected} runnable>
      <NodeField><NodeSelect value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })}><option value="">— modelo —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NodeSelect></NodeField>
      <NodeField><NodeTextarea rows={3} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Descreva a imagem (ou conecte um Prompt)…" /></NodeField>
      <WiseEnhanceBtn id={id} modality="image" value={(d.prompt as string) || ""} label="Wise enhance" />
      <MultiUpload id={id} refs={refs} />
      <div className="grid grid-cols-2 gap-2">
        <NodeSelect value={(d.aspectRatio as string) || "1:1"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })}>{["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}</NodeSelect>
        <NodeSelect value={(d.resolution as string) || "720p"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })}>{["720p", "1080p"].map((r) => <option key={r} value={r}>{r}</option>)}</NodeSelect>
      </div>
      <ResultThumb url={d.__result as string} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: 52, background: "#22D3EE" }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: 96, background: "#F97316" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.imageGen }} />
    </NodeShell>
  );
}
function VideoGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx).video; const d = data as NodeData;
  return (
    <NodeShell id={id} accent={ACCENT.videoGen} icon={Film} title={(d.title as string) || "Video Generator"} hint="Transforma prompts em vídeos. Start/End frame opcionais." status={d.__status as string} selected={selected} runnable width={296}>
      <NodeField><NodeSelect value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })}><option value="">— modelo —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NodeSelect></NodeField>
      <NodeField><NodeTextarea rows={3} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Descreva o movimento (ou conecte um Prompt)…" /></NodeField>
      <WiseEnhanceBtn id={id} modality="video" value={(d.prompt as string) || ""} label="Generate prompt for me" />
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <div><span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[color:var(--flow-subtle)]">Start Frame</span><FrameUpload id={id} field="startFrame" url={(d.startFrame as string) || ""} /></div>
        <div><span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-[color:var(--flow-subtle)]">End Frame</span><FrameUpload id={id} field="endFrame" url={(d.endFrame as string) || ""} /></div>
      </div>
      <div className="mb-2.5 grid grid-cols-2 gap-2">
        <NodeSelect value={(d.aspectRatio as string) || "9:16"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })}>{["9:16", "16:9", "1:1", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}</NodeSelect>
        <NodeSelect value={(d.resolution as string) || "720p"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })}>{["480p", "720p", "1080p"].map((r) => <option key={r} value={r}>{r}</option>)}</NodeSelect>
      </div>
      <div className="mb-2.5 flex items-center gap-2">
        <input type="range" min={4} max={30} value={(d.duration as number) || 8} onChange={(e) => rf.updateNodeData(id, { duration: Number(e.target.value) })} className="nodrag flex-1" />
        <span className="w-8 text-right text-[11px] text-[color:var(--flow-muted)]">{(d.duration as number) || 8}s</span>
      </div>
      <div className="flex gap-2">
        <NodeSwitch label="Audio" on={d.audioOn !== false} onToggle={() => rf.updateNodeData(id, { audioOn: d.audioOn === false })} />
        <NodeSwitch label="Multi-shot" on={Boolean(d.multiShot)} onToggle={() => rf.updateNodeData(id, { multiShot: !d.multiShot })} />
      </div>
      <ResultThumb url={d.__result as string} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ top: 52, background: "#22D3EE" }} />
      <Handle type="target" position={Position.Left} id="reference" style={{ top: 96, background: "#F97316" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.videoGen }} />
    </NodeShell>
  );
}
function AudioGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx).audio; const d = data as NodeData;
  const voice = TTS_VOICES.find((v) => v.id === (d.voice as string));
  function preview() { if (voice?.preview) { const a = new Audio(voice.preview); void a.play().catch(() => {}); } }
  return (
    <NodeShell id={id} accent={ACCENT.audioGen} icon={Music} title={(d.title as string) || "Audio Generator"} hint="Gera voz (TTS) a partir do texto." status={d.__status as string} selected={selected} runnable>
      <NodeTabs tabs={["TTS", "SFX", "Music"]} value={(d.mode as string) || "TTS"} onChange={(v) => { if (v !== "TTS") { toast("SFX/Music em breve — usando TTS."); return; } rf.updateNodeData(id, { mode: v }); }} />
      <NodeField><NodeSelect value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })}><option value="">— modelo —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</NodeSelect></NodeField>
      <NodeField><NodeSelect value={(d.voice as string) || ""} onChange={(e) => rf.updateNodeData(id, { voice: e.target.value })}><option value="">— voz —</option>{TTS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.accent}</option>)}</NodeSelect></NodeField>
      <div className="mb-2.5"><NodeButton onClick={preview} disabled={!voice}><Play className="h-3.5 w-3.5" fill="currentColor" />Preview Voice</NodeButton></div>
      <NodeTextarea rows={3} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Texto que a voz vai falar…" />
      <ResultThumb url={d.__result as string} />
      <Handle type="target" position={Position.Left} id="prompt" style={{ background: "#22D3EE" }} />
      <Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.audioGen }} />
    </NodeShell>
  );
}
function OutputNode({ id, data, selected }: NodeProps) {
  const d = data as NodeData;
  return (
    <NodeShell id={id} accent={ACCENT.output} icon={CircleDot} title={(d.title as string) || "Output"} hint="Coleta o resultado final." status={d.__status as string} selected={selected} width={272}>
      {d.__result ? <ResultThumb url={d.__result as string} /> : <p className="text-[11px] text-[color:var(--flow-subtle)]">O resultado final aparece aqui após o Run.</p>}
      <Handle type="target" position={Position.Left} id="in" style={{ background: ACCENT.output }} />
    </NodeShell>
  );
}

const nodeTypes: NodeTypes = { prompt: PromptNode, refImage: RefImageNode, imageGen: ImageGenNode, videoGen: VideoGenNode, audioGen: AudioGenNode, output: OutputNode };

const NODE_DEFS = [
  { type: "imageGen", label: "Image Generator", Icon: ImageIcon, group: "gen", hint: "Gera imagens.", defaults: { prompt: "", model: "", modelName: "", aspectRatio: "1:1", resolution: "720p", refs: [] } },
  { type: "videoGen", label: "Video Generator", Icon: Film, group: "gen", hint: "Gera vídeos.", defaults: { prompt: "", model: "", modelName: "", duration: 8, resolution: "720p", aspectRatio: "9:16", startFrame: "", endFrame: "", audioOn: true, multiShot: false } },
  { type: "audioGen", label: "Audio Generator", Icon: Music, group: "gen", hint: "Gera voz (TTS).", defaults: { prompt: "", model: "", modelName: "", voice: "", mode: "TTS" } },
  { type: "prompt", label: "Prompt", Icon: TypeIcon, group: "util", hint: "Texto reutilizável.", defaults: { text: "" } },
  { type: "refImage", label: "Reference Image", Icon: FileImage, group: "util", hint: "Imagem de referência.", defaults: { url: "" } },
  { type: "output", label: "Output", Icon: CircleDot, group: "util", hint: "Resultado final.", defaults: { label: "Output" } },
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
  const [zoom, setZoom] = useState(1);
  const [credits, setCredits] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [imageModels, setImageModels] = useState<ModelOpt[]>([]);
  const [videoModels, setVideoModels] = useState<ModelOpt[]>([]);
  const [audioModels, setAudioModels] = useState<ModelOpt[]>([]);
  const counter = useRef(0);

  const onNodesChange = useCallback((c: Parameters<typeof onNodesChangeRaw>[0]) => { onNodesChangeRaw(c); setDirty(true); }, [onNodesChangeRaw]);
  const onEdgesChange = useCallback((c: Parameters<typeof onEdgesChangeRaw>[0]) => { onEdgesChangeRaw(c); setDirty(true); }, [onEdgesChangeRaw]);

  useEffect(() => {
    (async () => {
      const load = async (t: string) => { const r = await fetch(`/api/models?type=${t}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null); return Array.isArray(r?.models) ? r.models.map((m: ModelOpt) => ({ id: m.id, name: m.name })) : []; };
      const [im, vm, am] = await Promise.all([load("image"), load("video"), load("audio")]);
      setImageModels(im); setVideoModels(vm); setAudioModels(am);
      try { const me = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null); if (typeof me?.credits === "number") setCredits(me.credits); } catch { /* noop */ }
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
      } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao carregar flow."); } finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [flowId, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => { setEdges((eds) => addEdge({ ...c, animated: true, style: { stroke: "#7C3AED", strokeWidth: 2 } }, eds)); setDirty(true); }, [setEdges]);

  const spawn = useCallback((type: string, position: { x: number; y: number }) => {
    const def = NODE_DEFS.find((d) => d.type === type); if (!def) return;
    counter.current += 1;
    const nid = `${type}_${Date.now()}_${counter.current}`;
    const same = rf.getNodes().filter((n) => n.type === type).length;
    const label = def.label;
    const defaults: NodeData = JSON.parse(JSON.stringify(def.defaults));
    defaults.title = `${label} ${same + 1}`;
    if (type === "imageGen" && imageModels[0]) { defaults.model = imageModels[0].id; defaults.modelName = imageModels[0].name; }
    if (type === "videoGen" && videoModels[0]) { defaults.model = videoModels[0].id; defaults.modelName = videoModels[0].name; }
    if (type === "audioGen") { if (audioModels[0]) { defaults.model = audioModels[0].id; defaults.modelName = audioModels[0].name; } if (TTS_VOICES[0]) defaults.voice = TTS_VOICES[0].id; }
    setNodes((nds) => [...nds, { id: nid, type, position, data: defaults }]);
    setDirty(true);
  }, [imageModels, videoModels, audioModels, setNodes, rf]);

  const addAtCenter = useCallback((type: string) => {
    const box = wrapRef.current?.getBoundingClientRect();
    const pos = box ? rf.screenToFlowPosition({ x: box.x + box.width / 2 - 145, y: box.y + box.height / 2 - 100 }) : { x: 200, y: 160 };
    spawn(type, pos);
  }, [rf, spawn]);

  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); const type = e.dataTransfer.getData("application/flownode"); if (!type) return; spawn(type, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }, [rf, spawn]);

  const setNodeState = useCallback((id: string, patch: NodeData) => rf.updateNodeData(id, patch), [rf]);

  async function save() {
    setSaving(true);
    try {
      const obj = rf.toObject();
      const cleanNodes = obj.nodes.map((n) => { const dd = { ...(n.data as NodeData) }; delete dd.__status; delete dd.__result; return { ...n, data: dd }; });
      const res = await fetch(`/api/flows/${flowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, definition: { ...obj, nodes: cleanNodes } }) });
      if (!res.ok) { const data = await res.json().catch(() => null); throw new Error(data?.error || "Falha ao salvar flow."); }
      setDirty(false); toast.success("Flow salvo ✓");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao salvar flow."); } finally { setSaving(false); }
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

  const runFlow = useCallback(async (targetId?: string) => {
    const snapNodes = rf.getNodes(); const snapEdges = rf.getEdges();
    if (snapNodes.length === 0) { toast.error("Adicione nós ao fluxo antes de rodar."); return; }
    const indeg = new Map<string, number>(); const adj = new Map<string, string[]>();
    snapNodes.forEach((n) => { indeg.set(n.id, 0); adj.set(n.id, []); });
    snapEdges.forEach((e) => { adj.get(e.source)?.push(e.target); indeg.set(e.target, (indeg.get(e.target) || 0) + 1); });
    const queue = snapNodes.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id); const order: string[] = [];
    while (queue.length) { const id = queue.shift()!; order.push(id); for (const t of adj.get(id) || []) { indeg.set(t, (indeg.get(t) || 0) - 1); if ((indeg.get(t) || 0) === 0) queue.push(t); } }
    if (order.length !== snapNodes.length) { toast.error("O fluxo tem um ciclo — remova ligações em loop."); return; }
    let allowed: Set<string> | null = null;
    if (targetId) {
      const radj = new Map<string, string[]>(); snapNodes.forEach((n) => radj.set(n.id, []));
      snapEdges.forEach((e) => radj.get(e.target)?.push(e.source));
      allowed = new Set<string>(); const q = [targetId];
      while (q.length) { const x = q.shift()!; if (allowed.has(x)) continue; allowed.add(x); for (const s of radj.get(x) || []) q.push(s); }
    }
    const runOrder = allowed ? order.filter((id) => allowed!.has(id)) : order;
    const nodeById = new Map(snapNodes.map((n) => [n.id, n])); const outputs = new Map<string, string>();
    runOrder.forEach((id) => rf.updateNodeData(id, { __status: undefined, __result: undefined }));
    setRunning(true);
    try {
      for (const id of runOrder) {
        const node = nodeById.get(id)!; const d = node.data as NodeData;
        const incoming = snapEdges.filter((e) => e.target === id);
        let promptText = ""; const connRefs: string[] = [];
        for (const e of incoming) { const val = outputs.get(e.source); if (!val) continue; const isUrl = /^https?:\/\//i.test(val); if (e.targetHandle === "reference" || isUrl) connRefs.push(val); else promptText = promptText ? `${promptText} ${val}` : val; }
        if (node.type === "prompt") { outputs.set(id, (d.text as string) || ""); continue; }
        if (node.type === "refImage") { outputs.set(id, (d.url as string) || ""); continue; }
        if (node.type === "output") { const val = incoming.map((e) => outputs.get(e.source)).find(Boolean) || ""; outputs.set(id, val); setNodeState(id, { __status: val ? "done" : "failed", __result: val || undefined }); continue; }
        if (node.type === "audioGen") {
          const text = String(d.prompt || "").trim() || promptText.trim();
          if (!d.model) { setNodeState(id, { __status: "failed" }); throw new Error(`O no "${d.title || "Audio Generator"}" precisa de um modelo.`); }
          if (!text) { setNodeState(id, { __status: "failed" }); throw new Error(`O no "${d.title || "Audio Generator"}" precisa de um texto.`); }
          setNodeState(id, { __status: "running", __result: undefined });
          const res = await fetch("/api/generate/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, model_uuid: d.model, voice_id: d.voice }) });
          const data = await res.json().catch(() => null);
          if (!res.ok) { setNodeState(id, { __status: "failed" }); throw new Error(data?.error || "Falha ao gerar áudio."); }
          let url = data?.result_url as string | undefined; if (data?.status !== "completed" || !url) url = await pollGeneration(String(data.generation_id));
          outputs.set(id, url); setNodeState(id, { __status: "done", __result: url }); continue;
        }
        if (node.type === "imageGen" || node.type === "videoGen") {
          const genLabel = (d.title as string) || (node.type === "imageGen" ? "Image Generator" : "Video Generator");
          const finalPrompt = promptText.trim() || String(d.prompt || "").trim();
          if (!d.model) { setNodeState(id, { __status: "failed" }); throw new Error(`O no "${genLabel}" precisa de um modelo selecionado.`); }
          if (!finalPrompt) { setNodeState(id, { __status: "failed" }); throw new Error(`O no "${genLabel}" precisa de um prompt — escreva nele ou conecte um Prompt.`); }
          setNodeState(id, { __status: "running", __result: undefined });
          const isImage = node.type === "imageGen";
          const uploaded = isImage ? (Array.isArray(d.refs) ? (d.refs as string[]) : []) : [d.startFrame, d.endFrame].filter((x): x is string => typeof x === "string" && x.length > 0);
          const allRefs = [...connRefs, ...uploaded];
          const body: Record<string, unknown> = { prompt: finalPrompt, model_uuid: d.model, aspect_ratio: d.aspectRatio, quality: "high", resolution: d.resolution || "720p" };
          if (allRefs.length > 0) { body.reference_images = allRefs; body.reference_image_url = allRefs[0]; }
          if (!isImage) body.duration = d.duration;
          const res = await fetch(`/api/generate/${isImage ? "image" : "video"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const data = await res.json().catch(() => null);
          if (!res.ok) { setNodeState(id, { __status: "failed" }); throw new Error(data?.error || "Falha ao iniciar a geração."); }
          let url = data?.result_url as string | undefined; if (data?.status !== "completed" || !url) url = await pollGeneration(String(data.generation_id));
          outputs.set(id, url); setNodeState(id, { __status: "done", __result: url });
        }
      }
      toast.success("Fluxo executado ✓");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao executar o fluxo."); } finally { setRunning(false); }
  }, [rf, setNodeState]);

  function clearAll() { if (nodes.length === 0) return; if (!window.confirm("Limpar todos os nós deste flow?")) return; setNodes([]); setEdges([]); setDirty(true); }
  const zoomPct = Math.round(zoom * 100);

  return (
    <ModelsCtx.Provider value={{ image: imageModels, video: videoModels, audio: audioModels }}>
      <ActionsCtx.Provider value={{ runNode: (id) => void runFlow(id), running }}>
        <div className="flow-root relative flex h-[calc(100vh-4rem)] min-h-[560px] flex-col">
          <style>{FLOW_CSS}</style>
          <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--flow-border)" }}>
            <Link href="/flows" className="flex h-8 w-8 items-center justify-center rounded-lg border text-[color:var(--flow-muted)] hover:bg-white/5" style={{ borderColor: "var(--flow-border)" }} aria-label="Voltar"><ArrowLeft className="h-4 w-4" /></Link>
            <Workflow className="h-4 w-4 text-[#A78BFA]" />
            <Link href="/flows" className="text-sm text-[color:var(--flow-subtle)] hover:text-white">Flows</Link>
            <span className="text-[color:var(--flow-subtle)]">/</span>
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-[color:var(--flow-text)] outline-none focus:border-[#7C3AED]" />
            {credits !== null && <span className="flex items-center gap-1 rounded-full bg-[#7C3AED]/12 px-2.5 py-1 text-[11px] font-medium text-[#A78BFA]"><Zap className="h-3 w-3" fill="currentColor" />{credits}</span>}
            <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: dirty ? "#F59E0B22" : "#4ADE8022", color: dirty ? "#FBBF24" : "#4ADE80" }}>{saving ? "Salvando…" : dirty ? "Não salvo" : "Salvo ✓"}</span>
            <button type="button" onClick={() => void save()} disabled={saving || loading} className="rounded-full bg-[#7C3AED] px-4 py-1.5 text-sm font-medium text-white transition hover:bg-[#6D28D9] disabled:opacity-50">Salvar</button>
          </div>

          <div className="flex min-h-0 flex-1">
            <div ref={wrapRef} className="relative min-w-0 flex-1 overflow-hidden" style={{ background: "var(--flow-bg)" }} onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
              <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(900px 380px at 50% -8%, rgba(124,58,237,0.13), transparent 70%)" }} />
              <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView minZoom={0.2} onMove={(_e, vp: Viewport) => setZoom(vp.zoom)} proOptions={{ hideAttribution: true }}>
                <Background color="rgba(255,255,255,.06)" gap={16} size={1} />
                <MiniMap pannable zoomable nodeColor={(n) => ACCENT[n.type || "output"] || "#666"} maskColor="rgba(0,0,0,0.7)" style={{ background: "#0f0f11", borderRadius: 8 }} />
              </ReactFlow>
              <div className="pointer-events-none absolute right-3 top-3 rounded-lg border bg-[#141416]/90 px-2 py-1 text-[11px] text-[color:var(--flow-muted)]" style={{ borderColor: "var(--flow-border)" }}>{zoomPct}%</div>
              {credits !== null && <div className="absolute bottom-4 left-3 flex items-center gap-1 rounded-lg border bg-[#141416]/90 px-2.5 py-1 text-[11px] font-medium text-[#FBBF24]" style={{ borderColor: "var(--flow-border)" }}><Zap className="h-3 w-3" fill="currentColor" />{credits}</div>}
              {!panelOpen && <button type="button" onClick={() => setPanelOpen(true)} className="absolute right-3 top-12 flex items-center gap-1.5 rounded-lg border bg-[#141416]/90 px-2.5 py-1.5 text-xs text-[color:var(--flow-muted)] hover:bg-white/5" style={{ borderColor: "var(--flow-border)" }}><PanelRightOpen className="h-4 w-4" /> Nós</button>}
              {nodes.length === 0 && !loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><p className="text-sm text-[color:var(--flow-subtle)]">Arraste um nó do painel para começar.</p></div>}

              <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl border bg-[#141416]/95 p-1 shadow-[0_16px_50px_rgba(0,0,0,0.55)] backdrop-blur" style={{ borderColor: "var(--flow-border)" }}>
                <button type="button" onClick={() => void runFlow()} disabled={running || loading} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition hover:bg-white/90 disabled:opacity-50">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" fill="currentColor" />}{running ? "Rodando…" : "Run Flow"}</button>
                <button type="button" onClick={clearAll} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[color:var(--flow-muted)] transition hover:bg-white/5"><Eraser className="h-4 w-4" /> Limpar</button>
                <button type="button" onClick={() => rf.fitView({ duration: 300 })} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[color:var(--flow-muted)] transition hover:bg-white/5"><Crosshair className="h-4 w-4" /> Centralizar</button>
                <div className="mx-1 h-5 w-px" style={{ background: "var(--flow-border)" }} />
                <button type="button" onClick={() => rf.zoomOut()} className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--flow-muted)] hover:bg-white/5"><Minus className="h-4 w-4" /></button>
                <button type="button" onClick={() => rf.zoomIn()} className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--flow-muted)] hover:bg-white/5"><Plus className="h-4 w-4" /></button>
                <button type="button" onClick={() => rf.fitView({ duration: 300 })} className="flex h-8 w-8 items-center justify-center rounded-lg text-[color:var(--flow-muted)] hover:bg-white/5"><Maximize2 className="h-4 w-4" /></button>
              </div>
            </div>

            {panelOpen && (
              <div className="w-[248px] shrink-0 border-l p-3" style={{ borderColor: "var(--flow-border)", background: "#0e0e10" }}>
                <div className="mb-3 flex items-center gap-2 px-1">
                  <Workflow className="h-4 w-4 text-[#A78BFA]" />
                  <p className="flex-1 text-xs font-semibold text-[color:var(--flow-text)]">Nós</p>
                  <button type="button" onClick={() => setPanelOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-[color:var(--flow-subtle)] hover:bg-white/5 hover:text-[color:var(--flow-muted)]" title="Fechar painel"><PanelRightClose className="h-4 w-4" /></button>
                </div>
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--flow-subtle)]">Geradores</p>
                <div className="space-y-1.5">{NODE_DEFS.filter((d) => d.group === "gen").map((def) => <PanelItem key={def.type} def={def} onAdd={addAtCenter} />)}</div>
                <div className="my-3 h-px" style={{ background: "var(--flow-border)" }} />
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--flow-subtle)]">Utilitários</p>
                <div className="space-y-1.5">{NODE_DEFS.filter((d) => d.group === "util").map((def) => <PanelItem key={def.type} def={def} onAdd={addAtCenter} />)}</div>
                <p className="mt-3 px-1 text-[10px] leading-relaxed text-[color:var(--flow-subtle)]">Arraste um nó pro canvas (ou clique). Ligue arrastando dos pontos: azul = prompt, laranja = referência.</p>
              </div>
            )}
          </div>
        </div>
      </ActionsCtx.Provider>
    </ModelsCtx.Provider>
  );
}

function PanelItem({ def, onAdd }: { def: (typeof NODE_DEFS)[number]; onAdd: (t: string) => void }) {
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/flownode", def.type); e.dataTransfer.effectAllowed = "move"; }} onClick={() => onAdd(def.type)}
      className="flow-item flex h-[50px] cursor-grab items-center gap-2.5 px-3 text-left active:cursor-grabbing">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${ACCENT[def.type]}22`, color: ACCENT[def.type] }}><def.Icon className="h-4 w-4" /></span>
      <span className="flex-1 text-xs font-medium text-[color:var(--flow-text)]">{def.label}</span>
      <span className="flex h-5 w-5 items-center justify-center text-[color:var(--flow-subtle)]" title={def.hint}><Info className="h-3.5 w-3.5" /></span>
    </div>
  );
}

export default function FlowEditorPage() {
  return (<ReactFlowProvider><Editor /></ReactFlowProvider>);
}
