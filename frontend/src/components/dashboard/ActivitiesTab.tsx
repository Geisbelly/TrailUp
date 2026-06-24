import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Link2 } from "lucide-react";
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

interface Activity {
  id: number;
  titulo: string;
  topico: string;
  tipo: string;
  pontuacaoMaxima: number;
  dataEntrega: string;
  topicIds: number[];
  contentIds: number[];
}

interface Topic {
  id: number;
  nome: string;
}

interface Content {
  id: number;
  titulo: string;
}

export default function ActivitiesTab() {
  const [activities, setActivities] = useState<Activity[]>([
    { id: 1, titulo: "Exercícios de Equações", topico: "Álgebra Básica", tipo: "exercicio", pontuacaoMaxima: 10, dataEntrega: "2025-12-15", topicIds: [1], contentIds: [1] },
    { id: 2, titulo: "Prova de Geometria", topico: "Geometria Plana", tipo: "prova", pontuacaoMaxima: 20, dataEntrega: "2025-12-20", topicIds: [2], contentIds: [] },
  ]);

  const [topics] = useState<Topic[]>([
    { id: 1, nome: "Álgebra Básica" },
    { id: 2, nome: "Geometria Plana" },
  ]);

  const [contents] = useState<Content[]>([
    { id: 1, titulo: "Introdução à Álgebra" },
    { id: 2, titulo: "Vídeo: Equações do 1º Grau" },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [linkingActivity, setLinkingActivity] = useState<Activity | null>(null);
  const [linkType, setLinkType] = useState<"topic" | "content">("topic");
  const [formData, setFormData] = useState({ 
    titulo: "", 
    topico: "", 
    tipo: "exercicio", 
    pontuacaoMaxima: 10, 
    dataEntrega: "" 
  });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingActivity) {
      setActivities(activities.map(a => 
        a.id === editingActivity.id ? { ...a, ...formData } : a
      ));
      toast.success("Atividade atualizada com sucesso!");
    } else {
      const newActivity: Activity = {
        id: Math.max(...activities.map(a => a.id), 0) + 1,
        ...formData,
        topicIds: [],
        contentIds: [],
      };
      setActivities([...activities, newActivity]);
      toast.success("Atividade criada com sucesso!");
    }
    handleDialogClose();
  };

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setFormData(activity);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setActivities(activities.filter(a => a.id !== id));
    toast.success("Atividade excluída com sucesso!");
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingActivity(null);
    setFormData({ titulo: "", topico: "", tipo: "exercicio", pontuacaoMaxima: 10, dataEntrega: "" });
  };

  const handleOpenLinkDialog = (activity: Activity, type: "topic" | "content") => {
    setLinkingActivity(activity);
    setLinkType(type);
    const currentIds = type === "topic" ? activity.topicIds : activity.contentIds;
    setSelectedIds(currentIds);
    setIsLinkDialogOpen(true);
  };

  const handleLinkSubmit = () => {
    if (!linkingActivity) return;

    const updatedActivities = activities.map(a => {
      if (a.id === linkingActivity.id) {
        if (linkType === "topic") {
          return { ...a, topicIds: selectedIds };
        } else {
          return { ...a, contentIds: selectedIds };
        }
      }
      return a;
    });

    setActivities(updatedActivities);
    toast.success(`${linkType === "topic" ? "Tópicos" : "Conteúdos"} vinculados com sucesso!`);
    setIsLinkDialogOpen(false);
    setLinkingActivity(null);
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
          <h2 className="text-3xl font-bold">Gerenciar Atividades</h2>
          <p className="text-muted-foreground mt-1">Crie exercícios e avaliações</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleDialogClose()}>
              <Plus className="mr-2 h-4 w-4" />
              Nova Atividade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingActivity ? "Editar Atividade" : "Nova Atividade"}</DialogTitle>
                <DialogDescription>
                  {editingActivity ? "Atualize os dados da atividade" : "Preencha os dados da nova atividade"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="titulo">Título</Label>
                  <Input
                    id="titulo"
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="topico">Tópico</Label>
                    <Input
                      id="topico"
                      value={formData.topico}
                      onChange={(e) => setFormData({ ...formData, topico: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo</Label>
                    <Input
                      id="tipo"
                      value={formData.tipo}
                      onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="pontuacao">Pontuação Máxima</Label>
                    <Input
                      id="pontuacao"
                      type="number"
                      value={formData.pontuacaoMaxima}
                      onChange={(e) => setFormData({ ...formData, pontuacaoMaxima: Number(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="dataEntrega">Data de Entrega</Label>
                    <Input
                      id="dataEntrega"
                      type="date"
                      value={formData.dataEntrega}
                      onChange={(e) => setFormData({ ...formData, dataEntrega: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  Cancelar
                </Button>
                <Button type="submit">{editingActivity ? "Atualizar" : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {activities.map((activity) => (
          <Card key={activity.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle>{activity.titulo}</CardTitle>
                  <CardDescription>{activity.topico}</CardDescription>
                </div>
                <span className="text-xs px-2 py-1 bg-secondary text-secondary-foreground rounded-md">
                  {activity.tipo}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>Pontuação: {activity.pontuacaoMaxima} pts</p>
                {activity.dataEntrega && <p>Entrega: {new Date(activity.dataEntrega).toLocaleDateString()}</p>}
                <p>{activity.topicIds.length} tópico(s) vinculado(s)</p>
                <p>{activity.contentIds.length} conteúdo(s) vinculado(s)</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(activity, "topic")}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Tópicos
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(activity, "content")}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Conteúdos
                </Button>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(activity)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(activity.id)}>
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
              Vincular {linkType === "topic" ? "Tópicos" : "Conteúdos"}
            </DialogTitle>
            <DialogDescription>
              Selecione os itens que deseja vincular a esta atividade
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
            {(linkType === "topic" ? topics : contents).map((item) => (
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
                  {item.titulo || item.nome}
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
