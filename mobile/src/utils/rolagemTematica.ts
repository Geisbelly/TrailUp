// CSS das barras de rolagem da web em tela larga (#346): finas, na cor da
// borda do perfil, trilho transparente. Firefox usa `scrollbar-*`; Chrome,
// Edge e Safari, os pseudo-elementos `::-webkit-scrollbar`.
//
// As propriedades padrão ficam só para quem não tem os pseudo-elementos: no
// Chrome 121+ elas desligam os `::-webkit-scrollbar` (medido no Chrome 152: a
// barra volta a 11px, com trilho cinza e, no Windows, com setas). A cor e o
// resto continuam do app: a borda do perfil, sem hover.
export function cssRolagemTematica(cor: string): string {
  const c = cor.replace(/[;{}<>]/g, "");
  return [
    `@supports not selector(::-webkit-scrollbar) { * { scrollbar-width: thin; scrollbar-color: ${c} transparent; } }`,
    `*::-webkit-scrollbar { width: 8px; height: 8px; }`,
    `*::-webkit-scrollbar-track { background: transparent; }`,
    `*::-webkit-scrollbar-thumb { background: ${c}; border-radius: 8px; }`,
    `*::-webkit-scrollbar-button { display: none; }`,
    `*::-webkit-scrollbar-corner { background: transparent; }`,
  ].join("\n");
}
