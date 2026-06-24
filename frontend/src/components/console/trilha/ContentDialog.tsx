import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowUpDown, Plus } from "lucide-react";
import type { Conteudo, Topico } from "./types";

type ContentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contentTopic: Topico | null;
  contents: Conteudo[];
  selectedContentId: number | null;
  setSelectedContentId: (id: number | null) => void;
  contentForm: { titulo: string; tipo: string; conteudo: string };
  setContentForm: (data: { titulo: string; tipo: string; conteudo: string }) => void;
  isSavingContent: boolean;
  saveContentOrder: () => Promise<void>;
  handleContentReorder: (targetId: number) => (event: React.DragEvent) => void;
  allowDrop: (event: React.DragEvent) => void;
  handleCreateContent: () => Promise<void>;
};

export function ContentDialog({
  open,
  onOpenChange,
  contentTopic,
  contents,
  selectedContentId,
  setSelectedContentId,
  contentForm,
  setContentForm,
  isSavingContent,
  saveContentOrder,
  handleContentReorder,
  allowDrop,
  handleCreateContent,
}: ContentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Conteudos do topico: {contentTopic?.nome}</DialogTitle>
          <DialogDescription>Reordene os conteudos, visualize detalhes ou crie novos.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">Fila de conteúdos</h4>
              <Button size="sm" variant="outline" onClick={saveContentOrder} disabled={isSavingContent}>
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Salvar ordem
              </Button>
            </div>
            <div className="space-y-2">
              {contents.map((c) => (
                <div
                  key={c.id}
                  className={`p-2 border rounded flex items-center justify-between cursor-move ${
                    selectedContentId === c.id ? "border-primary" : ""
                  }`}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", c.id.toString())}
                  onDragOver={allowDrop}
                  onDrop={handleContentReorder(c.id)}
                  onClick={() => setSelectedContentId(c.id)}
                >
                  <div>
                    <p className="font-medium text-sm">{c.titulo}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.tipo} {c.ordem ? `- Ordem ${c.ordem}` : ""}
                    </p>
                  </div>
                </div>
              ))}
              {contents.length === 0 && <p className="text-sm text-muted-foreground">Nenhum conteúdo ainda.</p>}
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Novo conteúdo</h4>
            <div className="space-y-2">
              <div>
                <Label>Título</Label>
                <Input
                  value={contentForm.titulo}
                  onChange={(e) => setContentForm({ ...contentForm, titulo: e.target.value })}
                />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={contentForm.tipo} onValueChange={(v) => setContentForm({ ...contentForm, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="texto">Texto</SelectItem>
                    <SelectItem value="video">Vídeo</SelectItem>
                    <SelectItem value="imagem">Imagem</SelectItem>
                    <SelectItem value="link">Link</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Conteúdo / URL</Label>
                <Textarea
                  value={contentForm.conteudo}
                  onChange={(e) => setContentForm({ ...contentForm, conteudo: e.target.value })}
                  rows={3}
                />
              </div>
              <Button onClick={handleCreateContent} disabled={isSavingContent || !contentTopic}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar conteudo
              </Button>
            </div>

            <div className="mt-4 border rounded p-3">
              <h4 className="font-semibold text-sm">Detalhes do conteúdo</h4>
              {selectedContentId ? (
                (() => {
                  const c = contents.find((ct) => ct.id === selectedContentId);
                  if (!c) return <p className="text-sm text-muted-foreground">Selecione um conteúdo.</p>;
                  return (
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">{c.titulo}</p>
                      <p className="text-muted-foreground">Tipo: {c.tipo}</p>
                      <p className="text-muted-foreground">Ordem: {c.ordem}</p>
                      {c.conteudo && (
                        <p className="text-muted-foreground">
                          Conteúdo: <span className="font-medium break-words">{c.conteudo}</span>
                        </p>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="text-sm text-muted-foreground">Selecione um conteúdo para ver detalhes.</p>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
