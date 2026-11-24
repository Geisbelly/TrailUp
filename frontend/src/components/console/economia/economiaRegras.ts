/** Regras da economia que a tela precisa decidir antes de chamar o banco. */

export type AbaDaEconomia = "valores" | "alunos" | "loja" | "fundo" | "metas" | "historico";

/** As partes da tela Economia. A Lumi leva o professor a uma delas por `?aba=`. */
export const ABAS_DA_ECONOMIA: { id: AbaDaEconomia; rotulo: string }[] = [
  { id: "valores", rotulo: "Valores" },
  { id: "alunos", rotulo: "Moedas por aluno" },
  { id: "loja", rotulo: "Loja" },
  { id: "fundo", rotulo: "Fundo da turma" },
  { id: "metas", rotulo: "Metas" },
  { id: "historico", rotulo: "Histórico" },
];

export function abaDaEconomiaNaUrl(valor: string | null): AbaDaEconomia | null {
  return ABAS_DA_ECONOMIA.find((a) => a.id === valor)?.id ?? null;
}

/**
 * Os campos de prazo e tempo que o professor ajusta no editor do tópico, no da atividade e no da
 * turma. `max` é o CHECK de `economia_config_escopo` (o de `loja_config_classe` é o mesmo).
 */
export const CAMPOS_DE_PRAZO = [
  { chave: "prazo_extensao_min_dias", rotulo: "Mínimo de dias por uso", max: 14 },
  { chave: "prazo_extensao_max_dias", rotulo: "Máximo de dias por uso", max: 14 },
  { chave: "prazo_max_por_ativ", rotulo: "Teto de dias na atividade", max: 14 },
  { chave: "tempo_extra_min_minutos", rotulo: "Mínimo de minutos por uso", max: 180 },
  { chave: "tempo_extra_max_minutos", rotulo: "Máximo de minutos por uso", max: 180 },
  { chave: "tempo_max_por_ativ", rotulo: "Teto de minutos na atividade", max: 600 },
] as const;

export type ChaveDePrazo = (typeof CAMPOS_DE_PRAZO)[number]["chave"];

/** Os campos que só a regra de tópico ou atividade tem. */
export const CAMPOS_DO_ESCOPO = [
  { chave: "uso_max_retry", rotulo: "Novas tentativas compradas", max: 5 },
  { chave: "moedas_conclusao", rotulo: "Moedas na conclusão", max: 100_000 },
  { chave: "moedas_aprovacao", rotulo: "Moedas na aprovação", max: 100_000 },
] as const;

export type ChaveDoEscopo = ChaveDePrazo | (typeof CAMPOS_DO_ESCOPO)[number]["chave"];

/** O padrão da turma: os campos do tópico e da atividade, mais os dois que só a turma tem. */
export const CAMPOS_DA_TURMA = [
  CAMPOS_DE_PRAZO[0],
  CAMPOS_DE_PRAZO[1],
  CAMPOS_DE_PRAZO[2],
  { chave: "prazo_max_dias_total", rotulo: "Teto de dias na turma", max: 14 },
  CAMPOS_DE_PRAZO[3],
  CAMPOS_DE_PRAZO[4],
  CAMPOS_DE_PRAZO[5],
  { chave: "retry_max_por_topico", rotulo: "Novas tentativas por tópico", max: 5 },
] as const;

export type ChaveDaTurma = (typeof CAMPOS_DA_TURMA)[number]["chave"];

/** Na turma não há o que herdar: todo campo é obrigatório. */
export function validarPrazosDaTurma(
  textos: Record<ChaveDaTurma, string>,
): { ok: true; valores: Record<ChaveDaTurma, number> } | { ok: false; erro: string } {
  const valores = {} as Record<ChaveDaTurma, number>;
  for (const c of CAMPOS_DA_TURMA) {
    const n = lerCampoInteiro(textos[c.chave], c.max);
    if (n === null || Number.isNaN(n)) return { ok: false, erro: `${c.rotulo}: use um número inteiro de 0 a ${c.max}.` };
    valores[c.chave] = n;
  }
  const faixa = erroDaFaixa(valores, valores.prazo_max_dias_total);
  return faixa ? { ok: false, erro: faixa } : { ok: true, valores };
}

