/**
 * Uma fórmula do texto rico, em SVG do MathJax (spec A). Enquanto o MathJax carrega, e se a
 * fórmula tiver erro, aparece a leitura em texto (`corpoDaFormula`), nunca o LaTeX cru com `\ce`.
 *
 * O `dangerouslySetInnerHTML` recebe **só** a saída do MathJax, já sem `style` e `data-*`
 * (`extrairSvg`), nunca texto do professor.
 */

import { useEffect, useState } from "react";

import { formulaJaConvertida, formulaParaSvg, type ResultadoFormula } from "@/lib/textoRico/formulaParaSvg";
import { corpoDaFormula } from "@/lib/textoRico/matematicaLegivel";
import { cn } from "@/lib/utils";

type Props = { tex: string; emBloco?: boolean; className?: string };

export function Formula({ tex, emBloco = false, className }: Props) {
  const [resultado, setResultado] = useState<ResultadoFormula | null>(() => formulaJaConvertida(tex, { display: emBloco }));

  useEffect(() => {
    let vivo = true;
    const pronto = formulaJaConvertida(tex, { display: emBloco });
    setResultado(pronto);
    if (!pronto) void formulaParaSvg(tex, { display: emBloco }).then((r) => vivo && setResultado(r));
    return () => {
      vivo = false;
    };
  }, [tex, emBloco]);

  const leitura = corpoDaFormula(tex);

  if (!resultado || "erro" in resultado) {
    const erro = resultado && "erro" in resultado ? resultado.erro : null;
    return (
      <span
        className={cn("font-mono", erro && "text-destructive", emBloco && "my-2 block text-center", className)}
        title={erro ? `Fórmula com erro: ${erro}` : undefined}
        data-formula-erro={erro ?? undefined}
      >
        {leitura}
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label={leitura}
      // O preflight do Tailwind faz todo `svg` virar bloco: centraliza com margem automática, e o
      // `overflow-visible` deixa o expoente e o índice saírem da caixa que o MathJax mediu.
      className={cn(
        emBloco ? "my-2 block overflow-x-auto py-1 [&>svg]:mx-auto" : "inline-block [&>svg]:inline-block",
        "[&>svg]:overflow-visible",
        className,
      )}
      style={emBloco ? undefined : { verticalAlign: `${resultado.alinhamento}ex` }}
      dangerouslySetInnerHTML={{ __html: resultado.svg }}
    />
  );
}
