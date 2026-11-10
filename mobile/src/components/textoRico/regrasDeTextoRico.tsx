/**
 * Regras do `react-native-markdown-display` para fórmula e código, usadas pelo `TextoRico` e pelo
 * `MarkdownBlock` (spec A, 08/11). Os tokens `formula_inline` e `formula_bloco` vêm de
 * `markdownItFormula`.
 *
 * Bloco cercado só vira `BlocoDeCodigo` quando nomeia uma linguagem que o realce conhece. Sem
 * linguagem, a cerca carrega também diagrama em ASCII (o microservice os devolve intactos de
 * propósito), e número de linha e cor estragariam o desenho: esses ficam com quem chamou.
 */

import React from "react";

import type { ProfileShellPalette } from "@/utils/profileShellPalette";
import { linguagemDoCodigo } from "@/utils/textoRico/tokensDoCodigo";

import { BlocoDeCodigo } from "./BlocoDeCodigo";
import { Formula } from "./Formula";

type No = { key: string; content: string; block?: boolean; sourceInfo?: string };

export type OpcoesDasRegras = {
  paleta: Pick<ProfileShellPalette, "background" | "accent" | "text" | "border">;
  cor: string;
  tamanhoDaFonte: number;
};

export function regrasDeTextoRico({ paleta, cor, tamanhoDaFonte }: OpcoesDasRegras) {
  return {
    formula_inline: (no: No) => <Formula key={no.key} tex={no.content} tamanhoDaFonte={tamanhoDaFonte} cor={cor} />,
    formula_bloco: (no: No) =>
      // `$$…$$` no meio de uma frase chega como token inline: desenha em destaque, mas na linha.
      no.block ? (
        <Formula key={no.key} tex={no.content} bloco tamanhoDaFonte={tamanhoDaFonte} cor={cor} />
      ) : (
        <Formula key={no.key} tex={`\\displaystyle ${no.content}`} tamanhoDaFonte={tamanhoDaFonte} cor={cor} />
      ),
  };
}

/** A regra de cerca: devolve `null` quando não é código com linguagem, para quem chamou decidir. */
export function cercaComoCodigo(no: No, opcoes: OpcoesDasRegras): React.ReactElement | null {
  const rotulo = (no.sourceInfo ?? "").trim().split(/\s+/)[0] ?? "";
  if (!linguagemDoCodigo(rotulo)) return null;
  return (
    <BlocoDeCodigo
      key={no.key}
      codigo={no.content}
      linguagem={rotulo}
      paleta={opcoes.paleta}
      tamanhoDaFonte={Math.max(12, opcoes.tamanhoDaFonte - 2)}
    />
  );
}
