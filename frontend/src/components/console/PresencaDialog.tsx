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
import SegmentedPills from "./dashboard/SegmentedPills";
import {
  descreverResultado,
  montarPedidoDePresenca,
  registrarPresenca,
  type ClienteRpc,
  type TipoConcessao,
} from "@/lib/presencaDaTurma";

type Aluno = { id: string; nome: string };

const TIPOS: { value: TipoConcessao; label: string }[] = [
  { value: "presenca_aula", label: "Presença" },
  { value: "participacao_aula", label: "Participação" },
];

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

  // Só o visual mudou (protótipo 287-360); as regras continuam em presencaDaTurma.ts.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88vh] max-w-[560px] flex-col gap-0 overflow-hidden rounded-[20px] border-[hsl(var(--console-violet))] bg-card p-0">
        <DialogHeader className="flex-none space-y-0 border-b border-border px-[26px] pb-[18px] pt-[22px] pr-14 text-left">
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[hsl(var(--console-violet)/.16)]">
              <CalendarCheck className="h-4 w-4 text-[hsl(var(--console-violet-text))]" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-[19px]">Registrar presença</DialogTitle>
              <DialogDescription className="mt-[3px] text-[12.5px] text-muted-foreground">
                Turma: <span className="font-semibold text-[hsl(var(--console-violet-text))]">{classeDescricao ?? "—"}</span>. Os
                pontos entram no ranking como qualquer outra atividade.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-[26px] py-5">
          <div className="grid gap-3.5 sm:grid-cols-2">
            <div>
              <div id="presenca-tipo-rotulo" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                O que registrar
              </div>
              <SegmentedPills ariaLabel="O que registrar" opcoes={TIPOS} valor={tipo} onChange={(v) => setTipo(v)} className="mt-[9px] w-fit" />
            </div>

            <div>
              <Label htmlFor="presenca-data" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Dia da aula
              </Label>
              <Input
                id="presenca-data"
                type="date"
                value={data}
                max={hojeLocal()}
                onChange={(e) => setData(e.target.value)}
                className="mt-[9px] rounded-[14px] bg-muted"
              />
            </div>
          </div>

          <div className="mt-4">
            <Label htmlFor="presenca-pontos" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              Pontos
            </Label>
            <Input
              id="presenca-pontos"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder={tipo === "participacao_aula" ? "obrigatório" : "padrão da turma"}
              value={pontos}
              onChange={(e) => setPontos(e.target.value)}
              aria-describedby="presenca-pontos-ajuda"
              className="mt-[9px] w-[180px] rounded-[14px] bg-muted"
            />
            <p id="presenca-pontos-ajuda" className="mt-[7px] text-[11.5px] leading-normal text-muted-foreground">
              {ajudaDoValor}
            </p>
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="flex items-center gap-2.5">
              <Users className="h-[15px] w-[15px] text-muted-foreground" aria-hidden="true" />
              <span id="presenca-alunos-rotulo" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Quem esteve presente
              </span>
              <button
                type="button"
                disabled={alunos.length === 0}
                onClick={() => setSelecionados(todosMarcados ? new Set() : new Set(alunos.map((a) => a.id)))}
                className="ml-auto rounded-full border border-border bg-muted px-[13px] py-1.5 text-[11.5px] font-semibold text-[hsl(var(--console-violet-text))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
              >
                {todosMarcados ? "Desmarcar todos" : "Marcar todos"}
              </button>
            </div>

            {alunos.length === 0 ? (
              <p className="mt-3 text-[13px] text-muted-foreground">Nenhum aluno matriculado nesta turma.</p>
            ) : (
              <ScrollArea className="mt-2.5 max-h-[220px] rounded-[14px] border border-border bg-background">
                <div role="group" aria-labelledby="presenca-alunos-rotulo" className="flex flex-col gap-1.5 p-2">
                  {alunos.map((aluno) => (
                    <label key={aluno.id} className="flex cursor-pointer items-center gap-[11px] rounded-[10px] px-[11px] py-[9px] hover:bg-muted">
                      <Checkbox checked={selecionados.has(aluno.id)} onCheckedChange={() => alternar(aluno.id)} />
                      <span className={selecionados.has(aluno.id) ? "text-[13.5px] text-foreground" : "text-[13.5px] text-muted-foreground"}>{aluno.nome}</span>
                    </label>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </div>

        <div className="flex flex-none items-center gap-3 border-t border-border px-[26px] py-4">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="ml-auto rounded-full px-[22px] font-bold" onClick={registrar} disabled={enviando || alunos.length === 0 || selecionados.size === 0}>
            {enviando ? "Registrando..." : "Registrar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PresencaDialog;
