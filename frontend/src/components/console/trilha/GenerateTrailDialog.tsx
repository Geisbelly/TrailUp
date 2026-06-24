import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Wand2, Loader2, ArrowRight, CheckCircle2, Plus, X, Upload, FileText, AlertTriangle, BrainCircuit, LayoutList, Clapperboard } from "lucide-react";
import type { Topico, StagedFile } from "./types";
import { formatFileSize } from "@/lib/utils";

const ACCEPTED_EXT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.mp4,.mov,.webm,.mp3,.wav,.m4a";
type Step = "form" | "confirm-delete" | "preview" | "creating";
type MediaType = "video" | "audio" | "pdf" | "documento" | "apresentacao";

type AiCard = {
  titulo: string;
  descricao: string;
  conteudo_ref?: string | null;
  conteudo_origem_ref?: string | null;
};
type AiAtividade = {
  titulo: string;
  enunciado: string;
  tipo: string;
  alternativas: string[] | null;
  resposta_correta: string;
  conteudo_ref?: string | null;
};
type AiMidia = {
  tipo: MediaType;
  titulo: string;
  descricao: string;
  roteiro?: string | null;
  transcricao?: string | null;
  url?: string | null;
  sourceRef?: string | null;
};
type AiConteudo = {
  ref?: string | null;
  sourceRef?: string | null;
  titulo: string;
  tipo: string;
  conteudo: string;
  cards?: AiCard[];
  atividades?: AiAtividade[];
  midias?: AiMidia[];
};
type AiTopico = {
  nome: string;
  descricao: string;
  ordem: number;
  depende: number[];
  next: number[];
  conteudos: AiConteudo[];
  cards?: AiCard[];
  atividades?: AiAtividade[];
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classeId: number;
  onCreated: (topicos: Topico[]) => void;
  initialFileNames?: string[];
  initialDescription?: string;
  initialFileContents?: string;
};

const inferMime = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    txt: "text/plain", md: "text/markdown", pdf: "application/pdf", doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  };
  return map[ext] ?? "application/octet-stream";
};
const sourceType = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (["mp3", "wav", "m4a"].includes(ext)) return "audio";
  if (ext === "pdf") return "pdf";
  if (["doc", "docx"].includes(ext)) return "documento";
  if (["ppt", "pptx"].includes(ext)) return "apresentacao";
  return "texto";
};
const mediaToContentType = (tipo: MediaType): "video" | "link" | "arquivo" =>
  tipo === "video" ? "video" : tipo === "audio" ? "arquivo" : "arquivo";

async function fileToBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function readStagedText(staged: StagedFile[]) {
  const parts: string[] = [];
  for (const { file } of staged) {
    if (/\.(txt|md)$/i.test(file.name)) {
      try {
        parts.push(`=== ${file.name} ===\n${(await file.text()).substring(0, 15000)}`);
      } catch {
        parts.push(`[Arquivo: ${file.name}]`);
      }
    } else parts.push(`[Arquivo: ${file.name}]`);
  }
  return parts.join("\n\n");
}

async function deletePrefix(bucket: string, prefix: string) {
  const folder = prefix.replace(/^\/+|\/+$/g, "");
  if (!folder) return;
  const { data } = await supabase.storage.from(bucket).list(folder, { limit: 1000, offset: 0 });
  const files = (data ?? []).filter((item: { id?: string | null }) => Boolean(item.id)).map((item: { name: string }) => `${folder}/${item.name}`);
  if (files.length > 0) await supabase.storage.from(bucket).remove(files);
}

