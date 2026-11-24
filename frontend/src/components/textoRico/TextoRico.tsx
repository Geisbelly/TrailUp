/**
 * Texto que o professor marcou como rico (`formato_texto = 'rico'`): markdown com fórmula,
 * química e código (spec A), como o app desenha. Com `'texto'`, ou sem a marca, sai o mesmo texto
 * de antes, em `whitespace-pre-wrap` e sem markdown: nem um `*` vira ênfase.
 *
 * O desenho do rico mora em `TextoRicoMarkdown.tsx` e só desce na primeira vez que um texto rico
 * aparece: o markdown e o Prism pesam ~200 KB e a maior parte dos textos é comum. Enquanto baixa,
 * fica um esqueleto do tamanho aproximado do texto, nunca o markdown cru.
 */

import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { lazyWithReload } from "@/lib/chunkReload";
import { formatoDoTexto, type FormatoTexto } from "@/lib/textoRico/formatoTexto";
import { cn } from "@/lib/utils";

const TextoRicoMarkdown = lazyWithReload(() => import("./TextoRicoMarkdown"));

type Props = {
  texto: string | null | undefined;
  formato: FormatoTexto | string | null | undefined;
  className?: string;
};

/** Uma linha de esqueleto a cada ~80 caracteres (ou quebra de linha), de 1 a 4. */
function linhasDoEsqueleto(texto: string | null | undefined): number {
  const t = texto ?? "";
  const linhas = t.split("\n").reduce((soma, linha) => soma + Math.max(1, Math.ceil(linha.length / 80)), 0);
  return Math.min(4, Math.max(1, linhas));
}

function EsqueletoDoTextoRico({ texto, className }: { texto: string | null | undefined; className?: string }) {
  const n = linhasDoEsqueleto(texto);
  return (
    <div className={cn("space-y-2 py-1", className)} aria-busy="true" aria-label="Carregando texto" data-formato="rico">
      {Array.from({ length: n }, (_, i) => (
        <Skeleton key={i} className={cn("h-3.5", i === n - 1 && n > 1 ? "w-2/3" : "w-full")} />
      ))}
    </div>
  );
}

export function TextoRico({ texto, formato, className }: Props) {
  if (formatoDoTexto(formato) !== "rico") return <div className={cn("whitespace-pre-wrap", className)}>{texto ?? ""}</div>;

  return (
    <Suspense fallback={<EsqueletoDoTextoRico texto={texto} className={className} />}>
      <TextoRicoMarkdown texto={texto} className={className} />
    </Suspense>
  );
}
