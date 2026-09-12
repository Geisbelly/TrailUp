import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  descreverResultado,
  montarPedidoDePresenca,
  registrarPresenca,
  type ClienteRpc,
  type TipoConcessao,
} from "@/lib/presencaDaTurma";

type Aluno = { id: string; nome: string };

type Props = {
  classeId: number | null;
  classeDescricao?: string | null;
  alunos: Aluno[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function hojeLocal(): string {
  // `toISOString()` converteria para UTC e, a noite, registraria a aula do dia
  // seguinte.
  const agora = new Date();
  const mes = String(agora.getMonth() + 1).padStart(2, "0");
  const dia = String(agora.getDate()).padStart(2, "0");
  return `${agora.getFullYear()}-${mes}-${dia}`;
}

export function PresencaDialog({
  classeId,
  classeDescricao,
  alunos,
  open,
  onOpenChange,
}: Props) {
  const [tipo, setTipo] = useState<TipoConcessao>("presenca_aula");
  const [data, setData] = useState(hojeLocal);
  const [pontos, setPontos] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);

  // A turma inteira presente e o caso comum; quem faltou o professor desmarca.
  useEffect(() => {
    if (!open) return;
    setSelecionados(new Set(alunos.map((a) => a.id)));
    setTipo("presenca_aula");
    setData(hojeLocal());
    setPontos("");
  }, [open, alunos]);

  const todosMarcados = alunos.length > 0 && selecionados.size === alunos.length;

  const ajudaDoValor = useMemo(
    () =>
      tipo === "participacao_aula"
        ? "Participação é sempre discricionária: informe quanto vale."
        : "Em branco usa o padrão configurado da turma.",
    [tipo],
  );

  function alternar(id: string) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  async function registrar() {
    const valorDigitado = pontos.trim() === "" ? null : Number(pontos);
    if (valorDigitado !== null && Number.isNaN(valorDigitado)) {
      toast.error("Pontos precisam ser um número.");
      return;
    }

    const pedido = montarPedidoDePresenca({
      classeId,
      tipo,
      // `null` = turma inteira, resolvida no banco; a lista explícita registra
      // exatamente quem o professor viu marcado.
      alunosSelecionados: todosMarcados ? null : Array.from(selecionados),
      valor: valorDigitado,
      data,
      hoje: hojeLocal(),
    });

    if (pedido.erro || !pedido.pedido) {
      toast.error(pedido.erro ?? "Não foi possível montar o registro.");
      return;
    }

    setEnviando(true);
    const { concedidos, erro } = await registrarPresenca(
      supabase as unknown as ClienteRpc,
      pedido.pedido,
    );
    setEnviando(false);

    if (erro) {
      toast.error(erro);
      return;
    }

    const pedidos = todosMarcados ? alunos.length : selecionados.size;
    toast.success(descreverResultado(concedidos, pedidos));
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4" /> Registrar presença
          </DialogTitle>
          <DialogDescription>
            Turma: <span className="font-semibold">{classeDescricao ?? "—"}</span>. Os
            pontos entram no ranking como qualquer outra atividade.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="presenca-tipo">O que registrar</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as TipoConcessao)}>
              <SelectTrigger id="presenca-tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="presenca_aula">Presença</SelectItem>
                <SelectItem value="participacao_aula">Participação</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="presenca-data">Dia da aula</Label>
            <Input
              id="presenca-data"
              type="date"
              value={data}
              max={hojeLocal()}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="presenca-pontos">Pontos</Label>
          <Input
            id="presenca-pontos"
            type="number"
            min={1}
            inputMode="numeric"
            placeholder={tipo === "participacao_aula" ? "obrigatório" : "padrão da turma"}
            value={pontos}
            onChange={(e) => setPontos(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{ajudaDoValor}</p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" /> Quem esteve presente
            </Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setSelecionados(
                  todosMarcados ? new Set() : new Set(alunos.map((a) => a.id)),
                )
              }
            >
              {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
            </Button>
          </div>

          <ScrollArea className="h-56 rounded-md border">
            <div className="p-2 space-y-1">
              {alunos.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum aluno matriculado nesta turma.
                </p>
              ) : (
                alunos.map((aluno) => (
                  <label
                    key={aluno.id}
                    className="flex items-center gap-3 rounded-md p-2 hover:bg-muted cursor-pointer"
                  >
                    <Checkbox
                      checked={selecionados.has(aluno.id)}
                      onCheckedChange={() => alternar(aluno.id)}
                    />
                    <span className="text-sm">{aluno.nome}</span>
                  </label>
                ))
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={registrar}
            disabled={enviando || alunos.length === 0 || selecionados.size === 0}
          >
            {enviando ? "Registrando..." : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PresencaDialog;
