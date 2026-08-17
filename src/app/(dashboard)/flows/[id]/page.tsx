"use client";

import { createContext, memo, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ReactFlow, ReactFlowProvider, Background, addEdge, useNodesState, useEdgesState,
  useReactFlow, useStore, useUpdateNodeInternals, Handle, Position, getBezierPath,
  type Node, type Edge, type Connection, type NodeProps, type NodeTypes, type EdgeTypes, type EdgeProps, type Viewport,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft, Play, Loader2, Check, X as XIcon, Trash2, Info, ChevronDown, ChevronUp,
  Type as TypeIcon, Image as ImageIcon, Film, FileImage, CircleDot, Workflow,
  Crosshair, Eraser, Plus, Maximize2, Minus, Upload, Sparkles, Music, Zap,
  PanelRightOpen, Layers, Scissors, ArrowUpToLine, Images, Download, Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
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
.fx-dots{display:grid;grid-template-columns:repeat(4,6px);gap:7px}
.fx-dots span{width:6px;height:6px;border-radius:999px;background:var(--dot,#F97316);opacity:.22;animation:fxpulse 1.15s ease-in-out infinite}
@keyframes fxpulse{0%,100%{opacity:.18}50%{opacity:1}}
.fx-bar{position:relative;height:3px;width:100%;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.08)}
.fx-bar::after{content:"";position:absolute;left:-40%;top:0;height:100%;width:40%;border-radius:999px;background:var(--dot,#F97316);animation:fxslide 1.2s ease-in-out infinite}
@keyframes fxslide{0%{left:-40%}100%{left:110%}}
@media (prefers-reduced-motion: reduce){.fx-dots span{animation:none;opacity:.55}.fx-bar::after{animation:none;left:0;width:100%;opacity:.5}}
.fx-edge-active{stroke-dasharray:9 8;stroke-linecap:round;animation:fxdash .8s linear infinite}
@keyframes fxdash{to{stroke-dashoffset:-24}}
@media (prefers-reduced-motion: reduce){.fx-edge-active{animation:none;opacity:.5}}
.fx-checker{background-color:#0f0f10;background-image:linear-gradient(45deg,#1c1c1f 25%,transparent 25%),linear-gradient(-45deg,#1c1c1f 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#1c1c1f 75%),linear-gradient(-45deg,transparent 75%,#1c1c1f 75%);background-size:14px 14px;background-position:0 0,0 7px,7px -7px,-7px 0}
`;

type ND = Record<string, unknown>;
interface ModelOpt { id: string; name: string; cost: number; modelId?: string; backend?: string; durMin?: number; durMax?: number; resolution?: string; hasAudio?: boolean }

/* ── NODE REGISTRY (metadata única: cor, ícone, descrição, exemplos) ─────── */
interface RegEntry { type: string; label: string; Icon: typeof TypeIcon; accent: string; group: "gen" | "util" | "hidden"; description: string; examples: string[]; }
const REGISTRY: RegEntry[] = [
  { type: "imageGen", label: "Image Generator", Icon: ImageIcon, accent: "#F97316", group: "gen", description: "Cria imagens de IA a partir de texto. Escolha o modelo, controle proporção e resolução, e suba referências.", examples: ["Um golden retriever numa praia ao pôr do sol", "Foto de produto de tênis sobre mármore", "Logo para uma marca de café"] },
  { type: "videoGen", label: "Video Generator", Icon: Film, accent: "#3B82F6", group: "gen", description: "Transforma prompts em vídeos de IA. Conecte uma imagem como primeiro frame para melhores resultados.", examples: ["Conecte um nó de imagem → vira o start frame", "Duração de 4 a 30 segundos", "End frame para transições controladas"] },
  { type: "audioGen", label: "Audio Generator", Icon: Music, accent: "#A78BFA", group: "gen", description: "Três modos: Text-to-Speech com 39 vozes, e (em breve) SFX e Música por IA.", examples: ["TTS: escolha a voz, escreva o script, gere", "SFX: 'trovão durante uma tempestade' (em breve)", "Música: 'lo-fi hip hop, Ré menor' (em breve)"] },
  { type: "prompt", label: "Prompt", Icon: TypeIcon, accent: "#C9C9D1", group: "util", description: "Um nó de texto reutilizável. O que você escrever aqui alimenta os geradores conectados.", examples: ["Escreva uma vez, use em vários nós", "Ótimo pra testar o mesmo prompt em modelos diferentes"] },
  { type: "storyboard", label: "Storyboard", Icon: Layers, accent: "#D8ED19", group: "util", description: "Planeje uma sequência de cenas. Encadeie Image e Video generators com direção criativa compartilhada.", examples: ["Esboce um comercial de 4 cenas num fluxo", "Mantenha luz e enquadramento consistentes", "(processamento em breve)"] },
  { type: "removeBg", label: "Remove BG", Icon: Scissors, accent: "#22D3EE", group: "util", description: "Remove o fundo de qualquer imagem, deixando só o sujeito com transparência.", examples: ["Produto no branco → PNG transparente", "Foto de pessoa → recorte limpo", "Conecte qualquer saída de imagem"] },
  { type: "upscale", label: "Upscale", Icon: ArrowUpToLine, accent: "#A3E635", group: "util", description: "Amplia imagens para 2× ou 4×, preservando detalhe e nitidez.", examples: ["2× transforma 1K em 2K", "4× transforma 1K em 4K", "Conecte qualquer saída de imagem → upscale"] },
  { type: "output", label: "Output", Icon: CircleDot, accent: "#4ADE80", group: "util", description: "Coleta o resultado final do fluxo.", examples: ["Conecte a saída de um gerador aqui"] },
  { type: "imageAsset", label: "Image Asset", Icon: FileImage, accent: "#F97316", group: "hidden", description: "Uma imagem pronta no canvas. Arraste um resultado gerado para cá para reutilizá-la.", examples: ["Arraste a imagem de um resultado", "Conecte a um Video Generator / Remove BG / Upscale"] },
];
const ACCENT: Record<string, string> = Object.fromEntries(REGISTRY.map((r) => [r.type, r.accent]));
const DEFAULTS: Record<string, ND> = {
  imageGen: { prompt: "", model: "", modelName: "", aspectRatio: "1:1", resolution: "1K", refs: [] },
  videoGen: { prompt: "", model: "", modelName: "", duration: 8, resolution: "720p", aspectRatio: "9:16", startFrame: "", endFrame: "", audioOn: true, multiShot: false },
  audioGen: { prompt: "", model: "", modelName: "", voice: "", mode: "TTS" },
  prompt: { text: "" }, storyboard: { aspectRatio: "1:1", resolution: "1K", image: "", prompts: [], model: "", modelName: "", results: [] }, removeBg: { rmbgModel: "RMBG-2.0" }, upscale: { scale: "2x", mode: "Sharp" }, output: {},
};

const ModelsCtx = createContext<{ image: ModelOpt[]; video: ModelOpt[]; audio: ModelOpt[] }>({ image: [], video: [], audio: [] });
const ActionsCtx = createContext<{ runNode: (id: string) => void; running: boolean; markDirty: () => void }>({ runNode: () => {}, running: false, markDirty: () => {} });

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
function NodeShell({ id, type, title, status, selected, runnable, width = 288, subtitle, noPad, glow, children }: {
  id: string; type: string; title: string; status?: string; selected?: boolean; runnable?: boolean; width?: number; subtitle?: React.ReactNode; noPad?: boolean; glow?: string; children?: React.ReactNode;
}) {
  const rf = useReactFlow(); const { runNode, running } = useContext(ActionsCtx);
  const reg = REGISTRY.find((r) => r.type === type)!; const accent = reg.accent;
  const [info, setInfo] = useState(false); const [ipos, setIpos] = useState({ x: 0, y: 0 });
  useEffect(() => { if (!info) return; const h = () => setInfo(false); const k = (e: KeyboardEvent) => { if (e.key === "Escape") setInfo(false); }; window.addEventListener("mousedown", h); window.addEventListener("keydown", k); return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); }; }, [info]);
  function openInfo(e: React.MouseEvent) { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const w = 280; let x = r.right + 8; if (x + w > window.innerWidth - 12) x = r.left - w - 8; let y = r.top; if (y + 140 > window.innerHeight - 12) y = window.innerHeight - 152; setIpos({ x, y }); setInfo((v) => !v); }
  return (
    <div className="fx-card group relative" style={{ width, ...(selected ? { borderColor: accent, boxShadow: `0 0 16px ${accent}22, 0 8px 28px rgba(0,0,0,.45)` } : glow ? { borderColor: `${glow}99`, boxShadow: `0 0 0 1px ${glow}55, 0 0 18px ${glow}44` } : {}) }}>
      <div className="relative flex h-[34px] items-center gap-2 border-b px-2.5" style={{ borderColor: "var(--fx-border)" }}>
        <span className="flex h-4 w-4 items-center justify-center" style={{ color: accent }}><reg.Icon className="h-3.5 w-3.5" /></span>
        <span className="flex-1 truncate text-[11px] font-semibold" style={{ color: accent }}>{title}</span>
        {subtitle}
        <StatusDot status={status} />
        <button type="button" className="nodrag flex h-5 w-5 items-center justify-center rounded text-[color:var(--fx-subtle)] transition hover:text-[color:var(--fx-muted)]" onMouseDown={(e) => e.stopPropagation()} onClick={openInfo} title="Sobre este nó"><Info className="h-3 w-3" /></button>
        <button type="button" className="nodrag flex h-5 w-5 items-center justify-center rounded text-[color:var(--fx-subtle)] transition hover:text-[#FCA5A5]" onMouseDown={(e) => e.stopPropagation()} onClick={() => rf.deleteElements({ nodes: [{ id }] })} title="Excluir nó"><Trash2 className="h-3 w-3" /></button>
      </div>
      <div className={noPad ? "" : "p-2.5"}>{children}</div>
      {runnable ? <div className="flex justify-end border-t px-2.5 py-1.5" style={{ borderColor: "var(--fx-border)" }}><button type="button" disabled={running} onClick={() => runNode(id)} className="nodrag flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#0A0A0A] transition hover:bg-white/90 disabled:opacity-50" title="Rodar este nó">{running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" fill="currentColor" />}</button></div> : null}
      {info && typeof document !== "undefined" && createPortal(
        <div className="fixed z-[90] w-[280px] rounded-xl p-3" style={{ left: ipos.x, top: ipos.y, background: "#17181b", border: "1px solid var(--fx-border-h)", boxShadow: "0 16px 44px rgba(0,0,0,.6)" }} onMouseDown={(e) => e.stopPropagation()}>
          <p className="mb-1 text-[12px] font-semibold" style={{ color: accent }}>{reg.label}</p>
          <p className="text-[12px] leading-relaxed text-[color:var(--fx-muted)]">{reg.description}</p>
        </div>, document.body)}
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
function FModelSelect({ value, options, onChange, placeholder }: { value: string; options: ModelOpt[]; onChange: (id: string) => void; placeholder?: string }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); }; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("mousedown", h); window.addEventListener("keydown", k); return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); }; }, [open]);
  const sel = options.find((o) => o.id === value);
  return (<div ref={ref} className="relative nodrag">
    <button type="button" onClick={() => setOpen((o) => !o)} className="fx-ctrl flex h-[32px] w-full items-center justify-between px-2.5 text-[11px]"><span className={sel ? "truncate text-[color:var(--fx-text)]" : "truncate text-[color:var(--fx-subtle)]"}>{sel ? sel.name : (placeholder || "— modelo —")}</span><ChevronDown className="h-3 w-3 shrink-0 text-[color:var(--fx-subtle)]" /></button>
    {open && <div className="nowheel absolute left-0 right-0 top-[36px] z-50 max-h-[220px] overflow-y-auto rounded-[10px] p-1" style={{ background: "var(--fx-elev)", border: "1px solid var(--fx-border-h)", boxShadow: "0 16px 40px rgba(0,0,0,.6)" }}>
      {options.length === 0 && <div className="px-2.5 py-2 text-[11px] text-[color:var(--fx-subtle)]">Sem modelos</div>}
      {options.map((o) => { const on = o.id === value; return (<button key={o.id} type="button" onClick={() => { onChange(o.id); setOpen(false); }} className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[11px] transition" style={on ? { background: "#F9731622", color: "#F97316" } : { color: "var(--fx-text)" }} onMouseEnter={(e) => { if (!on) e.currentTarget.style.background = "rgba(255,255,255,.05)"; }} onMouseLeave={(e) => { if (!on) e.currentTarget.style.background = "transparent"; }}><span className="flex-1 truncate">{o.name}</span>{on && <Check className="h-3.5 w-3.5 shrink-0" />}</button>); })}
    </div>}
  </div>);
}
function PromptModal({ value, onChange, onClose }: { value: string; onChange: (v: string) => void; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const content = (<div className="fixed inset-0 z-[100] flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,.55)", backdropFilter: "blur(6px)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="w-full max-w-[880px] rounded-[18px] p-5" style={{ background: "var(--fx-surface)", border: "1px solid var(--fx-border-h)", boxShadow: "0 30px 80px rgba(0,0,0,.6)" }}>
      <div className="mb-1 flex items-center justify-between"><p className="text-[16px] font-semibold text-[color:var(--fx-text)]">Prompt</p><button type="button" onClick={onClose} className="text-[color:var(--fx-subtle)] transition hover:text-white"><XIcon className="h-4 w-4" /></button></div>
      <p className="mb-3 text-[12px] text-[color:var(--fx-muted)]">As alterações salvam automaticamente — feche quando terminar.</p>
      <textarea autoFocus value={value} onChange={(e) => onChange(e.target.value)} className="fx-ctrl w-full resize-none px-3 py-2.5 text-[13px] leading-relaxed" style={{ minHeight: 240 }} placeholder="Descreva sua imagem…" />
    </div>
  </div>);
  return typeof document !== "undefined" ? createPortal(content, document.body) : null;
}
function DotLoader({ accent }: { accent: string }) {
  return (<div className="fx-dots" style={{ ["--dot" as string]: accent } as React.CSSProperties}>{Array.from({ length: 16 }).map((_, i) => <span key={i} style={{ animationDelay: (((i % 4) + Math.floor(i / 4)) * 90) + "ms" }} />)}</div>);
}
function ActBtn({ children, onClick, title, active }: { children: React.ReactNode; onClick: (e: React.MouseEvent) => void; title?: string; active?: boolean }) {
  return (<button type="button" onClick={onClick} data-active={active ? "1" : undefined} title={title} className="nodrag flex h-[28px] items-center gap-1 rounded-[7px] px-2 text-[10px] font-medium text-[color:var(--fx-text)] transition" style={{ background: "var(--fx-elev)", border: active ? "1px solid #F97316" : "1px solid var(--fx-border)" }} onMouseEnter={(e) => { e.currentTarget.style.background = "#202024"; }} onMouseLeave={(e) => { e.currentTarget.style.background = "var(--fx-elev)"; }}>{children}</button>);
}

function GenToolPopover({ kind, anchor, count, setCount, res, setRes, cost, busy, onGenerate, onClose }: { kind: "angles" | "variations"; anchor: DOMRect; count: number; setCount: (f: (c: number) => number) => void; res: string; setRes: (v: string) => void; cost: number; busy: boolean; onGenerate: () => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const [pos, setPos] = useState({ left: anchor.left, top: anchor.top - 8 });
  useLayoutEffect(() => { const el = ref.current; if (!el) return; const w = el.offsetWidth; const hh = el.offsetHeight; let left = anchor.left; if (left + w > window.innerWidth - 16) left = window.innerWidth - 16 - w; if (left < 16) left = 16; let top = anchor.top - hh - 8; if (top < 16) top = anchor.bottom + 8; setPos({ left, top }); }, [anchor]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; const md = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) onClose(); }; window.addEventListener("keydown", k); window.addEventListener("mousedown", md); return () => { window.removeEventListener("keydown", k); window.removeEventListener("mousedown", md); }; }, [onClose]);
  if (typeof document === "undefined") return null;
  return createPortal(<div ref={ref} className="fixed z-[95] flex items-center gap-2 rounded-xl fx-panel px-2.5 py-2" style={{ left: pos.left, top: pos.top, width: "max-content", minWidth: 360, maxWidth: "min(520px, calc(100vw - 32px))" }} onMouseDown={(e) => e.stopPropagation()}>
    <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium" style={{ color: ACCENT.imageGen }}>{kind === "angles" ? <CircleDot className="h-3.5 w-3.5" /> : <Layers className="h-3.5 w-3.5" />}{kind === "angles" ? "Angles" : "Variations"}</span>
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => setCount((c) => Math.max(1, c - 1))} className="flex h-6 w-6 items-center justify-center rounded text-[color:var(--fx-muted)] hover:bg-white/5"><Minus className="h-3.5 w-3.5" /></button>
      <span className="w-5 text-center text-[12px] text-[color:var(--fx-text)]">{count}</span>
      <button type="button" onClick={() => setCount((c) => Math.min(8, c + 1))} className="flex h-6 w-6 items-center justify-center rounded text-[color:var(--fx-muted)] hover:bg-white/5"><Plus className="h-3.5 w-3.5" /></button>
    </div>
    <select value={res} onChange={(e) => setRes(e.target.value)} className="fx-ctrl h-7 w-[74px] shrink-0 appearance-none px-2 text-[11px]">{["1K", "2K", "4K"].map((r) => <option key={r} value={r}>{r}</option>)}</select>
    <button type="button" onClick={onGenerate} disabled={busy} className="flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 text-[12px] font-semibold text-white disabled:opacity-60" style={{ background: ACCENT.imageGen }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Zap className="h-3.5 w-3.5" fill="currentColor" />Generate{cost ? " " + cost : ""}</>}</button>
    <button type="button" onClick={onClose} className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[color:var(--fx-subtle)] hover:text-white"><XIcon className="h-4 w-4" /></button>
  </div>, document.body);
}
function ImagePreviewModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  if (typeof document === "undefined" || !url) return null;
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center p-8" style={{ background: "rgba(0,0,0,.7)", backdropFilter: "blur(4px)" }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="relative max-h-[90vh] max-w-[90vw]"><button type="button" onClick={onClose} className="absolute -right-2 -top-10 flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: "rgba(0,0,0,.6)" }}><XIcon className="h-4 w-4" /></button>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain" /></div>
  </div>, document.body);
}

function ImageGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const upd = useUpdateNodeInternals();
  const models = useContext(ModelsCtx).image; const videoModels = useContext(ModelsCtx).video;
  const { runNode, running, markDirty } = useContext(ActionsCtx);
  const d = data as ND;
  const [promptOpen, setPromptOpen] = useState(false); const [imgLoaded, setImgLoaded] = useState(false);
  const [tool, setTool] = useState<"none" | "angles" | "variations">("none"); const [toolAnchor, setToolAnchor] = useState<DOMRect | null>(null); const [tCount, setTCount] = useState(4); const [tRes, setTRes] = useState("1K"); const [tBusy, setTBusy] = useState(false);
  const refs = Array.isArray(d.refs) ? (d.refs as string[]) : [];
  const tray = Array.isArray(d.__tray) ? (d.__tray as string[]) : [];
  const status = d.__status as string | undefined; const result = d.__result as string | undefined; const editing = Boolean(d.__editing);
  const collapsed = d.__collapsed !== false;
  const vstate = status === "running" ? "generating" : status === "failed" ? "error" : (result && !editing) ? "result" : "config";
  useEffect(() => { upd(id); }, [vstate, id, upd, collapsed, tray.length]);
  const meta = (d.__resultMeta as ND) || {};
  const usedModel = (meta.modelName as string) || (d.modelName as string) || (d.model as string) || "";
  const usedAspect = (meta.aspectRatio as string) || (d.aspectRatio as string) || "1:1";
  const usedRes = (meta.resolution as string) || (d.resolution as string) || "1K";
  const [aw, ah] = ((d.aspectRatio as string) || "1:1").split(":").map(Number);
  const genH = Math.max(150, Math.min(420, Math.round(298 * ((ah || 1) / (aw || 1)))));
  const [uaw, uah] = usedAspect.split(":").map(Number);
  const resH = Math.max(150, Math.min(440, Math.round(298 * ((uah || 1) / (uaw || 1)))));
  const modelCost = models.find((m) => m.id === d.model)?.cost || 0;
  const handles = (<><Handle type="target" position={Position.Left} id="prompt" style={{ top: 48, background: "#22D3EE" }} /><Handle type="target" position={Position.Left} id="reference" style={{ top: 88, background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.imageGen }} /></>);
  function spawnLinked(type: string, patch: ND, targetHandle: string) {
    const pos = rf.getNode(id)?.position || { x: 0, y: 0 };
    const nid = type + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const base = JSON.parse(JSON.stringify(DEFAULTS[type])) as ND;
    rf.setNodes((n) => [...n, { id: nid, type, position: { x: pos.x + 360, y: pos.y }, data: { ...base, ...patch } } as Node]);
    rf.setEdges((e) => addEdge({ source: id, target: nid, sourceHandle: "out", targetHandle, type: "grad" }, e)); markDirty();
  }
  function animate() { if (!result) return; const vm = videoModels[0]; spawnLinked("videoGen", { title: "Video Generator", startFrame: result, model: vm?.id || "", modelName: vm?.name || "" }, "reference"); toast.success("Video Generator criado com a imagem como start frame."); }
  function removeBg() { if (!result) return; spawnLinked("removeBg", { title: "Remove BG" }, "reference"); toast.success("Nó Remove BG criado e conectado."); }
  async function download(u: string) { try { const r = await fetch(u); const b = await r.blob(); const l = URL.createObjectURL(b); const a = document.createElement("a"); a.href = l; a.download = "fluxyra-" + Date.now() + ".png"; a.click(); URL.revokeObjectURL(l); } catch { window.open(u, "_blank"); } }
  async function poll(gid: string): Promise<string> { for (let i = 0; i < 120; i++) { await sleep(3000); const r = await fetch(`/api/generate/status?id=${gid}`, { cache: "no-store" }); const dt = await r.json().catch(() => null); if (dt?.status === "completed" && dt.result_url) return dt.result_url; if (dt?.status === "failed") throw new Error(dt.error_message || "Geração falhou."); } throw new Error("Tempo esgotado."); }
  async function genDerived(kind: "angles" | "variations") {
    if (!d.model) { toast.error("Escolha um modelo de imagem."); return; }
    if (!result) return; setTBusy(true);
    const suffix = kind === "angles" ? " — same subject, outfit and style, different camera angle and perspective, cinematic framing" : " — same subject, creative variation: alternative composition, lighting and mood";
    const basePrompt = String(d.prompt || "").trim() || "same subject as the reference image";
    try {
      for (let i = 0; i < tCount; i++) {
        const body = { prompt: basePrompt + suffix, model_uuid: d.model, aspect_ratio: d.aspectRatio, quality: "high", resolution: tRes, reference_images: [result], reference_image_url: result };
        const r = await fetch("/api/generate/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const dt = await r.json().catch(() => null); if (!r.ok) throw new Error(dt?.error || "Falha ao gerar.");
        let u = dt?.result_url as string | undefined; if (dt?.status !== "completed" || !u) u = await poll(String(dt.generation_id));
        const fresh = (rf.getNode(id)?.data as ND) || {}; const cur = Array.isArray(fresh.__tray) ? [...(fresh.__tray as string[])] : []; rf.updateNodeData(id, { __tray: [...cur, u], __collapsed: false });
      }
      toast.success((kind === "angles" ? "Ângulos" : "Variações") + " gerados ✓");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setTBusy(false); setTool("none"); }
  }
  const title = (d.title as string) || "Image Generator";
  const cfg = (<>
    <div className="mb-2"><FModelSelect value={(d.model as string) || ""} options={models} placeholder="— modelo —" onChange={(mid) => rf.updateNodeData(id, { model: mid, modelName: models.find((m) => m.id === mid)?.name || "" })} /></div>
    <div className="relative mb-2"><FTextarea rows={2} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Descreva a imagem (ou conecte um Prompt)…" className="pr-7" /><button type="button" onClick={() => setPromptOpen(true)} className="nodrag absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-[color:var(--fx-subtle)] transition hover:text-[color:var(--fx-muted)]" title="Expandir"><Maximize2 className="h-3 w-3" /></button></div>
    <EnhanceBtn id={id} modality="image" value={(d.prompt as string) || ""} label="Wise enhance" />
    <MultiUpload id={id} refs={refs} />
    <div className="grid grid-cols-2 gap-2"><FSelect value={(d.aspectRatio as string) || "1:1"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })}>{["1:1", "16:9", "9:16", "4:3", "3:4"].map((a) => <option key={a} value={a}>{a}</option>)}</FSelect><FSelect value={(d.resolution as string) || "1K"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })}>{["1K", "2K", "4K"].map((r) => <option key={r} value={r}>{r}</option>)}</FSelect></div>
  </>);

  if (vstate === "generating") {
    return (<NodeShell id={id} type="imageGen" title={title} status={status} selected={selected} noPad width={300}>
      <div className="relative overflow-hidden rounded-b-[11px]" style={{ height: genH, background: "#0a0a0b", backgroundImage: "radial-gradient(circle at 72% 14%, " + ACCENT.imageGen + "22, transparent 55%)" }}>
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-2"><span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium text-white" style={{ background: "rgba(0,0,0,.5)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT.imageGen }} />{(d.modelName as string) || (d.model as string) || "Modelo"}</span><span className="rounded-full px-2 py-0.5 text-[9px] text-white" style={{ background: "rgba(0,0,0,.5)" }}>{(d.aspectRatio as string) || "1:1"}</span></div>
        <div className="flex h-full items-center justify-center"><DotLoader accent={ACCENT.imageGen} /></div>
        <div className="absolute inset-x-0 bottom-0 p-2.5"><div className="mb-1 text-[10px] font-medium text-white">Generating…</div><div className="fx-bar" style={{ ["--dot" as string]: ACCENT.imageGen } as React.CSSProperties} /></div>
      </div>
      {handles}
    </NodeShell>);
  }
  if (vstate === "error") {
    return (<NodeShell id={id} type="imageGen" title={title} status={status} selected={selected} width={300}>
      <p className="text-[12px] font-medium text-[#FCA5A5]">Falha na geração</p>
      <p className="mt-1 text-[10px] text-[color:var(--fx-muted)]">{(d.__error as string) || "Não foi possível concluir. Tente novamente ou ajuste os parâmetros."}</p>
      <div className="mt-3 flex gap-2"><FButton onClick={() => runNode(id)} disabled={running}><Play className="h-3 w-3" fill="currentColor" />Retry</FButton><FButton onClick={() => rf.updateNodeData(id, { __status: undefined, __editing: true })}>Editar parâmetros</FButton></div>
      {handles}
    </NodeShell>);
  }
  if (vstate === "result") {
    return (<NodeShell id={id} type="imageGen" title={title} status={status} selected={selected} noPad runnable={!collapsed} width={300}>
      {tool !== "none" && toolAnchor && <GenToolPopover kind={tool} anchor={toolAnchor} count={tCount} setCount={setTCount} res={tRes} setRes={setTRes} cost={modelCost * tCount} busy={tBusy} onGenerate={() => genDerived(tool)} onClose={() => setTool("none")} />}
      <div className="relative overflow-hidden rounded-b-[11px]" style={{ height: resH, background: "#0a0a0b" }}>
        {!imgLoaded && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-[color:var(--fx-subtle)]" /></div>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result} alt="" onLoad={() => setImgLoaded(true)} draggable onDragStart={(e) => { e.dataTransfer.setData("application/flowasset", JSON.stringify({ url: result, aspectRatio: usedAspect, model: usedModel, resolution: usedRes })); e.dataTransfer.effectAllowed = "all"; }} className="nodrag h-full w-full object-cover" style={{ opacity: imgLoaded ? 1 : 0, transition: "opacity .2s" }} />
        <div className="absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium text-white" style={{ background: "rgba(0,0,0,.5)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT.imageGen }} />{usedModel || "Modelo"}</div>
        <div className="absolute right-2 top-2 z-10 flex gap-1"><span className="rounded-full px-2 py-0.5 text-[9px] text-white" style={{ background: "rgba(0,0,0,.5)" }}>{usedAspect}</span><span className="rounded-full px-2 py-0.5 text-[9px] text-white" style={{ background: "rgba(0,0,0,.5)" }}>{usedRes}</span></div>
      </div>
      <div className="flex flex-wrap gap-1.5 p-2">
        <ActBtn onClick={() => download(result!)} title="Baixar"><Download className="h-3 w-3" /></ActBtn>
        <ActBtn onClick={animate}><Film className="h-3 w-3" />Animate</ActBtn>
        <ActBtn onClick={removeBg}><Scissors className="h-3 w-3" />Remove BG</ActBtn>
        <ActBtn active={tool === "variations"} onClick={(e) => { setToolAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()); setTool(tool === "variations" ? "none" : "variations"); }}><Layers className="h-3 w-3" />Variations</ActBtn>
        <ActBtn active={tool === "angles"} onClick={(e) => { setToolAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()); setTool(tool === "angles" ? "none" : "angles"); }}><CircleDot className="h-3 w-3" />Angles</ActBtn>
        {collapsed ? <ActBtn onClick={() => rf.updateNodeData(id, { __collapsed: false })}><Sparkles className="h-3 w-3" />Edit</ActBtn> : <ActBtn onClick={() => rf.updateNodeData(id, { __collapsed: true })}><ChevronUp className="h-3 w-3" />Collapse</ActBtn>}
        <ActBtn onClick={() => { if (!String(d.prompt || "").trim()) { rf.updateNodeData(id, { __collapsed: false }); toast("Configure o prompt e o modelo, depois gere."); return; } runNode(id); }}><Play className="h-3 w-3" fill="currentColor" />Recreate</ActBtn>
      </div>
      {!collapsed && <div className="space-y-2 border-t p-2.5" style={{ borderColor: "var(--fx-border)" }}>
        {cfg}
        {tray.length > 0 && <div><p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-[color:var(--fx-subtle)]">Generated</p><div className="flex flex-wrap gap-1.5">{tray.map((u, i) => <div key={i} className="group/thumb relative h-14 w-14 overflow-hidden rounded-md ring-1 ring-white/10">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={u} alt="" draggable onDragStart={(e) => { e.dataTransfer.setData("application/flowasset", JSON.stringify({ url: u, aspectRatio: usedAspect, model: usedModel, resolution: usedRes })); e.dataTransfer.effectAllowed = "all"; }} className="nodrag h-full w-full cursor-grab object-cover" /><button type="button" onClick={() => download(u)} className="nodrag absolute bottom-0.5 right-0.5 flex h-4 w-4 items-center justify-center rounded bg-black/70 text-white opacity-0 transition group-hover/thumb:opacity-100"><Download className="h-2.5 w-2.5" /></button></div>)}</div></div>}
      </div>}
      {promptOpen && <PromptModal value={(d.prompt as string) || ""} onChange={(v) => rf.updateNodeData(id, { prompt: v })} onClose={() => setPromptOpen(false)} />}
      {handles}
    </NodeShell>);
  }
  return (<NodeShell id={id} type="imageGen" title={title} status={status} selected={selected} runnable width={300}>
    {cfg}
    {promptOpen && <PromptModal value={(d.prompt as string) || ""} onChange={(v) => rf.updateNodeData(id, { prompt: v })} onClose={() => setPromptOpen(false)} />}
    {handles}
  </NodeShell>);
}

type VDur = { type: "range"; min: number; max: number } | { type: "enum"; values: number[] };
interface VCaps { endFrame: boolean; audio: boolean; multiShot: boolean; omni: boolean; aspects: string[]; resolutions: string[]; duration: VDur; rule1080Dur6?: boolean; }
// Mapa explícito por model_id (doc oficial PiAPI, 16/08/2026). Fonte de verdade da UI+normalização.
const SEEDANCE_ASPECTS = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
const KV_ASPECTS = ["16:9", "9:16", "1:1"];
const VCAPS: Record<string, VCaps> = {
  "kling-3.0": { endFrame: true, audio: true, multiShot: true, omni: false, aspects: KV_ASPECTS, resolutions: ["720p", "1080p"], duration: { type: "range", min: 3, max: 15 } },
  "kling-2.5-turbo": { endFrame: true, audio: false, multiShot: false, omni: false, aspects: KV_ASPECTS, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [5, 10] } },
  "kling-omni": { endFrame: true, audio: true, multiShot: false, omni: true, aspects: KV_ASPECTS, resolutions: ["720p", "1080p"], duration: { type: "range", min: 3, max: 15 } },
  "kling-3.0-motion": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: KV_ASPECTS, resolutions: ["1080p"], duration: { type: "range", min: 3, max: 30 } },
  "kling-avatar": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: [], resolutions: ["720p"], duration: { type: "enum", values: [4, 8] } },
  "seedance-2.0": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEEDANCE_ASPECTS, resolutions: ["480p", "720p", "1080p"], duration: { type: "range", min: 4, max: 15 } },
  "seedance-2.0-less-restriction": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEEDANCE_ASPECTS, resolutions: ["480p", "720p", "1080p"], duration: { type: "range", min: 4, max: 15 } },
  "seedance-2.0-fast": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEEDANCE_ASPECTS, resolutions: ["480p", "720p"], duration: { type: "range", min: 4, max: 15 } },
  "seedance-1.5-pro": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEEDANCE_ASPECTS, resolutions: ["480p", "720p"], duration: { type: "range", min: 4, max: 12 } },
  "seedance-2.5": { endFrame: true, audio: false, multiShot: false, omni: true, aspects: SEEDANCE_ASPECTS, resolutions: ["480p", "720p"], duration: { type: "range", min: 4, max: 30 } },
  "veo-3.1-quality": { endFrame: true, audio: true, multiShot: false, omni: false, aspects: KV_ASPECTS, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] } },
  "veo-3.1-fast": { endFrame: true, audio: true, multiShot: false, omni: false, aspects: KV_ASPECTS, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] } },
  "veo-3": { endFrame: true, audio: true, multiShot: false, omni: false, aspects: KV_ASPECTS, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] } },
  "veo-3-fast": { endFrame: true, audio: true, multiShot: false, omni: false, aspects: KV_ASPECTS, resolutions: ["720p", "1080p"], duration: { type: "enum", values: [4, 6, 8] } },
  "hailuo": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: [], resolutions: ["720p", "1080p"], duration: { type: "enum", values: [6, 10] }, rule1080Dur6: true },
  "hailuo-live": { endFrame: false, audio: false, multiShot: false, omni: false, aspects: [], resolutions: ["720p", "1080p"], duration: { type: "enum", values: [6, 10] }, rule1080Dur6: true },
  "wan-2.1-video": { endFrame: false, audio: true, multiShot: false, omni: false, aspects: ["16:9", "9:16", "1:1", "4:3", "3:4"], resolutions: ["720p", "1080p"], duration: { type: "enum", values: [5, 10, 15] } },
};
// Flag global: editor de multi-shot ainda não existe -> capability fica true, UI oculta.
const MULTISHOT_UI_ENABLED = false;
function videoCapsFor(m?: ModelOpt): VCaps {
  if (m?.modelId && VCAPS[m.modelId]) return VCAPS[m.modelId];
  const b = m?.backend || ""; const dmin = m?.durMin ?? 4; const dmax = m?.durMax ?? 8;
  const dur: VDur = dmax - dmin <= 6 ? { type: "enum", values: Array.from(new Set([dmin, Math.round((dmin + dmax) / 2), dmax])) } : { type: "range", min: dmin, max: dmax };
  return { endFrame: ["kling", "kling-turbo", "seedance", "veo3", "veo3.1"].includes(b), audio: Boolean(m?.hasAudio), multiShot: false, omni: b === "seedance", aspects: KV_ASPECTS, resolutions: m?.resolution === "1080p" ? ["720p", "1080p"] : [m?.resolution || "720p"], duration: dur };
}
// validateConfig: normaliza a config para caber nas capabilities (usado ao trocar modelo e ao mudar resolução).
function normalizeVideo(d: ND, caps: VCaps): ND {
  const patch: ND = {};
  const curRes = (d.resolution as string) || "";
  const finalRes = caps.resolutions.includes(curRes) ? curRes : caps.resolutions[caps.resolutions.length - 1];
  if (finalRes !== curRes) patch.resolution = finalRes;
  if (caps.aspects.length && !caps.aspects.includes((d.aspectRatio as string) || "")) patch.aspectRatio = caps.aspects[0];
  if (!caps.endFrame && d.endFrame) patch.endFrame = "";
  if (!caps.audio && d.audioOn !== false) patch.audioOn = false;
  if (d.multiShot) patch.multiShot = false;
  let dur = Number(d.duration) || (caps.duration.type === "enum" ? caps.duration.values[0] : caps.duration.min);
  if (caps.duration.type === "range") dur = Math.max(caps.duration.min, Math.min(caps.duration.max, dur));
  else dur = caps.duration.values.reduce((a, b) => (Math.abs(b - dur) < Math.abs(a - dur) ? b : a), caps.duration.values[0]);
  if (caps.rule1080Dur6 && finalRes === "1080p") dur = 6;
  patch.duration = dur;
  return patch;
}

function VideoGenNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx).video; const d = data as ND;
  const status = d.__status as string | undefined; const result = d.__result as string | undefined;
  const model = models.find((m) => m.id === d.model); const caps = videoCapsFor(model);
  const meta = (d.__resultMeta as ND) || {};
  const [promptOpen, setPromptOpen] = useState(false);
  const packed = useStore((s) => { const e = s.edges.find((ed) => ed.target === id && (ed.targetHandle === "reference" || !ed.targetHandle)); if (!e) return "0|0|"; const sd = (s.nodeLookup.get(e.source)?.data || {}) as ND; const u = (sd.__result as string) || (sd.url as string) || (sd.heldImage as string) || ""; return "1|" + (sd.__status === "running" ? "1" : "0") + "|" + (/^https?:\/\//i.test(u) ? u : ""); });
  const parts = packed.split("|"); const srcRunning = parts[1] === "1"; const connImg = parts.slice(2).join("|");
  const startFrame = (d.startFrame as string) || connImg;
  const resolution = (d.resolution as string) || caps.resolutions[caps.resolutions.length - 1];
  const dur = caps.duration.type === "range" ? Math.max(caps.duration.min, Math.min(caps.duration.max, Number(d.duration) || caps.duration.min)) : (caps.duration.values.includes(Number(d.duration)) ? Number(d.duration) : caps.duration.values[0]);
  const audioOn = d.audioOn !== false;
  const upd = useUpdateNodeInternals();
  useEffect(() => { const r = requestAnimationFrame(() => upd(id)); return () => cancelAnimationFrame(r); }, [status, result, d.model, id, upd]);
  const handles = (<><Handle type="target" position={Position.Left} id="prompt" style={{ top: 48, background: "#22D3EE" }} /><Handle type="target" position={Position.Left} id="reference" style={{ top: 88, background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.videoGen }} /></>);
  function pickModel(mid: string) { const m = models.find((x) => x.id === mid); rf.updateNodeData(id, { model: mid, modelName: m?.name || "", ...normalizeVideo(d, videoCapsFor(m)) }); }
  function setRes(v: string) { rf.updateNodeData(id, { resolution: v, ...(caps.rule1080Dur6 && v === "1080p" ? { duration: 6 } : {}) }); }
  async function download() { if (!result) return; try { const r = await fetch(result); const b = await r.blob(); const l = URL.createObjectURL(b); const a = document.createElement("a"); a.href = l; a.download = "fluxyra-" + Date.now() + ".mp4"; a.click(); URL.revokeObjectURL(l); } catch { window.open(result, "_blank"); } }

  if (status === "running") {
    return (<NodeShell id={id} type="videoGen" title={(d.title as string) || "Video Generator"} status={status} selected={selected} glow={ACCENT.videoGen} noPad width={300}>
      <div className="relative overflow-hidden" style={{ height: 260, background: "#0a0a0b" }}>
        {startFrame ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={startFrame} alt="" className="h-full w-full scale-105 object-cover opacity-55 blur-sm" />) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "rgba(0,0,0,.42)" }}><Loader2 className="h-6 w-6 animate-spin" style={{ color: ACCENT.videoGen }} /><span className="text-[11px] font-medium text-white">Gerando vídeo…</span></div>
      </div>{handles}
    </NodeShell>);
  }
  if (status === "failed") {
    return (<NodeShell id={id} type="videoGen" title={(d.title as string) || "Video Generator"} status={status} selected={selected} width={300} runnable>
      <p className="text-[12px] font-medium text-[#FCA5A5]">Falha na geração de vídeo</p>
      <p className="mt-1 text-[10px] text-[color:var(--fx-muted)]">{(d.__error as string) || "Não foi possível concluir. Tente novamente ou ajuste os parâmetros."}</p>{handles}
    </NodeShell>);
  }
  if (result) {
    return (<NodeShell id={id} type="videoGen" title={(d.title as string) || "Video Generator"} status={status} selected={selected} noPad width={300} runnable>
      <div className="relative" style={{ background: "#000" }}>
        <video src={result} controls playsInline className="nodrag block w-full" style={{ maxHeight: 360 }} />
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium text-white" style={{ background: "rgba(0,0,0,.55)" }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: ACCENT.videoGen }} />{(meta.modelName as string) || (d.modelName as string) || "Vídeo"}</div>
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1">{meta.aspectRatio ? <span className="rounded-full px-2 py-0.5 text-[9px] text-white" style={{ background: "rgba(0,0,0,.55)" }}>{meta.aspectRatio as string}</span> : null}{meta.duration ? <span className="rounded-full px-2 py-0.5 text-[9px] text-white" style={{ background: "rgba(0,0,0,.55)" }}>{meta.duration as number}s</span> : null}</div>
      </div>
      <div className="flex items-center gap-2 border-t p-2" style={{ borderColor: "var(--fx-border)" }}>
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={download} title="Baixar" className="nodrag flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#0A0A0A]"><Download className="h-3.5 w-3.5" /></button>
        <span className="text-[10px] text-[color:var(--fx-muted)]">{(meta.resolution as string) || resolution}</span>
      </div>{handles}
    </NodeShell>);
  }

  const startBlock = (<div><span className="mb-1 block text-[9px] uppercase tracking-wide text-[color:var(--fx-subtle)]">Start Frame</span>{(d.startFrame as string) ? <FrameUpload id={id} field="startFrame" url={(d.startFrame as string)} /> : connImg ? (<div className="relative h-14 overflow-hidden rounded-[8px]">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={connImg} alt="" className="h-full w-full object-cover" /><span className="absolute right-1 top-1 rounded px-1 py-0.5 text-[8px] text-white" style={{ background: "rgba(0,0,0,.6)" }}>Conectado</span></div>) : <FrameUpload id={id} field="startFrame" url="" waiting={srcRunning} />}</div>);
  return (<NodeShell id={id} type="videoGen" title={(d.title as string) || "Video Generator"} status={status} selected={selected} runnable width={300}>
    <div className="mb-2"><FModelSelect value={(d.model as string) || ""} options={models} placeholder="— modelo —" onChange={pickModel} /></div>
    <div className="relative mb-2"><FTextarea rows={2} value={(d.prompt as string) || ""} onChange={(e) => rf.updateNodeData(id, { prompt: e.target.value })} placeholder="Descreva o movimento…" className="pr-7" /><button type="button" onClick={() => setPromptOpen(true)} className="nodrag absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded text-[color:var(--fx-subtle)] transition hover:text-[color:var(--fx-muted)]" title="Expandir"><Maximize2 className="h-3 w-3" /></button></div>
    <EnhanceBtn id={id} modality="video" value={(d.prompt as string) || ""} label="Generate prompt for me" />
    <p className="mb-2 text-[9px] leading-snug text-[color:var(--fx-subtle)]">Adicione ou conecte uma imagem como frame inicial{caps.endFrame ? "/final" : ""} para guiar o movimento.</p>
    <div className={`mb-2 ${caps.endFrame ? "grid grid-cols-2 gap-2" : ""}`}>{startBlock}{caps.endFrame ? <div><span className="mb-1 block text-[9px] uppercase tracking-wide text-[color:var(--fx-subtle)]">End Frame</span><FrameUpload id={id} field="endFrame" url={(d.endFrame as string) || ""} /></div> : null}</div>
    <div className={`mb-2 ${caps.aspects.length ? "grid grid-cols-2 gap-2" : ""}`}>{caps.aspects.length ? <FDrop value={(d.aspectRatio as string) || caps.aspects[0]} accent={ACCENT.videoGen} options={caps.aspects.map((a) => ({ value: a, label: a }))} onChange={(v) => rf.updateNodeData(id, { aspectRatio: v })} /> : null}<FDrop value={resolution} accent={ACCENT.videoGen} options={caps.resolutions.map((r) => ({ value: r, label: r }))} onChange={setRes} /></div>
    <div className="mb-2">{caps.duration.type === "enum" ? (<div className="flex gap-1.5">{caps.duration.values.map((v) => <button key={v} type="button" onClick={() => rf.updateNodeData(id, { duration: v })} className="nodrag h-[30px] flex-1 rounded-[8px] border text-[11px] font-medium transition" style={dur === v ? { background: ACCENT.videoGen, borderColor: ACCENT.videoGen, color: "#fff" } : { background: "var(--fx-ctrl)", borderColor: "var(--fx-border)", color: "var(--fx-muted)" }}>{v}s</button>)}</div>) : (<div className="flex items-center gap-2"><input type="range" min={caps.duration.min} max={caps.duration.max} value={dur} onChange={(e) => rf.updateNodeData(id, { duration: Number(e.target.value) })} className="nodrag flex-1" /><span className="w-8 text-right text-[10px] text-[color:var(--fx-muted)]">{dur}s</span></div>)}</div>
    {caps.audio ? <div className="flex gap-2"><FSwitch label="Audio" on={audioOn} onToggle={() => rf.updateNodeData(id, { audioOn: !audioOn })} /></div> : null}
    {caps.multiShot && MULTISHOT_UI_ENABLED ? <div className="mt-2 flex gap-2"><FSwitch label="Multi-shot" on={Boolean(d.multiShot)} onToggle={() => rf.updateNodeData(id, { multiShot: !d.multiShot })} /></div> : null}
    {promptOpen && <PromptModal value={(d.prompt as string) || ""} onChange={(v) => rf.updateNodeData(id, { prompt: v })} onClose={() => setPromptOpen(false)} />}
    {handles}
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
  const rf = useReactFlow(); const d = data as ND; const models = useContext(ModelsCtx).image;
  const [genBusy, setGenBusy] = useState(false); const [allBusy, setAllBusy] = useState(false); const [scene, setScene] = useState<number | null>(null);
  const prompts = Array.isArray(d.prompts) ? (d.prompts as string[]) : [];
  const results = Array.isArray(d.results) ? (d.results as string[]) : [];
  function resolveImage(): string {
    const own = (d.image as string) || ""; if (/^https?:\/\//i.test(own)) return own;
    for (const e of rf.getEdges().filter((x) => x.target === id)) { const sd = (rf.getNode(e.source)?.data as ND) || {}; const u = (sd.url as string) || (sd.__result as string) || ""; if (/^https?:\/\//i.test(u)) return u; }
    return "";
  }
  async function poll(gid: string): Promise<string> { for (let i = 0; i < 120; i++) { await sleep(3000); const r = await fetch(`/api/generate/status?id=${gid}`, { cache: "no-store" }); const dt = await r.json().catch(() => null); if (dt?.status === "completed" && dt.result_url) return dt.result_url; if (dt?.status === "failed") throw new Error(dt.error_message || "Geração falhou."); } throw new Error("Tempo esgotado."); }
  async function genPrompts() {
    const img = resolveImage();
    if (!img) { toast.error("Conecte um Reference Image (ou envie uma imagem) antes de gerar."); return; }
    setGenBusy(true);
    try {
      const r = await fetch("/api/storyboard", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ image_url: img, count: 4, aspect_ratio: d.aspectRatio }) });
      const dt = await r.json().catch(() => null); if (!r.ok) throw new Error(dt?.error || "Falha");
      rf.updateNodeData(id, { prompts: dt.prompts, results: [] }); toast.success(`${dt.prompts.length} prompts gerados \u2728`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setGenBusy(false); }
  }
  async function genScene(i: number) {
    const cur = (rf.getNode(id)?.data as ND) || {}; const ps = Array.isArray(cur.prompts) ? (cur.prompts as string[]) : [];
    if (!cur.model) { toast.error("Escolha um modelo de imagem."); return; }
    if (!ps[i]) return; setScene(i);
    try {
      const body = { prompt: ps[i], model_uuid: cur.model, aspect_ratio: cur.aspectRatio, quality: "high", resolution: cur.resolution };
      const r = await fetch("/api/generate/image", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const dt = await r.json().catch(() => null); if (!r.ok) throw new Error(dt?.error || "Falha ao gerar cena.");
      let u = dt?.result_url as string | undefined; if (dt?.status !== "completed" || !u) u = await poll(String(dt.generation_id));
      const fresh = (rf.getNode(id)?.data as ND) || {}; const rs = Array.isArray(fresh.results) ? [...(fresh.results as string[])] : [];
      rs[i] = u; rf.updateNodeData(id, { results: rs }); toast.success(`Cena ${i + 1} gerada \u2713`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); } finally { setScene(null); }
  }
  async function genAll() { setAllBusy(true); const n = ((rf.getNode(id)?.data as ND)?.prompts as string[] | undefined)?.length || 0; for (let i = 0; i < n; i++) await genScene(i); setAllBusy(false); }
  const anyBusy = allBusy || scene !== null;
  return (<NodeShell id={id} type="storyboard" title={(d.title as string) || "Storyboard"} status={d.__status as string} selected={selected} width={300} subtitle={<span className="text-[9px] text-[color:var(--fx-subtle)]">{prompts.length} prompts</span>}>
    <p className="mb-2 text-[10px] text-[color:var(--fx-muted)]">O LLM analisa a imagem e gera prompts. Cada cena vira uma imagem só quando voc\u00ea clicar.</p>
    <div className="mb-2"><FrameUpload id={id} field="image" url={(d.image as string) || ""} /></div>
    <div className="mb-2"><FSelect value={(d.model as string) || ""} onChange={(e) => rf.updateNodeData(id, { model: e.target.value, modelName: models.find((m) => m.id === e.target.value)?.name || "" })}><option value="">— modelo de imagem —</option>{models.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</FSelect></div>
    <div className="mb-2 grid grid-cols-2 gap-2"><FSelect value={(d.aspectRatio as string) || "1:1"} onChange={(e) => rf.updateNodeData(id, { aspectRatio: e.target.value })}>{["1:1", "16:9", "9:16"].map((a) => <option key={a} value={a}>{a}</option>)}</FSelect><FSelect value={(d.resolution as string) || "1K"} onChange={(e) => rf.updateNodeData(id, { resolution: e.target.value })}>{["1K", "2K"].map((r) => <option key={r} value={r}>{r}</option>)}</FSelect></div>
    <FButton onClick={genPrompts} disabled={genBusy}>{genBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-[#D8ED19]" />}Generate Prompts</FButton>
    {prompts.length > 0 && <>
      <div className="mt-2"><FButton onClick={genAll} disabled={anyBusy || !d.model}>{allBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3 w-3" fill="currentColor" />}Gerar todas as cenas</FButton></div>
      <div className="mt-2 space-y-1.5">{prompts.map((pr, i) => <div key={i} className="rounded-md p-1.5" style={{ background: "rgba(0,0,0,.28)" }}>
        <div className="flex items-start gap-1.5"><span className="flex-1 text-[9px] leading-snug text-[color:var(--fx-muted)]">{i + 1}. {pr}</span><button type="button" onClick={() => genScene(i)} disabled={anyBusy} className="nodrag flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-[#0A0A0A] transition hover:bg-white/90 disabled:opacity-40" title="Gerar esta cena">{scene === i ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" fill="currentColor" />}</button></div>
        {results[i] ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={results[i]} alt="" className="mt-1.5 h-20 w-full rounded object-cover" />) : null}
      </div>)}</div>
    </>}
    <Handle type="target" position={Position.Left} id="in" style={{ background: "#F97316" }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.storyboard }} />
  </NodeShell>);
}
function ProcessedResult({ id, url, aspect, checker, provLabel }: { id: string; url: string; aspect: string; checker?: boolean; provLabel: string }) {
  const rf = useReactFlow(); const models = useContext(ModelsCtx); const { markDirty } = useContext(ActionsCtx);
  const [aw, ah] = aspect.split(":").map(Number); const [nat, setNat] = useState<{ w: number; h: number } | null>(null); const upd = useUpdateNodeInternals();
  useEffect(() => { if (nat) { const r = requestAnimationFrame(() => upd(id)); return () => cancelAnimationFrame(r); } }, [nat, id, upd]);
  const rw = nat?.w || aw || 1; const rh = nat?.h || ah || 1; const h = Math.max(180, Math.min(470, Math.round(248 * (rh / rw))));
  function linked(type: string, patch: ND, targetHandle: string) {
    const pos = rf.getNode(id)?.position || { x: 0, y: 0 };
    const nid = type + "_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
    const base = JSON.parse(JSON.stringify(DEFAULTS[type])) as ND;
    rf.setNodes((n) => [...n, { id: nid, type, position: { x: pos.x + 340, y: pos.y }, data: { ...base, ...patch } } as Node]);
    rf.setEdges((e) => addEdge({ source: id, target: nid, sourceHandle: "out", targetHandle, type: "grad" }, e)); markDirty();
  }
  function novaCriacao() { const m = models.image[0]; linked("imageGen", { title: "Image Generator", prompt: "", model: m?.id || "", modelName: m?.name || "", aspectRatio: aspect, resolution: "1K", refs: [url] }, "reference"); toast.success("Nova imagem criada com esta imagem como referência."); }
  function animate() { const m = models.video[0]; linked("videoGen", { title: "Video Generator", startFrame: url, model: m?.id || "", modelName: m?.name || "" }, "reference"); toast.success("Video Generator criado com a imagem como start frame."); }
  async function download() { try { const r = await fetch(url); const b = await r.blob(); const l = URL.createObjectURL(b); const a = document.createElement("a"); a.href = l; a.download = "fluxyra-" + Date.now() + ".png"; a.click(); URL.revokeObjectURL(l); } catch { window.open(url, "_blank"); } }
  return (<div className={`relative overflow-hidden rounded-b-[11px] ${checker ? "fx-checker" : ""}`} style={{ height: h, background: checker ? undefined : "#0a0a0b" }}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={url} alt="" draggable onLoad={(e) => { const t = e.currentTarget; if (t.naturalWidth && t.naturalHeight) setNat({ w: t.naturalWidth, h: t.naturalHeight }); }} onDragStart={(e) => { e.dataTransfer.setData("application/flowasset", JSON.stringify({ url, aspectRatio: aspect, model: provLabel })); e.dataTransfer.effectAllowed = "all"; }} className={`nodrag h-full w-full ${checker ? "object-contain" : "object-cover"}`} />
    <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={download} title="Baixar" className="nodrag absolute bottom-2 left-2 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#0A0A0A]"><Download className="h-3.5 w-3.5" /></button>
    <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1.5 py-2 pl-12 pr-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100" style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,.9), rgba(0,0,0,.45) 55%, transparent)" }}>
      <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={novaCriacao} className="nodrag flex h-[26px] items-center gap-1 rounded-[7px] px-2 text-[10px] font-medium text-white" style={{ background: "rgba(255,255,255,.18)" }}><Sparkles className="h-3 w-3" />Nova criação</button>
      <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={animate} className="nodrag flex h-[26px] items-center gap-1 rounded-[7px] px-2 text-[10px] font-medium text-white" style={{ background: "rgba(255,255,255,.18)" }}><Film className="h-3 w-3" />Animate</button>
    </div>
  </div>);
}

function RemoveBgNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const d = data as ND; const [cfg, setCfg] = useState(false);
  const status = d.__status as string | undefined; const result = d.__result as string | undefined; const aspect = (d.aspectRatio as string) || "1:1";
  const upd = useUpdateNodeInternals(); useEffect(() => { const raf = requestAnimationFrame(() => upd(id)); return () => cancelAnimationFrame(raf); }, [status, result, id, upd]);
  const handles = (<><Handle type="target" position={Position.Left} id="reference" style={{ background: ACCENT.removeBg }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.removeBg }} /></>);
  if (status === "running") {
    return (<NodeShell id={id} type="removeBg" title={(d.title as string) || "Remove BG"} status={status} selected={selected} glow={ACCENT.removeBg} noPad width={248}>
      <div className="relative flex items-center justify-center rounded-b-[11px]" style={{ height: 150, background: "#0a0a0b" }}><DotLoader accent={ACCENT.removeBg} /><span className="absolute bottom-2.5 left-2.5 text-[10px] font-medium text-white">Removendo fundo…</span></div>{handles}
    </NodeShell>);
  }
  if (result) {
    return (<NodeShell id={id} type="removeBg" title={(d.title as string) || "Remove BG"} status={status} selected={selected} noPad width={248}>
      <ProcessedResult id={id} url={result} aspect={aspect} checker provLabel="Remove BG" />{handles}
    </NodeShell>);
  }
  return (<NodeShell id={id} type="removeBg" title={(d.title as string) || "Remove BG"} status={status} selected={selected} width={248} runnable>
    <p className="text-[10px] text-[color:var(--fx-muted)]">Conecte uma imagem e rode para remover o fundo.</p>
    <div className="relative mt-2">
      <button type="button" onClick={() => setCfg((v) => !v)} className="fx-item nodrag inline-flex h-6 items-center gap-1 px-2 text-[9px] text-[color:var(--fx-muted)]"><Sliders className="h-3 w-3" />{(d.rmbgModel as string) || "RMBG-2.0"}</button>
      {cfg && <div className="absolute left-0 top-7 z-50 w-[152px] rounded-lg fx-panel p-1">{["RMBG-2.0", "RMBG-1.4", "BEN2"].map((m) => { const on = ((d.rmbgModel as string) || "RMBG-2.0") === m; return <button key={m} type="button" onClick={() => { rf.updateNodeData(id, { rmbgModel: m }); setCfg(false); }} className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[10px]" style={on ? { color: "#22D3EE" } : { color: "var(--fx-text)" }}>{m}{on && <Check className="ml-auto h-3 w-3" />}</button>; })}</div>}
    </div>{handles}
  </NodeShell>);
}
function FDrop({ value, options, accent, onChange }: { value: string; options: { value: string; label: string; disabled?: boolean; note?: string }[]; accent: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as globalThis.Node)) setOpen(false); }; const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); }; window.addEventListener("mousedown", h); window.addEventListener("keydown", k); return () => { window.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); }; }, [open]);
  const sel = options.find((o) => o.value === value);
  return (<div ref={ref} className="relative nodrag">
    <button type="button" onClick={() => setOpen((o) => !o)} className="fx-ctrl flex h-[32px] w-full items-center justify-between px-2.5 text-[11px]"><span className="truncate text-[color:var(--fx-text)]">{sel?.label || value}</span><ChevronDown className="h-3 w-3 shrink-0 text-[color:var(--fx-subtle)]" /></button>
    {open && <div className="nowheel absolute left-0 right-0 top-[36px] z-50 rounded-[10px] p-1" style={{ background: "var(--fx-elev)", border: "1px solid var(--fx-border-h)", boxShadow: "0 16px 40px rgba(0,0,0,.6)" }}>
      {options.map((o) => { const on = o.value === value; return (<button key={o.value} type="button" disabled={o.disabled} onClick={() => { if (o.disabled) return; onChange(o.value); setOpen(false); }} className="flex w-full items-center gap-2 rounded-[7px] px-2.5 py-1.5 text-left text-[11px] transition disabled:cursor-not-allowed" style={on ? { background: `${accent}22`, color: accent } : o.disabled ? { color: "var(--fx-subtle)" } : { color: "var(--fx-text)" }}><span className="flex-1 truncate">{o.label}</span>{o.note ? <span className="rounded px-1 py-0.5 text-[8px]" style={{ background: "rgba(255,255,255,.06)", color: "var(--fx-subtle)" }}>{o.note}</span> : null}{on && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: accent }} />}</button>); })}
    </div>}
  </div>);
}

function UpscaleNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const d = data as ND;
  const status = d.__status as string | undefined; const result = d.__result as string | undefined;
  const mode = (d.mode as string) || "Sharp"; const scale = (d.scale as string) || "2x";
  const meta = (d.__resultMeta as ND) || {}; const resultScale = (meta.scale as string) || scale;
  // selector empacotado em string (equality estável): "hasEdge|running|url"
  const packed = useStore((s) => { const e = s.edges.find((ed) => ed.target === id); if (!e) return "0|0|"; const sd = (s.nodeLookup.get(e.source)?.data || {}) as ND; const u = (sd.__result as string) || (sd.url as string) || (sd.heldImage as string) || ""; const url = /^https?:\/\//i.test(u) ? u : ""; return "1|" + (sd.__status === "running" ? "1" : "0") + "|" + url; });
  const parts = packed.split("|"); const hasEdge = parts[0] === "1"; const sourceRunning = parts[1] === "1"; const inputUrl = parts.slice(2).join("|");
  const lastInputRef = useRef(""); if (inputUrl) lastInputRef.current = inputUrl; const displayInput = inputUrl || lastInputRef.current;
  const resultInput = (meta.inputUrl as string) || ""; const resultStale = Boolean(result) && Boolean(inputUrl) && Boolean(resultInput) && resultInput !== inputUrl;
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const upd = useUpdateNodeInternals();
  useEffect(() => { const r = requestAnimationFrame(() => upd(id)); return () => cancelAnimationFrame(r); }, [status, result, inputUrl, hasEdge, nat, id, upd]);
  const [aw, ah] = ((d.aspectRatio as string) || "1:1").split(":").map(Number);
  const rw = nat?.w || aw || 1; const rh = nat?.h || ah || 1; const mH = nat ? Math.max(180, Math.min(470, Math.round(268 * (rh / rw)))) : 360;
  const W = 292;
  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => { const t = e.currentTarget; if (t.naturalWidth && t.naturalHeight) setNat({ w: t.naturalWidth, h: t.naturalHeight }); };
  async function download() { const u = result; if (!u) return; try { const r = await fetch(u); const b = await r.blob(); const l = URL.createObjectURL(b); const a = document.createElement("a"); a.href = l; a.download = "fluxyra-" + Date.now() + ".png"; a.click(); URL.revokeObjectURL(l); } catch { window.open(u, "_blank"); } }
  const handles = (<><Handle type="target" position={Position.Left} id="reference" style={{ background: ACCENT.upscale }} /><Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.upscale }} /></>);
  const controls = (<div className="grid grid-cols-2 gap-2"><FDrop value={mode} accent={ACCENT.upscale} options={[{ value: "Sharp", label: "Sharp" }, { value: "Creative", label: "Creative", disabled: true, note: "Em breve" }]} onChange={(v) => rf.updateNodeData(id, { mode: v })} /><FDrop value={scale} accent={ACCENT.upscale} options={[{ value: "2x", label: "2×" }, { value: "4x", label: "4×" }]} onChange={(v) => rf.updateNodeData(id, { scale: v })} /></div>);

  if (status === "running") {
    return (<NodeShell id={id} type="upscale" title={(d.title as string) || "Upscale"} status={status} selected={selected} glow={ACCENT.upscale} noPad width={W}>
      <div className="relative overflow-hidden" style={{ height: mH, background: "#0a0a0b" }}>
        {(result || displayInput) ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={result || displayInput} alt="" className="h-full w-full scale-105 object-cover opacity-60 blur-sm" />) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "rgba(0,0,0,.4)" }}><Loader2 className="h-6 w-6 animate-spin" style={{ color: ACCENT.upscale }} /><span className="text-[11px] font-medium text-white">Ampliando…</span></div>
      </div>
      <div className="pointer-events-none border-t p-2.5 opacity-45" style={{ borderColor: "var(--fx-border)" }}>{controls}</div>
      {handles}
    </NodeShell>);
  }
  if (status === "failed") {
    return (<NodeShell id={id} type="upscale" title={(d.title as string) || "Upscale"} status={status} selected={selected} width={W} runnable>
      <p className="text-[12px] font-medium text-[#FCA5A5]">Falha no upscale</p>
      <p className="mt-1 text-[10px] text-[color:var(--fx-muted)]">{(d.__error as string) || "Não foi possível concluir. Tente novamente."}</p>
      <div className="mt-2">{controls}</div>{handles}
    </NodeShell>);
  }
  if (result && !resultStale) {
    return (<NodeShell id={id} type="upscale" title={(d.title as string) || "Upscale"} status={status} selected={selected} noPad width={W} runnable>
      <div className="relative overflow-hidden" style={{ height: mH, background: "#0a0a0b" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result} alt="" onLoad={onImgLoad} draggable onDragStart={(e) => { e.dataTransfer.setData("application/flowasset", JSON.stringify({ url: result, aspectRatio: (d.aspectRatio as string) || "1:1", model: "Upscale" })); e.dataTransfer.effectAllowed = "all"; }} className="nodrag h-full w-full object-cover" />
        <div className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-medium text-white" style={{ background: "rgba(0,0,0,.55)" }}>{resultScale}</div>
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={download} title="Baixar" className="nodrag absolute bottom-2 left-2 z-20 flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#0A0A0A]"><Download className="h-3.5 w-3.5" /></button>
      </div>
      <div className="border-t p-2.5" style={{ borderColor: "var(--fx-border)" }}>{controls}</div>{handles}
    </NodeShell>);
  }
  if (hasEdge && inputUrl) {
    return (<NodeShell id={id} type="upscale" title={(d.title as string) || "Upscale"} status={status} selected={selected} noPad width={W} runnable>
      <div className="relative overflow-hidden" style={{ height: mH, background: "#0a0a0b" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={inputUrl} alt="" onLoad={onImgLoad} className="h-full w-full object-cover" />
        <div className="absolute right-2 top-2 rounded-full px-2 py-0.5 text-[9px] font-medium text-white" style={{ background: "rgba(0,0,0,.55)" }}>Input</div>
      </div>
      <div className="border-t p-2.5" style={{ borderColor: "var(--fx-border)" }}>{controls}</div>{handles}
    </NodeShell>);
  }
  if (hasEdge) {
    return (<NodeShell id={id} type="upscale" title={(d.title as string) || "Upscale"} status={status} selected={selected} noPad width={W}>
      <div className="relative overflow-hidden" style={{ height: mH, background: "#0a0a0b" }}>
        {displayInput ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={displayInput} alt="" onLoad={onImgLoad} className="h-full w-full object-cover opacity-35" />) : null}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5" style={{ background: "rgba(0,0,0,.35)" }}><Loader2 className="h-4 w-4 animate-spin text-[color:var(--fx-muted)]" /><span className="text-[10px] font-medium text-[color:var(--fx-muted)]">{sourceRunning ? "Aguardando nova imagem…" : "Aguardando imagem…"}</span></div>
      </div>
      <div className="pointer-events-none border-t p-2.5 opacity-45" style={{ borderColor: "var(--fx-border)" }}>{controls}</div>{handles}
    </NodeShell>);
  }
  return (<NodeShell id={id} type="upscale" title={(d.title as string) || "Upscale"} status={status} selected={selected} width={W} runnable>
    {controls}
    <p className="mt-2 text-[10px] text-[color:var(--fx-muted)]">Conecte uma imagem, escolha a escala e rode.</p>{handles}
  </NodeShell>);
}

function OutputNode({ id, data, selected }: NodeProps) { const d = data as ND; return (<NodeShell id={id} type="output" title={(d.title as string) || "Output"} status={d.__status as string} selected={selected} width={256}>{d.__result ? <ResultThumb url={d.__result as string} /> : <p className="text-[10px] text-[color:var(--fx-subtle)]">O resultado final aparece aqui após o Run.</p>}<Handle type="target" position={Position.Left} id="in" style={{ background: ACCENT.output }} /></NodeShell>); }

function ImageAssetNode({ id, data, selected }: NodeProps) {
  const rf = useReactFlow(); const upd = useUpdateNodeInternals(); const models = useContext(ModelsCtx).image; const { markDirty } = useContext(ActionsCtx);
  const d = data as ND; const url = (d.url as string) || ""; const aspect = (d.aspectRatio as string) || "1:1";
  const [aw, ah] = aspect.split(":").map(Number); const w = 220; const h = Math.max(140, Math.min(360, Math.round(w * ((ah || 1) / (aw || 1)))));
  const [preview, setPreview] = useState(false);
  function del(e: React.MouseEvent) { e.stopPropagation(); rf.deleteElements({ nodes: [{ id }] }); markDirty(); }
  function convert(e: React.MouseEvent) { e.stopPropagation(); const first = models[0]; const provModel = (d.provModel as string) || ""; const provRes = (d.provRes as string) || ""; rf.setNodes((nds) => nds.map((n) => n.id === id ? ({ ...n, type: "imageGen", data: { title: "Image Generator", prompt: "", model: first?.id || "", modelName: first?.name || "", aspectRatio: aspect, resolution: provRes || "1K", refs: [], heldImage: url, __result: url, __collapsed: true, __resultMeta: { modelName: provModel || "Imported", aspectRatio: aspect, resolution: provRes || "" } } }) as Node : n)); markDirty(); setTimeout(() => upd(id), 0); toast.success("Convertido em Image Generator — imagem como resultado atual."); }
  return (
    <div className="fx-card group relative" style={{ width: w, ...(selected ? { borderColor: ACCENT.imageGen, boxShadow: `0 0 16px ${ACCENT.imageGen}22, 0 8px 28px rgba(0,0,0,.45)` } : {}) }}>
      <div className="relative overflow-hidden rounded-[11px]" style={{ height: h, background: "#0a0a0b" }}>
        {url ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={url} alt="" className="h-full w-full object-cover" />) : <div className="flex h-full items-center justify-center text-[10px] text-[color:var(--fx-subtle)]">Vazio</div>}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-12 opacity-0 transition-opacity group-hover:opacity-100" style={{ backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,.5), transparent)" }} />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 opacity-0 transition-opacity group-hover:opacity-100" style={{ backgroundImage: "linear-gradient(to top, rgba(0,0,0,.6), transparent)" }} />
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={del} className="nodrag nopan absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-white opacity-0 transition group-hover:opacity-100" style={{ background: "#ef4444" }} title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setPreview(true); }} className="nodrag nopan absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-lg text-white opacity-0 transition group-hover:opacity-100" style={{ background: "rgba(0,0,0,.55)" }} title="Ampliar"><Maximize2 className="h-3.5 w-3.5" /></button>
        <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={convert} className="nodrag nopan absolute inset-x-3 bottom-3 flex h-9 items-center justify-center gap-1.5 rounded-xl text-[12px] font-semibold text-[#0A0A0A] opacity-0 transition group-hover:opacity-100" style={{ background: ACCENT.imageGen }}><Sparkles className="h-3.5 w-3.5" />Convert to Image Node</button>
        <Handle type="source" position={Position.Right} id="out" style={{ background: ACCENT.imageGen }} />
      </div>
      {preview && <ImagePreviewModal url={url} onClose={() => setPreview(false)} />}
    </div>
  );
}

const nodeTypes: NodeTypes = { prompt: memo(PromptNode), refImage: memo(RefImageNode), imageGen: memo(ImageGenNode), videoGen: memo(VideoGenNode), audioGen: memo(AudioGenNode), storyboard: memo(StoryboardNode), removeBg: memo(RemoveBgNode), upscale: memo(UpscaleNode), output: memo(OutputNode), imageAsset: memo(ImageAssetNode) };

/* ── EDGE COM GRADIENTE POR CATEGORIA ────────────────────────────────────── */
function GradientEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target, data }: EdgeProps) {
  const rf = useReactFlow();
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const c1 = ACCENT[rf.getNode(source)?.type || ""] || "#7C3AED";
  const c2 = ACCENT[rf.getNode(target)?.type || ""] || "#7C3AED";
  const gid = `fxg-${id}`;
  const active = Boolean((data as { active?: boolean } | undefined)?.active);
  return (<>
    <defs><linearGradient id={gid} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}><stop offset="0%" stopColor={c1} /><stop offset="100%" stopColor={c2} /></linearGradient></defs>
    <path id={id} d={path} fill="none" strokeWidth={active ? 2.5 : 2} className="react-flow__edge-path" style={{ stroke: `url(#${gid})`, strokeOpacity: active ? 1 : 0.7, ...(active ? { filter: `drop-shadow(0 0 5px ${c2}99)` } : {}) }} />
    {active && <path d={path} fill="none" strokeWidth={2.5} className="fx-edge-active" style={{ stroke: `url(#${gid})`, opacity: 0.95 }} />}
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
  const counter = useRef(0); const savingRef = useRef(false); const runGenRef = useRef<Record<string, string>>({});

  const markDirty = useCallback(() => setSaveState((s) => (s === "saving" ? s : "dirty")), []);
  const markEdgesActive = useCallback((tid: string, on: boolean) => rf.setEdges((eds) => eds.map((e) => e.target === tid ? { ...e, data: { ...(e.data || {}), active: on } } : e)), [rf]);
  const resumePoll = useCallback(async (nid: string, gid: string) => {
    markEdgesActive(nid, true); if (!runGenRef.current[nid]) runGenRef.current[nid] = gid; if (process.env.NODE_ENV !== "production") console.log("[GEN-GUARD]", { nodeId: nid, incomingGenerationId: gid, currentRefGenerationId: runGenRef.current[nid], action: runGenRef.current[nid] === gid ? "reattach-claim" : "reattach-superseded" }); rf.updateNodeData(nid, { __status: "running" }); let resolved = false;
    try {
      for (let i = 0; i < 200; i++) {
        await sleep(3000);
        const r = await fetch(`/api/generate/status?id=${gid}`, { cache: "no-store" });
        const d = await r.json().catch(() => null); if (!d) continue;
        if (d.status === "completed" && d.result_url) { const nd = (rf.getNode(nid)?.data as ND) || {}; if (runGenRef.current[nid] === gid) rf.updateNodeData(nid, { __status: "done", __result: d.result_url, __resultMeta: nd.model ? { modelName: (nd.modelName as string) || (nd.model as string), aspectRatio: nd.aspectRatio, resolution: nd.resolution } : undefined }); resolved = true; break; }
        if (d.status === "failed") { if (runGenRef.current[nid] === gid) rf.updateNodeData(nid, { __status: "failed", __error: d.error_message || "Falhou." }); resolved = true; break; }
      }
      if (!resolved) rf.updateNodeData(nid, { __status: "failed", __error: "Execução interrompida." });
    } catch { rf.updateNodeData(nid, { __status: "failed", __error: "Execução interrompida." }); }
    finally { markEdgesActive(nid, false); }
  }, [rf, markEdgesActive]);
  const onNodesChange = useCallback((c: Parameters<typeof onNodesChangeRaw>[0]) => { onNodesChangeRaw(c); markDirty(); }, [onNodesChangeRaw, markDirty]);
  const onEdgesChange = useCallback((c: Parameters<typeof onEdgesChangeRaw>[0]) => { onEdgesChangeRaw(c); markDirty(); }, [onEdgesChangeRaw, markDirty]);

  useEffect(() => { (async () => { const load = async (t: string) => { const r = await fetch(`/api/models?type=${t}`, { cache: "no-store" }).then((x) => x.json()).catch(() => null); return Array.isArray(r?.models) ? r.models.map((m: { id: string; name: string; model_id?: string; credit_cost?: number; backend?: string; dur_min?: number; dur_max?: number; resolution?: string; has_audio?: boolean }) => ({ id: m.id, name: m.name, modelId: m.model_id || undefined, cost: typeof m.credit_cost === "number" ? m.credit_cost : 0, backend: m.backend || undefined, durMin: typeof m.dur_min === "number" ? m.dur_min : undefined, durMax: typeof m.dur_max === "number" ? m.dur_max : undefined, resolution: m.resolution || undefined, hasAudio: Boolean(m.has_audio) })) : []; }; const [im, vm, am] = await Promise.all([load("image"), load("video"), load("audio")]); setImageModels(im); setVideoModels(vm); setAudioModels(am); try { const me = await fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).catch(() => null); if (typeof me?.credits === "number") setCredits(me.credits); } catch { /* noop */ } })(); }, []);

  useEffect(() => { let alive = true; (async () => { setLoading(true); try { const res = await fetch(`/api/flows/${flowId}`, { cache: "no-store" }); const data = await res.json().catch(() => null); if (!res.ok) throw new Error(data?.error || "Falha ao carregar."); if (!alive) return; setName(data.flow.name || "Novo Flow"); const def = data.flow.definition || {}; setNodes(Array.isArray(def.nodes) ? def.nodes : []); const defNodes = (Array.isArray(def.nodes) ? def.nodes : []) as Node[]; setEdges(Array.isArray(def.edges) ? def.edges : []); setSaveState("saved"); setTimeout(() => { defNodes.forEach((n) => { const dd = (n.data || {}) as ND; if (dd.__gen && !dd.__result) void resumePoll(n.id, String(dd.__gen)); }); }, 0); } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao carregar."); } finally { if (alive) setLoading(false); } })(); return () => { alive = false; }; }, [flowId, setNodes, setEdges]);

  const onConnect = useCallback((c: Connection) => { setEdges((eds) => addEdge({ ...c, type: "grad" }, eds)); markDirty(); }, [setEdges, markDirty]);

  const save = useCallback(async () => {
    if (savingRef.current) return; savingRef.current = true; setSaveState("saving");
    try { const obj = rf.toObject(); const clean = obj.nodes.map((n) => { const dd = { ...(n.data as ND) }; delete dd.__status; delete dd.__editing; return { ...n, data: dd }; });
      const cleanEdges = obj.edges.map((e) => { if (!e.data) return e; const ed = { ...(e.data as Record<string, unknown>) }; delete ed.active; return { ...e, data: ed }; }); const res = await fetch(`/api/flows/${flowId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, definition: { ...obj, nodes: clean, edges: cleanEdges } }) }); if (!res.ok) throw new Error(); setSaveState("saved"); } catch { setSaveState("error"); } finally { savingRef.current = false; }
  }, [rf, flowId, name]);

  // auto-save
  useEffect(() => { if (loading || saveState !== "dirty") return; const t = setTimeout(() => void save(), 1400); return () => clearTimeout(t); }, [saveState, loading, save, nodes, edges, name]);

  const spawn = useCallback((type: string, position: { x: number; y: number }) => {
    if (!DEFAULTS[type]) return; counter.current += 1; const nid = `${type}_${Date.now()}_${counter.current}`;
    const same = rf.getNodes().filter((n) => n.type === type).length; const label = REGISTRY.find((r) => r.type === type)?.label || type;
    const dft: ND = JSON.parse(JSON.stringify(DEFAULTS[type])); dft.title = `${label} ${same + 1}`;
    if (type === "imageGen" && imageModels[0]) { dft.model = imageModels[0].id; dft.modelName = imageModels[0].name; }
    if (type === "videoGen" && videoModels[0]) { dft.model = videoModels[0].id; dft.modelName = videoModels[0].name; }
    if (type === "storyboard" && imageModels[0]) { dft.model = imageModels[0].id; dft.modelName = imageModels[0].name; }
    if (type === "audioGen") { if (audioModels[0]) { dft.model = audioModels[0].id; dft.modelName = audioModels[0].name; } if (TTS_VOICES[0]) dft.voice = TTS_VOICES[0].id; }
    setNodes((nds) => [...nds, { id: nid, type, position, data: dft }]); markDirty();
  }, [imageModels, videoModels, audioModels, setNodes, rf, markDirty]);

  const addAtCenter = useCallback((type: string) => { const b = wrapRef.current?.getBoundingClientRect(); const p = b ? rf.screenToFlowPosition({ x: b.x + b.width / 2 - 145, y: b.y + b.height / 2 - 90 }) : { x: 200, y: 160 }; spawn(type, p); }, [rf, spawn]);
  const onDrop = useCallback((e: React.DragEvent) => { e.preventDefault(); const asset = e.dataTransfer.getData("application/flowasset"); if (asset) { let payload: { url?: string; aspectRatio?: string; model?: string; resolution?: string } = {}; try { payload = JSON.parse(asset); } catch { payload = { url: asset }; } if (!payload.url) return; const nid = `imageAsset_${Date.now()}_${Math.floor(Math.random() * 1000)}`; setNodes((nds) => [...nds, { id: nid, type: "imageAsset", position: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }), data: { url: payload.url, aspectRatio: payload.aspectRatio || "1:1", title: "Image Asset", provModel: payload.model || "", provRes: payload.resolution || "" } }]); markDirty(); return; } const t = e.dataTransfer.getData("application/flownode"); if (!t) return; spawn(t, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })); }, [rf, spawn, setNodes, markDirty]);
  const setNS = useCallback((id: string, patch: ND) => rf.updateNodeData(id, patch), [rf]);

  async function pollGen(gid: string): Promise<string> { for (let i = 0; i < 120; i++) { await sleep(3000); const r = await fetch(`/api/generate/status?id=${gid}`, { cache: "no-store" }); const d = await r.json().catch(() => null); if (d?.status === "completed" && d.result_url) return d.result_url; if (d?.status === "failed") throw new Error(d.error_message || "Geração falhou."); } throw new Error("Tempo esgotado."); }

  const runFlow = useCallback(async (targetId?: string) => {
    const sn = rf.getNodes(); const se = rf.getEdges();
    const setEdgeActive = markEdgesActive;
    const applyGuard = (nid: string, incoming: string) => { const cur = runGenRef.current[nid] || ""; const ok = !incoming || cur === incoming; if (process.env.NODE_ENV !== "production") console.log("[GEN-GUARD]", { nodeId: nid, incomingGenerationId: incoming, currentRefGenerationId: cur, action: ok ? "apply" : "discard" }); return ok; };
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
    runOrder.forEach((id) => { runGenRef.current[id] = ""; rf.updateNodeData(id, { __status: undefined, __result: undefined, __editing: undefined, __error: undefined, __gen: undefined }); });
    setRunning(true);
    try {
      for (const id of runOrder) {
        try {
        setEdgeActive(id, true);
        const node = byId.get(id)!; const d = node.data as ND;
        const inc = se.filter((e) => e.target === id); let pText = ""; const refs: string[] = [];
        for (const e of inc) { const v = out.get(e.source); if (!v) continue; const isUrl = /^https?:\/\//i.test(v); if (e.targetHandle === "reference" || isUrl) refs.push(v); else pText = pText ? `${pText} ${v}` : v; }
        if (node.type === "prompt") { out.set(id, (d.text as string) || ""); continue; }
        if (node.type === "refImage") { out.set(id, (d.url as string) || ""); continue; }
        if (node.type === "output") { const v = inc.map((e) => out.get(e.source)).find(Boolean) || ""; out.set(id, v); setNS(id, { __status: v ? "done" : "failed", __result: v || undefined }); continue; }
        if (node.type === "storyboard") { const ps = Array.isArray(d.prompts) ? (d.prompts as string[]) : []; const rs = Array.isArray(d.results) ? (d.results as string[]).filter(Boolean) : []; if (!ps.length) { setNS(id, { __status: "failed" }); throw new Error(`"${d.title || "Storyboard"}" precisa gerar os prompts primeiro (Generate Prompts).`); } out.set(id, rs[0] || ps[0]); setNS(id, { __status: "done" }); continue; }
        if (node.type === "removeBg" || node.type === "upscale") {
          const src = refs[0]; if (!src) { setNS(id, { __status: "failed" }); throw new Error(`Conecte uma imagem ao "${d.title || node.type}".`); }
          setNS(id, { __status: "running", __result: undefined });
          const isUp = node.type === "upscale";
          const body: Record<string, unknown> = isUp
            ? { image_url: src, scale: Number(String(d.scale || "2x").replace(/x/i, "")) || 2, face_enhance: ((d.mode as string) || "Sharp") === "Sharp" }
            : { image_url: src, rmbg_model: (d.rmbgModel as string) || "RMBG-2.0" };
          const rr = await fetch(`/api/generate/${isUp ? "upscale" : "removebg"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const dtt = await rr.json().catch(() => null); if (!rr.ok) { setNS(id, { __status: "failed" }); throw new Error(dtt?.error || "Falha ao processar."); }
          if (dtt?.generation_id) { setNS(id, { __gen: String(dtt.generation_id) }); runGenRef.current[id] = String(dtt.generation_id); } let uu = dtt?.result_url as string | undefined; if (dtt?.status !== "completed" || !uu) uu = await pollGen(String(dtt.generation_id));
          out.set(id, uu); if (applyGuard(id, String(dtt?.generation_id || ""))) setNS(id, { __status: "done", __result: uu, __resultMeta: isUp ? { scale: String(d.scale || "2x"), inputUrl: src } : undefined }); continue;
        }
        if (node.type === "audioGen") {
          const text = String(d.prompt || "").trim() || pText.trim();
          if (!d.model) { setNS(id, { __status: "failed" }); throw new Error(`"${d.title || "Audio Generator"}" precisa de um modelo.`); }
          if (!text) { setNS(id, { __status: "failed" }); throw new Error(`"${d.title || "Audio Generator"}" precisa de um texto.`); }
          setNS(id, { __status: "running", __result: undefined });
          const r = await fetch("/api/generate/audio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: text, model_uuid: d.model, voice_id: d.voice }) });
          const dt = await r.json().catch(() => null); if (!r.ok) { setNS(id, { __status: "failed" }); throw new Error(dt?.error || "Falha ao gerar áudio."); }
          if (dt?.generation_id) { setNS(id, { __gen: String(dt.generation_id) }); runGenRef.current[id] = String(dt.generation_id); } let u = dt?.result_url as string | undefined; if (dt?.status !== "completed" || !u) u = await pollGen(String(dt.generation_id)); out.set(id, u); if (applyGuard(id, String(dt?.generation_id || ""))) setNS(id, { __status: "done", __result: u, __resultMeta: { modelName: (d.modelName as string) || (d.model as string), aspectRatio: d.aspectRatio, resolution: d.resolution, duration: (node.type as string) === "videoGen" ? d.duration : undefined } }); continue;
        }
        if (node.type === "imageGen" || node.type === "videoGen") {
          const gl = (d.title as string) || (node.type === "imageGen" ? "Image Generator" : "Video Generator");
          const fp = pText.trim() || String(d.prompt || "").trim();
          if (!fp && node.type === "imageGen" && d.heldImage) { const hu = String(d.heldImage); out.set(id, hu); setNS(id, { __status: "done", __result: hu }); continue; }
          if (!d.model) { setNS(id, { __status: "failed" }); throw new Error(`"${gl}" precisa de um modelo.`); }
          if (!fp) { setNS(id, { __status: "failed" }); throw new Error(`"${gl}" precisa de um prompt — escreva nele ou conecte um Prompt.`); }
          setNS(id, { __status: "running", __result: undefined });
          const isImg = node.type === "imageGen";
          const up = isImg ? (Array.isArray(d.refs) ? (d.refs as string[]) : []) : [d.startFrame, d.endFrame].filter((x): x is string => typeof x === "string" && x.length > 0);
          const all = [...refs, ...up];
          const body: Record<string, unknown> = { prompt: fp, model_uuid: d.model, aspect_ratio: d.aspectRatio, quality: "high", resolution: d.resolution || "720p" };
          if (all.length) { body.reference_images = all; body.reference_image_url = all[0]; } if (!isImg) { body.duration = d.duration; const sf = (d.startFrame as string) || refs[0] || ""; if (sf) body.start_image_url = sf; if (d.endFrame) body.end_image_url = d.endFrame as string; body.with_audio = d.audioOn !== false; }
          const r = await fetch(`/api/generate/${isImg ? "image" : "video"}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const dt = await r.json().catch(() => null); if (!r.ok) { setNS(id, { __status: "failed" }); throw new Error(dt?.error || "Falha ao iniciar."); }
          if (dt?.generation_id) { setNS(id, { __gen: String(dt.generation_id) }); runGenRef.current[id] = String(dt.generation_id); } let u = dt?.result_url as string | undefined; if (dt?.status !== "completed" || !u) u = await pollGen(String(dt.generation_id)); out.set(id, u); if (applyGuard(id, String(dt?.generation_id || ""))) setNS(id, { __status: "done", __result: u, __resultMeta: { modelName: (d.modelName as string) || (d.model as string), aspectRatio: d.aspectRatio, resolution: d.resolution, duration: (node.type as string) === "videoGen" ? d.duration : undefined } });
        }
        } catch (nodeErr) { setNS(id, { __status: "failed", __error: nodeErr instanceof Error ? nodeErr.message : "Erro" }); throw nodeErr; } finally { setEdgeActive(id, false); }
      }
      toast.success("Fluxo executado ✓");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Erro ao executar."); } finally { setRunning(false); }
  }, [rf, setNS, markEdgesActive]);

  function clearAll() { if (!nodes.length) return; if (!window.confirm("Limpar todos os nós?")) return; setNodes([]); setEdges([]); markDirty(); }
  const zoomPct = Math.round(zoom * 100);
  const saveLabel = saveState === "saving" ? "Salvando…" : saveState === "dirty" ? "Não salvo" : saveState === "error" ? "Erro ao salvar" : "Salvo";
  const saveColor = saveState === "saved" ? { c: "#F97316", b: "rgba(249,115,22,.14)" } : saveState === "error" ? { c: "#FCA5A5", b: "rgba(220,60,60,.14)" } : { c: "#FBBF24", b: "rgba(245,158,11,.14)" };
  const gens = REGISTRY.filter((r) => r.group === "gen"); const utils = REGISTRY.filter((r) => r.group === "util");
  const infoReg = infoType ? REGISTRY.find((r) => r.type === infoType) : null;
  const modelsValue = useMemo(() => ({ image: imageModels, video: videoModels, audio: audioModels }), [imageModels, videoModels, audioModels]);
  const runNodeCb = useCallback((nid: string) => { void runFlow(nid); }, [runFlow]);
  const actionsValue = useMemo(() => ({ runNode: runNodeCb, running, markDirty }), [runNodeCb, running, markDirty]);

  return (
    <ModelsCtx.Provider value={modelsValue}>
      <ActionsCtx.Provider value={actionsValue}>
        <div className="flow-root relative h-[calc(100vh-4rem)] min-h-[560px] overflow-hidden" style={{ background: "var(--fx-canvas)" }}>
          <style>{FLOW_CSS}</style>
          {/* canvas full-screen */}
          <div ref={wrapRef} className="absolute inset-0" onDrop={onDrop} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }}>
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
          <div className="absolute bottom-5 flex -translate-x-1/2 items-center gap-1 rounded-2xl fx-panel p-1 shadow-[0_16px_50px_rgba(0,0,0,0.55)]" style={{ left: panelOpen ? "calc(50% - 132px)" : "50%" }}>
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
    <div draggable onDragStart={(e) => { e.dataTransfer.setData("application/flownode", reg.type); e.dataTransfer.effectAllowed = "all"; }} onClick={() => onAdd(reg.type)}
      className="fx-item flex h-10 cursor-grab items-center gap-2 px-2.5 active:cursor-grabbing" style={active ? { borderColor: reg.accent, background: `${reg.accent}14` } : {}}>
      <span className="flex h-6 w-6 items-center justify-center rounded-lg" style={{ backgroundColor: `${reg.accent}22`, color: reg.accent }}><reg.Icon className="h-3.5 w-3.5" /></span>
      <span className="flex-1 text-xs font-medium" style={{ color: active ? reg.accent : "var(--fx-text)" }}>{reg.label}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onInfo((e.currentTarget as HTMLElement).getBoundingClientRect().top - 20); }} className="flex h-5 w-5 items-center justify-center rounded text-[color:var(--fx-subtle)] transition hover:text-[color:var(--fx-muted)]" title={`Sobre ${reg.label}`}><Info className="h-3.5 w-3.5" /></button>
    </div>
  );
}

export default function FlowEditorPage() { return (<ReactFlowProvider><Editor /></ReactFlowProvider>); }
