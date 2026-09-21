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

/**
 * O veredito de uma questão JÁ respondida.
 *
 * Ao reabrir uma atividade concluída, a tela remarcava cada questão chamando
 * `checkResposta` de novo — ou seja, re-corrigindo contra
 * `questao.resposta_correta`. Essa coluna não chega mais ao aluno
 * (`20260921_01`), então a comparação é sempre contra `null` e **toda** questão
 * já respondida aparece como errada. É a terceira perna do "não importa o que
 * responde, sempre dá erro", e a mais enganosa: aqui o aluno nem respondeu
 * nada, só voltou para olhar.
 *
 * A resposta certa é não recorrigir. `questao_aluno.correta` é o veredito que
 * o servidor gravou no momento da resposta, e é o registro autoritativo — vem
 * na view como `correta_aluno`. Recorrigir só poderia divergir dele.
 *
 * Quando não há veredito gravado (linha antiga, ou material personalizado que
 * nunca passou pelo servidor), cai para a correção local — que para o
 * personalizado ainda tem contra o que comparar. Se nem isso existe, devolve
 * `null`: **sem status é melhor que status errado**, porque "errado" aqui é
 * uma afirmação sobre o que o aluno fez.
 */
export function vereditoDaRevisao(params: {
  corretaGravada: boolean | null | undefined;
  podeCorrigirLocalmente: boolean;
  acertouLocalmente: () => boolean;
}): "certo" | "errado" | null {
  if (typeof params.corretaGravada === "boolean") {
    return params.corretaGravada ? "certo" : "errado";
  }
  if (!params.podeCorrigirLocalmente) return null;
  return params.acertouLocalmente() ? "certo" : "errado";
}

/**
 * O veredito de uma resposta que a TELA teve de corrigir.
 *
 * `checkResposta` devolvia `false` quando não havia gabarito — e `false` é uma
 * afirmação sobre o que o aluno fez. Medido na base: **0 das 55 linhas** de
 * `conteudo_personalizado` têm `resposta_correta` em `plano`, `materiais` ou
 * `ai_patch`. Ou seja, no único caminho que corrige na tela o gabarito nunca
 * existe, e a tela reprovava **toda** resposta — "não importa o que você
 * responde, sempre dá erro" na forma mais literal possível.
 *
 * Sem gabarito a resposta certa é `null`: sem status é melhor que status
 * errado. É a mesma regra de `vereditoDaRevisao`, e agora ela vale também na
 * hora de responder, não só ao reabrir.
 *
 * `null` **não** bloqueia o aluno: quem chama trata como respondida e segue.
 * Travar a questão faria o oposto do que a decisão de corrigir na tela existe
 * para evitar — que a questão fique impossível de responder.
 */
export function vereditoLocal(params: {
  temGabarito: boolean;
  acertouLocalmente: () => boolean;
}): "certo" | "errado" | null {
  if (!params.temGabarito) return null;
  return params.acertouLocalmente() ? "certo" : "errado";
}

/** Quantos ERROS liberam o gabarito. Espelha `questao_responder`. */
export const ERROS_PARA_REVELAR = 2;

/**
 * Mostrar o gabarito agora?
 *
 * Conta ERRO, não tentativa: `tentativa` cresce também quando o aluno acerta e
 * volta para revisar, e usar esse número faria a segunda visita a uma questão
 * já acertada parecer o segundo erro. O que a regra pesa é dificuldade, e
 * dificuldade se mede em erro.
 *
 * Quem decide de verdade é o servidor — ele só MANDA o gabarito quando
 * liberado, porque esconder na tela deixaria o valor no tráfego. Esta função é
 * a mesma conta do lado do cliente, para a questão personalizada (que o
 * servidor não corrige) e para a tela saber o que dizer enquanto não há
 * gabarito: "erre de novo e eu mostro" é diferente de "não há gabarito".
 */
export function deveRevelarGabarito(params: {
  errosNaQuestao: number;
  acertou: boolean;
}): boolean {
  if (params.acertou) return true;
  return Number(params.errosNaQuestao) >= ERROS_PARA_REVELAR;
}
