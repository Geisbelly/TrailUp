// Arquivo da pesquisa no R2 (#17): regras puras da Edge Function `pesquisa-arquivar`.
//
// O banco diz o que falta arquivar (`pesquisa_arquivo_pendentes`), esta funcao sobe cada registro
// para o R2 e devolve o caminho (`pesquisa_arquivo_registrar`). Ver a migracao
// `20261104_02_arquivo_da_pesquisa_no_r2`.
//
// Puro (sem Deno) para o vitest testar direto.

import { mesmaChave } from "../storage-upload-url/pedido.ts";

export const ORIGENS = ["telemetria_sessoes", "telemetria_lotes", "telemetria_eventos_app"] as const;
export type Origem = (typeof ORIGENS)[number];

/** Pasta de cada origem dentro de `pesquisa/`. */
const PASTA: Record<Origem, string> = {
  telemetria_sessoes: "sessoes",
  telemetria_lotes: "lotes",
  telemetria_eventos_app: "eventos",
};

/** Versao do formato do objeto. Suba ao mudar o que vai dentro. */
export const VERSAO_DO_OBJETO = 1;

export interface Pendente {
  origem: Origem;
  origem_id: string;
  aluno_id: string;
  criado_em: string;
  registro: Record<string, unknown>;
}

export interface Arquivado {
  origem: Origem;
  origem_id: string;
  aluno_id: string;
  bucket: string;
  caminho: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** O header `x-trailup-segredo` confere com o segredo do ambiente. Segredo vazio nunca autoriza. */
export function segredoConfere(header: string | null, segredo: string | undefined): boolean {
  if (!segredo || !header) return false;
  return mesmaChave(header.trim(), segredo);
}

/** Limite pedido pelo cron, entre 1 e 1000 (padrao 300). */
export function limiteDoPedido(corpo: unknown): number {
  const bruto = corpo && typeof corpo === "object" ? (corpo as { limite?: unknown }).limite : undefined;
  const n = Number(bruto);
  if (!Number.isFinite(n)) return 300;
  return Math.min(1000, Math.max(1, Math.floor(n)));
}

/** A linha devolvida pelo RPC tem o formato esperado? Linha estranha e' ignorada, nunca sobe. */
export function lerPendente(linha: unknown): Pendente | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  if (!ORIGENS.includes(l.origem as Origem)) return null;
  if (typeof l.origem_id !== "string" || !UUID.test(l.origem_id)) return null;
  if (typeof l.aluno_id !== "string" || !UUID.test(l.aluno_id)) return null;
  if (typeof l.criado_em !== "string" || Number.isNaN(Date.parse(l.criado_em))) return null;
  if (!l.registro || typeof l.registro !== "object" || Array.isArray(l.registro)) return null;
  return {
    origem: l.origem as Origem,
    origem_id: l.origem_id.toLowerCase(),
    aluno_id: l.aluno_id.toLowerCase(),
    criado_em: l.criado_em,
    registro: l.registro as Record<string, unknown>,
  };
}

/**
 * `pesquisa/<pasta>/<aluno>/<AAAA>/<MM>/<DD>/<id>.json`, com a data (UTC) de quando o registro foi
 * gravado. Deterministico de proposito: rodar duas vezes sobrescreve o mesmo objeto em vez de
 * deixar copia orfa, e o aluno no caminho deixa a exclusao a pedido achar tudo dele.
 */
export function caminhoDoArquivo(p: Pick<Pendente, "origem" | "aluno_id" | "criado_em" | "origem_id">): string {
  const d = new Date(p.criado_em);
  const aaaa = String(d.getUTCFullYear());
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `pesquisa/${PASTA[p.origem]}/${p.aluno_id}/${aaaa}/${mm}/${dd}/${p.origem_id}.json`;
}

/**
 * Chave do R2 onde a API ja' guardou o payload bruto (`payload._r2`), ou null. Nesse caso o
 * Postgres so' tem o ponteiro, e o arquivo precisa do conteudo de verdade.
 */
export function ponteiroDoPayload(registro: Record<string, unknown>): string | null {
  const payload = registro.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const chave = (payload as Record<string, unknown>)._r2;
  return typeof chave === "string" && chave.startsWith("telemetria/") ? chave : null;
}

/**
 * O objeto gravado: o registro inteiro (colunas estruturadas e payload), com o payload bruto no
 * lugar do ponteiro quando ele estava no R2.
 */
export function montarObjeto(p: Pendente, payloadBruto: unknown | undefined, arquivadoEm: Date): string {
  const registro = payloadBruto === undefined ? p.registro : { ...p.registro, payload: payloadBruto };
  return JSON.stringify({
    versao: VERSAO_DO_OBJETO,
    origem: p.origem,
    arquivado_em: arquivadoEm.toISOString(),
    registro,
  });
}
