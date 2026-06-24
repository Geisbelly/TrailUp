import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { HelpCircle, Loader2, Pencil, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parseOptionalPositiveScore, scoreToInputString } from "@/lib/question-score";
import { QUESTION_MEDIA_ACCEPT, isQuestionMediaFileAllowed } from "@/lib/upload-file-policy";
import EssayQuestionRenderer from "./EssayQuestionRenderer";

interface Atividade {
  id: number;
  titulo: string;
}

interface Questao {
  id: number;
  atividade_id: number;
  enunciado: string;
  tipo: string | null;
  alternativas: Record<string, unknown>[] | string[] | null;
  resposta_correta: string | null;
  nota_estabelecida: number | null;
  midia_url: string | null;
}

type UiQuestionType = "multipla" | "verdadeiro_falso" | "fill_blank" | "essay";
type DbQuestionType = "multipla" | "verdadeiro_falso" | "fill_blank" | "dissertativa";
type Alternative = { id: string; texto: string; isCorrect: boolean };

const tiposQuestao: Array<{ value: UiQuestionType; label: string }> = [
  { value: "multipla", label: "Multipla escolha" },
  { value: "verdadeiro_falso", label: "Verdadeiro/Falso" },
  { value: "fill_blank", label: "Completar lacuna" },
  { value: "essay", label: "Dissertativa (Essay)" },
];

const normalizeQuestionTypeForUi = (tipo: string | null | undefined): UiQuestionType => {
  const raw = (tipo || "").trim().toLowerCase();
  if (raw === "multipla" || raw === "quiz") return "multipla";
  if (raw === "verdadeiro_falso" || raw === "true_false" || raw === "vf") return "verdadeiro_falso";
  if (raw === "fill_blank" || raw === "lacuna" || raw === "completar") return "fill_blank";
  if (raw === "essay" || raw === "dissertativa" || raw === "questao" || raw === "texto") return "essay";
  return "essay";
};

const mapUiTypeToDb = (tipo: UiQuestionType): DbQuestionType => {
  if (tipo === "essay") return "dissertativa";
  return tipo;
};

const formatQuestionTypeLabel = (tipo: string | null | undefined): string => {
  const normalized = normalizeQuestionTypeForUi(tipo);
  if (normalized === "multipla") return "Multipla escolha";
  if (normalized === "verdadeiro_falso") return "Verdadeiro/Falso";
  if (normalized === "fill_blank") return "Completar lacuna";
  return "Dissertativa (Essay)";
};

const buildDefaultAlternatives = (tipo: UiQuestionType): Alternative[] => {
  if (tipo === "verdadeiro_falso") {
    return [
      { id: "Verdadeiro", texto: "Verdadeiro", isCorrect: true },
      { id: "Falso", texto: "Falso", isCorrect: false },
    ];
  }

  if (tipo === "multipla") {
    return [
      { id: "A", texto: "Alternativa A", isCorrect: true },
      { id: "B", texto: "Alternativa B", isCorrect: false },
    ];
  }

  return [];
};

const normalizeTrueFalseAnswer = (value: string | null | undefined): string => {
  const raw = (value || "").trim().toLowerCase();
  if (raw === "f" || raw === "falso" || raw === "false") return "Falso";
  return "Verdadeiro";
};

const parseAlternatives = (
  alternativas: Questao["alternativas"],
  tipo: UiQuestionType,
  respostaCorreta: string | null
): Alternative[] => {
  if (!Array.isArray(alternativas)) {
    return buildDefaultAlternatives(tipo);
  }

  const parsed = alternativas
    .map((item, idx): Alternative | null => {
      if (typeof item === "string") {
        const text = item.trim();
        if (!text) return null;
        const id = String.fromCharCode(65 + idx);
        return {
          id,
          texto: text,
          isCorrect: text === (respostaCorreta || "") || id === (respostaCorreta || ""),
        };
      }

      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const id = String(row.id ?? String.fromCharCode(65 + idx)).trim();
      const texto = String(row.texto ?? "").trim();
      if (!id || !texto) return null;
      const isCorrect =
        Boolean(row.correta) ||
        Boolean(row.isCorrect) ||
        id === (respostaCorreta || "") ||
        texto === (respostaCorreta || "");
      return { id, texto, isCorrect };
    })
    .filter((item): item is Alternative => item !== null);

  if (tipo === "verdadeiro_falso" && parsed.length === 0) {
    return buildDefaultAlternatives("verdadeiro_falso");
  }
  if (tipo === "multipla" && parsed.length === 0) {
    return buildDefaultAlternatives("multipla");
  }
  return parsed;
};

