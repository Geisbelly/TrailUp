import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatSupabaseFunctionError } from "@/lib/supabaseFunctionError";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Wand2, Loader2, ArrowRight, CheckCircle2, X, Upload, FileText, AlertTriangle } from "lucide-react";
import type { Topico, StagedFile } from "./types";
import { formatFileSize } from "@/lib/utils";
import { deleteTopicCascade } from "./classDeletion";

const ACCEPTED_EXT = ".pdf,.doc,.docx,.ppt,.pptx,.txt,.md,.mp4,.mov,.webm,.mp3,.wav,.m4a";
type Step = "configurar" | "processando" | "resultado" | "revisar" | "ajustar" | "aplicando";

const PASSOS = ["Configurar", "Gerar", "Processando", "Resultado", "Revisar", "Ajustar"] as const;
// Qual rótulo do indicador cada tela acende (o "Gerar" é o instante do envio das fontes).
const PASSO_ATIVO: Record<Step, number> = { configurar: 0, processando: 2, resultado: 3, revisar: 4, ajustar: 5, aplicando: 4 };
import type { AiAtividade, AiTopico, MediaType } from "./proposta";
import { contagemDaProposta, removerDaProposta, semAtividades, substituirNaProposta } from "./proposta";

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

export function GenerateTrailDialog({ open, onOpenChange, classeId, onCreated, initialFileNames = [], initialDescription = "", initialFileContents = "" }: Props) {
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>("configurar");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [existingCount, setExistingCount] = useState(0);
  const [gerarAtividades, setGerarAtividades] = useState(true);
  const [mostrarAvancado, setMostrarAvancado] = useState(false);
  const [ajusteOrdem, setAjusteOrdem] = useState<number | null>(null);
  const [ajusteTexto, setAjusteTexto] = useState("");
  const [isAdjusting, setIsAdjusting] = useState(false);
  const [confirmouSubstituir, setConfirmouSubstituir] = useState(false);
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

  const reset = () => {
    setStep("configurar");
    setPreview([]);
    setDescription(initialDescription);
    setNumTopics(6);
    setTopicNamesRaw("");
    setSyllabus("");
    setStagedFiles([]);
    setStagedFileContents("");
    setCreatingStatus("");
    setGerarAtividades(true);
    setMostrarAvancado(false);
    setAjusteOrdem(null);
    setAjusteTexto("");
    setConfirmouSubstituir(false);
    setExistingCount(0);
  };
  const close = () => { if (step === "aplicando" || step === "processando") return; reset(); onOpenChange(false); };

  // Gerar NÃO apaga nada: a proposta só existe na tela até o professor aplicar.
  const callTrail = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("generate-content-ai", { body });
    if (error) throw new Error(await formatSupabaseFunctionError(error));
    if (!Array.isArray(data?.topicos)) throw new Error("Resposta invalida da IA.");
    return data.topicos as AiTopico[];
  };

  const handleGenerate = async () => {
    if (!description.trim()) return toast.error("Descreva o que a turma precisa aprender.");
    setStep("processando");
    setIsGenerating(true);
    try {
      const topicNames = topicNamesRaw.split("\n").map((line) => line.trim()).filter(Boolean);
      const topicos = await callTrail({
        mode: "trail", topicName: description, topicDescription: description, contents: [], sources: await buildSources(),
        trailDescription: description, numTopics, topicNames, syllabus, fileContents: allFileContents || undefined, fileNames: allFileNames.length ? allFileNames : undefined,
      });
      setPreview(topicos);
      setStep("resultado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar trilha.");
      setStep("configurar");
    } finally { setIsGenerating(false); }
  };

  // "Pedir ajuste": regera SÓ este item pelo mesmo modo "trail" (1 tópico, com o nome dele e a instrução),
  // e o novo tópico assume o lugar do antigo no grafo. Os demais ficam como estão.
  const handleAdjust = async () => {
    const alvo = preview.find((t) => t.ordem === ajusteOrdem);
    if (!alvo) return;
    if (!ajusteTexto.trim()) return toast.error("Descreva o que mudar neste tópico.");
    setIsAdjusting(true);
    try {
      const [novo] = await callTrail({
        mode: "trail", topicName: alvo.nome, topicDescription: alvo.descricao, contents: [], sources: await buildSources(),
        trailDescription: `${description}\n\nGere apenas o tópico "${alvo.nome}". Ajuste pedido pelo professor: ${ajusteTexto.trim()}`,
        numTopics: 1, topicNames: [alvo.nome], syllabus, fileContents: allFileContents || undefined, fileNames: allFileNames.length ? allFileNames : undefined,
      });
      if (!novo) throw new Error("A IA não devolveu o tópico ajustado.");
      setPreview((atual) => substituirNaProposta(atual, alvo.ordem, novo));
      setAjusteOrdem(null);
      setAjusteTexto("");
      setStep("revisar");
      toast.success(`“${alvo.nome}” foi regerado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao ajustar o tópico.");
    } finally { setIsAdjusting(false); }
  };

  const abrirAplicar = async () => {
    const { count } = await supabase.from("topicos").select("id", { count: "exact", head: true }).eq("classe_id", classeId);
    setExistingCount(count ?? 0);
    setConfirmouSubstituir(false);
    setStep("revisar");
  };

  const handleCreate = async () => {
    if (preview.length === 0) return;
    const plano = gerarAtividades ? preview : semAtividades(preview);
    // Tópicos que já existem: só saem DEPOIS de a trilha nova estar criada por inteiro.
    const { data: antigosRows } = await supabase.from("topicos").select("id").eq("classe_id", classeId);
    const antigos = (antigosRows ?? []).map((r) => (r as { id: number }).id);
    setStep("aplicando");
    // Declarado fora do try para o catch poder reverter os topicos ja
    // inseridos: sem isso, uma falha no meio do loop (rede, validacao de um
    // bloco especifico etc.) deixava topicos/conteudos/cards orfaos, e
    // clicar em "Criar trilha" de novo reprocessava o mesmo plano do
    // zero, duplicando tudo que ja tinha sido criado com sucesso.
    const created: Array<{ ai: number; real: number }> = [];
    try {
      setCreatingStatus("Enviando arquivos...");
      const uploadedFiles = await uploadStagedFiles();
      setCreatingStatus("Criando topicos...");
      for (const t of plano) {
        const { data, error } = await supabase.from("topicos").insert({ classe_id: classeId, nome: t.nome, descricao: t.descricao, ordem: t.ordem, next: [], depende: [] }).select("id").single();
        if (error) throw error;
        created.push({ ai: t.ordem, real: (data as { id: number }).id });
      }
      const map = new Map(created.map((i) => [i.ai, i.real]));
      await Promise.all(plano.map((t) => supabase.from("topicos").update({ next: t.next.map((o) => map.get(o)).filter(Boolean), depende: t.depende.map((o) => map.get(o)).filter(Boolean) }).eq("id", map.get(t.ordem)!)));

      const insertCards = async (rows: Array<{ conteudo_id: number; conteudo_origem_id: number; titulo: string; descricao: string }>) => {
        if (!rows.length) return;
        const { error } = await supabase.from("cards").insert(rows.map((r) => ({ ...r, imagem_url: null })));
        if (!error) return;
        const msg = String((error as { message?: string }).message ?? "").toLowerCase();
        if (!msg.includes("conteudo_origem_id")) throw error;
        const { error: fallback } = await supabase.from("cards").insert(rows.map(({ conteudo_origem_id: _x, ...r }) => ({ ...r, imagem_url: null })));
        if (fallback) throw fallback;
      };

      for (const t of plano) {
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

      const out: Topico[] = plano.map((t) => ({ id: map.get(t.ordem)!, classe_id: classeId, nome: t.nome, descricao: t.descricao, ordem: t.ordem, next: t.next.map((o) => map.get(o)!).filter(Boolean), depende: t.depende.map((o) => map.get(o)!).filter(Boolean), created_at: null }));
      toast.success(`Trilha criada: ${out.length} topicos, ${plano.reduce((s, t) => s + (t.conteudos?.length ?? 0), 0)} conteudos, ${plano.reduce((s, t) => s + countCards(t), 0)} cards, ${plano.reduce((s, t) => s + countActivities(t), 0)} atividades, ${plano.reduce((s, t) => s + countMedia(t), 0)} midias.`);
      if (antigos.length > 0) {
        setCreatingStatus("Removendo a trilha anterior...");
        try {
          for (const id of antigos) await deleteTopicCascade(id);
        } catch (removeError) {
          console.error("Falha ao remover tópicos antigos:", removeError);
          toast.warning("A trilha nova foi criada, mas alguns tópicos antigos não puderam ser removidos.");
        }
      }
      onCreated(out);
      close();
    } catch (e) {
      if (created.length > 0) {
        setCreatingStatus("Revertendo criação parcial...");
        try {
          await Promise.all(created.map((c) => deleteTopicCascade(c.real)));
        } catch (rollbackError) {
          console.error("Falha ao reverter trilha criada parcialmente:", rollbackError);
        }
      }
      toast.error(e instanceof Error ? e.message : "Erro ao criar trilha.");
      setStep("revisar");
    }
  };

  const rotuloCampo = "mb-2 block text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground";
  const totais = contagemDaProposta(gerarAtividades ? preview : semAtividades(preview));
  const alvoDoAjuste = preview.find((t) => t.ordem === ajusteOrdem) ?? null;
  const ocupado = step === "aplicando" || step === "processando";

  const itemDaProposta = (t: AiTopico, acoes?: React.ReactNode) => {
    const c = contagemDaProposta([t]);
    return (
      <li key={t.ordem} className="flex items-center gap-3.5 rounded-[14px] bg-muted px-4 py-3">
        <span aria-hidden="true" className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-primary/20 text-[13px] font-extrabold text-primary">{t.ordem}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{t.nome}</p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {c.conteudos} {c.conteudos === 1 ? "conteúdo" : "conteúdos"} · {c.cards} cards · {c.atividades} {c.atividades === 1 ? "atividade" : "atividades"}
          </p>
        </div>
        {acoes}
      </li>
    );
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-hidden rounded-[20px] bg-card">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-primary/20 text-primary"><Wand2 size={18} /></span>
          <div>
            <DialogTitle className="text-xl">Gerar trilha com IA</DialogTitle>
            <DialogDescription className="mt-1 text-[12.5px]">
              Descreva o plano de ensino. A IA propõe os tópicos e a ordem — você revisa antes de aplicar. Nada é publicado nem apagado sem a sua confirmação.
            </DialogDescription>
          </div>
        </div>

        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]" aria-label="Etapas">
          {PASSOS.map((nome, i) => {
            const atual = PASSO_ATIVO[step];
            const estado = i < atual ? "feito" : i === atual ? "atual" : "falta";
            return (
              <li key={nome} aria-current={estado === "atual" ? "step" : undefined} className="flex items-center gap-2">
                {i > 0 && <span aria-hidden="true" className="h-px w-4 bg-border" />}
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${estado === "falta" ? "bg-muted text-muted-foreground" : "bg-primary text-primary-foreground"}`}>
                  {estado === "feito" ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : i + 1}
                </span>
                <span className={estado === "atual" ? "font-bold" : "text-muted-foreground"}>{nome}</span>
              </li>
            );
          })}
        </ol>

        <ScrollArea className="flex-1 overflow-y-auto pr-1">
          {step === "configurar" && (
            <div className="space-y-5 py-2">
              <div>
                <Label htmlFor="trilha-descricao" className={rotuloCampo}>O que a turma precisa aprender *</Label>
                <Textarea id="trilha-descricao" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="rounded-[14px] bg-background" placeholder="Ex.: semestre de mecânica clássica para engenharia, da cinemática até trabalho e energia, com ênfase em resolução de problemas…" />
              </div>

              <div>
                <span className={rotuloCampo}>Plano de ensino ou ementa (opcional)</span>
                {initialFileNames.map((name, i) => (
                  <div key={`${name}-${i}`} className="mb-2 flex items-center gap-2 rounded-[14px] bg-muted px-3 py-2"><FileText className="h-3.5 w-3.5 flex-none text-success" aria-hidden="true" /><span className="truncate text-xs text-muted-foreground">{name}</span></div>
                ))}
                <div
                  role="button"
                  tabIndex={0}
                  className={`cursor-pointer rounded-[14px] border-2 border-dashed p-5 text-center transition-colors ${isDragging ? "border-primary bg-primary/10" : "border-border hover:bg-muted/40"}`}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInputRef.current?.click(); } }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); void addFiles(e.dataTransfer.files); }}
                >
                  <Upload className="mx-auto mb-2 h-6 w-6 text-muted-foreground" aria-hidden="true" />
                  <p className="text-sm text-muted-foreground">Arraste arquivos ou <span className="font-semibold text-primary">clique para escolher</span></p>
                  <p className="mt-1 text-[11px] text-muted-foreground">PDF · DOC/DOCX · PPT/PPTX · TXT · MD · vídeo · áudio</p>
                  <input ref={fileInputRef} type="file" multiple accept={ACCEPTED_EXT} className="hidden" onChange={(e) => void addFiles(e.target.files)} />
                </div>
                {stagedFiles.map((sf) => (
                  <div key={sf.id} className="mt-2 flex items-center gap-3 rounded-[14px] bg-muted p-2.5">
                    <FileText className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
                    <div className="min-w-0 flex-1"><p className="truncate text-xs">{sf.file.name}</p><p className="text-[10px] text-muted-foreground">{formatFileSize(sf.file.size)}</p></div>
                    <button type="button" aria-label={`Remover ${sf.file.name}`} onClick={() => void removeFile(sf.id)} className="text-muted-foreground hover:text-destructive"><X size={13} /></button>
                  </div>
                ))}
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div role="radiogroup" aria-label="Quantidade de tópicos">
                  <span className={rotuloCampo}>Quantidade de tópicos</span>
                  <div className="flex flex-wrap gap-2">
                    {[4, 6, 8, 12].map((n) => (
                      <button key={n} type="button" role="radio" aria-checked={numTopics === n} onClick={() => setNumTopics(n)} className={`rounded-full border px-4 py-1.5 text-[12.5px] font-semibold ${numTopics === n ? "border-primary bg-primary/20" : "border-border text-muted-foreground hover:text-foreground"}`}>{n}</button>
                    ))}
                  </div>
                </div>
                <div role="radiogroup" aria-label="Já gerar atividades?">
                  <span className={rotuloCampo}>Já gerar atividades?</span>
                  <div className="flex gap-2">
                    {[{ v: true, l: "Sim, com a proposta" }, { v: false, l: "Não, depois" }].map((o) => (
                      <button key={String(o.v)} type="button" role="radio" aria-checked={gerarAtividades === o.v} onClick={() => setGerarAtividades(o.v)} className={`rounded-full border px-4 py-1.5 text-[12.5px] font-semibold ${gerarAtividades === o.v ? "border-primary bg-primary/20" : "border-border text-muted-foreground hover:text-foreground"}`}>{o.l}</button>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <button type="button" onClick={() => setMostrarAvancado((v) => !v)} aria-expanded={mostrarAvancado} className="text-xs font-semibold text-primary">
                  {mostrarAvancado ? "Ocultar opções avançadas" : "Opções avançadas (nomes dos tópicos, ementa)"}
                </button>
                {mostrarAvancado && (
                  <div className="mt-3 space-y-4">
                    <div><Label htmlFor="trilha-nomes" className={rotuloCampo}>Tópicos que você já tem em mente (um por linha)</Label><Textarea id="trilha-nomes" value={topicNamesRaw} onChange={(e) => setTopicNamesRaw(e.target.value)} rows={3} className="rounded-[14px] bg-background" /></div>
                    <div><Label htmlFor="trilha-ementa" className={rotuloCampo}>Ementa complementar</Label><Textarea id="trilha-ementa" value={syllabus} onChange={(e) => setSyllabus(e.target.value)} rows={3} className="rounded-[14px] bg-background" /></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "processando" && (
            <div className="flex flex-col items-center gap-4 py-16 text-center" role="status">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-bold">{isUploadingFiles ? "Enviando arquivos…" : "Gerando a proposta…"}</p>
              <p className="max-w-sm text-[12.5px] text-muted-foreground">A IA está montando os tópicos, a ordem e o material inicial a partir do que você descreveu. Pode levar alguns instantes.</p>
            </div>
          )}

          {step === "resultado" && (
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-3 rounded-[14px] border border-success/40 bg-success/10 px-4 py-3 text-[13px] font-semibold">
                <CheckCircle2 className="h-4 w-4 flex-none text-success" aria-hidden="true" />
                Proposta gerada: {totais.topicos} tópicos, {totais.conteudos} conteúdos{gerarAtividades ? ` e ${totais.atividades} atividades iniciais` : ""}.
              </div>
              <ul className="space-y-2">{preview.map((t) => itemDaProposta(t))}</ul>
            </div>
          )}

          {step === "revisar" && (
            <div className="space-y-3 py-2">
              <p className="text-[13px] text-muted-foreground">Confira a proposta. Se algo não estiver certo, peça um ajuste pontual — não é preciso gerar tudo de novo.</p>
              <ul className="space-y-2">
                {preview.map((t) =>
                  itemDaProposta(
                    t,
                    <span className="flex gap-1.5">
                      <Button variant="outline" size="sm" className="rounded-full" onClick={() => { setAjusteOrdem(t.ordem); setAjusteTexto(""); setStep("ajustar"); }}>Pedir ajuste</Button>
                      <button type="button" aria-label={`Tirar “${t.nome}” da proposta`} title="Tirar da proposta" disabled={preview.length <= 1} onClick={() => setPreview((atual) => removerDaProposta(atual, t.ordem))} className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted-foreground hover:text-destructive disabled:opacity-40"><X size={13} /></button>
                    </span>,
                  ),
                )}
              </ul>
              {existingCount > 0 && (
                <div className="space-y-3 rounded-[14px] border border-warning/40 bg-warning/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-warning" aria-hidden="true" />
                    <div>
                      <p className="text-sm font-bold">A turma já tem {existingCount} {existingCount === 1 ? "tópico" : "tópicos"}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Aplicar cria a trilha nova primeiro e só depois remove os tópicos atuais, com seus conteúdos, cards e questões. Se a criação falhar, a trilha atual continua como está.</p>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={confirmouSubstituir} onChange={(e) => setConfirmouSubstituir(e.target.checked)} />Entendi: a trilha atual será substituída.</label>
                </div>
              )}
            </div>
          )}

          {step === "ajustar" && alvoDoAjuste && (
            <div className="space-y-4 py-2">
              <button type="button" onClick={() => setStep("revisar")} disabled={isAdjusting} className="text-xs font-semibold text-primary">← Voltar para a revisão</button>
              <div className="rounded-[14px] bg-muted px-4 py-3"><p className={rotuloCampo + " !mb-1"}>Ajustando</p><p className="text-sm font-bold">{alvoDoAjuste.ordem}. {alvoDoAjuste.nome}</p></div>
              <div>
                <Label htmlFor="trilha-ajuste" className={rotuloCampo}>O que mudar neste tópico</Label>
                <Textarea id="trilha-ajuste" value={ajusteTexto} onChange={(e) => setAjusteTexto(e.target.value)} rows={4} className="rounded-[14px] bg-background" placeholder="Ex.: trocar o exemplo do carro por algo de esportes, e reduzir para 2 conteúdos em vez de 3." />
                <p className="mt-2 text-[11.5px] text-muted-foreground">Só este tópico é regerado; os outros e a ordem não mudam.</p>
              </div>
            </div>
          )}

          {step === "aplicando" && (
            <div className="flex flex-col items-center gap-4 py-16 text-center" role="status">
              <Loader2 className="h-10 w-10 animate-spin text-primary" aria-hidden="true" />
              <p className="text-sm font-bold">Criando a trilha…</p>
              <p className="text-xs text-muted-foreground">{creatingStatus}</p>
            </div>
          )}
        </ScrollArea>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t pt-4">
          <Button variant="ghost" className="rounded-full" onClick={close} disabled={ocupado}>
            {step === "resultado" ? "Descartar" : "Cancelar"}
          </Button>
          {step === "configurar" && (
            <Button className="rounded-full font-bold" onClick={() => void handleGenerate()} disabled={isGenerating || isUploadingFiles || !description.trim()}>
              <Wand2 className="mr-2 h-4 w-4" aria-hidden="true" />Gerar proposta
            </Button>
          )}
          {step === "resultado" && (
            <Button className="rounded-full font-bold" onClick={() => void abrirAplicar()}>Revisar <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" /></Button>
          )}
          {step === "revisar" && (
            <div className="flex gap-2">
              <Button variant="outline" className="rounded-full" onClick={() => setStep("configurar")}>Voltar</Button>
              <Button className="rounded-full font-bold" onClick={() => void handleCreate()} disabled={preview.length === 0 || isUploadingFiles || (existingCount > 0 && !confirmouSubstituir)}>Aplicar trilha</Button>
            </div>
          )}
          {step === "ajustar" && (
            <Button className="rounded-full font-bold" onClick={() => void handleAdjust()} disabled={isAdjusting || !ajusteTexto.trim()}>
              {isAdjusting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />Regerando…</> : "Regerar só este item"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
