import { describe, expect, it } from "vitest";
import {
  DESAFIOS_SCHEMA,
  PERFIS_BRAINHEX,
  PERFIS_PADRAO,
  normalizarDesafios,
  promptDeDesafios,
  type PropostaDeDesafio,
} from "./desafios";
import { letrasDaGrade } from "./montarCruzadinha";
import { chaveDoTexto, criarFiltroDeRepetidas } from "./repetidas";

// Termos que se cruzam (a montagem é por código; o teste confere que a grade saiu).
const TERMOS_BANCO = [
  { termo: "Tabela", pista: "Estrutura de linhas e colunas onde os dados ficam guardados" },
  { termo: "Chave", pista: "Campo que identifica cada registro sem repetição" },
  { termo: "Índice", pista: "Estrutura que acelera a busca por um campo" },
  { termo: "Banco de dados", pista: "Coleção organizada de informações de um sistema" },
  { termo: "Consulta", pista: "Pedido de leitura escrito em SQL" },
  { termo: "Atributo", pista: "Característica de uma entidade no modelo" },
];

const TERMOS_REDES = [
  { termo: "Roteador", pista: "Equipamento que encaminha pacotes entre redes" },
  { termo: "Pacote", pista: "Unidade de dados que viaja pela rede" },
  { termo: "Protocolo", pista: "Conjunto de regras de comunicação" },
  { termo: "Servidor", pista: "Máquina que atende pedidos de clientes" },
  { termo: "Endereço", pista: "Identificação de uma máquina na rede" },
  { termo: "Porta", pista: "Número que separa os serviços de um mesmo host" },
];

const LOGICA_MULTIPLA = {
  titulo: "Qual vem depois",
  enunciado: "Uma tabela cresce 1, 2, 4, 8 registros por dia. Quantos registros entram no quinto dia?",
  formato: "multipla",
  alternativas: ["10", "12", "16", "32"],
  resposta: "16",
  sinonimos: [],
};

const LOGICA_CURTA = {
  titulo: "Dedução da chave",
  enunciado: "Se todo valor do campo X precisa ser único e não nulo para identificar a linha, que papel X cumpre na tabela?",
  formato: "curta",
  resposta: "Chave primária",
  sinonimos: ["chave primaria", "PK", "primary key"],
};

function bruto(over: Partial<{ logicas: unknown[]; cruzadinhas: unknown[] }> = {}) {
  return {
    logicas: [LOGICA_MULTIPLA, LOGICA_CURTA],
    cruzadinhas: [
      { titulo: "Termos de banco", termos: TERMOS_BANCO },
      { titulo: "Termos de redes", termos: TERMOS_REDES },
    ],
    ...over,
  };
}

const semFiltro = () => criarFiltroDeRepetidas([]);

/** Todos os textos que o aluno lê no desafio público (os valores, não as chaves do JSON). */
function textosDoDesafio(valor: unknown): string[] {
  if (typeof valor === "string") return [valor];
  if (Array.isArray(valor)) return valor.flatMap(textosDoDesafio);
  if (valor && typeof valor === "object") return Object.values(valor).flatMap(textosDoDesafio);
  return [];
}

/** Todas as chaves de objeto, em qualquer nível. */
function chavesDoDesafio(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(chavesDoDesafio);
  if (valor && typeof valor === "object") {
    return Object.entries(valor).flatMap(([chave, filho]) => [chave, ...chavesDoDesafio(filho)]);
  }
  return [];
}

function porTipo(desafios: PropostaDeDesafio[], tipo: PropostaDeDesafio["tipo"]) {
  return desafios.filter((d) => d.tipo === tipo);
}

