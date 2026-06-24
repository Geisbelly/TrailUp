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
import { Plus, Pencil, Trash2, Users, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import ClassStudentsDialog from "./ClassStudentsDialog";
import { deleteClasseCascade } from "./classDeletion";

interface Materia {
  id: number;
  nome: string | null;
  descricao: string | null;
}

interface Classe {
  id: number;
  materia_id: number | null;
  descricao: string | null;
  created_at: string | null;
}

export default function ClassesManager() {
  const { user } = useAuth();
  const professorId = user?.id;

  const [classes, setClasses] = useState<Classe[]>([]);
  const [materias, setMaterias] = useState<Materia[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isMateriaDialogOpen, setIsMateriaDialogOpen] = useState(false);
  const [isStudentsDialogOpen, setIsStudentsDialogOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Classe | null>(null);
  const [editingClass, setEditingClass] = useState<Classe | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({ descricao: "", materia_id: "" });
  const [newMateria, setNewMateria] = useState({ nome: "", descricao: "" });

  const loadData = async () => {
    if (!professorId) return;
    setIsLoading(true);
    try {
      const [{ data: materiasData, error: materiasError }, { data: classesData, error: classesError }] =
        await Promise.all([
          supabase.from("materia").select("id, nome, descricao").order("nome"),
          supabase
            .from("classe")
            .select("id, materia_id, descricao, created_at")
            .eq("professor_id", professorId)
            .order("created_at", { ascending: false }),
        ]);

      if (materiasError) throw materiasError;
      if (classesError) throw classesError;

      setMaterias(materiasData ?? []);
      setClasses(classesData ?? []);
    } catch (error) {
      console.error("Erro ao carregar classes:", error);
      toast.error("Não foi possível carregar classes e matérias.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  const handleSubmit = async () => {
    if (!professorId) {
      toast.error("Não foi possível identificar o professor.");
      return;
    }

    if (!formData.descricao) {
      toast.error("Preencha a descrição da classe");
      return;
    }

    setIsSaving(true);

    try {
      if (editingClass) {
        const { error } = await supabase
          .from("classe")
          .update({
            descricao: formData.descricao,
            materia_id: formData.materia_id ? parseInt(formData.materia_id, 10) : null,
          })
          .eq("id", editingClass.id);

        if (error) throw error;

        toast.success("Classe atualizada!");
      } else {
        const { data, error } = await supabase
          .from("classe")
          .insert({
            descricao: formData.descricao,
            materia_id: formData.materia_id ? parseInt(formData.materia_id, 10) : null,
            professor_id: professorId,
          })
          .select("id, materia_id, descricao, created_at")
          .single();

        if (error) throw error;

        setClasses((prev) => [data as Classe, ...prev]);
        toast.success("Classe criada!");
      }

      await loadData();

      setIsDialogOpen(false);
      setEditingClass(null);
      setFormData({ descricao: "", materia_id: "" });
    } catch (error) {
      console.error("Erro ao salvar classe:", error);
      toast.error("Não foi possível salvar a classe.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (classe: Classe) => {
    setEditingClass(classe);
    setFormData({
      descricao: classe.descricao || "",
      materia_id: classe.materia_id?.toString() || "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteClasseCascade(id);
      setClasses((prev) => prev.filter((c) => c.id !== id));
      toast.success("Classe excluída!");
    } catch (error) {
      console.error("Erro ao excluir classe:", error);
      toast.error("Não foi possível excluir a classe.");
    }
  };

  const handleAddMateria = async () => {
    if (!newMateria.nome) {
      toast.error("Preencha o nome da materia");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("materia")
        .insert({
          nome: newMateria.nome,
          descricao: newMateria.descricao,
        })
        .select("id, nome, descricao")
        .single();

      if (error) throw error;

      setMaterias((prev) => [...prev, data as Materia]);
      setNewMateria({ nome: "", descricao: "" });
      setIsMateriaDialogOpen(false);
      toast.success("Matéria criada!");
    } catch (error) {
      console.error("Erro ao criar matéria:", error);
      toast.error("Não foi possível criar a matéria.");
    }
  };

  const handleOpenStudents = (classe: Classe) => {
    setSelectedClass(classe);
    setIsStudentsDialogOpen(true);
  };

  const getMateriaName = (materiaId: number | null) => {
    if (!materiaId) return "Sem matéria";
    return materias.find((m) => m.id === materiaId)?.nome || "Matéria não encontrada";
  };

  const hasData = useMemo(() => classes.length > 0, [classes.length]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Classes</h3>
          <p className="text-sm text-muted-foreground">
            Gerencie suas turmas e vincule a matérias
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={isMateriaDialogOpen} onOpenChange={setIsMateriaDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Nova Matéria
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Matéria</DialogTitle>
                <DialogDescription>Crie uma nova matéria para vincular as classes</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Nome</Label>
                  <Input
                    value={newMateria.nome}
                    onChange={(e) => setNewMateria({ ...newMateria, nome: e.target.value })}
                    placeholder="Ex: Redes de Computadores"
                  />
                </div>
                <div>
                  <Label>Descricao</Label>
                  <Textarea
                    value={newMateria.descricao}
                    onChange={(e) => setNewMateria({ ...newMateria, descricao: e.target.value })}
                    placeholder="Descrição da matéria"
                  />
                </div>
                <Button onClick={handleAddMateria} className="w-full" disabled={isSaving}>
                  Criar Materia
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={isDialogOpen}
            onOpenChange={(open) => {
              setIsDialogOpen(open);
              if (!open) {
                setEditingClass(null);
                setFormData({ descricao: "", materia_id: "" });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nova Classe
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingClass ? "Editar Classe" : "Nova Classe"}</DialogTitle>
                <DialogDescription>
                  {editingClass ? "Atualize os dados da classe" : "Crie uma nova turma para seus alunos"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Descricao</Label>
                  <Input
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Ex: Turma 2025.1 - Manha"
                  />
                </div>
                <div>
                  <Label>Matéria (opcional)</Label>
                  <Select
                    value={formData.materia_id}
                    onValueChange={(v) => setFormData({ ...formData, materia_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma matéria" />
                    </SelectTrigger>
                    <SelectContent>
                      {materias.map((m) => (
                        <SelectItem key={m.id} value={m.id.toString()}>
                          {m.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={isSaving}>
                  {editingClass ? "Salvar" : "Criar Classe"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando classes...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {classes.map((classe) => (
              <Card key={classe.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{classe.descricao}</CardTitle>
                  <CardDescription>{getMateriaName(classe.materia_id)}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleOpenStudents(classe)}>
                      <Users className="h-4 w-4 mr-1" />
                      Alunos
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleEdit(classe)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(classe.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!hasData && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhuma classe cadastrada</p>
              <p className="text-sm">Clique em "Nova Classe" para começar</p>
            </div>
          )}
        </>
      )}

      {selectedClass && (
        <ClassStudentsDialog
          open={isStudentsDialogOpen}
          onOpenChange={setIsStudentsDialogOpen}
          classe={selectedClass}
          onStudentsChanged={loadData}
        />
      )}
    </div>
  );
}
