import { useId, useState } from "react";
import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_CHARS_ORIENTACAO, temOrientacao } from "./orientacaoDaTurma";
import type { EstadoDaOrientacao } from "./useOrientacaoDaIa";

type Props = {
  estado: EstadoDaOrientacao;
  /** Onde a orientação vale, numa frase curta para o professor. */
  onde: string;
  /** Começa aberto (por exemplo, quando já existe orientação). */
  abertoDeInicio?: boolean;
};

/** Painel recolhível com o que pedir e o que evitar, salvo por turma. */
export function OrientacaoDaIa({ estado, onde, abertoDeInicio = false }: Props) {
  const { texto, setTexto, carregando, salvando, alterada, salvar } = estado;
  const [aberto, setAberto] = useState(abertoDeInicio);
  const id = useId();
  const ativa = temOrientacao(texto);

  return (
    <div className="rounded-[14px] border border-border bg-muted/40">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={`${id}-painel`}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <SlidersHorizontal className="h-4 w-4 flex-none text-primary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold">Orientação para a IA</span>
          <span className="block truncate text-[11px] text-muted-foreground">
            {carregando ? "Carregando…" : ativa ? `Em uso: ${onde}` : `Nenhuma. Vale para ${onde}`}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 flex-none transition-transform ${aberto ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>
      {aberto && (
        <div id={`${id}-painel`} className="space-y-3 border-t border-border px-3 pb-3 pt-3">
          <p className="text-[11.5px] text-muted-foreground">
            Fica salva na turma e vale para a trilha com IA, o ajuste de tópico e as sugestões de cards e atividades.
          </p>
          <div>
            <Label htmlFor={`${id}-pedir`} className="mb-1 block text-xs font-semibold">
              Peça à IA
            </Label>
            <Textarea
              id={`${id}-pedir`}
              value={texto.pedir}
              maxLength={MAX_CHARS_ORIENTACAO}
              onChange={(e) => setTexto((t) => ({ ...t, pedir: e.target.value }))}
              rows={3}
              disabled={carregando}
              placeholder="Ex.: questões com trechos de código SQL; exemplos do dia a dia de uma loja; mais questões de aplicação que de definição."
              className="rounded-[12px] bg-background text-[13px]"
            />
            <p className="mt-0.5 text-right text-[10.5px] text-muted-foreground">
              {texto.pedir.length}/{MAX_CHARS_ORIENTACAO}
            </p>
          </div>
          <div>
            <Label htmlFor={`${id}-evitar`} className="mb-1 block text-xs font-semibold">
              Evite
            </Label>
            <Textarea
              id={`${id}-evitar`}
              value={texto.evitar}
              maxLength={MAX_CHARS_ORIENTACAO}
              onChange={(e) => setTexto((t) => ({ ...t, evitar: e.target.value }))}
              rows={3}
              disabled={carregando}
              placeholder="Ex.: pegadinhas de nomenclatura; perguntas de decorar data ou autor; verdadeiro ou falso."
              className="rounded-[12px] bg-background text-[13px]"
            />
            <p className="mt-0.5 text-right text-[10.5px] text-muted-foreground">
              {texto.evitar.length}/{MAX_CHARS_ORIENTACAO}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2">
            {alterada && <span className="text-[11px] text-muted-foreground">Alterações não salvas</span>}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={!alterada || salvando || carregando}
              onClick={() => void salvar()}
            >
              {salvando && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
              Salvar para a turma
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