describe("normalizarDesafios", () => {
  it("aceita 2 lógicas e 2 cruzadinhas e põe os perfis padrão", () => {
    const { desafios, descartados } = normalizarDesafios(bruto(), semFiltro());
    expect(descartados).toBe(0);
    expect(porTipo(desafios, "logica")).toHaveLength(2);
    expect(porTipo(desafios, "cruzadinha")).toHaveLength(2);
    for (const d of desafios) {
      expect(d.perfis).toEqual(PERFIS_PADRAO[d.tipo]);
      for (const perfil of d.perfis) expect(PERFIS_BRAINHEX).toContain(perfil);
      expect(d.desafio.tipo).toBe(d.tipo);
      expect(d.titulo.length).toBeGreaterThan(0);
    }
    expect(PERFIS_PADRAO.logica).toEqual(["mastermind", "achiever"]);
    expect(PERFIS_PADRAO.cruzadinha).toEqual(["seeker", "mastermind"]);

    const multipla = desafios.find((d) => d.tipo === "logica" && d.desafio.formato === "multipla");
    expect(multipla?.tipo).toBe("logica");
    if (multipla?.tipo !== "logica" || multipla.desafio.formato !== "multipla") return;
    expect(Object.keys(multipla.desafio).sort()).toEqual(["alternativas", "enunciado", "formato", "tipo"]);
    expect(multipla.desafio.enunciado).toBe(LOGICA_MULTIPLA.enunciado);
    // A certa muda de lugar (ver o teste da posição); as outras mantêm a ordem entre si.
    expect([...multipla.desafio.alternativas].sort()).toEqual(["10", "12", "16", "32"]);
    expect(multipla.desafio.alternativas.filter((a) => a !== "16")).toEqual(["10", "12", "32"]);
    expect(multipla.resposta).toEqual({ aceitas: ["16"] });
  });

  it("cruzadinha que não monta é descartada e contada", () => {
    // Nenhuma letra em comum: nada cruza, a grade não sai.
    const soltas = [
      { termo: "Abc", pista: "Primeira" },
      { termo: "Def", pista: "Segunda" },
      { termo: "Ghi", pista: "Terceira" },
      { termo: "Jkl", pista: "Quarta" },
      { termo: "Mno", pista: "Quinta" },
    ];
    const { desafios, descartados } = normalizarDesafios(
      bruto({ cruzadinhas: [{ titulo: "Soltas", termos: soltas }, { titulo: "Banco", termos: TERMOS_BANCO }] }),
      semFiltro(),
    );
    expect(porTipo(desafios, "cruzadinha")).toHaveLength(1);
    expect(descartados).toBe(1);
  });

  it("cruzadinha monta só com as palavras que o banco aceita e a resposta bate com a grade", () => {
    const { desafios } = normalizarDesafios(bruto(), semFiltro());
    expect(porTipo(desafios, "cruzadinha")).toHaveLength(2);
    for (const d of porTipo(desafios, "cruzadinha")) {
      if (d.tipo !== "cruzadinha") continue;
      const { desafio, resposta } = d;
      // Os limites de missao_desafio_criar (20261117_03).
      expect(desafio.linhas).toBeGreaterThanOrEqual(2);
      expect(desafio.linhas).toBeLessThanOrEqual(40);
      expect(desafio.colunas).toBeGreaterThanOrEqual(2);
      expect(desafio.colunas).toBeLessThanOrEqual(40);
      expect(desafio.palavras.length).toBeGreaterThanOrEqual(4);
      expect(desafio.palavras.length).toBeLessThanOrEqual(10);
      const chaves = desafio.palavras.map((p) => `${p.numero}${p.direcao}`);
      expect(Object.keys(resposta.palavras).sort()).toEqual([...chaves].sort());
      for (const p of desafio.palavras) {
        const palavra = resposta.palavras[`${p.numero}${p.direcao}`];
        expect(letrasDaGrade(palavra)).toHaveLength(p.tamanho);
        expect(Array.from(p.pista).length).toBeLessThanOrEqual(200);
        expect(Object.keys(p).sort()).toEqual(["coluna", "direcao", "linha", "numero", "pista", "tamanho"]);
      }
    }
  });

  it("lógica múltipla com resposta fora das alternativas é descartada", () => {
    const fora = { ...LOGICA_MULTIPLA, resposta: "64" };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [fora, LOGICA_CURTA] }), semFiltro());
    expect(porTipo(desafios, "logica")).toHaveLength(1);
    expect(descartados).toBe(1);
  });

  it("lógica múltipla compara a resposta como o banco e guarda o texto da alternativa", () => {
    const multipla = {
      ...LOGICA_MULTIPLA,
      alternativas: ["Índice", "Tabela", "Visão", "Gatilho"],
      resposta: "  indice ",
    };
    const { desafios } = normalizarDesafios(bruto({ logicas: [multipla] }), semFiltro());
    expect(desafios[0].resposta).toEqual({ aceitas: ["Índice"] });
  });

  it("lógica múltipla precisa de 4 alternativas diferentes", () => {
    const tres = { ...LOGICA_MULTIPLA, alternativas: ["10", "12", "16"] };
    const repetidas = { ...LOGICA_MULTIPLA, alternativas: ["Dicionário", "dicionario", "Lista", "Fila"], resposta: "Lista" };
    const semAlternativas = { ...LOGICA_MULTIPLA, alternativas: undefined };
    const { desafios, descartados } = normalizarDesafios(
      bruto({ logicas: [tres, repetidas, semAlternativas] }),
      semFiltro(),
    );
    expect(porTipo(desafios, "logica")).toHaveLength(0);
    expect(descartados).toBe(3);
  });

  it("lógica curta junta resposta e sinônimos em aceitas, sem repetir forma normalizada", () => {
    const { desafios } = normalizarDesafios(bruto({ logicas: [LOGICA_CURTA] }), semFiltro());
    const curta = desafios[0];
    expect(curta.tipo).toBe("logica");
    expect(curta.desafio).toEqual({ tipo: "logica", enunciado: LOGICA_CURTA.enunciado, formato: "curta" });
    // "chave primaria" é a mesma forma de "Chave primária" (sem caixa e sem acento).
    expect(curta.resposta).toEqual({ aceitas: ["Chave primária", "PK", "primary key"] });
  });

  it("lógica curta separa formas escritas com | e corta espaço a mais", () => {
    const curta = { ...LOGICA_CURTA, resposta: "Chave  primária | PK", sinonimos: ["  pk  ", "", 7, "Chave Primária"] };
    const { desafios } = normalizarDesafios(bruto({ logicas: [curta] }), semFiltro());
    expect(desafios[0].resposta).toEqual({ aceitas: ["Chave primária", "PK"] });
  });

  it("descarta lógica com enunciado longo, formato desconhecido ou sem resposta", () => {
    const longo = { ...LOGICA_CURTA, enunciado: "a".repeat(1001) };
    const formato = { ...LOGICA_CURTA, formato: "verdadeiro_falso" };
    const semResposta = { ...LOGICA_CURTA, resposta: "   ", sinonimos: [] };
    const respostaLonga = { ...LOGICA_CURTA, resposta: "b".repeat(201), sinonimos: [] };
    const alternativaLonga = { ...LOGICA_MULTIPLA, alternativas: ["10", "12", "16", "3".repeat(201)] };
    const { desafios, descartados } = normalizarDesafios(
      bruto({ logicas: [longo, formato, semResposta, respostaLonga, alternativaLonga, "texto", null] }),
      semFiltro(),
    );
    expect(porTipo(desafios, "logica")).toHaveLength(0);
    expect(descartados).toBe(7);
  });

  it("enunciado de 1000 caracteres ainda entra (o limite do banco conta caractere, não unidade UTF-16)", () => {
    const enunciado = "é".repeat(999) + "😀"; // 1000 caracteres, 1001 unidades UTF-16
    const { desafios } = normalizarDesafios(bruto({ logicas: [{ ...LOGICA_CURTA, enunciado }] }), semFiltro());
    expect(desafios).toHaveLength(3);
  });

  it("sinônimo inválido sai sozinho, sem derrubar a lógica, e aceitas fica em 20", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => `forma ${i}`);
    const curta = { ...LOGICA_CURTA, sinonimos: ["x".repeat(201), ...muitos] };
    const { desafios } = normalizarDesafios(bruto({ logicas: [curta] }), semFiltro());
    const resposta = desafios[0].resposta as { aceitas: string[] };
    expect(resposta.aceitas).toHaveLength(20);
    expect(resposta.aceitas[0]).toBe("Chave primária");
    expect(resposta.aceitas.every((a) => Array.from(a).length <= 200)).toBe(true);
  });

  it("corta em 2 por tipo", () => {
    const outraCurta = { ...LOGICA_CURTA, enunciado: "Qual estrutura acelera a busca por um campo sem ler a tabela inteira?", resposta: "Índice", sinonimos: [] };
    const terceira = { ...LOGICA_CURTA, enunciado: "Que comando lê dados de uma tabela sem alterá-la em nada?", resposta: "SELECT", sinonimos: [] };
    const { desafios, descartados } = normalizarDesafios(
      bruto({
        logicas: [LOGICA_MULTIPLA, outraCurta, terceira],
        cruzadinhas: [
          { titulo: "A", termos: TERMOS_BANCO },
          { titulo: "B", termos: TERMOS_REDES },
          { titulo: "C", termos: TERMOS_BANCO },
        ],
      }),
      semFiltro(),
    );
    expect(porTipo(desafios, "logica")).toHaveLength(2);
    expect(porTipo(desafios, "cruzadinha")).toHaveLength(2);
    expect(desafios.map((d) => d.titulo)).toEqual([LOGICA_MULTIPLA.titulo, outraCurta.titulo, "A", "B"]);
    // O excedente não é falha: o modelo só mandou mais do que o pedido.
    expect(descartados).toBe(0);
  });

  it("enunciado repetido do tópico é descartado pelo filtro", () => {
    // A mesma pergunta, com outra caixa e pontuação, já está no tópico.
    const filtro = criarFiltroDeRepetidas([`${LOGICA_CURTA.enunciado.toUpperCase()}!`]);
    const { desafios, descartados } = normalizarDesafios(bruto(), filtro);
    expect(porTipo(desafios, "logica").map((d) => d.titulo)).toEqual([LOGICA_MULTIPLA.titulo]);
    expect(descartados).toBe(1);
  });

  it("as duas lógicas da mesma geração não repetem uma à outra", () => {
    const quase = { ...LOGICA_CURTA, titulo: "Outra", enunciado: LOGICA_CURTA.enunciado.toUpperCase() };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [LOGICA_CURTA, quase] }), semFiltro());
    expect(porTipo(desafios, "logica")).toHaveLength(1);
    expect(descartados).toBe(1);
  });

  it("lógica descartada por outro motivo não ocupa o filtro", () => {
    const filtro = semFiltro();
    const invalida = { ...LOGICA_MULTIPLA, resposta: "64" };
    const valida = { ...LOGICA_MULTIPLA, titulo: "Agora certa" };
    const { desafios } = normalizarDesafios(bruto({ logicas: [invalida, valida] }), filtro);
    expect(porTipo(desafios, "logica").map((d) => d.titulo)).toEqual(["Agora certa"]);
  });

  it("desafio público não contém a resposta", () => {
    const { desafios } = normalizarDesafios(bruto(), semFiltro());
    expect(desafios).toHaveLength(4);
    for (const d of desafios) {
      // Nenhuma chave de resposta em nível nenhum (o CHECK missoes_desafio_forma recusaria).
      for (const chave of chavesDoDesafio(d.desafio)) {
        expect(["resposta", "respostas", "aceitas", "gabarito", "palavra"]).not.toContain(chave);
      }
      const texto = ` ${textosDoDesafio(d.desafio).map(chaveDoTexto).join(" ")} `;
      if (d.tipo === "cruzadinha") {
        const termos = [...TERMOS_BANCO, ...TERMOS_REDES];
        for (const palavra of Object.values(d.resposta.palavras)) {
          // A forma da grade ("BANCODEDADOS") e a forma escrita ("banco de dados"), também no plural.
          expect(texto).not.toContain(` ${chaveDoTexto(palavra)}`);
          for (const { termo } of termos.filter((t) => letrasDaGrade(t.termo) === palavra)) {
            expect(texto).not.toContain(` ${chaveDoTexto(termo)}`);
          }
        }
      } else if (d.desafio.formato === "curta") {
        for (const aceita of d.resposta.aceitas) expect(texto).not.toContain(` ${chaveDoTexto(aceita)} `);
      } else {
        // Na múltipla a certa está entre as alternativas, como as outras: nada a marca.
        expect(Object.keys(d.desafio).sort()).toEqual(["alternativas", "enunciado", "formato", "tipo"]);
        for (const aceita of d.resposta.aceitas) expect(d.desafio.alternativas).toContain(aceita);
      }
    }
  });

  it("desafio público não carrega campo a mais vindo do modelo", () => {
    const comSolucao = { ...LOGICA_CURTA, solucao: "Chave primária", explicacao: "porque..." };
    const cruzadinha = {
      titulo: "Banco",
      termos: TERMOS_BANCO.map((t) => ({ ...t, resposta: t.termo })),
      gabarito: { x: 1 },
    };
    const { desafios } = normalizarDesafios(bruto({ logicas: [comSolucao], cruzadinhas: [cruzadinha] }), semFiltro());
    expect(desafios).toHaveLength(2);
    for (const d of desafios) {
      const json = JSON.stringify(d.desafio);
      expect(json).not.toContain("solucao");
      expect(json).not.toContain("explicacao");
      expect(json).not.toContain("gabarito");
      expect(json).not.toContain("resposta");
    }
  });

  it("lógica curta cujo enunciado já diz a resposta é descartada", () => {
    const entrega = {
      ...LOGICA_CURTA,
      enunciado: "A chave primária identifica cada linha. Que campo identifica cada linha?",
    };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [entrega] }), semFiltro());
    expect(porTipo(desafios, "logica")).toHaveLength(0);
    expect(descartados).toBe(1);
  });

  it("lógica curta com a resposta no plural dentro do enunciado também sai, mas número só vale inteiro", () => {
    const plural = {
      ...LOGICA_CURTA,
      enunciado: "Os índices aceleram a busca. Que estrutura evita ler a tabela inteira numa consulta por campo?",
      resposta: "Índice",
      sinonimos: [],
    };
    // "125" não está em "1250": número só vale como palavra inteira.
    const numero = {
      ...LOGICA_CURTA,
      enunciado: "Uma tabela tem 1250 linhas e perde metade a cada dia. Quantas linhas restam no fim do terceiro dia, arredondando para baixo?",
      resposta: "156",
      sinonimos: ["125"],
    };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [plural, numero] }), semFiltro());
    expect(porTipo(desafios, "logica").map((d) => d.resposta)).toEqual([{ aceitas: ["156", "125"] }]);
    expect(descartados).toBe(1);
  });

  it("a posição da certa sai do enunciado, não da ordem do modelo", () => {
    const posicoes = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      const multipla = {
        ...LOGICA_MULTIPLA,
        enunciado: `Um índice reduz a busca à metade a cada nível. Com ${i + 3} níveis, de quantas páginas é a tabela?`,
        // A certa sempre em primeiro, como o modelo costuma mandar.
        alternativas: ["Certa com acento é", "Outra A", "Outra B", "Outra C"],
        resposta: "certa com acento e",
      };
      const { desafios } = normalizarDesafios(bruto({ logicas: [multipla], cruzadinhas: [] }), semFiltro());
      const d = desafios[0];
      expect(d?.tipo).toBe("logica");
      if (d?.tipo !== "logica" || d.desafio.formato !== "multipla") continue;
      expect(d.resposta).toEqual({ aceitas: ["Certa com acento é"] });
      expect(d.desafio.alternativas.filter((a) => a !== "Certa com acento é")).toEqual(["Outra A", "Outra B", "Outra C"]);
      posicoes.add(d.desafio.alternativas.indexOf("Certa com acento é"));
      // Determinística: a mesma entrada dá a mesma posição.
      const deNovo = normalizarDesafios(bruto({ logicas: [multipla], cruzadinhas: [] }), semFiltro()).desafios[0];
      expect(deNovo.desafio).toEqual(d.desafio);
    }
    expect([...posicoes].sort()).toEqual([0, 1, 2, 3]);
  });

  it("múltipla cujo enunciado cita só a certa é descartada", () => {
    // Resposta de 3 caracteres ou mais: as de 1 ou 2 ficam fora da regra (teste abaixo).
    const comandos = { alternativas: ["SELECT", "INSERT", "UPDATE", "DELETE"], resposta: "SELECT" };
    const entrega = {
      ...LOGICA_MULTIPLA,
      ...comandos,
      enunciado: "Uma consulta com SELECT não altera a tabela. Que comando só lê os dados, sem mudar nada?",
    };
    // Citar a certa junto com outra não aponta para nenhuma.
    const cita = {
      ...LOGICA_MULTIPLA,
      ...comandos,
      titulo: "Cita duas",
      enunciado: "Entre SELECT e DELETE, e os outros comandos, qual deles só lê os dados de uma tabela?",
    };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [entrega, cita], cruzadinhas: [] }), semFiltro());
    expect(desafios.map((d) => d.titulo)).toEqual(["Cita duas"]);
    expect(descartados).toBe(1);
  });

  it("alternativa de 1 ou 2 letras não serve de álibi para a certa citada", () => {
    // O "a" do texto não é a alternativa "A": o enunciado entrega "Árvore" e a proposta sai.
    const entrega = {
      ...LOGICA_MULTIPLA,
      alternativas: ["Árvore", "A", "Hash", "Lista"],
      resposta: "Árvore",
      enunciado: "A árvore guarda os dados em ordem. Que estrutura guarda os dados em ordem e busca em log n?",
    };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [entrega], cruzadinhas: [] }), semFiltro());
    expect(desafios).toEqual([]);
    expect(descartados).toBe(1);
  });

  it("resposta de 1 ou 2 letras não passa pela regra de vazamento", () => {
    // "e" é conjunção em quase todo enunciado; a letra solta não entrega a sequência.
    const curta = {
      ...LOGICA_CURTA,
      titulo: "Letra E",
      enunciado: "Os vértices A, B, C e D formam um caminho em ordem alfabética. Qual vértice vem depois de D?",
      resposta: "E",
      sinonimos: [],
    };
    const multipla = {
      ...LOGICA_MULTIPLA,
      titulo: "Múltipla E",
      enunciado: "Depois de C e D, na ordem alfabética, qual letra vem a seguir?",
      alternativas: ["E", "F", "G", "H"],
      resposta: "E",
    };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [curta, multipla], cruzadinhas: [] }), semFiltro());
    expect(desafios.map((d) => d.titulo)).toEqual(["Letra E", "Múltipla E"]);
    expect(descartados).toBe(0);
  });

  it("resposta de 3 letras ou mais continua sendo pega", () => {
    const curta = {
      ...LOGICA_CURTA,
      enunciado: "Que linguagem o professor usa nas consultas? SQL é a resposta que se espera nesta pergunta.",
      resposta: "SQL",
      sinonimos: [],
    };
    const multipla = {
      ...LOGICA_MULTIPLA,
      enunciado: "Para ler dados sem alterar nada, usa-se SELECT. Qual comando lê os dados de uma tabela?",
      alternativas: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      resposta: "SELECT",
    };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [curta, multipla], cruzadinhas: [] }), semFiltro());
    expect(desafios).toHaveLength(0);
    expect(descartados).toBe(2);
  });

  it("caso aceito: a resposta 125 derruba o enunciado que cita 1,125", () => {
    const decimal = {
      ...LOGICA_CURTA,
      enunciado: "Uma consulta leva 1,125 segundo e outra leva o dobro mais um. Quantos milissegundos leva a outra, menos 2000?",
      resposta: "125",
      sinonimos: [],
    };
    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [decimal], cruzadinhas: [] }), semFiltro());
    expect(desafios).toHaveLength(0);
    expect(descartados).toBe(1);
  });

  it("a segunda cruzadinha com as mesmas palavras da primeira é descartada", () => {
    const embaralhada = [...TERMOS_BANCO].reverse().map((t) => ({ ...t, termo: t.termo.toUpperCase() }));
    const { desafios, descartados } = normalizarDesafios(
      bruto({
        logicas: [],
        cruzadinhas: [
          { titulo: "A", termos: TERMOS_BANCO },
          { titulo: "Mesma em outra ordem", termos: embaralhada },
          { titulo: "Redes", termos: TERMOS_REDES },
        ],
      }),
      semFiltro(),
    );
    expect(desafios.map((d) => d.titulo)).toEqual(["A", "Redes"]);
    expect(descartados).toBe(1);
  });

  it("continua tolerante quando o modelo ignora os limites do schema", () => {
    const quatro = [
      { termo: "Casa", pista: "Onde se mora" },
      { termo: "Cama", pista: "Onde se dorme" },
      { termo: "Sala", pista: "Cômodo de receber visitas" },
      { termo: "Mala", pista: "Leva a roupa na viagem" },
    ];
    const doze = [...TERMOS_BANCO, ...TERMOS_REDES];
    const { desafios } = normalizarDesafios(
      bruto({ logicas: [], cruzadinhas: [{ titulo: "Quatro", termos: quatro }, { titulo: "Doze", termos: doze }] }),
      semFiltro(),
    );
    expect(desafios.map((d) => d.titulo)).toEqual(["Quatro", "Doze"]);
    for (const d of desafios) {
      if (d.tipo !== "cruzadinha") continue;
      expect(d.desafio.palavras.length).toBeGreaterThanOrEqual(4);
      expect(d.desafio.palavras.length).toBeLessThanOrEqual(10);
    }
  });

  it("palavra cuja pista contém um termo da cruzadinha sai da grade", () => {
    const termos = [
      ...TERMOS_BANCO,
      // A pista diz o próprio termo (no plural) e outra diz o termo de outra palavra.
      { termo: "Registro", pista: "Os registros são as linhas de uma tabela" },
      { termo: "Coluna", pista: "Cada coluna guarda um atributo" },
    ];
    const { desafios } = normalizarDesafios(bruto({ cruzadinhas: [{ titulo: "Banco", termos }] }), semFiltro());
    const cruzadinha = porTipo(desafios, "cruzadinha")[0];
    expect(cruzadinha?.tipo).toBe("cruzadinha");
    if (cruzadinha?.tipo !== "cruzadinha") return;
    const palavras = Object.values(cruzadinha.resposta.palavras);
    expect(palavras).not.toContain("REGISTRO");
    expect(palavras).not.toContain("COLUNA");
    // A da "Tabela" fala em "colunas", que não é mais termo da grade: ela pode ficar.
  });

  it("perfis são os 7 em minúsculas", () => {
    expect([...PERFIS_BRAINHEX]).toEqual([
      "seeker",
      "survivor",
      "daredevil",
      "mastermind",
      "conqueror",
      "socializer",
      "achiever",
    ]);
  });

  it("entrada que não é objeto não dá erro", () => {
    expect(normalizarDesafios(null, semFiltro())).toEqual({ desafios: [], descartados: 0 });
    expect(normalizarDesafios("texto", semFiltro())).toEqual({ desafios: [], descartados: 0 });
    expect(normalizarDesafios({ logicas: "x", cruzadinhas: 3 }, semFiltro())).toEqual({ desafios: [], descartados: 0 });
  });

  it("título vazio vira o nome do tipo e título longo é cortado", () => {
    const semTitulo = { ...LOGICA_CURTA, titulo: "  " };
    const longo = { ...LOGICA_MULTIPLA, titulo: "t".repeat(300) };
    const { desafios } = normalizarDesafios(
      bruto({ logicas: [semTitulo, longo], cruzadinhas: [{ termos: TERMOS_BANCO }] }),
      semFiltro(),
    );
    expect(desafios[0].titulo).toBe("Desafio de lógica");
    expect(Array.from(desafios[1].titulo).length).toBeLessThanOrEqual(120);
    expect(desafios[2].titulo).toBe("Cruzadinha");
  });

  it("tira o NUL, que o jsonb do banco recusa", () => {
    const curta = { ...LOGICA_CURTA, enunciado: `${LOGICA_CURTA.enunciado}\u0000`, resposta: "Chave\u0000 primária" };
    const { desafios } = normalizarDesafios(bruto({ logicas: [curta], cruzadinhas: [] }), semFiltro());
    expect(JSON.stringify(desafios)).not.toContain("\\u0000");
    expect(desafios[0].resposta).toEqual({ aceitas: ["Chave primária", "PK", "primary key"] });
  });

  it("não muda a entrada", () => {
    const entrada = bruto();
    const copia = JSON.parse(JSON.stringify(entrada));
    normalizarDesafios(entrada, semFiltro());
    expect(entrada).toEqual(copia);
  });
});