/** Texto digitado → número, nulo (vazio = herda) ou NaN (inválido). Só inteiros de 0 a `max`. */
export function lerCampoInteiro(texto: string, max: number): number | null {
  const t = texto.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return Number.NaN;
  const n = Number(t);
  return n > max ? Number.NaN : n;
}

export type ValoresDePrazo = Record<ChaveDePrazo, number>;

/**
 * Confere a faixa que vai valer de fato: o que foi digitado e, no que ficou vazio, o que herdaria.
 * Devolve a mensagem para a tela, ou null quando está tudo certo.
 */
export function erroDaFaixa(valores: ValoresDePrazo, tetoDaTurma?: number): string | null {
  const prazo = faixaValida({
    min: valores.prazo_extensao_min_dias,
    max: valores.prazo_extensao_max_dias,
    teto: valores.prazo_max_por_ativ,
    tetoGeral: tetoDaTurma,
  });
  if (!prazo) return "Nos dias: o mínimo não pode passar do máximo, nem o máximo do teto da atividade, nem o teto da atividade o da turma.";
  const tempo = faixaValida({ min: valores.tempo_extra_min_minutos, max: valores.tempo_extra_max_minutos, teto: valores.tempo_max_por_ativ });
  if (!tempo) return "Nos minutos: o mínimo não pode passar do máximo, nem o máximo do teto da atividade.";
  return null;
}

export type Faixa = { min: number; max: number; teto: number; tetoGeral?: number };

export type ResultadoDoUso =
  | { ok: true; valor: number }
  | { ok: false; erro: "faixa_invalida" | "extensao_desligada" | "teto_da_atividade" | "teto_da_turma" };

