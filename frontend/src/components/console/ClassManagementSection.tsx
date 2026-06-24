import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  Pencil,
  Trash2,
  Copy,
  Users,
  BookOpen,
  UserPlus,
  X,
  Loader2,
  GraduationCap,
  Save,
} from "lucide-react";
import { ClassManagerDialog } from "./trilha/ClassManagerDialog";
import { deleteClasseCascade } from "./trilha/classDeletion";
import { enqueueCleanupJob, enqueueEnrollmentJob } from "./trilha/personalizacaoJobsApi";

// Tipos
type Classe = { id: number; descricao: string | null; materia_id: number | null; created_at: string | null };
type Materia = { id: number; nome: string | null; descricao: string | null };
type Student = { id: string; nome: string; email?: string | null };
type ProfessorAlunoRow = { aluno_id: string; has_acesso: boolean; alunos: { id: string; nome: string; email?: string | null } | null };
type TopicRow = { id: number; nome: string | null; descricao: string | null; ordem: number | null; next: number[] | string | null; depende: number[] | string | null };
type ContentRow = { id: number; topico_id: number; titulo: string | null; tipo: string | null; conteudo: string | null; ordem: number | null };
type ActivityRow = { id: number; topico_id: number; titulo: string | null; descricao: string | null; tipo: string | null; data_entrega: string | null };
type QuestionRow = {
  id: number;
  atividade_id: number;
  enunciado: string | null;
  tipo: string | null;
  alternativas: unknown;
  resposta_correta: string | null;
  nota_estabelecida: number | null;
};
type LinkRow = { atividade_id: number; conteudo_id: number };
type CardRow = { conteudo_id: number; titulo: string | null; descricao: string | null; imagem_url: string | null };

type Props = { professorId?: string };

