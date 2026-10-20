export type GuildShareKind = "desafio" | "questao";
/**
 * O que foi compartilhado no chat. **União discriminada e não um objeto com `id: number`**:
 * questão tem id `bigint` e desafio tem id `uuid`, e o normalizador antigo fazia
 * `Number(row.id)` com `Number.isFinite(id) && id > 0` — então o id de um desafio virava `NaN`
 * e o share saía `null`. Efeito medido: **o cartão de desafio nunca existiu**; a mensagem caía
 * no texto puro ("Um novo desafio foi lançado!") e o cliente não tinha como saber de qual
 * desafio se tratava. O `title` também era exigido não-vazio, e o payload do desafio não traz
 * título nenhum.
 */
export type GuildShare =
  | {
      kind: "questao";
      id: number;
      title: string;
      activityId?: number;
      questionType?: string | null;
      alternatives?: string[];
    }
  | {
      kind: "desafio";
      /** uuid — é por isso que o tipo é uma união e não um `id: number`. */
      desafioId: string;
      title: string;
      quantidade: number | null;
      dificuldade: string | null;
      consequencia: string | null;
    };
export type GuildMessage = {
  id: string;
  guildaId: string;
  authorId: string;
  authorName: string;
  authorPhotoUrl: string | null;
  kind: "text" | GuildShareKind;
  text: string;
  share: GuildShare | null;
  createdAt: string | null;
};

function textoOuNulo(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  return limpo ? limpo : null;
}

/** O título do cartão de desafio. O payload não traz título, então ele é montado do que traz. */
function tituloDoDesafio(quantidade: number | null, dificuldade: string | null, consequencia: string | null): string {
  const partes = [
    quantidade && quantidade > 0 ? `${quantidade} ${quantidade === 1 ? "questão" : "questões"}` : null,
    dificuldade === "dificil" ? "Difícil" : dificuldade === "normal" ? "Normal" : null,
    consequencia === "treino" ? "Treino" : consequencia === "ranqueada" ? "Ranqueada" : consequencia === "evento" ? "Evento" : null,
  ].filter(Boolean);
  return partes.length ? `Desafio · ${partes.join(" · ")}` : "Desafio";
}

function normalizeShare(kind: unknown, value: unknown): GuildShare | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;

  if (kind === "desafio") {
    // id é uuid: tratar como TEXTO. `Number(uuid)` é NaN, e era isso que anulava o cartão.
    // Número também é aceito: `guilda_desafios.id` é uuid hoje, mas recusar um payload antigo
    // de id numérico tornaria a mensagem inabrível sem necessidade.
    const desafioId =
      typeof row.id === "number" && Number.isFinite(row.id) ? String(row.id) : textoOuNulo(row.id);
    if (!desafioId) return null;
    const quantidade = Number(row.quantidade);
    const dificuldade = textoOuNulo(row.dificuldade);
    const consequencia = textoOuNulo(row.consequencia);
    return {
      kind: "desafio",
      desafioId,
      quantidade: Number.isFinite(quantidade) && quantidade > 0 ? quantidade : null,
      dificuldade,
      consequencia,
      // Título explícito, se o payload trouxer; os de hoje não trazem.
      title:
        textoOuNulo(row.titulo) ??
        textoOuNulo(row.title) ??
        tituloDoDesafio(Number.isFinite(quantidade) && quantidade > 0 ? quantidade : null, dificuldade, consequencia),
    };
  }

  if (kind !== "questao") return null;
  const id = Number(row.id);
  const title = String(row.titulo ?? row.title ?? row.enunciado ?? "").trim();
  const alternatives = Array.isArray(row.alternativas) ? row.alternativas.map((item) => String(typeof item === "object" && item ? ((item as Record<string, unknown>).texto ?? (item as Record<string, unknown>).label ?? "") : item)).filter(Boolean) : undefined;
  return Number.isFinite(id) && id > 0 && title ? { kind: "questao", id, title, activityId: Number(row.atividade_id) || undefined, questionType: typeof row.tipo === "string" ? row.tipo : null, alternatives } : null;
}

export function normalizeGuildMessages(rows: unknown): GuildMessage[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const row = value as Record<string, unknown>;
    const kind = row.tipo === "desafio" || row.tipo === "questao" ? row.tipo : "text";
    const share = normalizeShare(kind, row.conteudo);
    return [{
      id: String(row.id), guildaId: String(row.guilda_id), authorId: String(row.autor_id),
      authorName: String(row.autor_nome ?? "Colega"), authorPhotoUrl: typeof row.autor_foto_url === "string" ? row.autor_foto_url : null,
      kind, text: String(row.texto ?? ""), share, createdAt: typeof row.created_at === "string" ? row.created_at : null,
    }];
  });
}

/**
 * A mensagem é de quem está lendo?
 *
 * Era `message.authorId === "me"` dentro do componente, e **nunca era verdadeiro**:
 * `guilda_chat_listar` devolve `m.autor_id`, um uuid, não a string `"me"`. O efeito era
 * silencioso — nenhuma mensagem própria recebia o balão nem a cor de "minha", e no desktop
 * tudo aparecia alinhado como se fosse de outra pessoa.
 *
 * `meuId` nulo (sessão ainda carregando, ou sem sessão) devolve `false`: na dúvida, não
 * reivindica a mensagem de ninguém.
 */
export function mensagemEhMinha(message: Pick<GuildMessage, "authorId">, meuId: string | null): boolean {
  return Boolean(meuId) && message.authorId === meuId;
}
