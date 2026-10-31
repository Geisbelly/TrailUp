import { normalizeMediaStatus } from "../personalizacoes/personalizacaoFallback";

/**
 * Gargalos de personalização (#15): por formato do material-base, quantos estão prontos, na fila
 * ou gerando, e quantos falharam. A base é o que o microservice gera por (turma × tópico × conteúdo
 * × perfil BrainHex), sem aluno dono; a adequação por aluno é derivada dela e não gera mídia.
 *
 * O status de cada formato sai de `materiais.<formato>` pelo mesmo normalizador do fallback do
 * console (`normalizeMediaStatus`, porte de `_normalize_media_status` da API), para o card não
 * discordar da aba Personalizações. Formato que nem chegou a existir no registro herda o status do
 * registro: `failed` conta como falha, geração em curso como pendente.
 */
export const FORMATOS_DO_GARGALO = [
  { chave: "markdown", rotulo: "Texto" },
  { chave: "audio", rotulo: "Áudio" },
  { chave: "apresentacao", rotulo: "Apresentação" },
] as const;

export type FormatoDoGargalo = (typeof FORMATOS_DO_GARGALO)[number]["chave"];

/** Uma linha de `conteudo_personalizado` (base), com só o pedaço de `materiais` que importa aqui. */
export type LinhaBaseDaPersonalizacao = {
  status: string | null;
} & {
  [K in FormatoDoGargalo as `${K}_metadata`]?: unknown;
} & {
  [K in FormatoDoGargalo as `${K}_url`]?: string | null;
};

export type GargaloDoFormato = {
  formato: FormatoDoGargalo;
  rotulo: string;
  prontos: number;
  pendentes: number;
  falhas: number;
};

export type GargalosDePersonalizacao = {
  formatos: GargaloDoFormato[];
  registros: number;
  falhas: number;
  pendentes: number;
};

const STATUS_DE_FALHA = new Set(["failed", "falha", "failed_quality"]);
const STATUS_EM_CURSO = new Set(["processando_midias", "pending", "processing", "queued", "partial"]);

type Situacao = "pronto" | "pendente" | "falha" | null;

function situacaoDoFormato(linha: LinhaBaseDaPersonalizacao, formato: FormatoDoGargalo): Situacao {
  const metadata = linha[`${formato}_metadata`];
  const url = linha[`${formato}_url`];
  const existe = (metadata !== null && typeof metadata === "object") || Boolean(url);
  if (existe) {
    const status = normalizeMediaStatus({ metadata, arquivo_url: url ?? null });
    if (status === "ready") return "pronto";
    if (status === "failed") return "falha";
    return "pendente";
  }
  const doRegistro = String(linha.status ?? "").trim().toLowerCase();
  if (STATUS_DE_FALHA.has(doRegistro)) return "falha";
  if (STATUS_EM_CURSO.has(doRegistro)) return "pendente";
  return null;
}

export function contarGargalosPorFormato(linhas: LinhaBaseDaPersonalizacao[]): GargalosDePersonalizacao {
  const formatos = FORMATOS_DO_GARGALO.map(({ chave, rotulo }) => {
    const item: GargaloDoFormato = { formato: chave, rotulo, prontos: 0, pendentes: 0, falhas: 0 };
    for (const linha of linhas) {
      const situacao = situacaoDoFormato(linha, chave);
      if (situacao === "pronto") item.prontos += 1;
      else if (situacao === "pendente") item.pendentes += 1;
      else if (situacao === "falha") item.falhas += 1;
    }
    return item;
  });
  return {
    formatos,
    registros: linhas.length,
    falhas: formatos.reduce((total, f) => total + f.falhas, 0),
    pendentes: formatos.reduce((total, f) => total + f.pendentes, 0),
  };
}

/** `select` do PostgREST: só o metadata e a URL de cada formato, não o conteúdo do material. */
export const SELECT_DA_BASE = [
  "status",
  ...FORMATOS_DO_GARGALO.flatMap(({ chave }) => [
    `${chave}_metadata:materiais->${chave}->metadata`,
    `${chave}_url:materiais->${chave}->>arquivo_url`,
  ]),
].join(", ");