describe("normalizarDesafios com o título do conteúdo", () => {
  // A RPC monta o título da missão com o do conteúdo ("Desafio de lógica: Recursão"), e o aluno o lê
  // junto do desafio: a resposta que está no título está à vista.
  const RECURSAO = {
    titulo: "Função que chama a si mesma",
    enunciado: "Uma função resolve o problema chamando a si mesma com uma entrada menor até um caso base. Que técnica é essa?",
    formato: "curta",
    resposta: "Recursão",
    sinonimos: ["recursividade"],
  };

  it("lógica curta cuja resposta está no título do conteúdo é descartada", () => {
    const semTitulo = normalizarDesafios(bruto({ logicas: [RECURSAO], cruzadinhas: [] }), semFiltro());
    expect(semTitulo.desafios).toHaveLength(1);

    const { desafios, descartados } = normalizarDesafios(bruto({ logicas: [RECURSAO], cruzadinhas: [] }), semFiltro(), "Recursão");
    expect(desafios).toEqual([]);
    expect(descartados).toBe(1);
  });

  it("o sinônimo no título também entrega, e o plural também", () => {
    const { desafios } = normalizarDesafios(
      bruto({ logicas: [RECURSAO, { ...LOGICA_CURTA, resposta: "Índice", sinonimos: [] }], cruzadinhas: [] }),
      semFiltro(),
      "Recursividade e índices",
    );
    expect(desafios).toEqual([]);
  });

  it("múltipla cuja certa o título cita, sem citar outra, é descartada", () => {
    const comandos = {
      ...LOGICA_MULTIPLA,
      alternativas: ["SELECT", "INSERT", "UPDATE", "DELETE"],
      resposta: "SELECT",
      enunciado: "Que comando só lê os dados de uma tabela, sem mudar nada?",
    };
    const soACerta = normalizarDesafios(bruto({ logicas: [comandos], cruzadinhas: [] }), semFiltro(), "O comando SELECT");
    expect(soACerta.desafios).toEqual([]);
    expect(soACerta.descartados).toBe(1);

    // O título que cita a certa e outra não aponta para nenhuma.
    const duas = normalizarDesafios(bruto({ logicas: [comandos], cruzadinhas: [] }), semFiltro(), "SELECT e DELETE");
    expect(duas.desafios).toHaveLength(1);
  });

  it("palavra da cruzadinha cujo termo está no título sai da grade", () => {
    const { desafios } = normalizarDesafios(bruto({ logicas: [], cruzadinhas: [{ titulo: "Banco", termos: TERMOS_BANCO }] }), semFiltro(), "Índices");
    const cruzadinha = porTipo(desafios, "cruzadinha")[0];
    expect(cruzadinha?.tipo).toBe("cruzadinha");
    if (cruzadinha?.tipo !== "cruzadinha") return;
    expect(Object.values(cruzadinha.resposta.palavras)).not.toContain(letrasDaGrade("Índice"));
    expect(Object.values(cruzadinha.resposta.palavras).length).toBeGreaterThanOrEqual(4);
  });

  it("cruzadinha que fica com poucas palavras sem as do título é descartada", () => {
    const { desafios, descartados } = normalizarDesafios(
      bruto({ logicas: [], cruzadinhas: [{ titulo: "Banco", termos: TERMOS_BANCO }] }),
      semFiltro(),
      "Tabela, chave, índice e consulta",
    );
    expect(desafios).toEqual([]);
    expect(descartados).toBe(1);
  });

  it("sem título, nada muda", () => {
    expect(normalizarDesafios(bruto(), semFiltro(), "")).toEqual(normalizarDesafios(bruto(), semFiltro()));
  });
});

