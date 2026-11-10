/**
 * Texto que o professor marcou como rico (`formato_texto = 'rico'`): markdown com fórmula,
 * química e código (spec A), como o app desenha. Com `'texto'`, ou sem a marca, sai o mesmo texto
 * de antes, em `whitespace-pre-wrap` e sem markdown: nem um `*` vira ênfase.
 *
 * `prepararTextoRico` acerta os delimitadores (`\( \)` e `\[ \]` viram `$` e `$$`) e escapa o
 * cifrão de dinheiro; `remark-math` lê a fórmula; HTML cru continua desligado (sem `rehype-raw`).
 */

import { useMemo, type ReactElement, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

import { formatoDoTexto, type FormatoTexto } from "@/lib/textoRico/formatoTexto";
import { prepararTextoRico } from "@/lib/textoRico/prepararTextoRico";
import { cn } from "@/lib/utils";

import { BlocoDeCodigo } from "./BlocoDeCodigo";
import { Formula } from "./Formula";

type Props = {
  texto: string | null | undefined;
  formato: FormatoTexto | string | null | undefined;
  className?: string;
};

function textoDe(filhos: ReactNode): string {
  if (typeof filhos === "string") return filhos;
  if (Array.isArray(filhos)) return filhos.map(textoDe).join("");
  return "";
}

export function TextoRico({ texto, formato, className }: Props) {
  const rico = formatoDoTexto(formato) === "rico";
  const pronto = useMemo(() => (rico ? prepararTextoRico(texto) : ""), [rico, texto]);

  const componentes = useMemo<Components>(
    () => ({
      code({ className: classe, children, node }) {
        const conteudo = textoDe(children);
        if (classe?.includes("language-math")) {
          // `$$x$$` no meio de uma linha chega como fórmula "em linha"; o app a desenha em bloco,
          // então aqui também — decide pelo delimitador no texto de origem.
          const inicio = node?.position?.start.offset;
          const dupla = inicio !== undefined && pronto.startsWith("$$", inicio);
          return <Formula tex={conteudo.trim()} emBloco={classe.includes("math-display") || dupla} />;
        }
        return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">{children}</code>;
      },
      pre({ children }) {
        const filho = (Array.isArray(children) ? children[0] : children) as ReactElement<{ className?: string; children?: ReactNode }>;
        const classe = filho?.props?.className ?? "";
        if (classe.includes("language-math")) return <>{children}</>;
        const linguagem = /language-([^\s]+)/.exec(classe)?.[1] ?? null;
        return <BlocoDeCodigo codigo={textoDe(filho?.props?.children).replace(/\n$/, "")} linguagem={linguagem} />;
      },
      p: ({ children }) => <p className="my-1 first:mt-0 last:mb-0">{children}</p>,
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noreferrer noopener" className="text-primary underline">
          {children}
        </a>
      ),
    }),
    [pronto],
  );

  if (!rico) return <div className={cn("whitespace-pre-wrap", className)}>{texto ?? ""}</div>;

  return (
    <div className={cn("texto-rico space-y-1 break-words", className)} data-formato="rico">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} components={componentes}>
        {pronto}
      </ReactMarkdown>
    </div>
  );
}
