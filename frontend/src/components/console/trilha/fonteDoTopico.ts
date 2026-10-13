import type { Conteudo, ConteudoFile } from "./types";

export type FonteDoTopico = { nome: string; tamanho: number; extensao: string; total: number };

/**
 * "Fonte deste tópico": o primeiro arquivo anexado (na ordem dos conteúdos) e
 * quantos há no total. Lê só o que `conteudos.metadata.files` já guarda — nome e
 * tamanho. Sem arquivo, devolve null e o cartão não aparece.
 */
export function fonteDoTopico(conteudos: Conteudo[]): FonteDoTopico | null {
  const arquivos: ConteudoFile[] = conteudos.flatMap((c) => c.metadata?.files ?? []).filter((f) => f && f.name);
  if (arquivos.length === 0) return null;
  const [primeiro] = arquivos;
  const ext = primeiro.name.includes(".") ? primeiro.name.split(".").pop()!.toLowerCase() : "";
  return { nome: primeiro.name, tamanho: primeiro.size ?? 0, extensao: ext.slice(0, 4) || "arq", total: arquivos.length };
}
