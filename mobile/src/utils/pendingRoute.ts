// Guarda a rota protegida que o aluno tentou abrir sem sessão, para
// restaurá-la depois do login (issue #27). Estado em memória: sobrevive
// à navegação para (auth) mas não a um reload da aba — comportamento
// aceitável aqui, já que um reload já perde a intenção de navegação.
let pendingRoute: string | null = null;

export function setPendingRoute(path: string | null): void {
  pendingRoute = path;
}

export function consumePendingRoute(): string | null {
  const path = pendingRoute;
  pendingRoute = null;
  return path;
}