export function faixaValida(f: Faixa): boolean {
  if (![f.min, f.max, f.teto].every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (f.min > f.max || f.max > f.teto) return false;
  if (f.tetoGeral !== undefined && f.teto > f.tetoGeral) return false;
  return true;
}

/**
 * Aperta o pedido do item para dentro do mínimo e do máximo de um uso.
 * Se o valor não cabe no teto da atividade ou da turma, recusa o uso inteiro.
 */
export function concedido(
  pedido: number,
  minimo: number,
  maximo: number,
  usadoNaAtividade: number,
  tetoAtividade: number,
  usadoNaTurma = 0,
  tetoTurma = tetoAtividade,
): ResultadoDoUso {
  if (!faixaValida({ min: minimo, max: maximo, teto: tetoAtividade, tetoGeral: tetoTurma })) {
    return { ok: false, erro: "faixa_invalida" };
  }
  const valor = Math.min(Math.max(pedido, minimo), maximo);
  if (valor <= 0) return { ok: false, erro: "extensao_desligada" };
  if (usadoNaAtividade + valor > tetoAtividade) return { ok: false, erro: "teto_da_atividade" };
  if (usadoNaTurma + valor > tetoTurma) return { ok: false, erro: "teto_da_turma" };
  return { ok: true, valor };
}

export const MENSAGEM_DE_ERRO: Record<string, string> = {
  fundo_ja_ativo: "Esta turma já tem um fundo aberto. Encerre o atual antes de abrir outro.",
  meta_invalida: "A meta precisa ser um número inteiro entre 1 e 100.000 moedas.",
  texto_invalido: "Preencha o nome (até 80 caracteres) e o benefício (até 300).",
  meta_nao_atingida: "Só dá para entregar depois que a turma bater a meta.",
  fundo_ja_encerrado: "Este fundo já foi encerrado.",
  sem_permissao: "Você não pode alterar a economia desta turma.",
  sem_sessao: "A sessão expirou. Entre de novo.",
  faixa_invalida: "Confira os números: o mínimo não pode passar do máximo, nem o máximo do teto.",
  tipo_desconhecido: "Esse tipo de evento não existe no catálogo global.",
  item_indisponivel: "Esse item não está no catálogo.",
  saldo_insuficiente: "Saldo insuficiente.",
  estoque_esgotado: "O estoque deste item na turma acabou.",
  limite_de_compras: "Este aluno já comprou o máximo permitido deste item.",
  quantidade_invalida: "Compre de 1 a 20 unidades por vez.",
  sem_unidade: "Não há unidade deste item na mochila.",
  limite_por_atividade: "Chegou no limite de usos deste item nesta atividade.",
  limite_por_questao: "Chegou no limite de usos deste item nesta questão.",
  limite_por_topico: "Chegou no limite de usos deste item neste tópico.",
  limite_por_dia: "Chegou no limite de usos deste item hoje.",
  limite_por_semana: "Chegou no limite de usos deste item nesta semana.",
  limite_por_turma: "Chegou no limite de usos deste item na turma.",
  escopo_invalido: "Escolha turma, tópico (com id) ou atividade (com id).",
  fora_da_turma: "Você não está nesta turma.",
  teto_da_atividade: "A extensão passaria do máximo desta atividade.",
  teto_da_turma: "A extensão passaria do máximo da turma.",
  extensao_desligada: "O professor desligou esta extensão.",
  ja_usado: "O item já foi usado. Estorno só vale para o que ainda está na mochila.",
  ja_consumida: "Este item já foi usado.",
  estornada: "Esta compra foi estornada.",
  compra_nao_encontrada: "Compra não encontrada.",
  alvo_invalido: "Escolha a atividade ou a questão em que o item será usado.",
  alvo_de_outra_turma: "O alvo não pertence a esta turma.",
  cooldown_24h: "A nova tentativa só libera 24 horas depois da anterior.",
  revise_o_material: "Para responder de novo, é preciso revisar o material do tópico antes.",
  sem_questao_elegivel: "Não há questão elegível para uma nova tentativa.",
  nota_minima_exige_atividade: "Nota mínima só vale numa atividade.",
  criterio_exige_turma: "Acertos e presenças são metas da turma inteira.",
  meta_nao_encontrada: "Meta não encontrada nesta turma.",
  chave_ausente: "Não foi possível identificar o pedido. Tente de novo.",
};

export function mensagemDeErro(codigo: string | null | undefined, padrao = "Não foi possível concluir."): string {
  if (!codigo) return padrao;
  return MENSAGEM_DE_ERRO[codigo] ?? padrao;
}

export type FiltroDeExtrato = "todos" | "evento" | "compra" | "estorno" | "concessao" | "dotacao";

export type LinhaDeExtrato = { id: number; motivo: string; delta: number };

export function filtrarExtrato<T extends LinhaDeExtrato>(linhas: readonly T[], filtro: FiltroDeExtrato): T[] {
  if (filtro === "todos") return [...linhas];
  return linhas.filter((l) => l.motivo === filtro);
}

export function numeroOuNulo(texto: string): number | null {
  const limpo = texto.trim();
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** As situações em que o professor limita quantas unidades de um item o aluno usa. */
export const SITUACOES_DE_USO = [
  { campo: "por_atividade", rotulo: "Por atividade" },
  { campo: "por_questao", rotulo: "Por questão" },
  { campo: "por_topico", rotulo: "Por tópico" },
  { campo: "por_dia", rotulo: "Por dia" },
  { campo: "por_semana", rotulo: "Por semana" },
  { campo: "por_turma", rotulo: "Na turma" },
] as const;

export type CampoDeLimite = (typeof SITUACOES_DE_USO)[number]["campo"];
export type LimitesDeUso = Record<CampoDeLimite, number | null>;

/** O que vale quando ninguém configurou nada (igual a `fn_loja_limites` no banco). */
export const LIMITE_PADRAO: Record<string, Partial<LimitesDeUso>> = {
  prazo_extra: { por_atividade: 1 },
  tempo_extra: { por_atividade: 3 },
  segunda_chance: { por_questao: 1, por_topico: 1 },
  dica: { por_questao: 1 },
};

/** Texto do campo -> valor salvo. Vazio herda (null), "sem limite"/"-" vira -1, 0 bloqueia. */
export function limiteDoTexto(texto: string): number | null {
  const limpo = texto.trim().toLowerCase();
  if (!limpo) return null;
  if (limpo === "-" || limpo === "-1" || limpo === "sem limite" || limpo === "∞") return -1;
  const n = Number(limpo);
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : Number.NaN;
}

export function textoDoLimite(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return "";
  return valor < 0 ? "sem limite" : String(valor);
}

export function descreverPadrao(item: string, campo: CampoDeLimite): string {
  const v = LIMITE_PADRAO[item]?.[campo];
  return v === undefined || v === null ? "sem limite" : String(v);
}

/** Preço da n-ésima unidade (0 = primeira) com aumento por compra; fator 1 desliga o aumento. */
export function precoDaUnidade(base: number, fator: number, jaCompradas: number): number {
  return Math.round(base * Math.pow(fator, jaCompradas));
}

export type StatusDoFundo = "aberto" | "atingido" | "entregue" | "cancelado";

export const ROTULO_DO_FUNDO: Record<StatusDoFundo, string> = {
  aberto: "Arrecadando",
  atingido: "Meta atingida",
  entregue: "Benefício entregue",
  cancelado: "Cancelado (moedas devolvidas)",
};

/** "30 de 50 moedas (60%)"; o percentual nunca passa de 100. */
export function progressoDoFundo(arrecadado: number, meta: number): string {
  const pct = meta > 0 ? Math.min(100, Math.floor((100 * arrecadado) / meta)) : 0;
  return `${arrecadado} de ${meta} moedas (${pct}%)`;
}

export type LinhaDaCarteira = { aluno_id: string; delta: number; motivo: string; classe_id: number | null };

export type CarteiraDoAluno = {
  id: string;
  nome: string;
  /** Moedas ganhas NESTA turma (eventos, metas, concessões), fora as devolvidas. */
  ganhou: number;
  /** Moedas gastas NESTA turma (loja e doações ao fundo). */
  gastou: number;
  /** Devolvidas nesta turma (compra estornada, fundo cancelado). */
  devolvido: number;
  /** Saldo da carteira do aluno, somando todas as turmas: é o que ele vê na loja. */
  saldo: number;
};

/** Resumo da moeda individual de cada aluno, a partir do razão (`moedas_ledger`). */
export function resumirCarteiras(
  alunos: { id: string; nome: string }[],
  linhas: LinhaDaCarteira[],
  classeId: number,
): CarteiraDoAluno[] {
  const porAluno = new Map(alunos.map((a) => [a.id, { id: a.id, nome: a.nome, ganhou: 0, gastou: 0, devolvido: 0, saldo: 0 }]));
  for (const l of linhas) {
    const c = porAluno.get(l.aluno_id);
    if (!c) continue;
    const delta = Number(l.delta) || 0;
    c.saldo += delta;
    if (Number(l.classe_id) !== classeId) continue;
    if (l.motivo === "estorno") c.devolvido += delta;
    else if (delta > 0) c.ganhou += delta;
    else c.gastou += -delta;
  }
  return [...porAluno.values()];
}

/** "padrão: 5" — o que vale quando a turma não personaliza. */
export const textoDoPadrao = (valor: number) => `padrão: ${valor}`;

/** Critérios de meta coletiva, com o nome que o professor lê. A chave é a que o banco grava. */
export const CRITERIOS_DA_META: { id: string; rotulo: string }[] = [
  { id: "atividades_concluidas", rotulo: "Atividades concluídas" },
  { id: "acertos", rotulo: "Acertos" },
  { id: "presencas", rotulo: "Presenças" },
  { id: "nota_minima", rotulo: "Nota mínima (%)" },
];

/** "Atividades concluídas: pelo menos 5". Critério que a tela não conhece aparece como veio. */
export function resumoDoCriterioDaMeta(criterio: string, limiar: number): string {
  const rotulo = CRITERIOS_DA_META.find((c) => c.id === criterio)?.rotulo ?? criterio;
  return `${rotulo}: pelo menos ${limiar}`;
}
