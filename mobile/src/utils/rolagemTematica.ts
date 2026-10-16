// CSS das barras de rolagem da web em tela larga (#346): finas, na cor da
// borda do perfil, trilho transparente. Firefox usa `scrollbar-*`; Chrome,
// Edge e Safari, os pseudo-elementos `::-webkit-scrollbar`.
export function cssRolagemTematica(cor: string): string {
  const c = cor.replace(/[;{}<>]/g, "");
  return [
    `* { scrollbar-width: thin; scrollbar-color: ${c} transparent; }`,
    `*::-webkit-scrollbar { width: 8px; height: 8px; }`,
    `*::-webkit-scrollbar-track { background: transparent; }`,
    `*::-webkit-scrollbar-thumb { background: ${c}; border-radius: 8px; }`,
    `*::-webkit-scrollbar-corner { background: transparent; }`,
  ].join("\n");
}
