// Helper puro para o agregado de `conteudo_personalizado.materiais`.
//
// A AUTORIDADE do merge e do `status` agregado é a RPC PL/pgSQL
// `public.merge_personalizacao_materiais_v2`, e ela é o único caminho de
// escrita: `supabaseService.mergePersonalizacaoMateriais` chama a RPC e
// LANÇA quando ela não existe — não há fallback em JS. O BrainHexPDF grava
// pela mesma RPC, parte a parte.
//
// Este cabeçalho já disse o contrário — que a versão TypeScript era "a fonte
// canônica" e que havia um fallback JS em `mergePersonalizacaoMateriais` — e a
// afirmação obsoleta custou caro: levou a um diagnóstico errado de onde um
// `pronto` indevido tinha sido gravado. O `computeMergedMaterials` que morava
// aqui não era chamado por nenhum código de produção (só pelo próprio teste),
// e a regra dele contradizia a da RPC: contava `failed` como conclusão e
// devolvia `pronto`, além de tornar `pronto` sticky. A RPC exige as três
// mídias `completed` com o `generation_key` corrente e chega a rebaixar um
// `pronto` velho para `processando_midias`. Duas implementações da mesma
// regra, discordando, com a morta ensinando a versão errada nos testes.
//
// Se precisar de merge em TypeScript algum dia, derive da RPC — não deste
// arquivo.

import type { MaterialPart } from "../services/supabaseService";

export interface MaterialEntryLike {
  metadata?: { status?: string; generation_key?: string };
}

// computeAggregatedApresentacaoEntry é duplicada deliberadamente em
// ../BrainHexPDF/src/services/materialsPersistence.ts (mesma lógica, TS dos
// dois lados — o BrainHexPDF grava direto na RPC parte a parte; este lado
// só é usado no fallback quando a chamada HTTP falha em nível de
// transporte). Se a lógica mudar aqui, atualize a cópia lá.
export function computeAggregatedApresentacaoEntry(
  currentPartes: MaterialPart[],
  novaParte: MaterialPart,
  totalPartes: number,
  currentStatus: string,
): { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } {
  const mergedPartes = [...currentPartes.filter((p) => p.ordem !== novaParte.ordem), novaParte].sort(
    (a, b) => a.ordem - b.ordem,
  );

  const anyFailed = mergedPartes.some((p) => p.failed);
  const allArrived = mergedPartes.length === totalPartes;

  let status: string;
  if (anyFailed) {
    status = "failed";
  } else if (allArrived) {
    status = "completed";
  } else {
    status = currentStatus;
  }

  return {
    partes: mergedPartes,
    status,
    headline: {
      arquivo_url: mergedPartes[0]?.arquivo_url ?? null,
      storage_path: mergedPartes[0]?.storage_path ?? null,
    },
  };
}
