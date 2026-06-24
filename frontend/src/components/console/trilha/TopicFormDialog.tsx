import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import type { Classe, Topico } from "./types";

type TopicFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  formData: { nome: string; descricao: string; classe_id: string; ordem: string };
  setFormData: (data: { nome: string; descricao: string; classe_id: string; ordem: string }) => void;
  isSaving: boolean;
  handleSubmit: () => void;
  editingTopic: Topico | null;
  classes: Classe[];
  selectedClassFilter: string;
};

export function TopicFormDialog({
  open,
  onOpenChange,
  formData,
  setFormData,
  isSaving,
  handleSubmit,
  editingTopic,
  classes,
  selectedClassFilter,
}: TopicFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Novo Topico
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingTopic ? "Editar tópico" : "Novo tópico"}</DialogTitle>
          <DialogDescription>
            {editingTopic ? "Atualize os dados do tópico" : "Crie um novo tópico de estudo"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Nome *</Label>
            <Input
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
              placeholder="Ex: Introdução a Redes"
            />
          </div>
          <div>
            <Label>Descricao</Label>
            <Textarea
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              placeholder="Descrição do tópico"
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
          <p className="text-xs text-muted-foreground">
            Classe selecionada:{" "}
            {classes.find((c) => c.id.toString() === (formData.classe_id || selectedClassFilter))?.descricao ||
              classes.find((c) => c.id.toString() === selectedClassFilter)?.descricao ||
              "Nenhuma"}
          </p>
          <Button onClick={handleSubmit} className="w-full" disabled={isSaving}>
            {editingTopic ? "Salvar" : "Criar Tópico"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
