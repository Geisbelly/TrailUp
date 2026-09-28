// O `markdown-it` e' o parser por baixo do react-native-markdown-display, mas
// vem como dependencia transitiva e nao publica tipos.
//
// O app NAO importa este modulo direto: o componente usa o `MarkdownIt`
// reexportado pela biblioteca, que ja vem tipado. Quem importa e'
// `utils/markdownDataUri.test.ts`, que precisa do parser de verdade — o bug que
// aquele teste trava (o markdown-it descartando o diagrama em data URI) so
// aparece contra a implementacao real, um dublê o esconderia.
//
// Declarado so o que o teste usa, em vez de puxar `@types/markdown-it`: uma
// devDependency inteira para seis assinaturas, num modulo que a producao nem
// importa, nao se paga.
declare module "markdown-it" {
  interface MarkdownItToken {
    type: string;
    children?: MarkdownItToken[] | null;
    attrGet(nome: string): string | null;
  }

  class MarkdownIt {
    constructor(opcoes?: Record<string, unknown>);
    parse(origem: string, env: Record<string, unknown>): MarkdownItToken[];
    render(origem: string): string;
    validateLink(url: string): boolean;
  }

  export = MarkdownIt;
}
