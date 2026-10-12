// Layout de computador da web do aluno (#346): só vale na web e a partir desta
// largura. Abaixo dela -- e sempre no iOS/Android -- o app segue com a barra
// de abas de baixo, exatamente como antes. Fica numa função pura (sem ler
// `Platform` nem `Dimensions`) para ser testável no `node --test`.
export const LARGURA_MINIMA_DESKTOP = 1024;

export function ehDesktopWeb(plataforma: string, largura: number): boolean {
  return plataforma === "web" && largura >= LARGURA_MINIMA_DESKTOP;
}
