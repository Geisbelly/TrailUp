/**
 * Agrega `personalizacao_item_progresso` -- o SEGUNDO livro-caixa do progresso
 * do aluno.
 *
 * O app mantém dois registros paralelos e as telas de métrica só leem um:
 *
 *   `conteudo_aluno` / `atividade_aluno`  material do professor (via
 *                                          `classe.topicos[].conteudos`)
 *   `personalizacao_item_progresso`        material personalizado, cards e as
 *                                          QUESTÕES DENTRO DAS APRESENTAÇÕES
 *                                          (chaves `slide:*`)
 *
 * Daí os números que não fecham: "Arquivos lidos 1 / 4 no total" quando o aluno
 * leu muito mais, "Desafios resolvidos 0 / 12" depois de responder os quizzes do
 * deck, e tempo de estudo que não sobe. Antes disto o app só tocava essa tabela
 * em UM lugar (o bônus de XP de slide) e selecionava apenas
 * `topico_id, item_key` -- descartando status, percentual, acertos e tempo.
 *
 * Módulo puro para poder ser testado: quem busca as linhas é a camada de dados.
 */

/** Linha de `personalizacao_item_progresso` (as colunas que interessam). */
export type LinhaProgressoItem = {
  topico_id?: number | null;
  item_key?: string | null;
  item_kind?: string | null;
  status?: string | null;
  percentual_concluido?: number | null;
  acertos_percentual?: number | null;
  tempo_gasto_min?: number | null;
};

export type NaturezaDoItem = "conteudo" | "cards" | "slide" | "atividade" | "outro";

export type ProgressoPersonalizado = {
  /** Itens com progresso registrado, por natureza. */
  totalPorNatureza: Record<NaturezaDoItem, number>;
  concluidosPorNatureza: Record<NaturezaDoItem, number>;
  /** Ids de conteúdo já contados aqui — usados para não somar duas vezes. */
  conteudoIds: number[];
  tempoMin: number;
  /** Média de acertos entre os itens que têm nota. `null` quando não há. */
  acertosMedio: number | null;
  topicosTocados: number[];
};

const VAZIO: Record<NaturezaDoItem, number> = {
  conteudo: 0,
  cards: 0,
  slide: 0,
  atividade: 0,
  outro: 0,
};

