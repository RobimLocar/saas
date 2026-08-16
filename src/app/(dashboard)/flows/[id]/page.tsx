"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow, ReactFlowProvider, Background, addEdge, useNodesState, useEdgesState,
  useReactFlow, Handle, Position, getBezierPath,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes, type EdgeTypes, type EdgeProps, type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Play, Loader2, Check, X as XIcon, Trash2, Info, ChevronDown, ChevronUp,
  Type as TypeIcon, Image as ImageIcon, Film, FileImage, CircleDot, Workflow,
  Crosshair, Eraser, Plus, Maximize2, Minus, Upload, Sparkles, Music, Zap,
  PanelRightOpen, Layers, Scissors, ArrowUpToLine, Images,
} from "lucide-react";
import { toast } from "sonner";
import { TTS_VOICES } from "@/lib/tts-voices";

const FLOW_CSS = `
.flow-root{
  --fx-canvas:#080809; --fx-surface:#131316; --fx-elev:#17181b; --fx-ctrl:#1b1c20;
  --fx-border:rgba(255,255,255,.09); --fx-border-h:rgba(255,255,255,.17);
  --fx-text:#f2f2f3; --fx-muted:rgba(255,255,255,.62); --fx-subtle:rgba(255,255,255,.38);
  --fx-node-r:11px; --fx-ctrl-r:8px;
}
.flow-root .react-flow__attribution{display:none}
.flow-root .react-flow__handle{width:10px;height:10px;border:2px solid var(--fx-surface);opacity:.8;transition:opacity .15s,transform .15s,box-shadow .15s}
.flow-root .react-flow__node:hover .react-flow__handle{opacity:1}
.flow-root .react-flow__handle:hover{opacity:1;transform:scale(1.3)}
.flow-root .react-flow__handle::after{content:"";position:absolute;inset:-8px;border-radius:999px}
.flow-root .react-flow__edge-path{filter:drop-shadow(0 0 3px rgba(124,58,237,.28))}
.fx-ctrl{background:var(--fx-ctrl);border:1px solid var(--fx-border);color:var(--fx-text);border-radius:var(--fx-ctrl-r);transition:border-color .14s,background .14s;outline:none}
.fx-ctrl:hover{border-color:var(--fx-border-h)}
.fx-ctrl:focus{border-color:#7C3AED}
.fx-ctrl::placeholder{color:var(--fx-subtle)}
.fx-btn{background:var(--fx-elev);border:1px solid var(--fx-border);color:var(--fx-text);border-radius:var(--fx-ctrl-r);transition:border-color .14s,background .14s}
.fx-btn:hover{border-color:var(--fx-border-h);background:#202024}
.fx-up{background:var(--fx-ctrl);border:1px dashed var(--fx-border);color:var(--fx-subtle);border-radius:var(--fx-ctrl-r);transition:border-color .14s,color .14s}
.fx-up:hover{border-color:var(--fx-border-h);color:var(--fx-muted)}
.fx-card{background:var(--fx-surface);border:1px solid var(--fx-border);border-radius:var(--fx-node-r);box-shadow:0 8px 28px rgba(0,0,0,.4);transition:border-color .14s,box-shadow .14s}
.fx-card:hover{border-color:var(--fx-border-h)}
.fx-item{background:var(--fx-elev);border:1px solid var(--fx-border);border-radius:11px;transition:border-color .14s,background .14s}
.fx-item:hover{border-color:var(--fx-border-h);background:#202024}
.fx-seg{background:var(--fx-ctrl);border:1px solid var(--fx-border);border-radius:8px}
.fx-panel{background:rgba(16,16,19,.92);border:1px solid var(--fx-border);backdrop-filter:blur(12px)}
`;

type ND = Record<string, unknown>;
interface ModelOpt { id: string; name: string }

/* ── NODE REGISTRY (metadata única: cor, ícone, descrição, exemplos) ─────── */
interface RegEntry { type: string; label: string; Icon: typeof TypeIcon; accent: string; group: "gen" | "util"; description: string; examples: string[]; }
const REGISTRY: RegEntry[] = [
  { type: "imageGen", label: "Image Generator", Icon: ImageIcon, accent: "#F97316", group: "gen", description: "Cria imagens de IA a partir de texto. Escolha o modelo, controle proporção e resolução, e suba referências.", examples: ["Um golden retriever numa praia ao pôr do sol", "Foto de produto de tênis sobre mármore", "Logo para uma marca de café"] },
  { type: "videoGen", label: "Video Generator", Icon: Film, accent: "#3B82F6", group: "gen", description: "Transforma prompts em vídeos de IA. Conecte uma imagem como primeiro frame para melhores resultados.", examples: ["Conecte um nó de imagem → vira o start frame", "Duração de 4 a 30 segundos", "End frame para transições controladas"] },
  { type: "audioGen", label: "Audio Generator", Icon: Music, accent: "#A78BFA", group: "gen", description: "Três modos: Text-to-Speech com 39 vozes, e (em breve) SFX e Música por IA.", examples: ["TTS: escolha a voz, escreva o script, gere", "SFX: 'trovão durante uma tempestade' (em breve)", "Música: 'lo-fi hip hop, Ré menor' (em breve)"] },
  { type: "prompt", label: "Prompt", Icon: TypeIcon, accent: "#C9C9D1", group: "util", description: "Um nó de texto reutilizável. O que você escrever aqui alimenta os geradores conectados.", examples: ["Escreva uma vez, use em vários nós", "Ótimo pra testar o mesmo prompt em modelos diferentes"] },
  { type: "storyboard", label: "Storyboard", Icon: Layers, accent: "#D8ED19", group: "util", description: "Planeje uma sequência de cenas. Encadeie Image e Video generators com direção criativa compartilhada.", examples: ["Esboce um comercial de 4 cenas num fluxo", "Mantenha luz e enquadramento consistentes", "(processamento em breve)"] },
  { type: "removeBg", label: "Remove BG", Icon: Scissors, accent: "#22D3EE", group: "util", description: "Remove o fundo de qualquer imagem, deixando só o sujeito com transparência.", examples: ["Produto no branco → PNG transparente", "Foto de pessoa → recorte limpo", "(processamento em breve)"] },
  { type: "upscale", label: "Upscale", Icon: ArrowUpToLine, accent: "#A3E635", group: "util", description: "Amplia imagens para 2× ou 4×, preservando detalhe e nitidez.", examples: ["2× transforma 1K em 2K", "4× transforma 1K em 4K", "(processamento em breve)"] },
  { type: "output", label: "Output", Icon: CircleDot, accent: "#4ADE80", group: "util", description: "Coleta o resultado final do fluxo.", examples: ["Conecte a saída de um gerador aqui"] },
];
const ACCENT: Record<string, string> = Object.fromEntries(REGISTRY.map((r) => [r.type, r.accent]));
const DEFAULTS: Record<string, ND> = {
  imageGen: { prompt: "", model: "", modelName: "", aspectRatio: "1:1", resolution: "720p", refs: [] },
  videoGen: { prompt: "", model: "", modelName: "", duration: 8, resolution: "720p", aspectRatio: "9:16", startFrame: "", endFrame: "", audioOn: true, multiShot: false },
  audioGen: { prompt: "", model: "", modelName: "", voice: "", mode: "TTS" },
  prompt: { text: "" }, storyboard: { aspectRatio: "1:1", resolution: "1K" }, removeBg: {}, upscale: { style: "Sharp", scale: "2x" }, output: {},
};

