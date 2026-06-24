import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, ClipboardList, Calendar, Award, Layers } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Atividade {
  id: number;
  topico_id: number;
  titulo: string;
  descricao: string | null;
  tipo: string | null;
  pontuacao_maxima: number | null;
  data_entrega: string | null;
  conteudo_ids: number[];
  metadata: Record<string, unknown> | null;
}

interface Topico {
  id: number;
  nome: string;
  classe_id: number;
}

interface Conteudo {
  id: number;
  titulo: string;
  topico_id: number;
}

const tiposAtividade = [
  { value: "quiz", label: "Quiz" },
  { value: "exercicio", label: "Exercicio" },
  { value: "projeto", label: "Projeto" },
  { value: "desafio", label: "Desafio" },
];

export default function ActivitiesManager() {
  const { user } = useAuth();
  const professorId = user?.id;

  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [conteudos, setConteudos] = useState<Conteudo[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Atividade | null>(null);
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    descricao: "",
    tipo: "quiz",
    topico_id: "",
    pontuacao_maxima: "10",
    data_entrega: "",
    conteudo_ids: [] as number[],
    penalty_timeout_pct: "20",
    penalty_retry_pct: "50",
    penalty_answer_reveal_pct: "80",
    zero_if_timeout: false,
    zero_if_wrong: false,
    zero_if_answer_revealed: false,
  });

  const conteudoById = useMemo(() => {
    const map = new Map<number, Conteudo>();
    conteudos.forEach((c) => map.set(c.id, c));
    return map;
  }, [conteudos]);

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

      const { data: topicsData, error: topicsError } =
        classIds.length > 0
          ? await supabase
              .from("topicos")
              .select("id, nome, classe_id")
              .in("classe_id", classIds)
          : { data: [], error: null };

      if (topicsError) throw topicsError;

      const topicIds = (topicsData ?? []).map((t) => t.id);

      const [{ data: contentsData, error: contentsError }, { data: activitiesData, error: activitiesError }] =
        await Promise.all([
          topicIds.length > 0
            ? supabase
                .from("conteudos")
                .select("id, titulo, topico_id")
                .in("topico_id", topicIds)
            : Promise.resolve({ data: [], error: null }),
          topicIds.length > 0
            ? supabase
                .from("atividades")
                .select("id, topico_id, titulo, descricao, tipo, pontuacao_maxima, data_entrega, metadata")
                .in("topico_id", topicIds)
            : Promise.resolve({ data: [], error: null }),
        ]);

      if (contentsError) throw contentsError;
      if (activitiesError) throw activitiesError;

      const atividadeIds = (activitiesData ?? []).map((a) => a.id);
      const { data: atividadeConteudos, error: atividadeConteudosError } =
        atividadeIds.length > 0
          ? await supabase
              .from("atividade_conteudos")
              .select("atividade_id, conteudo_id")
              .in("atividade_id", atividadeIds)
          : { data: [], error: null };

      if (atividadeConteudosError) throw atividadeConteudosError;

      const conteudosMap = new Map<number, number[]>();
      (atividadeConteudos ?? []).forEach((ac) => {
        const list = conteudosMap.get(ac.atividade_id) ?? [];
        list.push(ac.conteudo_id);
        conteudosMap.set(ac.atividade_id, list);
      });

      const atividadesComConteudo =
        activitiesData?.map((a) => ({
          ...(a as Atividade),
          conteudo_ids: conteudosMap.get(a.id) ?? [],
        })) ?? [];

      setTopicos((topicsData as Topico[]) ?? []);
      setConteudos((contentsData as Conteudo[]) ?? []);
      setAtividades(atividadesComConteudo);
    } catch (error) {
      console.error("Erro ao carregar atividades:", error);
      toast.error("Não foi possível carregar as atividades.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  const filteredActivities =
    selectedTopicFilter === "all"
      ? atividades
      : atividades.filter((a) => {
          if (a.topico_id.toString() === selectedTopicFilter) return true;
          return a.conteudo_ids.some((id) => conteudoById.get(id)?.topico_id.toString() === selectedTopicFilter);
        });

  const handleConteudoToggle = (conteudoId: number) => {
    setFormData((prev) => {
      const newIds = prev.conteudo_ids.includes(conteudoId)
        ? prev.conteudo_ids.filter((id) => id !== conteudoId)
        : [...prev.conteudo_ids, conteudoId];
      return { ...prev, conteudo_ids: newIds };
    });
  };

  const handleSubmit = async () => {
    if (!formData.titulo || !formData.topico_id) {
      toast.error("Preencha o título e selecione um tópico principal");
      return;
    }

    setIsSaving(true);

    try {
      if (editingActivity) {
        const { error } = await supabase
          .from("atividades")
          .update({
            titulo: formData.titulo,
            descricao: formData.descricao,
            tipo: formData.tipo,
            topico_id: parseInt(formData.topico_id, 10),
            pontuacao_maxima: parseInt(formData.pontuacao_maxima, 10),
            data_entrega: formData.data_entrega || null,
            metadata: {
              grading_rules: {
                penalty_timeout_pct: Number(formData.penalty_timeout_pct || 0),
                penalty_retry_pct: Number(formData.penalty_retry_pct || 0),
                penalty_answer_reveal_pct: Number(formData.penalty_answer_reveal_pct || 0),
                zero_if_timeout: formData.zero_if_timeout,
                zero_if_wrong: formData.zero_if_wrong,
                zero_if_answer_revealed: formData.zero_if_answer_revealed,
              },
            },
          })
          .eq("id", editingActivity.id);

        if (error) throw error;

        await supabase.from("atividade_conteudos").delete().eq("atividade_id", editingActivity.id);

        if (formData.conteudo_ids.length > 0) {
          const inserts = formData.conteudo_ids.map((conteudo_id) => ({
            atividade_id: editingActivity.id,
            conteudo_id,
          }));
          const { error: insertError } = await supabase.from("atividade_conteudos").insert(inserts);
          if (insertError) throw insertError;
        }

        toast.success("Atividade atualizada!");
      } else {
        const { data, error } = await supabase
          .from("atividades")
          .insert({
            titulo: formData.titulo,
            descricao: formData.descricao,
            tipo: formData.tipo,
            topico_id: parseInt(formData.topico_id, 10),
            pontuacao_maxima: parseInt(formData.pontuacao_maxima, 10),
            data_entrega: formData.data_entrega || null,
            metadata: {
              grading_rules: {
                penalty_timeout_pct: Number(formData.penalty_timeout_pct || 0),
                penalty_retry_pct: Number(formData.penalty_retry_pct || 0),
                penalty_answer_reveal_pct: Number(formData.penalty_answer_reveal_pct || 0),
                zero_if_timeout: formData.zero_if_timeout,
                zero_if_wrong: formData.zero_if_wrong,
                zero_if_answer_revealed: formData.zero_if_answer_revealed,
              },
            },
          })
          .select("id, topico_id, titulo, descricao, tipo, pontuacao_maxima, data_entrega, metadata")
          .single();

        if (error) throw error;

        if (formData.conteudo_ids.length > 0 && data?.id) {
          const inserts = formData.conteudo_ids.map((conteudo_id) => ({
            atividade_id: data.id,
            conteudo_id,
          }));
          const { error: insertError } = await supabase.from("atividade_conteudos").insert(inserts);
          if (insertError) throw insertError;
        }

        toast.success("Atividade criada!");
      }

      await loadData();
      setIsDialogOpen(false);
      setEditingActivity(null);
      setFormData({
        titulo: "",
        descricao: "",
        tipo: "quiz",
        topico_id: "",
        pontuacao_maxima: "10",
        data_entrega: "",
        conteudo_ids: [],
        penalty_timeout_pct: "20",
        penalty_retry_pct: "50",
        penalty_answer_reveal_pct: "80",
        zero_if_timeout: false,
        zero_if_wrong: false,
        zero_if_answer_revealed: false,
      });
    } catch (error) {
      console.error("Erro ao salvar atividade:", error);
      toast.error("Não foi possível salvar a atividade.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (activity: Atividade) => {
    const gradingRules = (activity.metadata?.grading_rules ?? {}) as Record<string, unknown>;
    setEditingActivity(activity);
    setFormData({
      titulo: activity.titulo,
      descricao: activity.descricao || "",
      tipo: activity.tipo || "quiz",
      topico_id: activity.topico_id.toString(),
      pontuacao_maxima: (activity.pontuacao_maxima ?? 10).toString(),
      data_entrega: activity.data_entrega || "",
      conteudo_ids: activity.conteudo_ids || [],
      penalty_timeout_pct: String(Number(gradingRules.penalty_timeout_pct ?? 20)),
      penalty_retry_pct: String(Number(gradingRules.penalty_retry_pct ?? 50)),
      penalty_answer_reveal_pct: String(Number(gradingRules.penalty_answer_reveal_pct ?? 80)),
      zero_if_timeout: Boolean(gradingRules.zero_if_timeout ?? false),
      zero_if_wrong: Boolean(gradingRules.zero_if_wrong ?? false),
      zero_if_answer_revealed: Boolean(gradingRules.zero_if_answer_revealed ?? false),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase.from("atividades").delete().eq("id", id);
      if (error) throw error;
      setAtividades((prev) => prev.filter((a) => a.id !== id));
      toast.success("Atividade excluída!");
    } catch (error) {
      console.error("Erro ao excluir atividade:", error);
      toast.error("Não foi possível excluir a atividade.");
    }
  };

  const getTopicName = (topicoId: number) => {
    return topicos.find((t) => t.id === topicoId)?.nome || "Tópico não encontrado";
  };

  const conteudosDaClasseSelecionada = useMemo(() => {
    if (!formData.topico_id) return [];
    const topicoSelecionado = topicos.find((t) => t.id.toString() === formData.topico_id);
    if (!topicoSelecionado) return [];
    return conteudos.filter((c) => {
      const topico = topicos.find((t) => t.id === c.topico_id);
      return topico?.classe_id === topicoSelecionado.classe_id;
    });
  }, [conteudos, formData.topico_id, topicos]);

  const hasData = useMemo(() => atividades.length > 0, [atividades.length]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Atividades</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie quizzes, exercícios e desafios. Vincule a conteúdos da trilha.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedTopicFilter} onValueChange={setSelectedTopicFilter}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Filtrar por topico" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tópicos</SelectItem>
              {topicos.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingActivity(null);
                setFormData({
                  titulo: "",
                  descricao: "",
                  tipo: "quiz",
                  topico_id: "",
                  pontuacao_maxima: "10",
                  data_entrega: "",
                  conteudo_ids: [],
                  penalty_timeout_pct: "20",
                  penalty_retry_pct: "50",
                  penalty_answer_reveal_pct: "80",
                  zero_if_timeout: false,
                  zero_if_wrong: false,
                  zero_if_answer_revealed: false,
                });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Atividade
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingActivity ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
                <DialogDescription>
                  {editingActivity ? "Atualize os dados da atividade" : "Crie uma nova atividade"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Título *</Label>
                  <Input
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ex: Quiz - Conceitos Básicos"
                  />
                </div>
                <div>
                  <Label>Descrição</Label>
                  <Textarea
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Descrição da atividade"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo *</Label>
                    <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposAtividade.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Pontuação Máxima</Label>
                    <Input
                      type="number"
                      value={formData.pontuacao_maxima}
                      onChange={(e) => setFormData({ ...formData, pontuacao_maxima: e.target.value })}
                      min="1"
                    />
                  </div>
                </div>
                <div>
                  <Label>Topico Principal *</Label>
                  <Select value={formData.topico_id} onValueChange={(v) => setFormData({ ...formData, topico_id: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um tópico" />
                    </SelectTrigger>
                    <SelectContent>
                      {topicos.map((t) => (
                        <SelectItem key={t.id} value={t.id.toString()}>
                          {t.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3 rounded-lg border p-3">
                  <Label>Regras de nota da atividade</Label>
                  <p className="text-xs text-muted-foreground">
                    Define penalidades e gatilhos de nota zero aplicados na conclusão da atividade.
                  </p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs">Penalidade timeout (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.penalty_timeout_pct}
                        onChange={(e) => setFormData({ ...formData, penalty_timeout_pct: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Penalidade nova tentativa (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.penalty_retry_pct}
                        onChange={(e) => setFormData({ ...formData, penalty_retry_pct: e.target.value })}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Penalidade ver resposta (%)</Label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.penalty_answer_reveal_pct}
                        onChange={(e) =>
                          setFormData({ ...formData, penalty_answer_reveal_pct: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                    <label className="flex items-center space-x-2 text-sm">
                      <Checkbox
                        checked={formData.zero_if_timeout}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, zero_if_timeout: checked === true })
                        }
                      />
                      <span>Zerar nota em timeout</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm">
                      <Checkbox
                        checked={formData.zero_if_wrong}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, zero_if_wrong: checked === true })
                        }
                      />
                      <span>Zerar nota por erro</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm">
                      <Checkbox
                        checked={formData.zero_if_answer_revealed}
                        onCheckedChange={(checked) =>
                          setFormData({ ...formData, zero_if_answer_revealed: checked === true })
                        }
                      />
                      <span>Zerar ao ver resposta</span>
                    </label>
                  </div>
                </div>

                <div>
                  <Label className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Conteúdos relacionados (opcional)
                  </Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Selecione conteúdos onde esta atividade deve aparecer.
                  </p>
                  <div className="border rounded-lg p-3 space-y-2 max-h-40 overflow-y-auto">
                    {conteudosDaClasseSelecionada.length === 0 && (
                      <p className="text-xs text-muted-foreground">Nenhum conteúdo encontrado</p>
                    )}
                    {conteudosDaClasseSelecionada.map((c) => (
                      <div key={c.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`conteudo-${c.id}`}
                          checked={formData.conteudo_ids.includes(c.id)}
                          onCheckedChange={() => handleConteudoToggle(c.id)}
                        />
                        <label htmlFor={`conteudo-${c.id}`} className="text-sm cursor-pointer">
                          {c.titulo}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Data de Entrega (opcional)</Label>
                  <Input
                    type="date"
                    value={formData.data_entrega}
                    onChange={(e) => setFormData({ ...formData, data_entrega: e.target.value })}
                  />
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={isSaving}>
                  {editingActivity ? "Salvar" : "Criar Atividade"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando atividades...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredActivities.map((activity) => (
              <Card key={activity.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        {activity.titulo}
                      </CardTitle>
                      <CardDescription>{getTopicName(activity.topico_id)}</CardDescription>
                    </div>
                    <span className="text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded capitalize">
                      {activity.tipo}
                    </span>
                  </div>
                </CardHeader>
                <CardContent>
                  {activity.descricao && (
                    <p className="text-sm text-muted-foreground mb-3">{activity.descricao}</p>
                  )}

                  {activity.conteudo_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-3">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        Conteúdos:
                      </span>
                      {activity.conteudo_ids.map((conteudoId) => (
                        <Badge key={conteudoId} variant="outline" className="text-xs">
                          {conteudoById.get(conteudoId)?.titulo || "Conteúdo"}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Award className="h-3 w-3" />
                      {activity.pontuacao_maxima} pts
                    </span>
                    {activity.data_entrega && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(activity.data_entrega).toLocaleDateString("pt-BR")}
                      </span>
                    )}
                  </div>
                  {activity.metadata?.grading_rules ? (
                    <div className="mb-3 rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
                      Timeout: {Number(activity.metadata.grading_rules.penalty_timeout_pct ?? 0)}% · Retry:{" "}
                      {Number(activity.metadata.grading_rules.penalty_retry_pct ?? 0)}% · Ver resposta:{" "}
                      {Number(activity.metadata.grading_rules.penalty_answer_reveal_pct ?? 0)}%
                    </div>
                  ) : null}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(activity)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(activity.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!hasData && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhuma atividade encontrada</p>
              <p className="text-sm">Clique em "Nova Atividade" para começar</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