describe("DESAFIOS_SCHEMA", () => {
  type No = { type: string; required?: string[]; properties?: Record<string, No>; items?: No; enum?: string[] };
  const schema = DESAFIOS_SCHEMA as unknown as No;

  it("exige os campos que normalizarDesafios lê", () => {
    expect(schema.type).toBe("OBJECT");
    expect(schema.required).toEqual(expect.arrayContaining(["logicas", "cruzadinhas"]));

    const logica = schema.properties?.logicas.items as No;
    expect(schema.properties?.logicas.type).toBe("ARRAY");
    expect(logica.required).toEqual(expect.arrayContaining(["titulo", "enunciado", "formato", "resposta"]));
    expect(Object.keys(logica.properties ?? {})).toEqual(
      expect.arrayContaining(["titulo", "enunciado", "formato", "alternativas", "resposta", "sinonimos"]),
    );
    expect(logica.properties?.formato.enum).toEqual(["multipla", "curta"]);
    expect(logica.properties?.alternativas.items?.type).toBe("STRING");
    expect(logica.properties?.sinonimos.items?.type).toBe("STRING");

    const cruzadinha = schema.properties?.cruzadinhas.items as No;
    expect(cruzadinha.required).toEqual(expect.arrayContaining(["titulo", "termos"]));
    const termo = cruzadinha.properties?.termos.items as No;
    expect(termo.required).toEqual(expect.arrayContaining(["termo", "pista"]));
  });

  it("o normalizador não precisa de campo fora do schema", () => {
    // A entrada passa pelas chaves de DESAFIOS_SCHEMA.properties: o que o schema não nomeia sai.
    const segundoOSchema = (valor: unknown, no: No): unknown => {
      if (no.type === "ARRAY" && Array.isArray(valor)) return valor.map((item) => segundoOSchema(item, no.items as No));
      if (no.type === "OBJECT" && valor && typeof valor === "object") {
        const registro = valor as Record<string, unknown>;
        return Object.fromEntries(
          Object.entries(no.properties ?? {})
            .filter(([chave]) => chave in registro)
            .map(([chave, filho]) => [chave, segundoOSchema(registro[chave], filho)]),
        );
      }
      return valor;
    };
    const comExtra = bruto({
      logicas: [{ ...LOGICA_MULTIPLA, extra: 1 }, { ...LOGICA_CURTA, dificuldade: "alta" }],
    });
    const filtrada = segundoOSchema(comExtra, schema);
    expect(JSON.stringify(filtrada)).not.toContain("dificuldade");
    expect(normalizarDesafios(filtrada, semFiltro()).desafios).toHaveLength(4);
  });

  it("pede 4 alternativas e de 6 a 10 termos", () => {
    const logica = schema.properties?.logicas.items as No;
    const termos = (schema.properties?.cruzadinhas.items as No).properties?.termos as No & { minItems?: number; maxItems?: number };
    const alternativas = logica.properties?.alternativas as No & { minItems?: number; maxItems?: number };
    expect([alternativas.minItems, alternativas.maxItems]).toEqual([4, 4]);
    expect([termos.minItems, termos.maxItems]).toEqual([6, 10]);
  });
});