async function deleteClassTrail(classeId: number, userId?: string) {
  const { data: topics, error } = await supabase.from("topicos").select("id").eq("classe_id", classeId);
  if (error) throw error;
  const topicIds = (topics ?? []).map((t: { id: number }) => t.id);
  if (topicIds.length > 0) {
    const { data: conteudos } = await supabase.from("conteudos").select("id").in("topico_id", topicIds);
    const { data: atividades } = await supabase.from("atividades").select("id").in("topico_id", topicIds);
    const conteudoIds = (conteudos ?? []).map((c: { id: number }) => c.id);
    const atividadeIds = (atividades ?? []).map((a: { id: number }) => a.id);
    if (atividadeIds.length > 0) {
      await supabase.from("questoes").delete().in("atividade_id", atividadeIds);
      await supabase.from("atividade_conteudos").delete().in("atividade_id", atividadeIds);
    }
    if (conteudoIds.length > 0) {
      await supabase.from("cards").delete().in("conteudo_id", conteudoIds);
      await supabase.from("atividade_conteudos").delete().in("conteudo_id", conteudoIds);
      await supabase.from("conteudos").delete().in("id", conteudoIds);
    }
    if (atividadeIds.length > 0) await supabase.from("atividades").delete().in("id", atividadeIds);
    await supabase.from("topicos").delete().in("id", topicIds);
  }
  if (userId) await deletePrefix("conteudos", `${userId}/classes/${classeId}/materials`);
}