export default function ClassManagementSection({ professorId }: Props) {
  // --- Dados ---
  const [classes, setClasses] = useState<Classe[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classStudents, setClassStudents] = useState<Record<number, string[]>>({});

  // --- UI ---
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ descricao: "", materia_id: "" });

  // --- Criar turma (modal) ---
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [classForm, setClassForm] = useState({ descricao: "", materia_id: "" });
  const [newMateria, setNewMateria] = useState({ nome: "", descricao: "" });

  // --- Alunos ---
  const [selectedClassForStudents, setSelectedClassForStudents] = useState<Classe | null>(null);
  const [studentToAdId, setStudentToAddId] = useState<string>("");
  const [isProcessingStudent, setIsProcessingStudent] = useState(false);

  const darkInputClass = "bg-input border-border text-foreground focus:border-ring placeholder:text-muted-foreground transition-colors";
  const darkLabelClass = "text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1.5 block";
  const darkSelectTrigger = "bg-input border-border text-foreground";
  const darkSelectContent = "bg-popover border-border text-popover-foreground";

  const fetchClassContextIds = async (classeId: number) => {
    const { data: topicoRows, error: topicoError } = await supabase
      .from("topicos")
      .select("id")
      .eq("classe_id", classeId);
    if (topicoError) throw topicoError;

    const topico_ids = (topicoRows ?? []).map((row) => row.id);
    if (topico_ids.length === 0) return { topico_ids, conteudo_ids: [] as number[] };

    const { data: conteudoRows, error: conteudoError } = await supabase
      .from("conteudos")
      .select("id")
      .in("topico_id", topico_ids);
    if (conteudoError) throw conteudoError;

    const conteudo_ids = (conteudoRows ?? []).map((row) => row.id);
    return { topico_ids, conteudo_ids };
  };

  // --- Carregamento ---
  const loadData = useCallback(async () => {
    if (!professorId) return;
    setIsLoading(true);
    try {
      const [{ data: cls }, { data: mats }, { data: profAlunos }] = await Promise.all([
        supabase.from("classe").select("id, descricao, materia_id, created_at").eq("professor_id", professorId).order("created_at", { ascending: false }),
        supabase.from("materia").select("id, nome, descricao"),
        supabase.from("professor_aluno").select("aluno_id, has_acesso, alunos(id, nome, email)").eq("professor_id", professorId).eq("has_acesso", true),
      ]);
      setClasses((cls as Classe[]) ?? []);
      setMaterias((mats as Materia[]) ?? []);
      const parsedStudents = ((profAlunos as ProfessorAlunoRow[]) ?? []).map((row) => ({
        id: row.aluno_id,
        nome: row.alunos?.nome || "Aluno",
        email: row.alunos?.email || "",
      }));
      setStudents(parsedStudents);
      const classIds = ((cls as Classe[]) ?? []).map((c) => c.id);
      if (classIds.length > 0) {
        const { data: clsAlunos } = await supabase.from("classe_aluno").select("classe_id, aluno_id").in("classe_id", classIds);
        const map: Record<number, string[]> = {};
        (clsAlunos as { classe_id: number; aluno_id: string }[] | null)?.forEach((row) => {
          map[row.classe_id] = map[row.classe_id] || [];
          if (!map[row.classe_id].includes(row.aluno_id)) map[row.classe_id].push(row.aluno_id);
        });
        setClassStudents(map);
      } else {
        setClassStudents({});
      }
    } catch {
      toast.error("Erro ao carregar dados.");
    } finally {
      setIsLoading(false);
    }
  }, [professorId]);

  useEffect(() => { loadData(); }, [loadData]);

  // --- Criar turma (chamado pelo ClassManagerDialog) ---
  const handleCreateClass = async () => {
    if (!professorId || !classForm.descricao) {
      toast.error("Informe uma descrição.");
      return null;
    }
    setIsSaving(true);
    try {
      let materiaId = classForm.materia_id ? Number(classForm.materia_id) : null;
      if (!materiaId && newMateria.nome) {
        const { data } = await supabase.from("materia").insert({ nome: newMateria.nome, descricao: newMateria.descricao }).select("id").single();
        if (data) materiaId = (data as { id: number }).id;
      }
      const { data: created, error } = await supabase
        .from("classe")
        .insert({ descricao: classForm.descricao, materia_id: materiaId, professor_id: professorId })
        .select("id, descricao")
        .single();
      if (error) throw error;
      toast.success("Classe criada.");
      await loadData();
      setClassForm({ descricao: "", materia_id: "" });
      setNewMateria({ nome: "", descricao: "" });
      setIsCreateOpen(false);
      return created as { id: number; descricao: string | null };
    } catch {
      toast.error("Erro ao salvar classe.");
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  // --- Editar turma ---
  const handleUpdate = async () => {
    if (!editingId || !editForm.descricao) return toast.error("Informe uma descriÃ§Ã£o.");
    setIsSaving(true);
    try {
      const materiaId = editForm.materia_id ? Number(editForm.materia_id) : null;
      await supabase.from("classe").update({ descricao: editForm.descricao, materia_id: materiaId }).eq("id", editingId);
      toast.success("Classe atualizada.");
      await loadData();
      setEditingId(null);
    } catch {
      toast.error("Erro ao atualizar classe.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Remover esta classe?")) return;
    try {
      await deleteClasseCascade(id);
      toast.success("Classe removida.");
      setClasses((prev) => prev.filter((c) => c.id !== id));
    } catch {
      toast.error("Erro ao remover classe.");
    }
  };

  const handleDuplicate = async (cls: Classe) => {
    if (!professorId) return;
    setIsSaving(true);
    try {
      const { data: clsData, error: clsErr } = await supabase
        .from("classe")
        .insert({
          descricao: `${cls.descricao} (copia)`,
          materia_id: cls.materia_id ?? null,
          professor_id: professorId,
        })
        .select("id")
        .single();
      if (clsErr) throw clsErr;
      const newClassId = (clsData as { id: number }).id;
      const { data: oldTopics } = await supabase.from("topicos").select("id, nome, descricao, ordem, next, depende").eq("classe_id", cls.id);
      const topicIdMap: Record<number, number> = {};
      for (const t of (oldTopics as TopicRow[]) || []) {
        const { data: created } = await supabase.from("topicos").insert({ classe_id: newClassId, nome: t.nome, descricao: t.descricao, ordem: t.ordem, next: t.next, depende: t.depende }).select("id").single();
        topicIdMap[t.id] = (created as { id: number }).id;
      }
      for (const t of (oldTopics as TopicRow[]) || []) {
        const newId = topicIdMap[t.id];
        const mapArr = (arr?: number[] | string | null) =>
          Array.isArray(arr) ? arr.map((n) => topicIdMap[n] || n)
            : arr ? (typeof arr === "string" ? JSON.parse(arr) : arr).map((n: number) => topicIdMap[n] || n) : [];
        await supabase.from("topicos").update({ next: mapArr(t.next), depende: mapArr(t.depende) }).eq("id", newId);
      }
      const { data: oldContents } = await supabase.from("conteudos").select("id, topico_id, titulo, tipo, conteudo, ordem").in("topico_id", Object.keys(topicIdMap).map(Number));
      const contentIdMap: Record<number, number> = {};
      for (const c of (oldContents as ContentRow[]) || []) {
        const { data: created } = await supabase.from("conteudos").insert({ topico_id: topicIdMap[c.topico_id], titulo: c.titulo, tipo: c.tipo, conteudo: c.conteudo, ordem: c.ordem }).select("id").single();
        contentIdMap[c.id] = (created as { id: number }).id;
      }
      const { data: oldActs } = await supabase.from("atividades").select("id, topico_id, titulo, descricao, tipo, data_entrega").in("topico_id", Object.keys(topicIdMap).map(Number));
      const activityIdMap: Record<number, number> = {};
      for (const a of (oldActs as ActivityRow[]) || []) {
        const { data: created } = await supabase.from("atividades").insert({ topico_id: topicIdMap[a.topico_id], titulo: a.titulo, descricao: a.descricao, tipo: a.tipo, data_entrega: a.data_entrega }).select("id").single();
        activityIdMap[a.id] = (created as { id: number }).id;
      }
      const { data: oldQuestions } = await supabase
        .from("questoes")
        .select("id, atividade_id, enunciado, tipo, alternativas, resposta_correta, nota_estabelecida")
        .in("atividade_id", Object.keys(activityIdMap).map(Number));
      for (const q of (oldQuestions as QuestionRow[]) || []) {
        const newActId = activityIdMap[q.atividade_id];
        if (newActId)
          await supabase.from("questoes").insert({
            atividade_id: newActId,
            enunciado: q.enunciado,
            tipo: q.tipo,
            alternativas: q.alternativas,
            resposta_correta: q.resposta_correta,
            nota_estabelecida: q.nota_estabelecida,
          });
      }
      const { data: oldLinks } = await supabase.from("atividade_conteudos").select("atividade_id, conteudo_id").in("atividade_id", Object.keys(activityIdMap).map(Number)).in("conteudo_id", Object.keys(contentIdMap).map(Number));
      for (const l of (oldLinks as LinkRow[]) || []) {
        const newActId = activityIdMap[l.atividade_id];
        const newContId = contentIdMap[l.conteudo_id];
        if (newActId && newContId) await supabase.from("atividade_conteudos").insert({ atividade_id: newActId, conteudo_id: newContId });
      }
      const { data: oldCards } = await supabase.from("cards").select("conteudo_id, titulo, descricao, imagem_url").in("conteudo_id", Object.keys(contentIdMap).map(Number));
      for (const c of (oldCards as CardRow[]) || []) {
        const newContId = contentIdMap[c.conteudo_id];
        if (newContId) await supabase.from("cards").insert({ conteudo_id: newContId, titulo: c.titulo, descricao: c.descricao, imagem_url: c.imagem_url });
      }
      toast.success("Classe duplicada com estrutura.");
      await loadData();
    } catch {
      toast.error("NÃ£o foi possÃ­vel duplicar classe.");
    } finally {
      setIsSaving(false);
    }
  };

  // --- Alunos ---
  const handleAddStudentToClass = async () => {
    if (!selectedClassForStudents || !studentToAdId) return;
    const classId = selectedClassForStudents.id;
    if (classStudents[classId]?.includes(studentToAdId)) return toast.error("Aluno jÃ¡ estÃ¡ na turma.");
    setIsProcessingStudent(true);
    try {
      await supabase.from("classe_aluno").insert({ classe_id: classId, aluno_id: studentToAdId });
      const { data: authData } = await supabase.auth.getSession();
      if (authData.session?.access_token) {
        const { topico_ids, conteudo_ids } = await fetchClassContextIds(classId);
        await enqueueEnrollmentJob(authData.session.access_token, {
          classe_id: classId,
          aluno_id: studentToAdId,
          topico_ids,
          conteudo_ids,
          reason: "matricula_aluno_console",
        });
      }
      setClassStudents((prev) => ({ ...prev, [classId]: [...(prev[classId] || []), studentToAdId] }));
      setStudentToAddId("");
      toast.success("Aluno adicionado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao adicionar.");
    } finally {
      setIsProcessingStudent(false);
    }
  };

  const handleRemoveStudentFromClass = async (alunoId: string) => {
    if (!selectedClassForStudents || !confirm("Remover este aluno da turma?")) return;
    const classId = selectedClassForStudents.id;
    try {
      await supabase.from("classe_aluno").delete().eq("classe_id", classId).eq("aluno_id", alunoId);
      const { data: authData } = await supabase.auth.getSession();
      if (authData.session?.access_token) {
        const { topico_ids, conteudo_ids } = await fetchClassContextIds(classId);
        await enqueueCleanupJob(authData.session.access_token, {
          classe_id: classId,
          aluno_id: alunoId,
          topico_ids,
          conteudo_ids,
          reason: "remocao_aluno_console",
        });
      }
      setClassStudents((prev) => ({ ...prev, [classId]: (prev[classId] || []).filter((id) => id !== alunoId) }));
      toast.success("Aluno removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover.");
    }
  };

  const availableStudents = useMemo(() => {
    if (!selectedClassForStudents) return [];
    const current = classStudents[selectedClassForStudents.id] || [];
    return students.filter((s) => !current.includes(s.id));
  }, [students, classStudents, selectedClassForStudents]);

  return (
    <div className="space-y-8 p-1">

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Turmas</h2>
          <p className="text-muted-foreground text-sm">Gerencie suas turmas e os alunos vinculados.</p>
        </div>
        <Button
          onClick={() => setIsCreateOpen(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg"
        >
          <Plus className="w-4 h-4 mr-2" /> Nova Turma
        </Button>
      </div>

      {/* Edit form (shown inline when editing) */}
      {editingId && (
        <Card className="bg-card border-primary/35 shadow-md">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-base text-foreground flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" /> Editando turma
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label className={darkLabelClass}>Nome da Turma</Label>
              <Input value={editForm.descricao} onChange={(e) => setEditForm({ ...editForm, descricao: e.target.value })} className={darkInputClass} />
            </div>
            <div>
              <Label className={darkLabelClass}>MatÃ©ria</Label>
              <Select value={editForm.materia_id || "none"} onValueChange={(v) => setEditForm({ ...editForm, materia_id: v === "none" ? "" : v })}>
                <SelectTrigger className={darkSelectTrigger}><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent className={darkSelectContent}>
                  <SelectItem value="none">Geral / Sem MatÃ©ria</SelectItem>
                  {materias.map((m) => <SelectItem key={m.id} value={m.id.toString()}>{m.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-1">
              <Button onClick={handleUpdate} disabled={isSaving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <Save className="w-4 h-4 mr-2" /> Salvar
              </Button>
              <Button variant="ghost" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">Cancelar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Class list */}
      {isLoading && <div className="text-center py-10 text-muted-foreground">Carregando turmas...</div>}

      {!isLoading && classes.length === 0 && (
        <div className="text-center py-20 border-2 border-dashed border-border rounded-xl bg-card/50 space-y-4">
          <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/40" />
          <div>
            <p className="text-foreground font-semibold">Nenhuma turma ainda</p>
            <p className="text-muted-foreground text-sm mt-1">Crie sua primeira turma para comecar.</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" /> Criar primeira turma
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {classes.map((c) => {
          const enrolledCount = (classStudents[c.id] || []).length;
          const materiaNome = materias.find((m) => m.id === c.materia_id)?.nome;
          return (
            <Card key={c.id} className="bg-card border-border shadow-md group hover:border-primary/40 transition-all hover:shadow-lg">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-bold text-foreground truncate">{c.descricao}</p>
                    <div className="mt-1.5">
                      {materiaNome
                        ? <span className="bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">{materiaNome}</span>
                        : <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wide">Geral</span>
                      }
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => { setEditingId(c.id); setEditForm({ descricao: c.descricao || "", materia_id: c.materia_id?.toString() || "" }); }}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-muted" onClick={() => handleDuplicate(c)} title="Duplicar">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    <span>{enrolledCount} alunos</span>
                  </div>
                  <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setSelectedClassForStudents(c)}>
                    <UserPlus className="w-3 h-3 mr-1.5" /> Alunos
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* â”€â”€ Modal: Criar Turma â”€â”€ */}
      <ClassManagerDialog
        open={isCreateOpen}
        onOpenChange={(v) => { setIsCreateOpen(v); if (!v) { setClassForm({ descricao: "", materia_id: "" }); setNewMateria({ nome: "", descricao: "" }); } }}
        classForm={classForm}
        setClassForm={setClassForm}
        newMateria={newMateria}
        setNewMateria={setNewMateria}
        materias={materias}
        isSaving={isSaving}
        handleCreateClass={handleCreateClass}
      />

      {/* â”€â”€ Modal: Gerenciar Alunos â”€â”€ */}
      <Dialog open={!!selectedClassForStudents} onOpenChange={(open) => !open && setSelectedClassForStudents(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] p-0 gap-0 bg-[#0F172A] border-slate-800 flex flex-col overflow-hidden sm:rounded-xl shadow-2xl shadow-black">
          <div className="px-6 py-4 bg-[#1E293B] border-b border-slate-800">
            <DialogHeader>
              <DialogTitle className="text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-500" /> Gerenciar Alunos
              </DialogTitle>
              <DialogDescription className="text-slate-400">
                Turma: <span className="font-semibold text-white">{selectedClassForStudents?.descricao}</span>
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 flex flex-col gap-0 overflow-hidden bg-[#0b1120]">
            <div className="p-6 border-b border-slate-800 bg-[#111827]">
              <Label className={`${darkLabelClass} mb-2`}>Adicionar Aluno</Label>
              <div className="flex gap-3">
                <div className="flex-1">
                  <Select value={studentToAdId} onValueChange={setStudentToAddId}>
                    <SelectTrigger className={`${darkSelectTrigger} h-10 border-slate-600`}>
                      <SelectValue placeholder="Selecione um aluno..." />
                    </SelectTrigger>
                    <SelectContent className={darkSelectContent}>
                      {availableStudents.length > 0 ? (
                        availableStudents.map((s) => (
                          <SelectItem key={s.id} value={s.id} className="focus:bg-violet-600 focus:text-white">
                            {s.nome} <span className="text-slate-400 ml-2 text-xs">({s.email})</span>
                          </SelectItem>
                        ))
                      ) : (
                        <div className="p-3 text-xs text-slate-500 text-center">Todos os alunos jÃ¡ estÃ£o nesta turma.</div>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddStudentToClass} disabled={!studentToAdId || isProcessingStudent} className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[100px]">
                  {isProcessingStudent ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Plus className="w-4 h-4 mr-2" /> Adicionar</>}
                </Button>
              </div>
            </div>

            <div className="flex-1 flex flex-col min-h-0 p-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Alunos Matriculados</h4>
                <Badge variant="secondary" className="bg-slate-800 text-slate-300">
                  {(classStudents[selectedClassForStudents?.id || 0] || []).length}
                </Badge>
              </div>
              <ScrollArea className="flex-1 border border-slate-700/50 rounded-lg bg-[#1E293B] shadow-inner">
                <div className="p-2 space-y-1">
                  {(classStudents[selectedClassForStudents?.id || 0] || []).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500 opacity-60">
                      <Users className="w-12 h-12 mb-3 opacity-20" />
                      <p className="text-sm">Nenhum aluno matriculado nesta turma.</p>
                    </div>
                  ) : (
                    (classStudents[selectedClassForStudents?.id || 0] || []).map((studentId) => {
                      const student = students.find((s) => s.id === studentId);
                      if (!student) return null;
                      return (
                        <div key={student.id} className="flex items-center justify-between p-3 hover:bg-slate-700/50 rounded-md transition-colors group border border-transparent hover:border-slate-600/50">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9 bg-slate-800 border border-slate-600 text-slate-300">
                              <AvatarFallback className="text-xs font-bold">{student.nome.substring(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-sm font-medium text-slate-200">{student.nome}</p>
                              <p className="text-[11px] text-slate-500">{student.email}</p>
                            </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-red-950/20 opacity-70 hover:opacity-100" onClick={() => handleRemoveStudentFromClass(student.id)}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
