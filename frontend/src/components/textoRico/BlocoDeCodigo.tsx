/**
 * Bloco de código do texto rico (spec A), com número de linha e realce do `tokensDoCodigo` — o
 * mesmo do app, inclusive os dialetos de SQL.
 * Cores em `coresDoCodigo.ts`.
 */

import { useMemo } from "react";

import { nomeDaLinguagem, tokensDoCodigo } from "@/lib/textoRico/tokensDoCodigo";

import { CORES_DO_CODIGO, FUNDO_DO_CODIGO, NUMERO_DA_LINHA } from "./coresDoCodigo";

const TAB = "    ";

export function BlocoDeCodigo({ codigo, linguagem }: { codigo: string; linguagem?: string | null }) {
  const linhas = useMemo(() => tokensDoCodigo(codigo.replace(/\t/g, TAB), linguagem), [codigo, linguagem]);
  const nome = nomeDaLinguagem(linguagem);
  const largura = String(linhas.length).length;

  return (
    <figure
      role="group"
      aria-label={nome ? `Código em ${nome}` : "Código"}
      className="my-2 overflow-hidden rounded-lg border border-border"
      style={{ backgroundColor: FUNDO_DO_CODIGO }}
    >
      {nome && (
        <figcaption className="border-b border-white/10 px-3 py-1 text-xs" style={{ color: CORES_DO_CODIGO.comentario }}>
          {nome}
        </figcaption>
      )}
      <pre className="m-0 overflow-x-auto p-3 font-mono text-[13px] leading-relaxed">
        <code>
          {linhas.map((linha, i) => (
            <div key={i} className="flex">
              <span
                aria-hidden="true"
                className="mr-3 shrink-0 select-none text-right"
                style={{ color: NUMERO_DA_LINHA, minWidth: `${largura}ch` }}
              >
                {i + 1}
              </span>
              <span className="whitespace-pre">
                {linha.length === 0
                  ? "\n"
                  : linha.map((trecho, j) => (
                      <span key={j} data-papel={trecho.papel} style={{ color: CORES_DO_CODIGO[trecho.papel] }}>
                        {trecho.texto}
                      </span>
                    ))}
              </span>
            </div>
          ))}
        </code>
      </pre>
    </figure>
  );
}
