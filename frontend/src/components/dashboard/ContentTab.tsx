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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

interface Content {
  id: number;
  titulo: string;
  tipo: string;
  topico: string;
  descricao: string;
  topicIds: number[];
}

interface Topic {
  id: number;
  nome: string;
}

export default function ContentTab() {
  const [contents, setContents] = useState<Content[]>([
    { id: 1, titulo: "Introdução à Álgebra", tipo: "texto", topico: "Álgebra Básica", descricao: "Conceitos fundamentais de álgebra", topicIds: [1] },
    { id: 2, titulo: "Vídeo: Equações do 1º Grau", tipo: "video", topico: "Álgebra Básica", descricao: "Resolução de equações simples", topicIds: [1] },
  ]);

  const [topics] = useState<Topic[]>([
    { id: 1, nome: "Álgebra Básica" },
    { id: 2, nome: "Geometria Plana" },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<Content | null>(null);
  const [linkingContent, setLinkingContent] = useState<Content | null>(null);
  const [formData, setFormData] = useState({ titulo: "", tipo: "texto", topico: "", descricao: "" });
  const [selectedTopicIds, setSelectedTopicIds] = useState<number[]>([]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingContent) {
      setContents(contents.map(c => 
        c.id === editingContent.id ? { ...c, ...formData } : c
      ));
      toast.success("Conteúdo atualizado com sucesso!");
    } else {
      const newContent: Content = {
        id: Math.max(...contents.map(c => c.id), 0) + 1,
        ...formData,
        topicIds: [],
      };
      setContents([...contents, newContent]);
      toast.success("Conteúdo criado com sucesso!");
    }
    handleDialogClose();
  };

  const handleEdit = (content: Content) => {
    setEditingContent(content);
    setFormData(content);
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    setContents(contents.filter(c => c.id !== id));
    toast.success("Conteúdo excluído com sucesso!");
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingContent(null);
    setFormData({ titulo: "", tipo: "texto", topico: "", descricao: "" });
  };

  const handleOpenLinkDialog = (content: Content) => {
    setLinkingContent(content);
    setSelectedTopicIds(content.topicIds);
    setIsLinkDialogOpen(true);
  };

  const handleLinkSubmit = () => {
    if (!linkingContent) return;

    const updatedContents = contents.map(c => 
      c.id === linkingContent.id ? { ...c, topicIds: selectedTopicIds } : c
    );

    setContents(updatedContents);
    toast.success("Tópicos vinculados com sucesso!");
    setIsLinkDialogOpen(false);
    setLinkingContent(null);
    setSelectedTopicIds([]);
  };

  const toggleTopicSelection = (id: number) => {
    setSelectedTopicIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold">Gerenciar Conteúdos</h2>
          <p className="text-muted-foreground mt-1">Crie e organize materiais de estudo</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => handleDialogClose()}>
              <Plus className="mr-2 h-4 w-4" />
              Novo Conteúdo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingContent ? "Editar Conteúdo" : "Novo Conteúdo"}</DialogTitle>
                <DialogDescription>
                  {editingContent ? "Atualize os dados do conteúdo" : "Preencha os dados do novo conteúdo"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="titulo">Título</Label>
                    <Input
                      id="titulo"
                      value={formData.titulo}
                      onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tipo">Tipo</Label>
                    <Select value={formData.tipo} onValueChange={(value) => setFormData({ ...formData, tipo: value })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="texto">Texto</SelectItem>
                        <SelectItem value="video">Vídeo</SelectItem>
                        <SelectItem value="pdf">PDF</SelectItem>
                        <SelectItem value="slides">Slides</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
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
                  <Label htmlFor="descricao">Descrição</Label>
                  <Textarea
                    id="descricao"
                    value={formData.descricao}
                    onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                    rows={4}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={handleDialogClose}>
                  Cancelar
                </Button>
                <Button type="submit">{editingContent ? "Atualizar" : "Criar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {contents.map((content) => (
          <Card key={content.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle>{content.titulo}</CardTitle>
                  <CardDescription>{content.topico}</CardDescription>
                </div>
                <span className="text-xs px-2 py-1 bg-primary/10 text-primary rounded-md">
                  {content.tipo}
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{content.descricao}</p>
              
              <div className="text-sm text-muted-foreground">
                {content.topicIds.length} tópico(s) vinculado(s)
              </div>

              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleOpenLinkDialog(content)}
                >
                  <Link2 className="h-3 w-3 mr-1" />
                  Tópicos
                </Button>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(content)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(content.id)}>
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
            <DialogTitle>Vincular Tópicos</DialogTitle>
            <DialogDescription>
              Selecione os tópicos aos quais este conteúdo pertence
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[400px] overflow-y-auto">
            {topics.map((topic) => (
              <div key={topic.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`topic-${topic.id}`}
                  checked={selectedTopicIds.includes(topic.id)}
                  onCheckedChange={() => toggleTopicSelection(topic.id)}
                />
                <label
                  htmlFor={`topic-${topic.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  {topic.nome}
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