export default function QuestionsManager() {
  const { user } = useAuth();
  const professorId = user?.id;

  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [questoes, setQuestoes] = useState<Questao[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Questao | null>(null);
  const [selectedActivityFilter, setSelectedActivityFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    atividade_ids: [] as string[],
    enunciado: "",
    tipo: "multipla" as UiQuestionType,
    resposta_correta: "",
    nota_estabelecida: "",
    midia_url: "",
  });
  const [alternativasUI, setAlternativasUI] = useState<Alternative[]>([]);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const url = formData.midia_url;
    if (!url || url.startsWith("http")) {
      setMediaPreviewUrl(url || null);
      return;
    }
    if (!/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(url)) {
      setMediaPreviewUrl(null);
      return;
    }
    supabase.storage.from("conteudos").createSignedUrl(url, 3600).then(({ data }) => {
      setMediaPreviewUrl(data?.signedUrl ?? null);
    });
  }, [formData.midia_url]);

  const loadData = async () => {
    if (!professorId) return;
    setIsLoading(true);
    try {
      const { data: classes, error: classesError } = await supabase
        .from("classe")
        .select("id")
        .eq("professor_id", professorId);

      if (classesError) throw classesError;

      const classIds = (classes ?? []).map((c) => c.id);
      const { data: topics, error: topicsError } =
        classIds.length > 0
          ? await supabase.from("topicos").select("id").in("classe_id", classIds)
          : { data: [], error: null };

      if (topicsError) throw topicsError;

      const topicIds = (topics ?? []).map((t) => t.id);
      const { data: activitiesData, error: activitiesError } =
        topicIds.length > 0
          ? await supabase
              .from("atividades")
              .select("id, titulo")
              .in("topico_id", topicIds)
              .order("created_at", { ascending: false })
          : { data: [], error: null };

      if (activitiesError) throw activitiesError;

      const atividadeIds = (activitiesData ?? []).map((a) => a.id);
      const { data: questionsData, error: questionsError } =
        atividadeIds.length > 0
          ? await supabase
              .from("questoes")
              .select("id, atividade_id, enunciado, tipo, alternativas, resposta_correta, nota_estabelecida, midia_url")
              .in("atividade_id", atividadeIds)
          : { data: [], error: null };

      if (questionsError) throw questionsError;

      setAtividades((activitiesData as Atividade[]) ?? []);
      setQuestoes((questionsData as Questao[]) ?? []);
    } catch (error) {
      console.error("Erro ao carregar questoes:", error);
      toast.error("Nao foi possivel carregar as questoes.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  const filteredQuestions =
    selectedActivityFilter === "all"
      ? questoes
      : questoes.filter((q) => q.atividade_id.toString() === selectedActivityFilter);

  const ensureAlternativesForType = (tipo: UiQuestionType) => {
    if (tipo === "essay" || tipo === "fill_blank") {
      setAlternativasUI([]);
      return;
    }

    if (tipo === "verdadeiro_falso") {
      setAlternativasUI(buildDefaultAlternatives("verdadeiro_falso"));
      setFormData((prev) => ({
        ...prev,
        resposta_correta: normalizeTrueFalseAnswer(prev.resposta_correta),
      }));
      return;
    }

    if (tipo === "multipla" && alternativasUI.length === 0) {
      const defaults = buildDefaultAlternatives("multipla");
      setAlternativasUI(defaults);
      setFormData((prev) => ({ ...prev, resposta_correta: defaults[0]?.id || "A" }));
    }
  };

  const handleUploadMedia = async (file: File) => {
    if (!isQuestionMediaFileAllowed(file)) {
      toast.error("Formato de mídia não permitido para questões.");
      return;
    }
    if (!user?.id) {
      toast.error("Faca login para enviar midia.");
      return;
    }
    setIsUploadingMedia(true);
    try {
      const sanitized = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${user.id}/questions/${Date.now()}_${sanitized}`;
      const { error } = await supabase.storage.from("conteudos").upload(path, file, { upsert: true });
      if (error) throw error;
      setFormData((prev) => ({ ...prev, midia_url: path }));
      toast.success("Midia da questao enviada com sucesso.");
    } catch (error) {
      console.error("Erro ao subir midia da questao:", error);
      toast.error("Nao foi possivel enviar a midia da questao.");
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleSubmit = async () => {
    if (!formData.enunciado || formData.atividade_ids.length === 0) {
      toast.error("Preencha o enunciado e selecione ao menos uma atividade.");
      return;
    }

    const uiType = normalizeQuestionTypeForUi(formData.tipo);
    const dbType = mapUiTypeToDb(uiType);

    if (uiType === "fill_blank" && !formData.resposta_correta.trim()) {
      toast.error("Informe a resposta correta para questao de completar lacuna.");
      return;
    }

    if (uiType === "multipla" || uiType === "verdadeiro_falso") {
      const hasCorrect = alternativasUI.some((a) => a.isCorrect);
      if (!hasCorrect) {
        toast.error("Selecione uma alternativa correta.");
        return;
      }
    }

    let alternativasPayload: Record<string, unknown>[] | null = null;
    let respostaCorreta = formData.resposta_correta.trim();
    const scoreParsed = parseOptionalPositiveScore(formData.nota_estabelecida);
    if (!scoreParsed.isValid) {
      toast.error("A nota da questao deve ser maior que 0 ou deixada em branco.");
      return;
    }
    const notaEstabelecida = scoreParsed.value;

    if (uiType === "multipla") {
      const sanitized = alternativasUI
        .map((a, idx) => ({
          id: (a.id || String.fromCharCode(65 + idx)).trim(),
          texto: (a.texto || "").trim(),
          correta: Boolean(a.isCorrect),
        }))
        .filter((a) => a.id && a.texto);

      const correct = sanitized.find((a) => a.correta);
      if (!correct) {
        toast.error("Selecione uma alternativa correta.");
        return;
      }
      alternativasPayload = sanitized;
      respostaCorreta = correct.id;
    } else if (uiType === "verdadeiro_falso") {
      const resposta = normalizeTrueFalseAnswer(respostaCorreta);
      alternativasPayload = [
        { id: "Verdadeiro", texto: "Verdadeiro", correta: resposta === "Verdadeiro" },
        { id: "Falso", texto: "Falso", correta: resposta === "Falso" },
      ];
      respostaCorreta = resposta;
    } else if (uiType === "fill_blank") {
      alternativasPayload = null;
      respostaCorreta = respostaCorreta || "Resposta aberta";
    } else {
      alternativasPayload = null;
      respostaCorreta = respostaCorreta || "Guia de correcao aberto";
    }

    setIsSaving(true);
    try {
      if (editingQuestion) {
        const atividadeId = formData.atividade_ids[0]
          ? parseInt(formData.atividade_ids[0], 10)
          : editingQuestion.atividade_id;

        const { error } = await supabase
          .from("questoes")
          .update({
            atividade_id: atividadeId,
            enunciado: formData.enunciado,
            tipo: dbType,
            resposta_correta: respostaCorreta,
            nota_estabelecida: notaEstabelecida,
            alternativas: alternativasPayload,
            midia_url: formData.midia_url || null,
          })
          .eq("id", editingQuestion.id);

        if (error) throw error;
        toast.success("Questao atualizada.");
      } else {
        const inserts = formData.atividade_ids.map((id) => ({
          atividade_id: parseInt(id, 10),
          enunciado: formData.enunciado,
          tipo: dbType,
          resposta_correta: respostaCorreta,
          nota_estabelecida: notaEstabelecida,
          alternativas: alternativasPayload,
          midia_url: formData.midia_url || null,
        }));

        const { data, error } = await supabase
          .from("questoes")
          .insert(inserts)
          .select("id, atividade_id, enunciado, tipo, alternativas, resposta_correta, nota_estabelecida, midia_url");

        if (error) throw error;
        setQuestoes((prev) => [...prev, ...(data as Questao[])]);
        toast.success("Questao(oes) criada(s).");
      }

      await loadData();
      setIsDialogOpen(false);
      setEditingQuestion(null);
      setFormData({
        atividade_ids: [],
        enunciado: "",
        tipo: "multipla",
        resposta_correta: "",
        nota_estabelecida: "",
        midia_url: "",
      });
      setAlternativasUI([]);
    } catch (error) {
      console.error("Erro ao salvar questao:", error);
      toast.error("Nao foi possivel salvar a questao.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (questao: Questao) => {
    setEditingQuestion(questao);
    const uiType = normalizeQuestionTypeForUi(questao.tipo);
    const parsedAlt = parseAlternatives(questao.alternativas, uiType, questao.resposta_correta);
    const correctAlt = parsedAlt.find((a) => a.isCorrect);

    let resposta = questao.resposta_correta || "";
    if (uiType === "verdadeiro_falso") {
      resposta = normalizeTrueFalseAnswer(questao.resposta_correta);
    } else if (uiType === "multipla" && correctAlt) {
      resposta = correctAlt.id;
    }

    setAlternativasUI(uiType === "essay" || uiType === "fill_blank" ? [] : parsedAlt);
    setFormData({
      atividade_ids: [questao.atividade_id.toString()],
      enunciado: questao.enunciado,
      tipo: uiType,
      resposta_correta: resposta,
      nota_estabelecida: scoreToInputString(questao.nota_estabelecida),
      midia_url: questao.midia_url || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase.from("questoes").delete().eq("id", id);
      if (error) throw error;
      setQuestoes((prev) => prev.filter((q) => q.id !== id));
      toast.success("Questao excluida.");
    } catch (error) {
      console.error("Erro ao excluir questao:", error);
      toast.error("Nao foi possivel excluir a questao.");
    }
  };

  const getActivityTitle = (atividadeId: number) =>
    atividades.find((a) => a.id === atividadeId)?.titulo || "Atividade nao encontrada";

  const hasData = useMemo(() => questoes.length > 0, [questoes.length]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Questoes</h3>
          <p className="text-sm text-muted-foreground">Cadastre perguntas vinculadas a cada atividade</p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedActivityFilter} onValueChange={setSelectedActivityFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por atividade" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as atividades</SelectItem>
              {atividades.map((a) => (
                <SelectItem key={a.id} value={a.id.toString()}>
                  {a.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingQuestion(null);
                setFormData({
                  atividade_ids: [],
                  enunciado: "",
                  tipo: "multipla",
                  resposta_correta: "",
                  nota_estabelecida: "",
                  midia_url: "",
                });
                setAlternativasUI([]);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Questao
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingQuestion ? "Editar Questao" : "Nova Questao"}</DialogTitle>
                <DialogDescription>
                  {editingQuestion ? "Atualize os dados da questao" : "Crie uma nova questao"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Atividades *</Label>
                  <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-2">
                    {atividades.map((a) => (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={formData.atividade_ids.includes(a.id.toString())}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setFormData((prev) => ({
                              ...prev,
                              atividade_ids: checked
                                ? [...prev.atividade_ids, a.id.toString()]
                                : prev.atividade_ids.filter((id) => id !== a.id.toString()),
                            }));
                          }}
                        />
                        <span>{a.titulo}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Enunciado *</Label>
                  <Textarea
                    value={formData.enunciado}
                    onChange={(e) => setFormData({ ...formData, enunciado: e.target.value })}
                    placeholder="Texto da questao"
                    rows={3}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Tipo</Label>
                    <Select
                      value={formData.tipo}
                      onValueChange={(value) => {
                        const nextType = normalizeQuestionTypeForUi(value);
                        setFormData((prev) => ({ ...prev, tipo: nextType }));
                        ensureAlternativesForType(nextType);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposQuestao.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{formData.tipo === "essay" ? "Guia de correcao (opcional)" : "Resposta correta"}</Label>
                    {formData.tipo === "essay" ? (
                      <Textarea
                        value={formData.resposta_correta}
                        onChange={(e) => setFormData({ ...formData, resposta_correta: e.target.value })}
                        placeholder="Sugestao de resposta ou criterios de avaliacao"
                        rows={2}
                      />
                    ) : (
                      <Input
                        value={formData.resposta_correta}
                        onChange={(e) => setFormData({ ...formData, resposta_correta: e.target.value })}
                        placeholder={
                          formData.tipo === "multipla"
                            ? "Defina a correta nas alternativas"
                            : formData.tipo === "verdadeiro_falso"
                            ? "Verdadeiro ou Falso"
                            : "Resposta esperada"
                        }
                        readOnly={formData.tipo === "multipla" || formData.tipo === "verdadeiro_falso"}
                      />
                    )}
                  </div>
                  <div>
                    <Label>Nota da questao</Label>
                    <Input
                      type="number"
                      min="0.1"
                      step="0.01"
                      value={formData.nota_estabelecida}
                      onChange={(e) => setFormData({ ...formData, nota_estabelecida: e.target.value })}
                      placeholder="Opcional (ex: 2.5)"
                    />
                  </div>
                </div>
                {(formData.tipo === "multipla" || formData.tipo === "verdadeiro_falso") && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Alternativas</Label>
                      {formData.tipo === "multipla" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const nextId = String.fromCharCode(65 + alternativasUI.length);
                            setAlternativasUI((prev) => [
                              ...prev,
                              { id: nextId, texto: `Alternativa ${nextId}`, isCorrect: false },
                            ]);
                          }}
                        >
                          Adicionar
                        </Button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {alternativasUI.map((alt, idx) => (
                        <div key={`${alt.id}-${idx}`} className="flex items-center gap-2 p-2 border rounded">
                          <input
                            type="radio"
                            name="correta"
                            checked={alt.isCorrect}
                            onChange={() => {
                              setAlternativasUI((prev) =>
                                prev.map((a, aIdx) => ({ ...a, isCorrect: aIdx === idx }))
                              );
                              setFormData((prev) => ({ ...prev, resposta_correta: alt.id }));
                            }}
                          />
                          <Input
                            value={alt.texto}
                            onChange={(e) =>
                              setAlternativasUI((prev) =>
                                prev.map((a, aIdx) =>
                                  aIdx === idx ? { ...a, texto: e.target.value } : a
                                )
                              )
                            }
                            className="flex-1"
                            readOnly={formData.tipo === "verdadeiro_falso"}
                          />
                          {formData.tipo === "multipla" && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              onClick={() =>
                                setAlternativasUI((prev) => prev.filter((_, aIdx) => aIdx !== idx))
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <Label>Midia URL (opcional)</Label>
                  <Input
                    value={formData.midia_url}
                    onChange={(e) => setFormData({ ...formData, midia_url: e.target.value })}
                    placeholder="https://..."
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      ref={mediaInputRef}
                      type="file"
                      accept={QUESTION_MEDIA_ACCEPT}
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) await handleUploadMedia(file);
                        e.currentTarget.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => mediaInputRef.current?.click()}
                      disabled={isUploadingMedia}
                    >
                      {isUploadingMedia ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Enviando...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-1.5" /> Enviar arquivo
                        </>
                      )}
                    </Button>
                  </div>
                  {mediaPreviewUrl && (
                    <img
                      src={mediaPreviewUrl}
                      alt="Preview midia da questao"
                      className="mt-2 max-h-36 rounded border object-contain"
                    />
                  )}
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={isSaving}>
                  {editingQuestion ? "Salvar" : "Criar Questao"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando questoes...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredQuestions.map((questao) => (
              <Card key={questao.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    {questao.enunciado}
                  </CardTitle>
                  <CardDescription>{getActivityTitle(questao.atividade_id)}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Tipo: <span className="font-medium">{formatQuestionTypeLabel(questao.tipo)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Nota:{" "}
                    <span className="font-medium">
                      {questao.nota_estabelecida == null
                        ? "Sem nota definida"
                        : Number(questao.nota_estabelecida).toFixed(2)}
                    </span>
                  </p>
                  {questao.resposta_correta && (
                    <p className="text-xs text-muted-foreground">
                      Resposta correta: <span className="font-medium">{questao.resposta_correta}</span>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(questao)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(questao.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  {normalizeQuestionTypeForUi(questao.tipo) === "essay" && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="secondary" size="sm" className="w-full">
                          <Sparkles className="h-4 w-4 mr-1.5" />
                          Testar correcao IA
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-3xl">
                        <DialogHeader>
                          <DialogTitle>Validar questao dissertativa</DialogTitle>
                          <DialogDescription>
                            Simule uma resposta de aluno e valide pela IA usando enunciado, conteudo e gabarito do professor.
                          </DialogDescription>
                        </DialogHeader>
                        <EssayQuestionRenderer
                          questaoId={questao.id}
                          atividadeId={questao.atividade_id}
                          enunciado={questao.enunciado}
                          respostaProfessor={questao.resposta_correta}
                          notaEstabelecida={questao.nota_estabelecida}
                          saveAttempt={false}
                        />
                      </DialogContent>
                    </Dialog>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {!hasData && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhuma questao cadastrada</p>
              <p className="text-sm">Clique em "Nova Questao" para comecar</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
