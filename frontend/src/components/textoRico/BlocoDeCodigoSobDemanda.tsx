/**
 * `BlocoDeCodigo` carregado só quando aparece um código: o realce (Prism, ~40 KB) fica fora do
 * pedaço da tela. Enquanto baixa, o código já aparece, em monoespaçada e sem cor.
 */

import { Suspense } from "react";

import { lazyWithReload } from "@/lib/chunkReload";

import { CORES_DO_CODIGO, FUNDO_DO_CODIGO } from "./coresDoCodigo";

const BlocoDeCodigo = lazyWithReload(() => import("./BlocoDeCodigo").then((m) => ({ default: m.BlocoDeCodigo })));

type Props = { codigo: string; linguagem?: string | null };

export function BlocoDeCodigoSobDemanda({ codigo, linguagem }: Props) {
  return (
    <Suspense
      fallback={
        <pre
          aria-busy="true"
          className="my-2 overflow-x-auto rounded-lg border border-border p-3 font-mono text-[13px] leading-relaxed"
          style={{ backgroundColor: FUNDO_DO_CODIGO, color: CORES_DO_CODIGO.simples }}
        >
          <code>{codigo}</code>
        </pre>
      }
    >
      <BlocoDeCodigo codigo={codigo} linguagem={linguagem} />
    </Suspense>
  );
}
