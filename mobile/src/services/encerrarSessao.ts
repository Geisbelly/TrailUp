// Encerramento de sessao que NAO depende da rede.
//
// O logout chamava `supabase.auth.signOut()` direto e confiava no evento
// `SIGNED_OUT` para derrubar o estado. A auth-js tem dois caminhos em que ela
// devolve erro e **pula** o `_removeSession()` -- e sem `_removeSession()` nao
// sai evento nenhum:
//
//   1. o POST /logout falha (offline, Supabase fora, 5xx). Erro de rede nao e
//      401/403/404, entao ela retorna antes de limpar;
//   2. o refresh token ja venceu, e o `_useSession()` devolve erro antes mesmo
//      de tentar a rede.
//
// Nos dois casos `signOut()` **devolve** `{ error }` em vez de lancar, entao um
// `try/catch` em volta nao ve nada. O app seguia com `autenticado === true`, a
// guarda de rota devolvia o aluno para dentro das abas, e so um cold start
// deslogava -- ali o `getSessionSafe` trata o refresh token invalido e limpa.
//
// A regra aqui: a rede e melhor esforco, a limpeza local e obrigatoria. Modulo
// puro (sem react-native/expo) para rodar no `node --import tsx --test`, como
// `apiBaseUrl.core.ts` e `prefetchPool.ts`.

export type ResultadoSignOut = { error?: unknown | null };

export type DependenciasLogout = {
  /** `supabase.auth.signOut()`: revoga o token no servidor. Pode falhar. */
  signOutRemoto: () => Promise<ResultadoSignOut>;
  /** Apaga a sessao do storage e os caches em memoria. Nao usa rede. */
  limparSessaoLocal: () => Promise<void>;
  /** Recebe a falha do lado remoto, para log. Nao muda o desfecho. */
  aoFalhar?: (erro: unknown) => void;
};

export type ResultadoLogout = {
  /** O token chegou a ser revogado no servidor. */
  remotoOk: boolean;
  /** A sessao saiu do storage deste aparelho. */
  localOk: boolean;
};

export async function encerrarSessaoDoAluno(
  deps: DependenciasLogout,
): Promise<ResultadoLogout> {
  let remotoOk = false;

  try {
    const resultado = await deps.signOutRemoto();
    if (resultado?.error) {
      deps.aoFalhar?.(resultado.error);
    } else {
      remotoOk = true;
    }
  } catch (erro) {
    deps.aoFalhar?.(erro);
  }

  // Roda sempre, inclusive quando o remoto deu certo: a auth-js ja teria
  // limpado, e repetir e barato e idempotente. Condicionar a limpeza ao sucesso
  // do remoto e justamente o que deixava a sessao viva no aparelho.
  let localOk = true;
  try {
    await deps.limparSessaoLocal();
  } catch (erro) {
    localOk = false;
    deps.aoFalhar?.(erro);
  }

  return { remotoOk, localOk };
}
