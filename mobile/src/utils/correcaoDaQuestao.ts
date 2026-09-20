/**
 * Quem corrige: o servidor ou a tela?
 *
 * O gabarito saiu do alcance do aluno (`20260921_01`) e `questao_responder`
 * virou o corretor — mas só da questão **do professor**. Duas coisas impedem
 * que ele corrija a questão personalizada, e as duas foram medidas:
 *
 * 1. **A inventada não existe em `questoes`.** Quando o plano não traz id,
 *    `stableNegativeId` (`utils/personalization.ts`) dá a ela um id NEGATIVO.
 *    Mandar esse id para a RPC devolve `questao_inexistente`, e a tela trata
 *    erro de correção abortando a resposta: a questão fica impossível de
 *    responder — não erra, não acerta, não registra.
 * 2. **A que herdou o id é uma REESCRITA.** `_enriquecer_questao` preserva
 *    `item.id` da semente, então o id é real e a RPC acharia a linha — e
 *    corrigiria contra o gabarito do professor. Só que `fn_questao_confere`
 *    aceita letra e índice, e a versão personalizada reordena e reescreve as
 *    alternativas: a alternativa "A" do aluno não é a "A" do professor. O
 *    veredito sairia errado, com cara de certo.
 *
 * Há um terceiro motivo, de contabilidade: `questao_responder` GRAVA em
 * `questao_aluno`, e progresso de material personalizado é de
 * `personalizacao_item_progresso`. Registrar os dois creditaria o percurso do
 * professor por trabalho feito no personalizado.
 *
 * Fica a dívida: para a questão personalizada a resposta continua viajando no
 * payload que o aluno lê. Fechar isso exige o gabarito do material
 * personalizado sair do JSONB de `conteudo_personalizado` — hoje não há uma
 * linha sequer com ele, então é buraco dormente, não vazamento ativo.
 */
export function servidorCorrige(params: {
  questaoId: unknown;
  personalizada?: boolean;
}): boolean {
  if (params.personalizada) return false;
  const id = Number(params.questaoId);
  return Number.isInteger(id) && id > 0;
}