function numero(valor: unknown): number {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Concluído? Mesma regra do resto do app: status textual OU percentual cheio.
 *
 * Não usa `>= 1` nem "tem linha": abrir um material cria a linha com 0%, e tratar
 * isso como concluído inflaria todo contador.
 */
export function itemConcluido(linha: LinhaProgressoItem): boolean {
  const status = String(linha?.status ?? "").toLowerCase();
  if (status.includes("concl")) return true;
  return numero(linha?.percentual_concluido) >= 100;
}

/**
 * Natureza do item a partir de `item_kind` e, na falta dele, do prefixo da
 * chave.
 *
 * `slide:` é o caso que importa: são as interações dentro da apresentação
 * (quiz, checklist, boss). O app já dependia desse prefixo para o bônus de XP,
 * então ele é contrato, não convenção acidental.
 */
export function naturezaDoItem(linha: LinhaProgressoItem): NaturezaDoItem {
  const chave = String(linha?.item_key ?? "").trim().toLowerCase();
  if (chave.startsWith("slide:")) return "slide";

  const kind = String(linha?.item_kind ?? "").trim().toLowerCase();
  if (kind === "cards") return "cards";
  if (kind === "activity" || kind === "atividade") return "atividade";
  if (kind === "content" || kind === "conteudo") return "conteudo";

  if (chave.startsWith("content:")) return "conteudo";
  if (chave.startsWith("cards:")) return "cards";
  if (chave.startsWith("activity:") || chave.startsWith("atividade:")) return "atividade";
  return "outro";
}

/** Id do conteúdo referenciado pela chave (`content:12`), se houver. */
export function conteudoIdDaChave(itemKey: unknown): number | null {
  const chave = String(itemKey ?? "").trim();
  if (!chave.toLowerCase().startsWith("content:")) return null;
  const bruto = Number(chave.split(":")[1]);
  return Number.isFinite(bruto) ? bruto : null;
}

export function agregarProgressoPersonalizado(
  linhas: LinhaProgressoItem[] | null | undefined
): ProgressoPersonalizado {
  const totalPorNatureza = { ...VAZIO };
  const concluidosPorNatureza = { ...VAZIO };
  const conteudoIds = new Set<number>();
  const topicos = new Set<number>();
  const notas: number[] = [];
  // Uma linha por (tópico, item_key): a tabela tem unique por
  // (aluno, personalizacao, item_key), mas o mesmo item_key pode voltar em
  // personalizações diferentes do mesmo tópico -- contar as duas inflaria.
  const vistos = new Set<string>();
  let tempoMin = 0;

  for (const linha of linhas ?? []) {
    const chave = String(linha?.item_key ?? "").trim();
    if (!chave) continue;

    const topicoId = Number(linha?.topico_id);
    const identidade = `${Number.isFinite(topicoId) ? topicoId : "?"}|${chave.toLowerCase()}`;
    if (vistos.has(identidade)) continue;
    vistos.add(identidade);

    if (Number.isFinite(topicoId)) topicos.add(topicoId);

    const natureza = naturezaDoItem(linha);
    totalPorNatureza[natureza] += 1;
    if (itemConcluido(linha)) concluidosPorNatureza[natureza] += 1;

    const idConteudo = conteudoIdDaChave(chave);
    if (idConteudo != null) conteudoIds.add(idConteudo);

    tempoMin += Math.max(0, numero(linha?.tempo_gasto_min));

    const acertos = linha?.acertos_percentual;
    // `null` é "não avaliado"; zero é nota zero de verdade. Tratar os dois igual
    // afundaria a média de quem só leu material sem quiz.
    if (acertos != null && Number.isFinite(Number(acertos))) {
      notas.push(Number(acertos));
    }
  }

  return {
    totalPorNatureza,
    concluidosPorNatureza,
    conteudoIds: [...conteudoIds],
    tempoMin: Math.round(tempoMin * 100) / 100,
    acertosMedio:
      notas.length > 0
        ? Math.round((notas.reduce((a, b) => a + b, 0) / notas.length) * 100) / 100
        : null,
    topicosTocados: [...topicos],
  };
}

export type ContadoresUnificados = {
  conteudosConcluidos: number;
  totalConteudos: number;
  atividadesConcluidas: number;
  totalAtividades: number;
  tempoMin: number;
};

/**
 * Junta os dois livros-caixa sem contar ninguém duas vezes.
 *
 * Regra da soma: o material do professor manda no que é "conteúdo" e
 * "atividade"; do lado personalizado entra apenas o que o lado acadêmico NÃO
 * conhece —
 *
 *   - conteúdo personalizado cujo id NÃO está entre os ids acadêmicos (um
 *     `content:12` que também existe em `conteudo_aluno` é o MESMO material
 *     visto por outra tabela, não um arquivo a mais);
 *   - cards, que não têm equivalente acadêmico;
 *   - `slide:*`, que são as questões dentro da apresentação — é isso que fazia
 *     "Desafios resolvidos" ficar em 0 depois de responder o deck inteiro.
 */
export function unificarContadores(params: {
  academico: {
    conteudosConcluidos: number;
    totalConteudos: number;
    atividadesConcluidas: number;
    totalAtividades: number;
    tempoMin?: number;
    conteudoIds?: number[];
  };
  personalizado: ProgressoPersonalizado;
}): ContadoresUnificados {
  const { academico, personalizado } = params;
  const idsAcademicos = new Set(academico.conteudoIds ?? []);

  const conteudosExtra = personalizado.conteudoIds.filter((id) => !idsAcademicos.has(id)).length;
  // `cards` e conteúdo personalizado sem id de conteúdo entram como material
  // próprio; sem isso o cards nunca apareceria em nenhum contador.
  const cardsTotal = personalizado.totalPorNatureza.cards;
  const cardsConcluidos = personalizado.concluidosPorNatureza.cards;

  const slidesTotal = personalizado.totalPorNatureza.slide;
  const slidesConcluidos = personalizado.concluidosPorNatureza.slide;
  const atividadesExtra = personalizado.totalPorNatureza.atividade;
  const atividadesExtraConcluidas = personalizado.concluidosPorNatureza.atividade;

  return {
    totalConteudos: academico.totalConteudos + conteudosExtra + cardsTotal,
    conteudosConcluidos:
      academico.conteudosConcluidos +
      Math.min(conteudosExtra, personalizado.concluidosPorNatureza.conteudo) +
      cardsConcluidos,
    totalAtividades: academico.totalAtividades + slidesTotal + atividadesExtra,
    atividadesConcluidas:
      academico.atividadesConcluidas + slidesConcluidos + atividadesExtraConcluidas,
    // MAXIMO, nao soma: o tempo do topico (que alimenta `academico.tempoMin`)
    // ja inclui o tempo gasto nos itens personalizados, porque o rastreio grava
    // o topico em TODO flush, inclusive nesses blocos. Somar contaria duas
    // vezes; o maximo tambem recupera o valor quando uma das duas escritas
    // falha e o outro lado tem o tempo.
    tempoMin:
      Math.round(Math.max(Math.max(0, academico.tempoMin ?? 0), personalizado.tempoMin) * 100) /
      100,
  };
}
