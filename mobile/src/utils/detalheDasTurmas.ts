/**
 * Junção dos detalhes das turmas na escolha de turma.
 *
 * O detalhe de cada turma (`vw_aluno_classe_detalhado`) é uma consulta separada, e
 * todas saem juntas na abertura do app, ao lado de umas 25 outras. Em 02/11 elas
 * levaram de 10 a 43 s nesse pico e uma ou todas voltaram 500; disparadas uma por
 * vez, cada uma levava de 0,6 a 4 s. Com `Promise.all`, uma turma lenta derrubava a
 * tela inteira. Aqui cada turma tem o próprio resultado: a que falhou leva o erro e
 * as outras aparecem.
 */

export type DetalheDaTurma<T> = { topicos: T[]; erro: Error | null };

/** Espera antes da única nova tentativa: o pico de 02/11 passava em segundos. */
export const ESPERA_NOVA_TENTATIVA_MS = 1500;

type Opcoes = {
  esperaMs?: number;
  esperar?: (ms: number) => Promise<void>;
};

const esperarDeVerdade = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function comoErro(valor: unknown): Error {
  if (valor instanceof Error) return valor;
  // O PostgrestError do supabase-js é um objeto simples com `message` e `code`.
  const objeto = valor as { message?: unknown; code?: unknown } | null;
  const erro = new Error(typeof objeto?.message === "string" ? objeto.message : String(valor));
  if (objeto && typeof objeto.code === "string") (erro as Error & { code?: string }).code = objeto.code;
  return erro;
}

/** Uma nova tentativa só, depois de uma espera curta. A segunda falha é a que vale. */
export async function comUmaNovaTentativa<R>(carregar: () => Promise<R>, opcoes: Opcoes = {}): Promise<R> {
  const { esperaMs = ESPERA_NOVA_TENTATIVA_MS, esperar = esperarDeVerdade } = opcoes;
  try {
    return await carregar();
  } catch {
    await esperar(esperaMs);
    return carregar();
  }
}

/** Carrega o detalhe de cada turma; a falha de uma não descarta as outras. Mantém a ordem de entrada. */
export async function carregarDetalhesDasTurmas<K, T>(
  turmas: readonly K[],
  carregar: (turma: K) => Promise<T[]>,
  opcoes: Opcoes = {},
): Promise<DetalheDaTurma<T>[]> {
  const resultados = await Promise.allSettled(
    turmas.map((turma) => comUmaNovaTentativa(() => carregar(turma), opcoes)),
  );
  return resultados.map((resultado) =>
    resultado.status === "fulfilled"
      ? { topicos: resultado.value, erro: null }
      : { topicos: [], erro: comoErro(resultado.reason) },
  );
}

type TurmaComDetalhe = { classe_id: number; aluno_id: string; topicos: unknown[]; detalheErro: Error | null };

/**
 * Num "Atualizar", a turma cujo detalhe falhou agora fica com o detalhe que já estava
 * na tela. Antes a atualização inteira falhava e a lista antiga ficava; sem isto, a
 * turma escolhida passaria a abrir uma Trilha vazia. Altera as turmas novas no lugar.
 */
export function manterDetalheAnterior<C extends TurmaComDetalhe>(novas: C[], anteriores: readonly C[]): C[] {
  for (const nova of novas) {
    if (!nova.detalheErro) continue;
    const anterior = anteriores.find(
      (turma) => turma.classe_id === nova.classe_id && turma.aluno_id === nova.aluno_id && !turma.detalheErro,
    );
    if (!anterior) continue;
    nova.topicos = anterior.topicos;
    nova.detalheErro = null;
  }
  return novas;
}

/**
 * Uma linha por matrícula, na ordem em que chegaram. `vw_aluno_classe_resumo` já devolveu duas
 * linhas para a mesma matrícula (aluno com duas linhas em `iaDescricao`, medido em 24/11; a view foi
 * corrigida na `20261124_06`): a turma aparecia duas vezes, e o `.single()` do resumo falhava com
 * `PGRST116`, que o app lia como "sem resumo" e deixava o percentual parado na tela. As colunas de
 * progresso vêm de `classe_aluno` e são iguais nas duas linhas, então a primeira basta.
 */
export function umaLinhaPorTurma<R extends { aluno_id?: unknown; classe_id?: unknown }>(linhas: readonly R[]): R[] {
  const vistas = new Set<string>();
  return linhas.filter((linha) => {
    const chave = `${String(linha.aluno_id ?? "")}:${String(linha.classe_id ?? "")}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}
