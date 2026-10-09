import { ArrowDown, ArrowLeft, ArrowUp, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PROFILE_LABEL, type BrainHexProfileKey } from "@/features/signup/brainhex";
import {
  AFIRMACOES_DE_ORDENACAO,
  moverNaOrdenacao,
} from "@/features/signup/brainhexOrdenacao";
import { cn } from "@/lib/utils";

/**
 * Bloco de ordenação forçada — a parte ipsativa do BrainHex.
 *
 * Setas em vez de arrastar, de propósito: drag-and-drop é ruim no teclado, ruim
 * com leitor de tela e exige precisão motora. Esta é justamente a parte do
 * instrumento que não pode sair enviesada por dificuldade de manipulação — um
 * aluno que não consegue arrastar entregaria uma ordem que não é a dele.
 */
export default function BrainHexOrdenacaoStep({
  ordem,
  onChange,
  onBack,
  onFinish,
}: {
  ordem: BrainHexProfileKey[];
  onChange: (proxima: BrainHexProfileKey[]) => void;
  onBack?: () => void;
  onFinish: () => void;
}) {
  const mover = (indice: number, direcao: -1 | 1) => {
    const proxima = moverNaOrdenacao(ordem, indice, direcao);
    // `moverNaOrdenacao` devolve a mesma lista quando o movimento é inválido.
    if (proxima !== ordem) onChange(proxima);
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto p-4">
      <div className="space-y-3">
        <h2 className="text-xl font-bold tracking-tight">O que te move mais?</h2>
        <p className="text-muted-foreground text-sm">
          Coloque em ordem, do que mais te empolga para o que menos te empolga.
          Não existe resposta certa — use as setas para reordenar.
        </p>
      </div>

      <ol className="space-y-2" aria-label="Ordene as preferências">
        {ordem.map((perfil, indice) => (
          <li
            key={perfil}
            className={cn(
              "flex items-center gap-3 rounded-lg border border-border bg-card p-3",
              indice === 0 && "border-primary/60",
            )}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary/40 font-mono text-xs"
              aria-hidden="true"
            >
              {indice + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm">{AFIRMACOES_DE_ORDENACAO[perfil]}</p>
              <p className="sr-only">
                Posição {indice + 1} de {ordem.length}: {PROFILE_LABEL[perfil]}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={indice === 0}
                onClick={() => mover(indice, -1)}
                aria-label={`Subir: ${AFIRMACOES_DE_ORDENACAO[perfil]}`}
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={indice === ordem.length - 1}
                onClick={() => mover(indice, 1)}
                aria-label={`Descer: ${AFIRMACOES_DE_ORDENACAO[perfil]}`}
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex items-center justify-between gap-3">
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
            Voltar
          </Button>
        ) : (
          <span />
        )}
        {/* Sempre habilitado: a lista já nasce completa e qualquer ordem é
            válida. Exigir "mexer" puniria quem concorda com a ordem sorteada. */}
        <Button type="button" onClick={onFinish}>
          Concluir
          <Check className="ml-2 h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
