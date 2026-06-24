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
import { Plus, Pencil, Trash2, FileText, Video, Image, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Conteudo {
  id: number;
  topico_id: number;
  titulo: string;
  tipo: string;
  conteudo: string | null;
  ordem: number | null;
  metadata: Record<string, unknown> | null;
}

interface Topico {
  id: number;
  nome: string;
  classe_id: number;
}

const tiposConteudo = [
  { value: "texto", label: "Texto", icon: FileText },
  { value: "video", label: "Video", icon: Video },
  { value: "imagem", label: "Imagem", icon: Image },
  { value: "link", label: "Link Externo", icon: LinkIcon },
];

export default function ContentsManager() {
  const { user } = useAuth();
  const professorId = user?.id;

  const [conteudos, setConteudos] = useState<Conteudo[]>([]);
  const [topicos, setTopicos] = useState<Topico[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingContent, setEditingContent] = useState<Conteudo | null>(null);
  const [selectedTopicFilter, setSelectedTopicFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    titulo: "",
    tipo: "texto",
    conteudo: "",
    topico_id: "",
    ordem: "1",
    metadata: "",
  });

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
              .order("ordem", { ascending: true })
          : { data: [], error: null };

      if (topicsError) throw topicsError;

      const topicIds = (topicsData ?? []).map((t) => t.id);
      const { data: contentsData, error: contentsError } =
        topicIds.length > 0
          ? await supabase
              .from("conteudos")
              .select("id, topico_id, titulo, tipo, conteudo, ordem, metadata")
              .in("topico_id", topicIds)
              .order("ordem", { ascending: true })
          : { data: [], error: null };

      if (contentsError) throw contentsError;

      setTopicos((topicsData as Topico[]) ?? []);
      setConteudos((contentsData as Conteudo[]) ?? []);
    } catch (error) {
      console.error("Erro ao carregar conteúdos:", error);
      toast.error("Não foi possível carregar os conteúdos.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professorId]);

  const filteredContents =
    selectedTopicFilter === "all"
      ? conteudos
      : conteudos.filter((c) => c.topico_id.toString() === selectedTopicFilter);

  const handleSubmit = async () => {
    if (!formData.titulo || !formData.topico_id) {
      toast.error("Preencha o título e selecione um tópico");
      return;
    }

    setIsSaving(true);

    try {
      if (editingContent) {
        const { error } = await supabase
          .from("conteudos")
          .update({
            titulo: formData.titulo,
            tipo: formData.tipo,
            conteudo: formData.conteudo,
            topico_id: parseInt(formData.topico_id, 10),
            ordem: parseInt(formData.ordem, 10),
            metadata: formData.metadata ? JSON.parse(formData.metadata) : null,
          })
          .eq("id", editingContent.id);

        if (error) throw error;
        toast.success("Conteúdo atualizado!");
      } else {
        const { data, error } = await supabase
          .from("conteudos")
          .insert({
            titulo: formData.titulo,
            tipo: formData.tipo,
            conteudo: formData.conteudo,
            topico_id: parseInt(formData.topico_id, 10),
            ordem: parseInt(formData.ordem, 10),
            metadata: formData.metadata ? JSON.parse(formData.metadata) : null,
          })
          .select("id, topico_id, titulo, tipo, conteudo, ordem, metadata")
          .single();

        if (error) throw error;
        setConteudos((prev) => [...prev, data as Conteudo]);
        toast.success("Conteúdo criado!");
      }

      await loadData();
      setIsDialogOpen(false);
      setEditingContent(null);
      setFormData({ titulo: "", tipo: "texto", conteudo: "", topico_id: "", ordem: "1", metadata: "" });
    } catch (error) {
      console.error("Erro ao salvar conteúdo:", error);
      toast.error("Não foi possível salvar o conteúdo.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = (content: Conteudo) => {
    setEditingContent(content);
    setFormData({
      titulo: content.titulo,
      tipo: content.tipo,
      conteudo: content.conteudo || "",
      topico_id: content.topico_id.toString(),
      ordem: (content.ordem ?? 1).toString(),
      metadata: content.metadata ? JSON.stringify(content.metadata) : "",
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    try {
      const { error } = await supabase.from("conteudos").delete().eq("id", id);
      if (error) throw error;
      setConteudos((prev) => prev.filter((c) => c.id !== id));
      toast.success("Conteúdo excluído!");
    } catch (error) {
      console.error("Erro ao excluir conteúdo:", error);
      toast.error("Não foi possível excluir o conteúdo.");
    }
  };

  const getTopicName = (topicoId: number) => {
    return topicos.find((t) => t.id === topicoId)?.nome || "Tópico não encontrado";
  };

  const getTipoIcon = (tipo: string) => {
    const tipoInfo = tiposConteudo.find((t) => t.value === tipo);
    if (tipoInfo) {
      const Icon = tipoInfo.icon;
      return <Icon className="h-4 w-4" />;
    }
    return <FileText className="h-4 w-4" />;
  };

  const hasData = useMemo(() => conteudos.length > 0, [conteudos.length]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Conteudos</h3>
          <p className="text-sm text-muted-foreground">Gerencie textos, videos e materiais de estudo</p>
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
                setEditingContent(null);
                setFormData({ titulo: "", tipo: "texto", conteudo: "", topico_id: "", ordem: "1", metadata: "" });
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Novo Conteudo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingContent ? "Editar Conteúdo" : "Novo Conteúdo"}</DialogTitle>
                <DialogDescription>
                  {editingContent ? "Atualize os dados do conteúdo" : "Crie um novo conteúdo"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Título *</Label>
                  <Input
                    value={formData.titulo}
                    onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                    placeholder="Ex: O que são Redes?"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Tipo</Label>
                    <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposConteudo.map((tipo) => (
                          <SelectItem key={tipo.value} value={tipo.value}>
                            {tipo.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Tópico *</Label>
                    <Select
                      value={formData.topico_id}
                      onValueChange={(v) => setFormData({ ...formData, topico_id: v })}
                    >
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
                </div>

                <div>
                  <Label>Conteudo</Label>
                  <Textarea
                    value={formData.conteudo}
                    onChange={(e) => setFormData({ ...formData, conteudo: e.target.value })}
                    placeholder="Texto, URL ou descrição"
                    rows={3}
                  />
                </div>

                <div>
                  <Label>Metadata (JSON opcional)</Label>
                  <Textarea
                    value={formData.metadata}
                    onChange={(e) => setFormData({ ...formData, metadata: e.target.value })}
                    placeholder='{"duracao": "10min"}'
                    rows={2}
                  />
                </div>

                <div>
                  <Label>Ordem</Label>
                  <Input
                    type="number"
                    value={formData.ordem}
                    onChange={(e) => setFormData({ ...formData, ordem: e.target.value })}
                    min="1"
                  />
                </div>
                <Button onClick={handleSubmit} className="w-full" disabled={isSaving}>
                  {editingContent ? "Salvar" : "Criar Conteúdo"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Carregando conteudos...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredContents.map((content) => (
              <Card key={content.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {getTipoIcon(content.tipo)}
                    {content.titulo}
                  </CardTitle>
                  <CardDescription>{getTopicName(content.topico_id)}</CardDescription>
                </CardHeader>
                <CardContent>
                  {content.conteudo && (
                    <p className="text-sm text-muted-foreground mb-3">{content.conteudo}</p>
                  )}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(content)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(content.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {!hasData && (
            <div className="text-center py-12 text-muted-foreground">
              <p>Nenhum conteúdo cadastrado</p>
              <p className="text-sm">Clique em "Novo Conteúdo" para começar</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