const ModelsCtx = createContext<{ image: ModelOpt[]; video: ModelOpt[]; audio: ModelOpt[] }>({ image: [], video: [], audio: [] });
const ActionsCtx = createContext<{ runNode: (id: string) => void; running: boolean }>({ runNode: () => {}, running: false });

/* ── PRIMITIVAS DE CONTROLE (compactas) ──────────────────────────────────── */
function FSelect(p: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <div className="relative"><select {...p} className={`fx-ctrl nodrag h-[32px] w-full appearance-none pl-2.5 pr-6 text-[11px] ${p.className || ""}`} /><ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[color:var(--fx-subtle)]" /></div>;
}
function FTextarea(p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...p} className={`fx-ctrl nodrag w-full resize-none px-2.5 py-1.5 text-[11px] leading-relaxed ${p.className || ""}`} />; }
function FInput(p: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...p} className={`fx-ctrl nodrag h-[32px] w-full px-2.5 text-[11px] ${p.className || ""}`} />; }
function FButton({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) { return <button {...p} className={`fx-btn nodrag flex h-[32px] w-full items-center justify-center gap-1.5 text-[11px] font-medium disabled:opacity-50 ${p.className || ""}`}>{children}</button>; }
function FTabs({ tabs, value, onChange }: { tabs: string[]; value: string; onChange: (v: string) => void }) {
  return <div className="fx-seg nodrag mb-2 grid p-0.5" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>{tabs.map((t) => <button key={t} type="button" onClick={() => onChange(t)} className="rounded-[6px] py-1 text-[10px] font-medium transition" style={value === t ? { background: "#7C3AED", color: "#fff" } : { color: "var(--fx-muted)" }}>{t}</button>)}</div>;
}
function FSwitch({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return <button type="button" onClick={onToggle} className="fx-item nodrag flex h-[32px] flex-1 items-center justify-between gap-2 px-2.5 text-[10px] text-[color:var(--fx-text)]"><span>{label}</span><span className="relative inline-flex h-4 w-7 items-center rounded-full transition" style={{ background: on ? "#7C3AED" : "#3a3a40" }}><span className="absolute h-3 w-3 rounded-full bg-white transition" style={{ left: on ? 14 : 2 }} /></span></button>;
}
function StatusDot({ status }: { status?: string }) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#A78BFA]" />;
  if (status === "done") return <Check className="h-3.5 w-3.5 text-[#4ADE80]" />;
  if (status === "failed") return <XIcon className="h-3.5 w-3.5 text-[#FCA5A5]" />;
  return null;
}
function ResultThumb({ url }: { url?: string }) {
  if (!url) return null;
  if (/\.(mp4|mov|webm)(\?|$)/i.test(url)) return <video src={url} muted playsInline controls className="nodrag mt-2 h-28 w-full rounded-[8px] object-cover" />;
  if (/\.(mp3|wav|ogg|m4a)(\?|$)/i.test(url)) return <audio src={url} controls className="nodrag mt-2 w-full" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="result" className="mt-2 h-28 w-full rounded-[8px] object-cover" />;
}
function NodeShell({ id, type, title, status, selected, runnable, width = 288, subtitle, children }: {
  id: string; type: string; title: string; status?: string; selected?: boolean; runnable?: boolean; width?: number; subtitle?: React.ReactNode; children?: React.ReactNode;
}) {
  const rf = useReactFlow(); const { runNode, running } = useContext(ActionsCtx);
  const reg = REGISTRY.find((r) => r.type === type)!; const accent = reg.accent;
  return (
    <div className="fx-card" style={{ width, ...(selected ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}66, 0 8px 28px rgba(0,0,0,.45)` } : {}) }}>
      <div className="flex h-[34px] items-center gap-2 border-b px-2.5" style={{ borderColor: "var(--fx-border)" }}>
        <span className="flex h-4.5 w-4.5 items-center justify-center" style={{ color: accent }}><reg.Icon className="h-3.5 w-3.5" /></span>
        <span className="flex-1 truncate text-[11px] font-semibold" style={{ color: accent }}>{title}</span>
        {subtitle}
        <StatusDot status={status} />
        <button type="button" className="nodrag flex h-5 w-5 items-center justify-center rounded text-[color:var(--fx-subtle)] transition hover:text-[#FCA5A5]" onClick={() => rf.deleteElements({ nodes: [{ id }] })} title="Excluir nó"><Trash2 className="h-3 w-3" /></button>
      </div>
      <div className="p-2.5">{children}</div>
      {runnable ? <div className="flex justify-end border-t px-2.5 py-1.5" style={{ borderColor: "var(--fx-border)" }}><button type="button" disabled={running} onClick={() => runNode(id)} className="nodrag flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0A0A0A] transition hover:bg-white/90 disabled:opacity-50" title="Rodar este nó">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}</button></div> : null}
    </div>
  );
}
async function uploadFile(f: File): Promise<string | null> { try { const fd = new FormData(); fd.append("file", f); const r = await fetch("/api/upload", { method: "POST", body: fd }); const d = await r.json().catch(() => null); return r.ok && d?.url ? d.url : null; } catch { return null; } }
function MultiUpload({ id, refs }: { id: string; refs: string[] }) {
  const rf = useReactFlow(); const [busy, setBusy] = useState(false);
  async function go(fl: FileList | null) { if (!fl?.length) return; setBusy(true); const got: string[] = []; for (const f of Array.from(fl).slice(0, 8)) { const u = await uploadFile(f); if (u) got.push(u); } rf.updateNodeData(id, { refs: [...refs, ...got].slice(0, 8) }); setBusy(false); }
  return (<div className="mb-2"><label className="fx-up nodrag flex cursor-pointer flex-col items-center justify-center gap-1 py-3 text-[10px]"><input type="file" accept="image/*" multiple className="hidden" onChange={(e) => { void go(e.target.files); e.currentTarget.value = ""; }} />{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Solte imagens ou clique ({refs.length}/8)</label>{refs.length > 0 && <div className="mt-1.5 flex flex-wrap gap-1.5">{refs.map((u, i) => (<div key={`${u}-${i}`} className="group relative h-9 w-9 overflow-hidden rounded ring-1 ring-white/10">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="" className="h-full w-full object-cover" /><button type="button" onClick={() => rf.updateNodeData(id, { refs: refs.filter((_, x) => x !== i) })} className="nodrag absolute right-0.5 top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100"><XIcon className="h-2 w-2" /></button></div>))}</div>}</div>);
}
function FrameUpload({ id, field, url, waiting }: { id: string; field: string; url: string; waiting?: boolean }) {
  const rf = useReactFlow(); const [busy, setBusy] = useState(false);
  async function go(fl: FileList | null) { const f = fl?.[0]; if (!f) return; setBusy(true); const u = await uploadFile(f); if (u) rf.updateNodeData(id, { [field]: u }); setBusy(false); }
  return (<label className="fx-up nodrag relative flex h-14 cursor-pointer flex-col items-center justify-center gap-0.5 overflow-hidden text-[9px]"><input type="file" accept="image/*" className="hidden" onChange={(e) => { void go(e.target.files); e.currentTarget.value = ""; }} />{url ? (<>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" /><button type="button" onClick={(e) => { e.preventDefault(); rf.updateNodeData(id, { [field]: "" }); }} className="nodrag absolute right-1 top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-black/70 text-white"><XIcon className="h-2 w-2" /></button></>) : busy ? <Loader2 className="h-4 w-4 animate-spin" /> : waiting ? <span>Aguardando fonte</span> : <><Upload className="h-3.5 w-3.5" />Solte/clique</>}</label>);
}
function EnhanceBtn({ id, modality, value, label }: { id: string; modality: string; value: string; label: string }) {
  const rf = useReactFlow(); const [busy, setBusy] = useState(false);
  async function go() { const c = (value || "").trim(); if (!c) { toast.error("Escreva algo no prompt primeiro."); return; } setBusy(true); try { const r = await fetch("/api/assist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: c, modality }) }); const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || "Falha"); rf.updateNodeData(id, { prompt: d.prompt }); toast.success("Prompt melhorado ✨"); } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setBusy(false); } }
  return <div className="mb-2"><FButton onClick={go} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-[#A78BFA]" />}{label}</FButton></div>;
}

/* ── NÓS ─────────────────────────────────────────────────────────────────── */
function PromptNode({ id, data, selected }: NodeProps) { const rf = useReactFlow(); const d = data as ND; return (<NodeShell id={id} type="prompt" title={(d.title as string) || "Prompt"} status={d.__status as string} selected={selected} width={256}><FTextarea rows={3} value={(d.text as string) || ""} onChange={(e) => rf.updateNodeData(id, { text: e.target.value })} placeholder="Texto…" /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.prompt }} /></NodeShell>); }
function RefImageNode({ id, data, selected }: NodeProps) { const rf = useReactFlow(); const d = data as ND; const u = (d.url as string) || ""; return (<NodeShell id={id} type="output" title={(d.title as string) || "Reference Image"} status={d.__status as string} selected={selected} width={256}><FInput value={u} onChange={(e) => rf.updateNodeData(id, { url: e.target.value })} placeholder="Cole a URL…" />{u ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={u} alt="" className="mt-2 h-24 w-full rounded-[8px] object-cover" />) : null}<Handle type="source" position={Position.Right} id="out" style={{ background: "#F97316" }} /></NodeShell>); }
function ImageGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx).image; const d = data as ND; const refs = Array.isArray(d.refs) ? (d.refs as string[]) : [];
  return (<NodeShell id={id} type="imageGen" title={(d.title as string) || "Image Generator"} status={d.__status as string} selected={selected} runnable>
    <div className="mb-2"><FSelect value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })}><option value="">— modelo —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</FSelect></div>
    <div className="mb-2"><FTextarea rows={2} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Descreva a imagem (ou conecte um Prompt)…" /></div>
    <EnhanceBtn id={id} modality="image" value={(d.prompt as string) || ""} label="Wise enhance" />
    <MultiUpload id={id} refs={refs} />
    <div className="grid grid-cols-2 gap-2"><FSelect value={(d.aspectRatio as string) || "1:1"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })}>{["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}</FSelect><FSelect value={(d.resolution as string) || "720p"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })}>{["720p", "1080p"].map((r) => <option key={r} value={r}>{r}</option>)}</FSelect></div>
    <ResultThumb url={d.__result as string} />
    <Handle type="target" position={Position.Left} id="prompt" style={{ top: 48, background: "#22D3EE" }} /><Handle type="target" position={Position.Left} id="reference" style={{ top: 88, background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.imageGen }} />
  </NodeShell>);
}
function VideoGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx).video; const d = data as ND;
  return (<NodeShell id={id} type="videoGen" title={(d.title as string) || "Video Generator"} status={d.__status as string} selected={selected} runnable width={294}>
    <div className="mb-2"><FSelect value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })}><option value="">— modelo —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</FSelect></div>
    <div className="mb-2"><FTextarea rows={2} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Descreva o movimento…" /></div>
    <EnhanceBtn id={id} modality="video" value={(d.prompt as string) || ""} label="Generate prompt for me" />
    <div className="mb-2 grid grid-cols-2 gap-2"><div><span className="mb-1 block text-[9px] uppercase tracking-wide text-[color:var(--fx-subtle)]">Start Frame</span><FrameUpload id={id} field="startFrame" url={(d.startFrame as string) || ""} /></div><div><span className="mb-1 block text-[9px] uppercase tracking-wide text-[color:var(--fx-subtle)]">End Frame</span><FrameUpload id={id} field="endFrame" url={(d.endFrame as string) || ""} /></div></div>
    <div className="mb-2 grid grid-cols-2 gap-2"><FSelect value={(d.aspectRatio as string) || "9:16"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })}>{["9:16", "16:9", "1:1", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}</FSelect><FSelect value={(d.resolution as string) || "720p"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })}>{["480p", "720p", "1080p"].map((r) => <option key={r} value={r}>{r}</option>)}</FSelect></div>
    <div className="mb-2 flex items-center gap-2"><input type="range" min={4} max={30} value={(d.duration as number) || 8} onChange={(e) => rf.updateNodeData(id, { duration: Number(e.target.value) })} className="nodrag flex-1" /><span className="w-7 text-right text-[10px] text-[color:var(--fx-muted)]">{(d.duration as number) || 8}s</span></div>
    <div className="flex gap-2"><FSwitch label="Audio" on={d.audioOn !== false} onToggle={() => rf.updateNodeData(id, { audioOn: d.audioOn === false })} /><FSwitch label="Multi-shot" on={Boolean(d.multiShot)} onToggle={() => rf.updateNodeData(id, { multiShot: !d.multiShot })} /></div>
    <ResultThumb url={d.__result as string} />
    <Handle type="target" position={Position.Left} id="prompt" style={{ top: 48, background: "#22D3EE" }} /><Handle type="target" position={Position.Left} id="reference" style={{ top: 88, background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.videoGen }} />
  </NodeShell>);
}
function AudioGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx).audio; const d = data as ND; const voice = TTS_VOICES.find((v) => v.id === (d.voice as string));
  return (<NodeShell id={id} type="audioGen" title={(d.title as string) || "Audio Generator"} status={d.__status as string} selected={selected} runnable>
    <FTabs tabs={["TTS", "SFX", "Music"]} value={(d.mode as string) || "TTS"} onChange={(v) => { if (v !== "TTS") { toast("SFX/Music em breve — usando TTS."); return; } rf.updateNodeData(id, { mode: v }); }} />
    <div className="mb-2"><FSelect value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })}><option value="">— modelo —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</FSelect></div>
    <div className="mb-2"><FSelect value={(d.voice as string) || ""} onChange={(e) => rf.updateNodeData(id, { voice: e.target.value })}><option value="">— voz —</option>{TTS_VOICES.map((v) => <option key={v.id} value={v.id}>{v.name} · {v.accent}</option>)}</FSelect></div>
    <div className="mb-2"><FButton onClick={() => { if (voice?.preview) { const a = new Audio(voice.preview); void a.play().catch(() => {}); } }} disabled={!voice}><Play className="h-3 w-3" fill="currentColor" />Preview Voice</FButton></div>
    <FTextarea rows={3} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Texto que a voz vai falar…" />
    <ResultThumb url={d.__result as string} />
    <Handle type="target" position={Position.Left} id="prompt" style={{ background: "#22D3EE" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.audioGen }} />
  </NodeShell>);
}
function StoryboardNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const d = data as ND;
  return (<NodeShell id={id} type="storyboard" title={(d.title as string) || "Storyboard"} status={d.__status as string} selected={selected} width={264} subtitle={<span className="text-[9px] text-[color:var(--fx-subtle)]">0 prompts</span>}>
    <p className="mb-2 text-[10px] text-[color:var(--fx-muted)]">Conecte uma fonte de imagem para gerar prompts.</p>
    <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] text-[color:var(--fx-muted)]">Proporção</span><div className="w-20"><FSelect value={(d.aspectRatio as string) || "1:1"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })}>{["1:1", "16:9", "9:16"].map((a) => <option key={a} value={a}>{a}</option>)}</FSelect></div></div>
    <div className="mb-2 flex items-center justify-between gap-2"><span className="text-[10px] text-[color:var(--fx-muted)]">Resolução</span><div className="w-20"><FSelect value={(d.resolution as string) || "1K"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })}>{["1K", "2K"].map((r) => <option key={r} value={r}>{r}</option>)}</FSelect></div></div>
    <FButton onClick={() => toast("Storyboard: geração automática em breve.")}><Sparkles className="h-3 w-3" />Gerar prompts</FButton>
    <Handle type="target" position={Position.Left} id="in" style={{ background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.storyboard }} />
  </NodeShell>);
}
function RemoveBgNode({ id, data, selected }: NodeProps) {
  const d = data as ND;
  return (<NodeShell id={id} type="removeBg" title={(d.title as string) || "Remove BG"} status={d.__status as string} selected={selected} width={244} runnable>
    <p className="text-[10px] text-[color:var(--fx-muted)]">Conecte uma imagem e rode para remover o fundo.</p>
    <ResultThumb url={d.__result as string} />
    <Handle type="target" position={Position.Left} id="reference" style={{ background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.removeBg }} />
  </NodeShell>);
}
function UpscaleNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const d = data as ND;
  return (<NodeShell id={id} type="upscale" title={(d.title as string) || "Upscale"} status={d.__status as string} selected={selected} width={256} runnable>
    <div className="mb-2 grid grid-cols-2 gap-2"><FSelect value={(d.style as string) || "Sharp"} onChange={(e) => rf.updateNodeData(id, { style: e.target.value })}>{["Sharp", "Soft"].map((s) => <option key={s} value={s}>{s}</option>)}</FSelect><FSelect value={(d.scale as string) || "2x"} onChange={(e) => rf.updateNodeData(id, { scale: e.target.value })}>{["2x", "4x"].map((s) => <option key={s} value={s}>{s}</option>)}</FSelect></div>
    <p className="text-[10px] text-[color:var(--fx-muted)]">Conecte uma imagem, escolha a escala e rode.</p>
    <ResultThumb url={d.__result as string} />
    <Handle type="target" position={Position.Left} id="reference" style={{ background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.upscale }} />
  </NodeShell>);
}
function OutputNode({ id, data, selected }: NodeProps) { const d = data as ND; return (<NodeShell id={id} type="output" title={(d.title as string) || "Output"} status={d.__status as string} selected={selected} width={256}>{d.__result ? <ResultThumb url={d.__result as string} /> : <p className="text-[10px] text-[color:var(--fx-subtle)]">O resultado final aparece aqui após o Run.</p>}<Handle type="target" position={Position.Left} id="in" style={{ background: ACCENT.output }} /></NodeShell>); }

const nodeTypes: NodeTypes = { prompt: PromptNode, refImage: RefImageNode, imageGen: ImageGenNode, videoGen: VideoGenNode, audioGen: AudioGenNode, storyboard: StoryboardNode, removeBg: RemoveBgNode, upscale: UpscaleNode, output: OutputNode };

/* ── EDGE COM GRADIENTE POR CATEGORIA ────────────────────────────────────── */
function GradientEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target }: EdgeProps) {
  const rf = useReactFlow();
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const c1 = ACCENT[rf.getNode(source)?.type || ""] || "#7C3AED";
  const c2 = ACCENT[rf.getNode(target)?.type || ""] || "#7C3AED";
  const gid = `fxg-${id}`;
  return (<>
    <defs><linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}><stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} /></linearGradient></defs>
    <path id={id} d={path} fill="none" stroke={`url(#${gid})`} strokeWidth={2} className="react-flow__edge-path" />
  </>);
}
const edgeTypes: EdgeTypes = { grad: GradientEdge };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ── INFO POPOVER ────────────────────────────────────────────────────────── */
function InfoPopover({ reg, top, onClose }: { reg: RegEntry; top: number; onClose: () => void }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="fixed z-50 w-[320px] rounded-2xl p-5" style={{ right: 320, top: Math.max(70, Math.min(top, typeof window !== "undefined" ? window.innerHeight - 260 : top)), background: "#17130f", border: "1px solid rgba(255,255,255,.16)", boxShadow: "0 20px 60px rgba(0,0,0,.6)" }}>
      <div className="mb-2 flex items-center gap-2"><span style={{ color: reg.accent }}><reg.Icon className="h-4 w-4" /></span><p className="flex-1 text-[15px] font-semibold text-white">{reg.label}</p><button type="button" onClick={onClose} className="text-[color:var(--fx-subtle)] hover:text-white"><XIcon className="h-4 w-4" /></button></div>
      <p className="text-[13px] leading-relaxed text-[color:var(--fx-muted)]">{reg.description}</p>
      <div className="mt-3 rounded-xl border p-3" style={{ borderColor: "rgba(255,255,255,.10)", background: "rgba(0,0,0,.25)" }}><ul className="space-y-1.5">{reg.examples.map((ex, i) => <li key={i} className="flex gap-2 text-[12px] text-[color:var(--fx-muted)]"><span style={{ color: reg.accent }}>•</span><span>{ex}</span></li>)}</ul></div>
    </div>
  );
}

function Editor() {
  const params = useParams(); const flowId = String(params?.id || ""); const rf = useReactFlow(); const wrapRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChangeRaw] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChangeRaw] = useEdgesState<Edge>([]);
  const [name, setName] = useState("Novo Flow");
  const [loading, setLoading] = useState(true); const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty" | "error">("saved");
  const [running, setRunning] = useState(false); const [zoom, setZoom] = useState(1); const [credits, setCredits] = useState<number | null>(null);
  const [panelOpen, setPanelOpen] = useState(true); const [galleryOpen, setGalleryOpen] = useState(false); const [infoType, setInfoType] = useState<string | null>(null); const [infoTop, setInfoTop] = useState(120);
  const [imageModels, setImageModels] = useState<ModelOpt[]>([]); const [videoModels, setVideoModels] = useState<ModelOpt[]>([]); const [audioModels, setAudioModels] = useState<ModelOpt[]>([]);
  const counter = useRef(0); const savingRef = useRef(false);

  const markDirty = useCallback(() => setSaveState((s) => (s === "saving" ? s : "dirty")), []);
  const onNodesChange = useCallback((c: Parameters<typeof onNodesChangeRaw>[0]) => { onNodesChangeRaw(c); markDirty(); }, [onNodesChangeRaw, markDirty]);
  const onEdgesChange = useCallback((c: Parameters<typeof onEdgesChangeRaw>[0]) => { onEdgesChangeRaw(c); markDirty(); }, [onEdgesChangeRaw, markDirty]);

  useEffect(() => { (async () => { const load = async (t: string) => { const r = await fetch(`/api/models?type=${t}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null); return Array.isArray(r?.models) ? r.models.map((m: ModelOpt) => ({ id: m.id, name: m.name })) : []; }; const [im, vm, am] = await Promise.all([load("image"), load("video"), load("audio")]); setImageModels(im); setVideoModels(vm); setAudioModels(am); try { const me = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null); if (typeof me?.credits === "number") setCredits(me.credits); } catch { /* noop */ } })(); }, []);

  useEffect(() => { let alive = true; (async () => { setLoading(true); try { const res = await fetch(`/api/flows/${flowId}`, { cache: "no-store" }); const data = await res.json().catch(() => null); if (!res.ok) throw new Error(data?.error || "Falha ao carregar."); if (!alive) return; setName(data.flow.name || "Novo Flow"); const def = data.flow.definition || {}; setNodes(Array.isArray(def.nodes) ? def.nodes : []); setEdges(Array.isArray(def.edges) ? def.edges : []); setSaveState("saved"); } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao carregar."); } finally { if (alive) setLoading(false); } })(); return () => { alive = false; }; }, [flowId, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => { setEdges((eds) => addEdge({ ...c, type: "grad", animated: true }, eds)); markDirty(); }, [setEdges, markDirty]);

  const save = useCallback(async () => {
    if (savingRef.current) return; savingRef.current = true; setSaveState("saving");
    try { const obj = rf.toObject(); const clean = obj.nodes.map((n) => { const dd = { ...(n.data as ND) }; delete dd.__status; delete dd.__result; return { ...n, data: dd }; }); const res = await fetch(`/api/flows/${flowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, definition: { ...obj, nodes: clean } }) }); if (!res.ok) throw new Error(); setSaveState("saved"); } catch { setSaveState("error"); } finally { savingRef.current = false; }
  }, [rf, flowId, name]);

  // auto-save
  useEffect(() => { if (loading || saveState !== "dirty") return; const t = setTimeout(() => void save(), 1400); return () => clearTimeout(t); }, [saveState, loading, save, nodes, edges, name]);

  const spawn = useCallback((type: string, position: { x: number; y: number }) => {
    if (!DEFAULTS[type]) return; counter.current += 1; const nid = `${type}_${Date.now()}_${counter.current}`;
    const same = rf.getNodes().filter((n) => n.type === type).length; const label = REGISTRY.find((r) => r.type === type)?.label || type;
    const dft: ND = JSON.parse(JSON.stringify(DEFAULTS[type])); dft.title = `${label} ${same + 1}`;
    if (type === "imageGen" && imageModels[0]) { dft.model = imageModels[0].id; dft.modelName = imageModels[0].name; }
    if (type === "videoGen" && videoModels[0]) { dft.model = videoModels[0].id; dft.modelName = videoModels[0].name; }
    if (type === "audioGen") { if (audioModels[0]) { dft.model = audioModels[0].id; dft.modelName = audioModels[0].name; } if (TTS_VOICES[0]) dft.voice = TTS_VOICES[0].id; }
    setNodes((nds) => [...nds, { id: nid, type, position, data: dft }]); markDirty();
  }, [imageModels, videoModels, audioModels, setNodes, rf, markDirty]);

  const addAtCenter = useCallback((type: string) => { const b = wrapRef.current?.getBoundingClientRect(); const p = b ? rf.screenToFlowPosition({ x: b.x + b.width / 2 - 145, y: b.y + b.height / 2 - 90 }) : { x: 200, y: 160 }; spawn(type, p); }, [rf, spawn]);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); const t = e.dataTransfer.getData("application/flownode"); if (!t) return; spawn(t, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }, [rf, spawn]);
  const setNS = useCallback((id: string, patch: ND) => rf.updateNodeData(id, patch), [rf]);

  async function pollGen(gid: string): Promise<string> { for (let i = 0; i < 120; i++) { await sleep(3000); const r = await fetch(`/api/generate/status?id=${gid}`, { cache: "no-store" }); const d = await r.json().catch(() => null); if (d?.status === "completed" && d.result_url) return d.result_url; if (d?.status === "failed") throw new Error(d.error_message || "Geração falhou."); } throw new Error("Tempo esgotado."); }

  const runFlow = useCallback(async (targetId?: string) => {
    const sn = rf.getNodes(); const se = rf.getEdges();
    if (!sn.length) { toast.error("Adicione nós antes de rodar."); return; }
    const indeg = new Map<string, number>(); const adj = new Map<string, string[]>();
    sn.forEach((n) => { indeg.set(n.id, 0); adj.set(n.id, []); });
    se.forEach((e) => { adj.get(e.source)?.push(e.target); indeg.set(e.target, (indeg.get(e.target) || 0) + 1); });
    const q = sn.filter((n) => (indeg.get(n.id) || 0) === 0).map((n) => n.id); const order: string[] = [];
    while (q.length) { const id = q.shift()!; order.push(id); for (const t of adj.get(id) || []) { indeg.set(t, (indeg.get(t) || 0) - 1); if ((indeg.get(t) || 0) === 0) q.push(t); } }
    if (order.length !== sn.length) { toast.error("O fluxo tem um ciclo."); return; }
    let allowed: Set<string> | null = null;
    if (targetId) { const radj = new Map<string, string[]>(); sn.forEach((n) => radj.set(n.id, [])); se.forEach((e) => radj.get(e.target)?.push(e.source)); allowed = new Set(); const s = [targetId]; while (s.length) { const x = s.shift()!; if (allowed.has(x)) continue; allowed.add(x); for (const p of radj.get(x) || []) s.push(p); } }
    const runOrder = allowed ? order.filter((id) => allowed!.has(id)) : order;
    const byId = new Map(sn.map((n) => [n.id, n])); const out = new Map<string, string>();
    runOrder.forEach((id) => rf.updateNodeData(id, { __status: undefined, __result: undefined }));
    setRunning(true);
    try {
      for (const id of runOrder) {
        const node = byId.get(id)!; const d = node.data as ND;
        const inc = se.filter((e) => e.target === id); let pText = ""; const refs: string[] = [];
        for (const e of inc) { const v = out.get(e.source); if (!v) continue; const isUrl = /^https?:\/\//i.test(v); if (e.targetHandle === "reference" || isUrl) refs.push(v); else pText = pText ? `${pText} ${v}` : v; }
        if (node.type === "prompt") { out.set(id, (d.text as string) || ""); continue; }
        if (node.type === "refImage") { out.set(id, (d.url as string) || ""); continue; }
        if (node.type === "output") { const v = inc.map((e) => out.get(e.source)).find(Boolean) || ""; out.set(id, v); setNS(id, { __status: v ? "done" : "failed", __result: v || undefined }); continue; }
        if (node.type === "storyboard") { out.set(id, pText || refs[0] || ""); setNS(id, { __status: "done" }); continue; }
        if (node.type === "removeBg" || node.type === "upscale") {
          const src = refs[0]; if (!src) { setNS(id, { __status: "failed" }); throw new Error(`Conecte uma imagem ao "${d.title || node.type}".`); }
          setNS(id, { __status: "running" }); await sleep(400); out.set(id, src); setNS(id, { __status: "done", __result: src });
          toast(`${node.type === "removeBg" ? "Remove BG" : "Upscale"}: processamento real em breve — imagem repassada.`); continue;
        }
        if (node.type === "audioGen") {
          const text = String(d.prompt || "").trim() || pText.trim();
          if (!d.model) { setNS(id, { __status: "failed" }); throw new Error(`"${d.title || "Audio Generator"}" precisa de um modelo.`); }
          if (!text) { setNS(id, { __status: "failed" }); throw new Error(`"${d.title || "Audio Generator"}" precisa de um texto.`); }
          setNS(id, { __status: "running", __result: undefined });
          const r = await fetch("/api/generate/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, model_uuid: d.model, voice_id: d.voice }) });
          const dt = await r.json().catch(() => null); if (!r.ok) { setNS(id, { __status: "failed" }); throw new Error(dt?.error || "Falha ao gerar áudio."); }
          let u = dt?.result_url as string | undefined; if (dt?.status !== "completed" || !u) u = await pollGen(String(dt.generation_id)); out.set(id, u); setNS(id, { __status: "done", __result: u }); continue;
        }
        if (node.type === "imageGen" || node.type === "videoGen") {
          const gl = (d.title as string) || (node.type === "imageGen" ? "Image Generator" : "Video Generator");
          const fp = pText.trim() || String(d.prompt || "").trim();
          if (!d.model) { setNS(id, { __status: "failed" }); throw new Error(`"${gl}" precisa de um modelo.`); }
          if (!fp) { setNS(id, { __status: "failed" }); throw new Error(`"${gl}" precisa de um prompt — escreva nele ou conecte um Prompt.`); }
          setNS(id, { __status: "running", __result: undefined });
          const isImg = node.type === "imageGen";
          const up = isImg ? (Array.isArray(d.refs) ? (d.refs as string[]) : []) : [d.startFrame, d.endFrame].filter((x): x is string => typeof x === "string" && x.length > 0);
          const all = [...refs, ...up];
          const body: Record<string, unknown> = { prompt: fp, model_uuid: d.model, aspect_ratio: d.aspectRatio, quality: "high", resolution: d.resolution || "720p" };
          if (all.length) { body.reference_images = all; body.reference_image_url = all[0]; } if (!isImg) body.duration = d.duration;
          const r = await fetch(`/api/generate/${isImg ? "image" : "video"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const dt = await r.json().catch(() => null); if (!r.ok) { setNS(id, { __status: "failed" }); throw new Error(dt?.error || "Falha ao iniciar."); }
          let u = dt?.result_url as string | undefined; if (dt?.status !== "completed" || !u) u = await pollGen(String(dt.generation_id)); out.set(id, u); setNS(id, { __status: "done", __result: u });
        }
      }
      toast.success("Fluxo executado ✓");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao executar."); } finally { setRunning(false); }
  }, [rf, setNS]);

  function clearAll() { if (!nodes.length) return; if (!window.confirm("Limpar todos os nós?")) return; setNodes([]); setEdges([]); markDirty(); }
  const zoomPct = Math.round(zoom * 100);
  const saveLabel = saveState === "saving" ? "Salvando…" : saveState === "dirty" ? "Não salvo" : saveState === "error" ? "Erro ao salvar" : "Salvo";
  const saveColor = saveState === "saved" ? { c: "#F97316", b: "rgba(249,115,22,.14)" } : saveState === "error" ? { c: "#FCA5A5", b: "rgba(220,60,60,.14)" } : { c: "#FBBF24", b: "rgba(245,158,11,.14)" };
  const gens = REGISTRY.filter((r) => r.group === "gen"); const utils = REGISTRY.filter((r) => r.group === "util");
  const infoReg = infoType ? REGISTRY.find((r) => r.type === infoType) : null;

  return (
    <ModelsCtx.Provider value={{ image: imageModels, video: videoModels, audio: audioModels }}>
      <ActionsCtx.Provider value={{ runNode: (id) => void runFlow(id), running }}>
        <div className="flow-root relative h-[calc(100vh-4rem)] min-h-[560px] overflow-hidden" style={{ background: "var(--fx-canvas)" }}>
          <style>{FLOW_CSS}</style>
          {/* canvas full-screen */}
          <div ref={wrapRef} className="absolute inset-0" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}>
            <div className="pointer-events-none absolute inset-0" style={{ background: "radial-gradient(circle at 82% -6%, rgba(150,60,20,.22), transparent 46%)" }} />
            <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} edgeTypes={edgeTypes} defaultEdgeOptions={{ type: "grad" }} fitView fitViewOptions={{ padding: 0.22, maxZoom: 1 }} minZoom={0.2} onMove={(_e, vp: Viewport) => setZoom(vp.zoom)} onPaneClick={() => setInfoType(null)} proOptions={{ hideAttribution: true }}>
              <Background color="rgba(255,255,255,.06)" gap={16} size={0.8} />
            </ReactFlow>
          </div>

          {/* breadcrumb flutuante */}
          <div className="pointer-events-none absolute left-4 top-3 flex items-center gap-2">
            <div className="pointer-events-auto flex items-center gap-2 rounded-xl fx-panel px-3 py-1.5">
              <Link href="/flows" className="flex h-6 w-6 items-center justify-center rounded-md text-[color:var(--fx-muted)] hover:text-white" aria-label="Voltar"><ArrowLeft className="h-3.5 w-3.5" /></Link>
              <Workflow className="h-3.5 w-3.5 text-[#A78BFA]" />
              <Link href="/flows" className="text-[13px] text-[color:var(--fx-subtle)] hover:text-white">Flows</Link>
              <span className="text-[color:var(--fx-subtle)]">/</span>
              <input value={name} onChange={(e) => { setName(e.target.value); markDirty(); }} className="w-[130px] rounded-md border border-transparent bg-transparent px-1 py-0.5 text-[13px] font-semibold text-[color:var(--fx-text)] outline-none focus:border-[#7C3AED]" />
              <span className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium" style={{ color: saveColor.c, background: saveColor.b }}>{saveState === "saved" && <Check className="h-3 w-3" />}{saveLabel}</span>
            </div>
          </div>

          {/* zoom + créditos */}
          <div className="absolute right-4 top-3 flex items-center gap-2">
            {credits !== null && <div className="flex items-center gap-1 rounded-xl fx-panel px-2.5 py-1.5 text-[11px] font-medium text-[#FBBF24]"><Zap className="h-3 w-3" fill="currentColor" />{credits}</div>}
            <div className="flex items-center gap-1 rounded-xl fx-panel px-1 py-1">
              <button type="button" onClick={() => rf.zoomOut()} className="flex h-6 w-6 items-center justify-center rounded-lg text-[color:var(--fx-muted)] hover:bg-white/5"><Minus className="h-3.5 w-3.5" /></button>
              <span className="w-10 text-center text-[11px] text-[color:var(--fx-muted)]">{zoomPct}%</span>
              <button type="button" onClick={() => rf.zoomIn()} className="flex h-6 w-6 items-center justify-center rounded-lg text-[color:var(--fx-muted)] hover:bg-white/5"><Plus className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          {nodes.length === 0 && !loading && <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><p className="text-sm text-[color:var(--fx-subtle)]">Arraste um nó do painel para começar.</p></div>}

          {/* bottom bar flutuante */}
          <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-2xl fx-panel p-1 shadow-[0_16px_50px_rgba(0,0,0,0.55)]">
            <button type="button" onClick={() => void runFlow()} disabled={running || loading} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition hover:bg-white/90 disabled:opacity-50">{running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" fill="currentColor" />}{running ? "Rodando…" : "Run Flow"}</button>
            <button type="button" onClick={clearAll} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[color:var(--fx-muted)] transition hover:bg-white/5"><Eraser className="h-4 w-4" /> Limpar</button>
            <button type="button" onClick={() => rf.fitView({ duration: 300 })} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm text-[color:var(--fx-muted)] transition hover:bg-white/5"><Crosshair className="h-4 w-4" /> Centralizar</button>
          </div>

          {/* reabrir painel */}
          {!panelOpen && <button type="button" onClick={() => setPanelOpen(true)} className="absolute right-4 top-14 flex items-center gap-1.5 rounded-xl fx-panel px-2.5 py-1.5 text-xs text-[color:var(--fx-muted)] hover:bg-white/5"><PanelRightOpen className="h-4 w-4" /> Nós</button>}

          {/* painel de nós flutuante */}
          {panelOpen && (
            <div className="absolute right-4 top-14 flex max-h-[calc(100vh-7rem)] w-[258px] flex-col rounded-[22px] fx-panel p-2.5">
              <div className="mb-2 flex items-center gap-2 px-1"><Workflow className="h-4 w-4 text-[#A78BFA]" /><p className="flex-1 text-xs font-semibold text-[color:var(--fx-text)]">Nós</p><button type="button" onClick={() => setPanelOpen(false)} className="flex h-6 w-6 items-center justify-center rounded-md text-[color:var(--fx-subtle)] hover:bg-white/5 hover:text-[color:var(--fx-muted)]"><XIcon className="h-4 w-4" /></button></div>
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--fx-subtle)]">Geradores</p>
              <div className="space-y-1">{gens.map((r) => <PanelItem key={r.type} reg={r} onAdd={addAtCenter} onInfo={(t) => { setInfoTop(t); setInfoType((p) => (p === r.type ? null : r.type)); }} active={infoType === r.type} />)}</div>
              <div className="my-2 h-px" style={{ background: "var(--fx-border)" }} />
              <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-widest text-[color:var(--fx-subtle)]">Utilitários</p>
              <div className="space-y-1">{utils.map((r) => <PanelItem key={r.type} reg={r} onAdd={addAtCenter} onInfo={(t) => { setInfoTop(t); setInfoType((p) => (p === r.type ? null : r.type)); }} active={infoType === r.type} />)}</div>
              <div className="my-2 h-px" style={{ background: "var(--fx-border)" }} />
              <button type="button" onClick={() => setGalleryOpen((v) => !v)} className="fx-item flex h-10 w-full items-center gap-2 px-2.5"><span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ background: "#4ADE8022", color: "#4ADE80" }}><Images className="h-4 w-4" /></span><span className="flex-1 text-left text-xs font-medium text-[color:var(--fx-text)]">Add Gallery</span>{galleryOpen ? <ChevronUp className="h-4 w-4 text-[color:var(--fx-subtle)]" /> : <ChevronDown className="h-4 w-4 text-[color:var(--fx-subtle)]" />}</button>
              {galleryOpen && <div className="mt-1 space-y-1 pl-3">{[["Image Gallery", ImageIcon], ["Video Gallery", Film]].map(([lb, Ic]) => { const I = Ic as typeof ImageIcon; return <button key={lb as string} type="button" onClick={() => toast("Galerias em breve.")} className="fx-item flex h-9 w-full items-center gap-2 px-2.5"><span className="flex h-5 w-5 items-center justify-center rounded-md text-[color:var(--fx-muted)]"><I className="h-3.5 w-3.5" /></span><span className="flex-1 text-left text-[11px] text-[color:var(--fx-muted)]">{lb as string}</span></button>; })}</div>}
            </div>
          )}

          {infoReg && <InfoPopover reg={infoReg} top={infoTop} onClose={() => setInfoType(null)} />}
        </div>
      </ActionsCtx.Provider>
    </ModelsCtx.Provider>
  );
}

function PanelItem({ reg, onAdd, onInfo, active }: { reg: RegEntry; onAdd: (t: string) => void; onInfo: (top: number) => void; active: boolean }) {
  return (
    <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/flownode", reg.type); e.dataTransfer.effectAllowed = "move"; }} onClick={() => onAdd(reg.type)}
      className="fx-item flex h-10 cursor-grab items-center gap-2 px-2.5 active:cursor-grabbing" style={active ? { borderColor: reg.accent, background: `${reg.accent}14` } : {}}>
      <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${reg.accent}22`, color: reg.accent }}><reg.Icon className="h-3.5 w-3.5" /></span>
      <span className="flex-1 text-xs font-medium" style={{ color: active ? reg.accent : "var(--fx-text)" }}>{reg.label}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onInfo((e.currentTarget as HTMLElement).getBoundingClientRect().top - 20); }} className="flex h-5 w-5 items-center justify-center rounded text-[color:var(--fx-subtle)] transition hover:text-[color:var(--fx-muted)]" title={`Sobre ${reg.label}`}><Info className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function FlowEditorPage() { return (<ReactFlowProvider><Editor /></ReactFlowProvider>); }
