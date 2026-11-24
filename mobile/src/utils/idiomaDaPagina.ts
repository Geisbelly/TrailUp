/**
 * Idioma da página do app na web: português, sem tradução automática do navegador.
 *
 * O HTML do app do aluno (`trailup.vercel.app/aluno/`) saía com `<html lang="en">`, o padrão do
 * Expo quando `web.lang` falta no `app.json`. O Chrome lia a página como inglês e a "traduzia"
 * para português (24/11, aluno de teste da turma 3):
 *
 * - a barra lateral mostrou "Não" no lugar de "Notificações", "Classificação" no lugar de
 *   "Ranking" e "configurações" em minúscula;
 * - pior, o tradutor troca cada texto por um nó dele, e o React segue atualizando o nó original,
 *   que já não está na tela. O texto fica parado no primeiro valor: o cartão da Trilha dizia
 *   "0 % concluído, 0 de 5 módulos" com a barra (estilo, não texto) já em 20%, e o painel juntava
 *   "0 % do módulo" com "Concluído". Para o aluno, o progresso "não era salvo".
 *
 * `app.json` agora declara `web.lang`, e isto cobre também o HTML já publicado e o que vier de
 * outro modelo: roda antes da primeira tela. A mesma regra do console (`frontend/index.html`).
 */

type ElementoMinimo = {
  setAttribute(nome: string, valor: string): void;
  classList?: { add(classe: string): void };
};

type DocumentoMinimo = {
  documentElement: ElementoMinimo & { lang: string };
  head: { appendChild(no: unknown): unknown } | null;
  querySelector(seletor: string): unknown;
  createElement(tag: string): ElementoMinimo;
};

export const IDIOMA_DA_PAGINA = "pt-BR";

export function fixarIdiomaDaPagina(doc: DocumentoMinimo): void {
  const html = doc.documentElement;
  html.lang = IDIOMA_DA_PAGINA;
  html.setAttribute("translate", "no");
  html.classList?.add("notranslate");
  if (doc.head && !doc.querySelector('meta[name="google"]')) {
    const meta = doc.createElement("meta");
    meta.setAttribute("name", "google");
    meta.setAttribute("content", "notranslate");
    doc.head.appendChild(meta);
  }
}
