/**
 * Os primeiros segmentos de rota que só o aluno com sessão abre.
 *
 * `(tabs)` é o app. `desafio` é a tela da missão-desafio (`app/desafio/[id].tsx`), que mora na
 * pilha raiz, fora das abas: aberta de dentro da aba Social, ela passava por cima do cadeado da
 * aba (que mora no `tabPress`) quando o "Resolver" do rastreador da Trilha a empurrava. Sem ela
 * aqui, `VerificacaoDeRota` mandaria o aluno logado de volta às abas e não guardaria o link para
 * depois do login.
 */
const AREA_LOGADA: ReadonlySet<string> = new Set(["(tabs)", "desafio"]);

export function estaNaAreaLogada(segmento: string | undefined): boolean {
  return segmento != null && AREA_LOGADA.has(segmento);
}
