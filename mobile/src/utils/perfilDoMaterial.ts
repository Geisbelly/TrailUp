/**
 * De qual perfil BrainHex e este material.
 *
 * Extraido de `services/personalizacao/TrailupApiProvider.ts` para poder ser
 * testado: aquele arquivo importa `@/database/supabase` no topo do modulo, e o
 * runner do node morre no `import`. Mesmo motivo de `context/metricas/
 * acumuladorLote.ts`.
 *
 * Vale a pena testar porque esta funcao **decide o que o aluno ve**: o material
 * so aparece se a chave que ela devolve casar com o perfil ativo. Errar aqui
 * nao da erro em lugar nenhum -- o conteudo simplesmente nao aparece.
 */

export type PerfilBrainHexLike = {
  brainhex_profile_key?: string | null;
  plano?: Record<string, any> | null;
  materiais?: Record<string, any> | null;
};

/**
 * O DEFAULT e `mastermind`, e ele e a parte perigosa desta funcao.
 *
 * Chave vazia ou irreconhecivel nao vira `null` nem erro: vira `mastermind`.
 * Entao uma linha cuja origem de perfil se perca e silenciosamente arquivada
 * como mastermind -- invisivel para o dono dela, e entregue a quem nao e.
 * Manter o default (em vez de devolver `null`) e deliberado: era o
 * comportamento anterior, e trocar isso mudaria o que ja aparece hoje. O que
 * mudou foi a PRECEDENCIA -- ver `perfilDoRegistro`.
 */
export const PERFIL_PADRAO = "mastermind";

const ALIASES: Record<string, string> = {
  seeker: "seeker",
  explorador: "seeker",
  buscador: "seeker",
  survivor: "survivor",
  sobrevivente: "survivor",
  daredevil: "daredevil",
  aventureiro: "daredevil",
  ousado: "daredevil",
  mastermind: "mastermind",
  estrategista: "mastermind",
  mestre: "mastermind",
  conqueror: "conqueror",
  conquistador: "conqueror",
  socializer: "socializer",
  socialiser: "socializer",
  socializador: "socializer",
  achiever: "achiever",
  realizador: "achiever",
};

export function normalizarPerfilBrainHex(value: string | null | undefined) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
  if (!normalized) return PERFIL_PADRAO;
  return ALIASES[normalized] ?? normalized;
}

/** O perfil embutido num caminho do Storage (`.../brainhex/<perfil>/...`). */
export function perfilNoCaminhoDeStorage(value: unknown) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;

  const decoded = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  })();

  const match = decoded.match(/brainhex\/([^\/?#]+)/i);
  if (!match?.[1]) return null;
  return normalizarPerfilBrainHex(match[1]);
}

export function perfilEmValorAninhado(value: unknown, depth = 0): string | null {
  if (depth > 6 || value == null) return null;

  const fromPath = perfilNoCaminhoDeStorage(value);
  if (fromPath) return fromPath;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = perfilEmValorAninhado(item, depth + 1);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      const found = perfilEmValorAninhado(nested, depth + 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * A COLUNA manda; o `plano` e reserva.
 *
 * `conteudo_personalizado.brainhex_profile_key` e a chave do unique
 * `(aluno, topico, perfil)` e esta preenchida em 100% das linhas da base. O
 * `plano` nao: ha linha `pronto` com a coluna dizendo `mastermind` e o `plano`
 * sem chave nenhuma. Por isso a coluna vem primeiro -- e por isso ela precisa
 * estar no SELECT, senao este primeiro elo chega `undefined` e a precedencia
 * nao significa nada.
 */
export function perfilDoRegistro(record: PerfilBrainHexLike | null | undefined) {
  const plano =
    record?.plano && typeof record.plano === "object"
      ? (record.plano as Record<string, any>)
      : {};
  const editorialMetadata =
    plano?.editorial_metadata && typeof plano.editorial_metadata === "object"
      ? (plano.editorial_metadata as Record<string, any>)
      : {};
  const perfilEditorial =
    editorialMetadata?.perfil_editorial && typeof editorialMetadata.perfil_editorial === "object"
      ? (editorialMetadata.perfil_editorial as Record<string, any>)
      : {};
  const modeloEditorial =
    editorialMetadata?.modelo_editorial && typeof editorialMetadata.modelo_editorial === "object"
      ? (editorialMetadata.modelo_editorial as Record<string, any>)
      : {};
  const personalizacaoBrainhex =
    modeloEditorial?.personalizacao_brainhex &&
    typeof modeloEditorial.personalizacao_brainhex === "object"
      ? (modeloEditorial.personalizacao_brainhex as Record<string, any>)
      : {};

  return normalizarPerfilBrainHex(
    String(
      record?.brainhex_profile_key ??
        plano?.brainhex_profile_key ??
        plano?.perfil_dominante ??
        perfilEditorial?.perfil_dominante ??
        personalizacaoBrainhex?.perfil_dominante ??
        perfilEmValorAninhado(record?.materiais) ??
        PERFIL_PADRAO
    )
  );
}

/** Card nao tem coluna de perfil: a chave mora no `metadata`. */
export function perfilDoCard(card: { metadata?: Record<string, any> | null } | null | undefined) {
  const metadata =
    card?.metadata && typeof card.metadata === "object"
      ? (card.metadata as Record<string, any>)
      : {};
  return normalizarPerfilBrainHex(
    String(
      metadata?.brainhex_profile_key ??
        metadata?.perfil_dominante ??
        metadata?.profile_key ??
        perfilEmValorAninhado(metadata) ??
        PERFIL_PADRAO
    )
  );
}
