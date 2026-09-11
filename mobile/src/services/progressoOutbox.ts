import { supabase } from "@/database/supabase";

import { criarFilaDuravel, type ItemEnfileirado } from "./filaDuravel";
import type { EscritaPendente } from "./progressoEscritas";

export type { EscritaPendente };

/**
 * Fila durável de progresso, tempo e pontos que não conseguiram ser gravados.
 *
 * Os quatro gravadores de `progressoTrilha` escreviam direto no Supabase, sem
 * rede de segurança: rede oscilando, app morto pelo sistema ou 500 do servidor
 * e o conteúdo concluído, o tempo daquela atividade ou o ponto conquistado
 * simplesmente não existiam. O aluno fez o trabalho e o banco não soube.
 *
 * A máquina da fila é a mesma da telemetria (`filaDuravel`). O que muda aqui
 * são os limites, e a diferença é conceitual, não um número escolhido à toa:
 *
 * **Telemetria vence em 7 dias** porque lote velho entra no banco só para
 * distorcer média de tempo recente -- é dado de observação, e observação
 * atrasada perde valor. **Progresso e ponto não estragam.** Um conteúdo
 * concluído continua concluído, e um ponto conquistado continua devido, dez
 * dias depois. Então a validade aqui é longa, e o teto é alto: o custo de
 * guardar é kilobytes, e o custo de descartar é o aluno perder o que fez.
 */

const CHAVE = "trailup:progresso-outbox";

/** Trinta dias. Ver o comentário acima: ponto não estraga. */
export const VALIDADE_PROGRESSO_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Teto alto de propósito. Cada item é um objeto pequeno, e o aluno que ficou
 * offline uma semana inteira tem MAIS direito de ver o progresso chegar, não
 * menos.
 */
export const MAX_ESCRITAS_OUTBOX = 500;

export type EscritaEnfileirada = ItemEnfileirado<EscritaPendente>;

const fila = criarFilaDuravel<EscritaPendente>({
  chave: CHAVE,
  maxItens: MAX_ESCRITAS_OUTBOX,
  validadeMs: VALIDADE_PROGRESSO_MS,
  rotulo: "progressoOutbox",
});

/**
 * Replica a escrita no Supabase.
 *
 * `upsert` é idempotente por construção -- o alvo do conflito é a identidade
 * da linha (`aluno_id,conteudo_id` e afins), então repetir converge para o
 * mesmo estado. `insert` só é seguro porque o evento carrega
 * `idempotencia_key`: a segunda entrega bate no índice único
 * `eventos_aluno_idempotencia_unico`, devolve 23505, e a fila trata 23505 como
 * DEFINITIVO -- ou seja, "já foi gravado" sai da fila em vez de ficar tentando.
 */
export async function aplicarEscrita(escrita: EscritaPendente): Promise<void> {
  const tabela = supabase.from(escrita.tabela);

  const { error } =
    escrita.operacao === "upsert"
      ? await tabela.upsert(escrita.valores, { onConflict: escrita.onConflict })
      : await tabela.insert(escrita.valores);

  // O cliente do Supabase devolve o erro no corpo em vez de lançar. Sem este
  // `throw`, a fila leria toda falha como sucesso e apagaria o item.
  if (error) throw error;
}

/**
 * Tenta gravar agora; se não der, guarda para depois.
 *
 * Nunca lança: o chamador é uma tela de estudo, e uma falha de rede não pode
 * interromper o que o aluno está fazendo. Devolve se a escrita chegou ao banco
 * para quem quiser reagir (o drain oportunista, por exemplo).
 */
export async function gravarOuEnfileirar(
  escrita: EscritaPendente,
): Promise<{ gravou: boolean }> {
  try {
    await aplicarEscrita(escrita);
    return { gravou: true };
  } catch (erro) {
    console.warn(
      `[progressoOutbox] ${escrita.operacao} em ${escrita.tabela} falhou; enfileirado.`,
      erro,
    );
    await fila.enfileirar(escrita);
    return { gravou: false };
  }
}

/**
 * Começa `true`: na abertura do app pode haver fila da execução anterior -- que
 * é justamente o caso para o qual a fila existe --, e a primeira gravação bem
 * sucedida é o melhor sinal de que a rede voltou.
 *
 * Depois disso só volta a `true` quando algo é enfileirado, para a drenagem não
 * virar uma leitura de disco a cada escrita.
 */
let podeHaverPendencia = true;

/**
 * O que os gravadores de progresso, tempo e pontos chamam.
 *
 * Grava agora ou enfileira, e escoa o que ficou para trás assim que a gravação
 * volta a funcionar -- que é o sinal certo, e não um intervalo fixo tentando no
 * escuro (mesma razão do `drenarLotesTelemetria` no MetricasContext).
 *
 * **Nunca lança.** Quem chama é uma tela de estudo, e depois desta chamada a
 * escrita ou está no banco ou está no disco: em nenhum dos dois casos faz
 * sentido interromper o que o aluno está fazendo. Antes disto, uma falha de
 * rede em `handleConcluirTopico` caía no `catch` e jogava o aluno para fora do
 * tópico com `router.back()`, sem ter gravado nada.
 */
export async function gravarProgresso(escrita: EscritaPendente): Promise<void> {
  const { gravou } = await gravarOuEnfileirar(escrita);

  if (!gravou) {
    podeHaverPendencia = true;
    return;
  }

  if (!podeHaverPendencia) return;

  podeHaverPendencia = false;
  const { pendentes } = await drenarProgressoPendente().catch(() => ({
    pendentes: 0,
  }));
  if (pendentes > 0) podeHaverPendencia = true;
}

export async function contarEscritasPendentes(): Promise<number> {
  return fila.contarPendentes();
}

/**
 * Escoa o que ficou para trás. Chame quando a gravação voltar a funcionar e na
 * abertura do app -- os dois momentos em que a fila da telemetria já é drenada,
 * pela mesma razão.
 */
export async function drenarProgressoPendente(): Promise<{
  enviados: number;
  descartados: number;
  pendentes: number;
}> {
  return fila.drenar(aplicarEscrita);
}
