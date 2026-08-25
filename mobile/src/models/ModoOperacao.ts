export class ModoOperacao {
  id: string;
  nome: string;
  descricao: string;
  ordem: ("conteudo" | "pergunta")[];
    static AUTOMATICO: any;
    static MANUAL: any;

  constructor(
    id: string,
    nome: string,
    descricao: string,
    ordem: ("conteudo" | "pergunta")[]
  ) {
    this.id = id;
    this.nome = nome;
    this.descricao = descricao;
    this.ordem = ordem;
  }

  // Método para alternar dinamicamente a ordem
  alternar() {
    this.ordem.reverse();
  }

  // Método para IA alterar ordem com base no aluno
  aplicarRegra(aluno: any) {
    // lógica futura de IA
    if (aluno.perfisPrincipais.some((p: ModoOperacao) => p.nome === "explorador")) {
      this.ordem = ["conteudo", "pergunta"];
    } else {
      this.ordem = ["pergunta", "conteudo"];
    }
  }
}

// Instâncias prontas
export const ConteudoPrimeiro = new ModoOperacao(
  "conteudoPrimeiro",
  "Conteúdo Primeiro",
  "Apresenta o conteúdo antes das perguntas",
  ["conteudo", "pergunta"]
);

export const PerguntasPrimeiro = new ModoOperacao(
  "perguntasPrimeiro",
  "Perguntas Primeiro",
  "Começa com perguntas para engajar o aluno",
  ["pergunta", "conteudo"]
);

export const Misturado = new ModoOperacao(
  "misturado",
  "Misturado",
  "Intercala conteúdo e perguntas de forma balanceada",
  ["conteudo", "pergunta"]
);