export function GenerateTrailDialog({ open, onOpenChange, classeId, onCreated, initialFileNames = [], initialDescription = "", initialFileContents = "" }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("form");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [creatingStatus, setCreatingStatus] = useState("");
  const [description, setDescription] = useState(initialDescription);
  const [numTopics, setNumTopics] = useState(6);
  const [topicNamesRaw, setTopicNamesRaw] = useState("");
  const [syllabus, setSyllabus] = useState("");
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([]);
  const [stagedFileContents, setStagedFileContents] = useState("");
  const [preview, setPreview] = useState<AiTopico[]>([]);

  const allFileNames = [...initialFileNames, ...stagedFiles.map((s) => s.file.name)];
  const allFileContents = [initialFileContents, stagedFileContents].filter(Boolean).join("\n\n");
  const countCards = (t: AiTopico) => (t.conteudos ?? []).reduce((s, c) => s + (c.cards?.length ?? 0), 0) || (t.cards?.length ?? 0);
  const countActivities = (t: AiTopico) => (t.conteudos ?? []).reduce((s, c) => s + (c.atividades?.length ?? 0), 0) || (t.atividades?.length ?? 0);
  const countMedia = (t: AiTopico) => (t.conteudos ?? []).reduce((s, c) => s + (c.midias?.length ?? 0), 0);

  const refreshStagedText = async (next: StagedFile[]) => setStagedFileContents(await readStagedText(next));
  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const valid = Array.from(files).filter((f) => f.name.match(/\.(pdf|doc|docx|ppt|pptx|txt|md|mp4|mov|webm|mp3|wav|m4a)$/i));
    if (valid.length < files.length) toast.warning("Alguns arquivos foram ignorados.");
    const next = [...stagedFiles, ...valid.map((file) => ({ file, id: `${file.name}-${file.size}-${Date.now()}` }))];
    setStagedFiles(next);
    await refreshStagedText(next);
  };
  const removeFile = async (id: string) => {
    const next = stagedFiles.filter((s) => s.id !== id);
    setStagedFiles(next);
    await refreshStagedText(next);
  };

  const buildSources = async () => Promise.all(stagedFiles.map(async ({ file }, index) => {
    const text = /\.(txt|md)$/i.test(file.name) ? (await file.text()).substring(0, 15000) : null;
    return {
      sourceRef: `upload:${index + 1}`,
      titulo: file.name,
      tipo: sourceType(file.name),
      conteudo: text,
      texto: text,
      markdown: /\.md$/i.test(file.name) ? text : null,
      files: [{ name: file.name, mimeType: inferMime(file.name), base64: await fileToBase64(file) }],
    };
  }));

  const uploadStagedFiles = async () => {
    const nameToPath = new Map<string, string>();
    if (!user?.id || stagedFiles.length === 0) return nameToPath;
    setIsUploadingFiles(true);
    try {
      for (const { file } of stagedFiles) {
        const path = `${user.id}/classes/${classeId}/materials/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("conteudos").upload(path, file, { upsert: true });
        if (error) throw error;
        nameToPath.set(file.name, path);
      }
      return nameToPath;
    } finally {
      setIsUploadingFiles(false);
    }
  };

  const reset = () => { setStep("form"); setPreview([]); setDescription(initialDescription); setNumTopics(6); setTopicNamesRaw(""); setSyllabus(""); setStagedFiles([]); setStagedFileContents(""); setCreatingStatus(""); };
  const close = () => { if (step === "creating") return; reset(); onOpenChange(false); };

  const runGeneration = async (deleteExisting: boolean) => {
    if (deleteExisting) {
      try { await deleteClassTrail(classeId, user?.id); toast.success("Trilha anterior removida."); } catch { toast.error("Falha ao remover trilha anterior."); return; }
    }
    setIsGenerating(true);
    try {
      const topicNames = topicNamesRaw.split("\n").map((line) => line.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("generate-content-ai", { body: {
        mode: "trail", topicName: description, topicDescription: description, contents: [], sources: await buildSources(),
        trailDescription: description, numTopics, topicNames, syllabus, fileContents: allFileContents || undefined, fileNames: allFileNames.length ? allFileNames : undefined,
      }});
      if (error) throw error;
      if (!Array.isArray(data?.topicos)) throw new Error("Resposta invalida da IA.");
      setPreview(data.topicos as AiTopico[]);
      setStep("preview");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar trilha.");
      setStep("form");
    } finally { setIsGenerating(false); }
  };

  const handleGenerate = async () => {
    if (!description.trim()) return toast.error("Descreva a disciplina.");
    const { count } = await supabase.from("topicos").select("id", { count: "exact", head: true }).eq("classe_id", classeId);
    if ((count ?? 0) > 0) { setExistingCount(count ?? 0); setStep("confirm-delete"); return; }
    await runGeneration(false);
  };

  const handleCreate = async () => {
    if (preview.length === 0) return;
    setStep("creating");
    try {
      setCreatingStatus("Enviando arquivos...");
      const uploadedFiles = await uploadStagedFiles();
      const created: Array<{ ai: number; real: number }> = [];
      setCreatingStatus("Criando topicos...");
      for (const t of preview) {
        const { data, error } = await supabase.from("topicos").insert({ classe_id: classeId, nome: t.nome, descricao: t.descricao, ordem: t.ordem, next: [], depende: [] }).select("id").single();
        if (error) throw error;
        created.push({ ai: t.ordem, real: (data as { id: number }).id });
      }
      const map = new Map(created.map((i) => [i.ai, i.real]));
      await Promise.all(preview.map((t) => supabase.from("topicos").update({ next: t.next.map((o) => map.get(o)).filter(Boolean), depende: t.depende.map((o) => map.get(o)).filter(Boolean) }).eq("id", map.get(t.ordem)!)));

      const insertCards = async (rows: Array<{ conteudo_id: number; conteudo_origem_id: number; titulo: string; descricao: string }>) => {
        if (!rows.length) return;
        const { error } = await supabase.from("cards").insert(rows.map((r) => ({ ...r, imagem_url: null })));
        if (!error) return;
        const msg = String((error as { message?: string }).message ?? "").toLowerCase();
        if (!msg.includes("conteudo_origem_id")) throw error;
        const { error: fallback } = await supabase.from("cards").insert(rows.map(({ conteudo_origem_id: _x, ...r }) => ({ ...r, imagem_url: null })));
        if (fallback) throw fallback;
      };

      for (const t of preview) {
        const topicId = map.get(t.ordem)!;
        const contentMap = new Map<string, number>();
        let order = 1;
        for (let i = 0; i < (t.conteudos ?? []).length; i += 1) {
          const c = t.conteudos[i];
          const ref = (c.ref || `content:${i + 1}`).trim();
          const { data, error } = await supabase.from("conteudos").insert({
            topico_id: topicId, titulo: c.titulo, tipo: c.tipo || "texto", conteudo: c.conteudo, ordem: order, metadata: { ai_source_ref: c.sourceRef ?? null, ai_midias: c.midias ?? [] },
          }).select("id").single();
          if (error) throw error;
          contentMap.set(ref, (data as { id: number }).id);
          order += 1;
        }
        const primary = contentMap.values().next().value as number | undefined;
        if (!primary) continue;

        const cardRows: Array<{ conteudo_id: number; conteudo_origem_id: number; titulo: string; descricao: string }> = [];
        (t.conteudos ?? []).forEach((c, i) => {
          const local = contentMap.get((c.ref || `content:${i + 1}`).trim()) ?? primary;
          (c.cards ?? []).forEach((card) => {
            const target = contentMap.get(card.conteudo_ref ?? "") ?? local;
            const origin = contentMap.get(card.conteudo_origem_ref ?? "") ?? target;
            cardRows.push({ conteudo_id: target, conteudo_origem_id: origin, titulo: card.titulo, descricao: card.descricao });
          });
        });
        if (!cardRows.length) (t.cards ?? []).forEach((card) => cardRows.push({ conteudo_id: primary, conteudo_origem_id: primary, titulo: card.titulo, descricao: card.descricao }));
        await insertCards(cardRows);

        const createActivity = async (a: AiAtividade, contentId: number) => {
          const { data, error } = await supabase.from("atividades").insert({ topico_id: topicId, titulo: a.titulo, descricao: "", tipo: a.tipo }).select("id").single();
          if (error) throw error;
          const atividadeId = (data as { id: number }).id;
          await supabase.from("questoes").insert({ atividade_id: atividadeId, enunciado: a.enunciado, tipo: a.tipo, alternativas: a.alternativas ?? null, resposta_correta: a.resposta_correta });
          await supabase.from("atividade_conteudos").insert({ atividade_id: atividadeId, conteudo_id: contentId });
        };
        for (let i = 0; i < (t.conteudos ?? []).length; i += 1) {
          const c = t.conteudos[i];
          const local = contentMap.get((c.ref || `content:${i + 1}`).trim()) ?? primary;
          for (const a of c.atividades ?? []) await createActivity(a, contentMap.get(a.conteudo_ref ?? "") ?? local);
          for (const m of c.midias ?? []) {
            const payload = m.url || m.roteiro || m.transcricao || m.descricao;
            if (!payload) continue;
            const mediaPath = m.sourceRef && uploadedFiles.has(m.sourceRef) ? uploadedFiles.get(m.sourceRef) : null;
            await supabase.from("conteudos").insert({ topico_id: topicId, titulo: `${c.titulo} - ${m.titulo}`, tipo: mediaToContentType(m.tipo), conteudo: payload, ordem: order, metadata: { ai_generated_media: true, media_tipo: m.tipo, media_storage_path: mediaPath } });
            order += 1;
          }
        }
        if ((t.conteudos ?? []).every((c) => (c.atividades?.length ?? 0) === 0)) for (const a of t.atividades ?? []) await createActivity(a, contentMap.get(a.conteudo_ref ?? "") ?? primary);
      }

      const out: Topico[] = preview.map((t) => ({ id: map.get(t.ordem)!, classe_id: classeId, nome: t.nome, descricao: t.descricao, ordem: t.ordem, next: t.next.map((o) => map.get(o)!).filter(Boolean), depende: t.depende.map((o) => map.get(o)!).filter(Boolean), created_at: null }));
      toast.success(`Trilha criada: ${out.length} topicos, ${preview.reduce((s, t) => s + (t.conteudos?.length ?? 0), 0)} conteudos, ${preview.reduce((s, t) => s + countCards(t), 0)} cards, ${preview.reduce((s, t) => s + countActivities(t), 0)} atividades, ${preview.reduce((s, t) => s + countMedia(t), 0)} midias.`);
      onCreated(out);
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar trilha.");
      setStep("preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl bg-[#0F172A] border-slate-800 text-slate-200 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 pb-2">
          <div className="w-9 h-9 rounded-lg bg-violet-600/20 flex items-center justify-center text-violet-400 shrink-0"><Wand2 size={18} /></div>
          <div><DialogTitle className="text-lg font-bold text-white">Gerar Trilha com IA</DialogTitle><DialogDescription className="text-slate-400 text-xs mt-0.5">Arquivos sao enviados ao bucket somente ao confirmar a criacao.</DialogDescription></div>
        </div>
        <ScrollArea className="flex-1 overflow-y-auto pr-1">
          {(step === "form" || step === "confirm-delete") && <div className="space-y-5 py-2">
            <div><Label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1 block">Descricao *</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} className="bg-[#111827] border-slate-700 text-slate-100 placeholder:text-slate-600 focus:border-violet-500 min-h-[72px] resize-none" /></div>
            <div><Label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1 block">Qtd. topicos</Label><Input type="number" min={2} max={20} value={numTopics} onChange={(e) => setNumTopics(Math.min(20, Math.max(2, Number(e.target.value) || 2)))} className="bg-[#111827] border-slate-700 text-slate-100 focus:border-violet-500 w-24" /></div>
            <div><Label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1 block">Topicos (opcional)</Label><Textarea value={topicNamesRaw} onChange={(e) => setTopicNamesRaw(e.target.value)} className="bg-[#111827] border-slate-700 text-slate-100 min-h-[80px] resize-none font-mono text-sm" /></div>
            <div><Label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1 block">Ementa (opcional)</Label><Textarea value={syllabus} onChange={(e) => setSyllabus(e.target.value)} className="bg-[#111827] border-slate-700 text-slate-100 min-h-[80px] resize-none" /></div>
            <Separator className="bg-slate-800" />
            <div className="space-y-3">
              <Label className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1 block">Arquivos (opcional)</Label>
              {initialFileNames.map((name, i) => <div key={`${name}-${i}`} className="flex items-center gap-2 px-3 py-2 bg-[#1E293B] border border-slate-700/50 rounded-lg"><FileText className="w-3.5 h-3.5 text-emerald-400 shrink-0" /><span className="text-xs text-slate-300 truncate">{name}</span></div>)}
              <div className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${isDragging ? "border-violet-500 bg-violet-900/10" : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/20"}`} onClick={() => fileInputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={(e) => { e.preventDefault(); setIsDragging(false); void addFiles(e.dataTransfer.files); }}>
                <Upload className="w-6 h-6 text-slate-600 mx-auto mb-2" /><p className="text-sm text-slate-400">Arraste arquivos ou <span className="text-violet-400">clique</span></p><p className="text-[11px] text-slate-600 mt-1">PDF DOC DOCX PPT PPTX TXT MD MP4 MP3...</p><input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXT} className="hidden" onChange={(e) => void addFiles(e.target.files)} />
              </div>
              {stagedFiles.map((s) => <div key={s.id} className="flex items-center gap-3 p-2.5 bg-[#1E293B] border border-amber-500/20 rounded-lg"><FileText className="w-4 h-4 text-amber-400 shrink-0" /><div className="flex-1 min-w-0"><p className="text-xs text-slate-200 truncate">{s.file.name}</p><p className="text-[10px] text-slate-500">{formatFileSize(s.file.size)}</p></div><button onClick={() => void removeFile(s.id)} className="text-slate-600 hover:text-red-400 transition-colors"><X size={13} /></button></div>)}
            </div>
            {step === "confirm-delete" && <div className="p-4 bg-red-950/30 border border-red-500/30 rounded-xl space-y-3"><div className="flex items-start gap-3"><AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" /><div><p className="text-sm font-semibold text-red-300">Ja existem {existingCount} topicos</p><p className="text-xs text-red-400/80 mt-1">Ao apagar, a trilha atual e seus arquivos da classe serao removidos.</p></div></div><div className="flex gap-2"><Button size="sm" className="bg-red-600 hover:bg-red-700 text-white flex-1" onClick={() => void runGeneration(true)}>Apagar e gerar</Button><Button size="sm" variant="outline" className="border-slate-600 text-slate-300 hover:text-white flex-1" onClick={() => void runGeneration(false)}>Manter e adicionar</Button></div></div>}
          </div>}
          {step === "preview" && preview.length > 0 && <div className="space-y-3 py-2">
            <div className="flex items-center gap-4 text-xs text-slate-400 bg-[#1E293B] px-4 py-2.5 rounded-lg border border-slate-700"><span className="flex items-center gap-1.5"><BrainCircuit size={13} className="text-violet-400" /> {preview.length} topicos</span><span className="flex items-center gap-1.5"><FileText size={13} className="text-blue-400" /> {preview.reduce((s, t) => s + (t.conteudos?.length ?? 0), 0)} conteudos</span><span className="flex items-center gap-1.5"><BrainCircuit size={13} className="text-emerald-400" /> {preview.reduce((s, t) => s + countCards(t), 0)} cards</span><span className="flex items-center gap-1.5"><LayoutList size={13} className="text-orange-400" /> {preview.reduce((s, t) => s + countActivities(t), 0)} atividades</span><span className="flex items-center gap-1.5"><Clapperboard size={13} className="text-cyan-400" /> {preview.reduce((s, t) => s + countMedia(t), 0)} midias</span></div>
            {preview.map((t, idx) => <div key={idx} className="p-4 bg-[#1E293B] border border-slate-700 rounded-xl space-y-3"><div className="flex items-start gap-3"><div className="w-7 h-7 rounded-full bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{t.ordem}</div><div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><p className="font-semibold text-white text-sm">{t.nome}</p><button className="text-slate-600 hover:text-red-400 transition-colors" onClick={() => setPreview((p) => p.filter((_, i) => i !== idx))}><X size={13} /></button></div><p className="text-xs text-slate-400 mt-0.5">{t.descricao}</p>{(t.depende.length > 0 || t.next.length > 0) && <div className="flex flex-wrap gap-1.5 mt-2">{t.depende.map((d) => { const dep = preview.find((p) => p.ordem === d); return dep ? <Badge key={d} variant="outline" className="border-blue-500/40 text-blue-400 text-[10px] py-0">Requer: {dep.nome}</Badge> : null; })}{t.next.map((n) => { const nxt = preview.find((p) => p.ordem === n); return nxt ? <Badge key={n} variant="outline" className="border-emerald-500/40 text-emerald-400 text-[10px] py-0 flex items-center gap-1"><ArrowRight size={9} />{nxt.nome}</Badge> : null; })}</div>}<div className="flex gap-3 mt-2 text-[11px] text-slate-500"><span className="text-blue-400/70">{t.conteudos?.length ?? 0} conteudos</span><span className="text-emerald-400/70">{countCards(t)} cards</span><span className="text-orange-400/70">{countActivities(t)} atividades</span><span className="text-cyan-400/70">{countMedia(t)} midias</span></div></div></div></div>)}
            <button onClick={() => setStep("form")} className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1 mt-1"><Plus size={12} /> Regenerar</button>
          </div>}
          {step === "creating" && <div className="py-16 flex flex-col items-center gap-4 text-center"><Loader2 className="w-10 h-10 text-violet-400 animate-spin" /><p className="text-sm font-semibold text-white">Criando trilha...</p><p className="text-xs text-slate-400">{creatingStatus}</p></div>}
        </ScrollArea>
        <div className="flex justify-between items-center pt-4 border-t border-slate-800 shrink-0 gap-3">
          <Button variant="ghost" onClick={close} disabled={step === "creating"} className="text-slate-400 hover:text-white">Cancelar</Button>
          {step === "form" && <Button onClick={() => void handleGenerate()} disabled={isGenerating || isUploadingFiles || !description.trim()} className="bg-violet-600 hover:bg-violet-700 text-white">{isGenerating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</> : <><Wand2 className="w-4 h-4 mr-2" />Gerar estrutura</>}</Button>}
          {step === "preview" && <Button onClick={() => void handleCreate()} disabled={preview.length === 0 || isUploadingFiles} className="bg-emerald-600 hover:bg-emerald-700 text-white">{isUploadingFiles ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Enviando arquivos...</> : <><CheckCircle2 className="w-4 h-4 mr-2" />Criar trilha ({preview.length})</>}</Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
