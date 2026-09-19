// Tipos de atividade e formatos de questão, num lugar só.
//
// `atividades.tipo` é `text` puro no banco -- **sem CHECK, sem enum, sem
// constraint nenhuma**. Nada impede um typo entrar, e um typo não dá erro: o
// console simplesmente não casa nenhum ramo e mostra formulário VAZIO, sem
// aviso. É por isso que a lista precisa nascer centralizada, e não espalhada em
// comparação de string -- foi o que a #150 pediu explicitamente.
//
// ## Missão é uma atividade, não uma tabela nova
//
// `tipo = 'missao'`. Uma tabela `missoes` própria seria invisível para
// `trailup_recalcular_topico_aluno`, que deriva o percentual do tópico de
// `conteudo_aluno`, `atividade_aluno` e `personalizacao_item_progresso`: o aluno
// cumpriria a missão inteira e veria a barra parada -- exatamente o problema que
// a `20260826_18` existe para corrigir.
//
// Estendendo `atividades`, a missão herda de graça prazo (`data_entrega`),
// pontuação (`pontuacao_maxima`), questões, avaliação do professor
// (`atividade_aluno.pontuacao_obtida`) e os eventos que alimentam o rank.
//
// ## O formato da missão vem da QUESTÃO
//
// Nos outros tipos, `atividades.tipo` e `questoes.tipo` são a mesma informação
// em vocabulários diferentes -- conferido no banco, as contagens batem uma a
// uma (quiz 94 / multipla 94, essay 34 / dissertativa 34, e assim por diante).
// A missão quebra esse par de propósito: ela descreve a NATUREZA da tarefa, e
// cada item dela pode ter um formato próprio. Por isso `formatoDaQuestao` cai
// no tipo da questão quando a atividade é missão.

/** Vocabulário de `questoes.tipo`, como está gravado no banco. */
export type FormatoDeQuestao =
  | "multipla"
  | "verdadeiro_falso"
  | "fill_blank"
  | "dissertativa";

export const FORMATOS_DE_QUESTAO: readonly {
  formato: FormatoDeQuestao;
  rotulo: string;
}[] = [
  { formato: "multipla", rotulo: "Múltipla escolha" },
  { formato: "verdadeiro_falso", rotulo: "Verdadeiro/Falso" },
  { formato: "fill_blank", rotulo: "Completar" },
  { formato: "dissertativa", rotulo: "Dissertação" },
] as const;

export type TipoDeAtividade =
  | "quiz"
  | "true_false"
  | "fill_blank"
  | "essay"
  | "missao";

export interface DefinicaoDeTipo {
  tipo: TipoDeAtividade;
  rotulo: string;
  /**
   * Formato implícito das questões. `null` na missão: lá o formato é de cada
   * questão, e é o que a torna capaz de misturar itens.
   */
  formato: FormatoDeQuestao | null;
}

export const TIPOS_DE_ATIVIDADE: readonly DefinicaoDeTipo[] = [
  { tipo: "quiz", rotulo: "Quiz (Múltipla)", formato: "multipla" },
  { tipo: "fill_blank", rotulo: "Completar", formato: "fill_blank" },
  { tipo: "true_false", rotulo: "Verdadeiro/Falso", formato: "verdadeiro_falso" },
  { tipo: "essay", rotulo: "Dissertação", formato: "dissertativa" },
  { tipo: "missao", rotulo: "Missão", formato: null },
] as const;

export const TIPO_DE_MISSAO = "missao" as const;

export function ehMissao(tipo: string | null | undefined): boolean {
  return String(tipo ?? "").trim().toLowerCase() === TIPO_DE_MISSAO;
}

export function acharTipo(
  tipo: string | null | undefined,
): DefinicaoDeTipo | null {
  const alvo = String(tipo ?? "").trim().toLowerCase();
  return TIPOS_DE_ATIVIDADE.find((t) => t.tipo === alvo) ?? null;
}

export function rotularTipoDeAtividade(tipo: string | null | undefined): string {
  // Tipo desconhecido aparece cru em vez de sumir: sumir esconderia uma
  // atividade que existe, e `tipo` é texto livre.
  return acharTipo(tipo)?.rotulo ?? String(tipo ?? "—");
}

const FORMATO_POR_APELIDO: Record<string, FormatoDeQuestao> = {
  multipla: "multipla",
  multipla_escolha: "multipla",
  quiz: "multipla",
  verdadeiro_falso: "verdadeiro_falso",
  true_false: "verdadeiro_falso",
  truefalse: "verdadeiro_falso",
  fill_blank: "fill_blank",
  completar: "fill_blank",
  dissertativa: "dissertativa",
  essay: "dissertativa",
};

export function normalizarFormato(
  valor: string | null | undefined,
): FormatoDeQuestao | null {
  const bruto = String(valor ?? "").trim().toLowerCase();
  return FORMATO_POR_APELIDO[bruto] ?? null;
}

/**
 * O formato que vale para ESTA questão.
 *
 * Fora da missão, o tipo da atividade manda -- é a informação canônica, e a
 * questão pode ter vindo de importação com vocabulário diferente. Na missão, o
 * tipo da atividade não carrega formato nenhum, então a questão decide.
 *
 * `multipla` é a reserva final: sem ela, uma questão sem tipo reconhecido não
 * renderizaria campo algum e o professor veria formulário vazio, que é o
 * defeito que esta lista existe para evitar.
 */
export function formatoDaQuestao(
  tipoDaAtividade: string | null | undefined,
  tipoDaQuestao: string | null | undefined,
): FormatoDeQuestao {
  if (ehMissao(tipoDaAtividade)) {
    return normalizarFormato(tipoDaQuestao) ?? "multipla";
  }

  const definicao = acharTipo(tipoDaAtividade);
  if (definicao?.formato) return definicao.formato;

  return normalizarFormato(tipoDaQuestao) ?? "multipla";
}

/**
 * Substitui o `normalizeQuestionTypeToActivityType` que estava inline no
 * editor. Continua existindo porque a questão pode chegar com o vocabulário
 * dela e o formulário do editor é indexado por tipo de ATIVIDADE.
 */
export function tipoDeAtividadeDoFormato(
  valor: string | null | undefined,
): TipoDeAtividade {
  const formato = normalizarFormato(valor);

  // A guarda de `null` não é defensiva: a MISSÃO é o tipo cujo `formato` é
  // `null`, então um `find` direto casaria com ela e um formato irreconhecível
  // transformaria a atividade em missão. Um teste guarda isso.
  if (formato === null) return "quiz";

  return TIPOS_DE_ATIVIDADE.find((t) => t.formato === formato)?.tipo ?? "quiz";
}