describe("promptDeDesafios", () => {
  const ctx = {
    contexto: "\n\nCONTEXTO PEDAGOGICO\n- Topico: Banco de dados",
    topico: "Banco de dados",
    descricaoDoTopico: "Modelagem relacional",
    conteudos: "- [texto] Chaves: chave primária identifica a linha",
    material: "\nMATERIAL DO PROFESSOR (FONTE OBRIGATORIA)\nTexto do material",
    orientacao: "\n<orientacao_do_professor>\nFaca assim:\nexemplos de loja\n</orientacao_do_professor>",
    existentes: "\nO TOPICO JA TEM ESTAS PERGUNTAS.\n- Pergunta antiga?",
    regrasDeTermos: "- Use o mesmo nome para o mesmo conceito",
    idioma: "Idioma obrigatório: português do Brasil",
    variacao: "abc-123",
  };

  it("pede 2 lógicas e 2 listas de 6 a 10 termos sobre o material", () => {
    const prompt = promptDeDesafios(ctx);
    for (const trecho of [ctx.material, ctx.conteudos, ctx.orientacao, ctx.existentes, ctx.regrasDeTermos, ctx.idioma, ctx.variacao]) {
      expect(prompt).toContain(trecho);
    }
    expect(prompt).toMatch(/2 desafios de l[óo]gica/i);
    expect(prompt).toMatch(/6 a 10/);
    expect(prompt).toMatch(/80 caracteres/);
    expect(prompt).toMatch(/4 alternativas/);
  });

  it("o que muda a cada chamada vem por último", () => {
    const prompt = promptDeDesafios(ctx);
    expect(prompt.indexOf(ctx.variacao)).toBeGreaterThan(prompt.indexOf(ctx.material));
    expect(prompt.trimEnd().endsWith(ctx.variacao)).toBe(true);
  });
});
