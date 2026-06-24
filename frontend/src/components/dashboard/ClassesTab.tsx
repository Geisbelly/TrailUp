import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Link2, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Class {
  id: number;
  materia: string;
  descricao: string;
  totalAlunos: number;
  topicIds: number[];
  studentIds: number[];
}

interface Topic {
  id: number;
  nome: string;
}

interface Student {
  id: number;
  nome: string;
}

export default function ClassesTab() {
  const [classes, setClasses] = useState<Class[]>([
    { id: 1, materia: "Matemática - 1º Ano", descricao: "Turma de matemática básica", totalAlunos: 25, topicIds: [1], studentIds: [1] },
    { id: 2, materia: "Física - 2º Ano", descricao: "Mecânica e termodinâmica", totalAlunos: 30, topicIds: [2], studentIds: [2] },
  ]);

  const [topics] = useState<Topic[]>([
    { id: 1, nome: "Álgebra Básica" },
    { id: 2, nome: "Geometria Plana" },
  ]);

  const [students] = useState<Student[]>([
    { id: 1, nome: "João Silva" },
    { id: 2, nome: "Maria Santos" },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<Class | null>(null);
  const [linkingClass, setLinkingClass] = useState<Class | null>(null);
  const [linkType, setLinkType] = useState<"topic" | "student">("topic");
  const [formData, setFormData] = useState({ materia: "", descricao: "" });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClass) {
      setClasses(classes.map(c => 
        c.id === editingClass.id 
          ? { ...c, ...formData }
          : c
      ));
      toast.success("Classe atualizada com sucesso!");
    } else {
      const newClass: Class = {
        id: Math.max(...classes.map(c => c.id), 0) + 1,
        ...formData,
        totalAlunos: 0,
        topicIds: [],
        studentIds: [],
      };
      setClasses([...classes, newClass]);
      toast.success("Classe criada com sucesso!");
    }
    setIsDialogOpen(false);
    setEditingClass(null);
    setFormData({ materia: "", descricao: "" });
  };

  const handleEdit = (classItem: Class) => {
    setEditingClass(classItem);
    setFormData({ materia: classItem.materia, descricao: classItem.descricao });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setClasses(classes.filter(c => c.id !== id));
    toast.success("Classe excluída com sucesso!");
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingClass(null);
    setFormData({ materia: "", descricao: "" });
  };

  const handleOpenLinkDialog = (classItem: Class, type: "topic" | "student") => {
    setLinkingClass(classItem);
    setLinkType(type);
    const currentIds = type === "topic" ? classItem.topicIds : classItem.studentIds;
    setSelectedIds(currentIds);
    setIsLinkDialogOpen(true);
  };

  const handleLinkSubmit = () => {
    if (!linkingClass) return;

    const updatedClasses = classes.map(c => {
      if (c.id === linkingClass.id) {
        if (linkType === "topic") {
          return { ...c, topicIds: selectedIds };
        } else {
          return { ...c, studentIds: selectedIds, totalAlunos: selectedIds.length };
        }
      }
      return c;
    });

    setClasses(updatedClasses);
    toast.success(`${linkType === "topic" ? "Tópicos" : "Alunos"} vinculados com sucesso!`);
    setIsLinkDialogOpen(false);
    setLinkingClass(null);
    setSelectedIds([]);
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Gerenciar Classes</h2>
          <p className="text-muted-foreground mt-1">Crie e gerencie suas turmas</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleDialogClose()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Classe
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingClass ? "Editar Classe" : "Nova Classe"}</DialogTitle>
                <DialogDescription>
                  {editingClass ? "Atualize os dados da classe" : "Preencha os dados da nova classe"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="materia">Matéria/Nome da Classe</Label>
                  <Input
                    id="materia"
                    value={formData.materia}
                    onChange={(e) => setFormData({ ...formData, materia: e.target.value })}
                    placeholder="Ex: Matemática - 1º Ano"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    placeholder="Descrição da classe"
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  Cancelar
                </Button>
                <Button type="submit">{editingClass ? "Atualizar" : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {classes.map((classItem) => (
          <Card key={classItem.id}>
            <CardHeader>
              <CardTitle>{classItem.materia}</CardTitle>
              <CardDescription>{classItem.descricao}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{classItem.totalAlunos} aluno(s)</p>
                <p>{classItem.topicIds.length} tópico(s) vinculado(s)</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(classItem, "topic")}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Tópicos
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(classItem, "student")}
                >
                  <Users className="h-3 w-3 mr-1" />
                  Alunos
                </Button>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEdit(classItem)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(classItem.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Vincular {linkType === "topic" ? "Tópicos" : "Alunos"}
            </DialogTitle>
            <DialogDescription>
              Selecione os itens que deseja vincular a esta classe
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
            {(linkType === "topic" ? topics : students).map((item) => (
              <div key={item.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`item-${item.id}`}
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={() => toggleSelection(item.id)}
                />
                <label
                  htmlFor={`item-${item.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {item.nome}
                </label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsLinkDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleLinkSubmit}>Salvar Vínculos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
