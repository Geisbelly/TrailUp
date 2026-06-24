/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Pencil, Trash2, Link2, Unlink } from "lucide-react";
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

interface Topic {
  id: number;
  nome: string;
  descricao: string;
  contentIds: number[];
  activityIds: number[];
  classIds: number[];
}

interface Content {
  id: number;
  titulo: string;
}

interface Activity {
  id: number;
  titulo: string;
}

interface Class {
  id: number;
  materia: string;
}

export default function TopicsTab() {
  const [topics, setTopics] = useState<Topic[]>([
    { 
      id: 1, 
      nome: "Álgebra Básica", 
      descricao: "Fundamentos de álgebra", 
      contentIds: [1],
      activityIds: [1],
      classIds: [1]
    },
    { 
      id: 2, 
      nome: "Geometria Plana", 
      descricao: "Formas e áreas", 
      contentIds: [],
      activityIds: [2],
      classIds: [2]
    },
  ]);

  // Mock data for linking
  const [contents] = useState<Content[]>([
    { id: 1, titulo: "Introdução à Álgebra" },
    { id: 2, titulo: "Vídeo: Equações do 1º Grau" },
  ]);

  const [activities] = useState<Activity[]>([
    { id: 1, titulo: "Exercícios de Equações" },
    { id: 2, titulo: "Prova de Geometria" },
  ]);

  const [classes] = useState<Class[]>([
    { id: 1, materia: "Matemática - 1º Ano" },
    { id: 2, materia: "Física - 2º Ano" },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [linkingTopic, setLinkingTopic] = useState<Topic | null>(null);
  const [linkType, setLinkType] = useState<"content" | "activity" | "class">("content");
  const [formData, setFormData] = useState({ nome: "", descricao: "" });
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTopic) {
      setTopics(topics.map(t => 
        t.id === editingTopic.id ? { ...t, ...formData } : t
      ));
      toast.success("Tópico atualizado com sucesso!");
    } else {
      const newTopic: Topic = {
        id: Math.max(...topics.map(t => t.id), 0) + 1,
        ...formData,
        contentIds: [],
        activityIds: [],
        classIds: [],
      };
      setTopics([...topics, newTopic]);
      toast.success("Tópico criado com sucesso!");
    }
    handleDialogClose();
  };

  const handleEdit = (topic: Topic) => {
    setEditingTopic(topic);
    setFormData({ nome: topic.nome, descricao: topic.descricao });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setTopics(topics.filter(t => t.id !== id));
    toast.success("Tópico excluído com sucesso!");
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingTopic(null);
    setFormData({ nome: "", descricao: "" });
  };

  const handleOpenLinkDialog = (topic: Topic, type: "content" | "activity" | "class") => {
    setLinkingTopic(topic);
    setLinkType(type);
    const currentIds = type === "content" ? topic.contentIds : 
                       type === "activity" ? topic.activityIds : 
                       topic.classIds;
    setSelectedIds(currentIds);
    setIsLinkDialogOpen(true);
  };

  const handleLinkSubmit = () => {
    if (!linkingTopic) return;

    const updatedTopics = topics.map(t => {
      if (t.id === linkingTopic.id) {
        if (linkType === "content") {
          return { ...t, contentIds: selectedIds };
        } else if (linkType === "activity") {
          return { ...t, activityIds: selectedIds };
        } else {
          return { ...t, classIds: selectedIds };
        }
      }
      return t;
    });

    setTopics(updatedTopics);
    toast.success(`${linkType === "content" ? "Conteúdos" : linkType === "activity" ? "Atividades" : "Classes"} vinculadas com sucesso!`);
    setIsLinkDialogOpen(false);
    setLinkingTopic(null);
    setSelectedIds([]);
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getLinkItems = () => {
    if (linkType === "content") return contents;
    if (linkType === "activity") return activities;
    return classes;
  };

  const getItemTitle = (item: any) => {
    return item.titulo || item.materia;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Gerenciar Tópicos</h2>
          <p className="text-muted-foreground mt-1">Organize conteúdos e atividades por tópicos</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleDialogClose()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Tópico
            </Button>
          </DialogTrigger>
          <DialogContent>
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingTopic ? "Editar Tópico" : "Novo Tópico"}</DialogTitle>
                <DialogDescription>
                  {editingTopic ? "Atualize os dados do tópico" : "Preencha os dados do novo tópico"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="nome">Nome do Tópico</Label>
                  <Input
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={3}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  Cancelar
                </Button>
                <Button type="submit">{editingTopic ? "Atualizar" : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {topics.map((topic) => (
          <Card key={topic.id}>
            <CardHeader>
              <CardTitle>{topic.nome}</CardTitle>
              <CardDescription>{topic.descricao}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{topic.contentIds.length} conteúdo(s) vinculado(s)</p>
                <p>{topic.activityIds.length} atividade(s) vinculada(s)</p>
                <p>{topic.classIds.length} classe(s) vinculada(s)</p>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(topic, "content")}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Conteúdos
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(topic, "activity")}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Atividades
                </Button>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(topic, "class")}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Classes
                </Button>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(topic)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(topic.id)}>
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
              Vincular {linkType === "content" ? "Conteúdos" : linkType === "activity" ? "Atividades" : "Classes"}
            </DialogTitle>
            <DialogDescription>
              Selecione os itens que deseja vincular a este tópico
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
            {getLinkItems().map((item) => (
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
                  {getItemTitle(item)}
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
