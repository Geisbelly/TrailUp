import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GraduationCap, Loader2 } from "lucide-react";
import type { Materia } from "./types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classForm: { descricao: string; materia_id: string };
  setClassForm: React.Dispatch<React.SetStateAction<{ descricao: string; materia_id: string }>>;
  newMateria: { nome: string; descricao: string };
  setNewMateria: React.Dispatch<React.SetStateAction<{ nome: string; descricao: string }>>;
  materias: Materia[];
  isSaving: boolean;
  /** Deve retornar a classe criada para evitar race conditions no fluxo seguinte */
  handleCreateClass: () => Promise<{ id: number } | null>;
};

export function ClassManagerDialog({
  open,
  onOpenChange,
  classForm,
  setClassForm,
  newMateria,
  setNewMateria,
  materias,
  isSaving,
  handleCreateClass
}: Props) {
  const darkInput = "bg-input border-border text-foreground placeholder:text-muted-foreground focus:border-ring";
  const darkLabel = "text-muted-foreground text-[11px] font-bold uppercase tracking-wider mb-1 block";

  const handleSave = async () => {
    if (!classForm.descricao) {
      toast.error("Descreva a classe");
      return;
    }

    await handleCreateClass();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl bg-background border-border text-foreground flex flex-col max-h-[90vh] overflow-hidden">
        <div className="flex items-center gap-3 pb-1">
          <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center text-primary shrink-0">
            <GraduationCap size={18} />
          </div>
          <div>
            <DialogTitle className="text-lg font-bold text-foreground">Nova Classe / Turma</DialogTitle>
            <DialogDescription className="text-muted-foreground text-xs mt-0.5">
              Crie a turma para gerenciar topicos e conteudos no console.
            </DialogDescription>
          </div>
        </div>

        <ScrollArea className="flex-1 overflow-y-auto pr-1">
          <div className="space-y-4 py-2">
            <div>
              <Label className={darkLabel}>Descrição da turma *</Label>
              <Input
                value={classForm.descricao}
                onChange={(e) => setClassForm({ ...classForm, descricao: e.target.value })}
                className={darkInput}
                placeholder="Ex: Turma 2026.1 - Programação Web"
              />
            </div>

            <div>
              <Label className={darkLabel}>Matéria existente</Label>
              <Select
                value={classForm.materia_id}
                onValueChange={(v) => setClassForm({ ...classForm, materia_id: v })}
              >
                <SelectTrigger className={darkInput}>
                  <SelectValue placeholder="Selecione ou crie uma nova abaixo" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border text-popover-foreground">
                  {materias.map((m) => (
                    <SelectItem key={m.id} value={m.id.toString()} className="focus:bg-primary focus:text-primary-foreground">
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={darkLabel}>Nova matéria <span className="normal-case text-muted-foreground font-normal">(opcional)</span></Label>
              <Input
                value={newMateria.nome}
                onChange={(e) => setNewMateria({ ...newMateria, nome: e.target.value })}
                className={darkInput}
                placeholder="Nome da matéria"
              />
              <Textarea
                value={newMateria.descricao}
                onChange={(e) => setNewMateria({ ...newMateria, descricao: e.target.value })}
                className={`${darkInput} resize-none min-h-[60px]`}
                placeholder="Descrição da matéria"
              />
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-between items-center pt-4 border-t border-border shrink-0 gap-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !classForm.descricao}
            className="bg-primary hover:bg-primary/90 text-primary-foreground min-w-[130px]"
          >
            {isSaving ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</>
            ) : (
              <><GraduationCap className="w-4 h-4 mr-2" />Criar Classe</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

