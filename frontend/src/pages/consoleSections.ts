// Cada aba do console do professor tem rota propria: refresh volta pra mesma
// aba, o botao voltar do navegador anda entre abas em vez de sair do console, e
// o link e compartilhavel. A relacao aba <-> caminho vive so aqui - App.tsx
// declara as rotas a partir desta lista e Console.tsx deriva a aba ativa da URL
// (nao ha estado local de aba: a URL e a fonte da verdade).
//
// A aba padrao fica em /console, sem slug, pra nao invalidar link antigo.

export const CONSOLE_SECTIONS = [
  { view: "dashboard", slug: "" },
  { view: "trilha", slug: "trilha" },
  { view: "classes", slug: "turmas" },
  { view: "personalizacoes", slug: "personalizacoes" },
  { view: "ranks", slug: "ranks" },
  { view: "profile", slug: "meus-dados" },
  { view: "aprovacoes", slug: "aprovacoes" },
] as const;

export type ConsoleView = (typeof CONSOLE_SECTIONS)[number]["view"];

export const CONSOLE_BASE_PATH = "/console";
export const DEFAULT_CONSOLE_VIEW: ConsoleView = "dashboard";

export function consolePathForView(view: ConsoleView): string {
  const secao = CONSOLE_SECTIONS.find((s) => s.view === view);
  if (!secao || !secao.slug) return CONSOLE_BASE_PATH;
  return `${CONSOLE_BASE_PATH}/${secao.slug}`;
}

/**
 * Resolve a aba ativa a partir do pathname. Devolve null quando o caminho nao
 * pertence ao console ou o segmento nao corresponde a nenhuma aba - quem chama
 * decide o que fazer (o roteador ja manda desconhecido pro NotFound).
 *
 * Subrotas contam como a aba dona do primeiro segmento: o editor de topico em
 * /console/trilha/:id/editar continua sendo a aba Trilha.
 */
export function consoleViewFromPathname(pathname: string): ConsoleView | null {
  const limpo = pathname.replace(/\/+$/, "");
  if (limpo !== CONSOLE_BASE_PATH && !limpo.startsWith(`${CONSOLE_BASE_PATH}/`)) {
    return null;
  }

  const resto = limpo.slice(CONSOLE_BASE_PATH.length).replace(/^\//, "");
  if (!resto) return DEFAULT_CONSOLE_VIEW;

  const primeiroSegmento = resto.split("/")[0];
  const secao = CONSOLE_SECTIONS.find((s) => s.slug && s.slug === primeiroSegmento);
  return secao ? secao.view : null;
}
