import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  andamentoDaPagina,
  corpoDaAvaliacao,
  emailsInvalidos,
  entriesDoItem,
  formularioDeAvaliacao,
  lerRascunho,
  pedacosComLinks,
  type EspelhoDaAvaliacao,
  type FormularioDeAvaliacao,
} from "./formularioDeAvaliacao";
import { ESPELHO_DA_AVALIACAO as PUBLICADO } from "./formularioDeAvaliacao.gerado";
import {
  BLOCOS,
  COLUNAS_DAS_METRICAS,
  ITENS_SUS,
  METRICAS,
  OPCOES_CONCLUSAO,
  OPCOES_DIVULGACAO,
  OPCOES_TEMPO,
  PERGUNTAS_ABERTAS,
  PERGUNTA_DIVULGACAO,
  TAREFAS,
} from "./pesquisaProfessores";

const itens = PUBLICADO.paginas.flatMap(p => p.itens);
const titulos = PUBLICADO.paginas.map(p => p.titulo);

describe("o espelho é o formulário que a cartilha descreve", () => {
  it("uma página por tarefa, com as quatro perguntas dela", () => {
    for (const tarefa of TAREFAS) {
      const pagina = PUBLICADO.paginas.find(p => p.titulo === `${tarefa.id}. ${tarefa.titulo}`);
      expect(pagina, tarefa.id).toBeDefined();
      const [conclusao, , tempo] = pagina!.itens;
      expect(conclusao.tipo === "escolha" && conclusao.opcoes).toEqual([...OPCOES_CONCLUSAO]);
      expect(tempo.tipo === "escolha" && tempo.opcoes).toEqual([...OPCOES_TEMPO]);
    }
  });

  it("SUS, métricas, blocos, abertas e divulgação", () => {
    ITENS_SUS.forEach((texto, i) => expect(itens.some(it => it.titulo === `SUS ${i + 1}. ${texto}`)).toBe(true));
    const metricas = itens.find(it => it.tipo === "grade" && it.multipla);
    expect(metricas?.tipo === "grade" && metricas.linhas.map(l => l.rotulo)).toEqual([...METRICAS]);
    expect(metricas?.tipo === "grade" && metricas.colunas).toEqual([...COLUNAS_DAS_METRICAS]);
    for (const bloco of BLOCOS) {
      const grade = itens.find(it => it.tipo === "grade" && it.titulo === bloco.titulo);
      expect(grade?.tipo === "grade" && grade.linhas.map(l => l.rotulo), bloco.id).toEqual([...bloco.itens]);
      expect(titulos).toContain(bloco.titulo + (bloco.opcional ? " (opcional)" : ""));
    }
    PERGUNTAS_ABERTAS.forEach(p => expect(itens.some(it => it.titulo === p)).toBe(true));
    const divulgacao = itens.find(it => it.titulo === PERGUNTA_DIVULGACAO);
    expect(divulgacao?.tipo === "escolha" && divulgacao.opcoes).toEqual([...OPCOES_DIVULGACAO]);
  });

  it("a primeira pergunta é o e-mail, com a validação do Forms", () => {
    const [primeira] = PUBLICADO.paginas[0].itens;
    expect(primeira.tipo === "texto" && primeira.email).toBe(true);
  });

  it("cada entry aparece uma vez só", () => {
    const entries = itens.flatMap(entriesDoItem);
    expect(new Set(entries).size).toBe(entries.length);
    entries.forEach(e => expect(e).toMatch(/^entry\.\d+$/));
  });
});

describe("formularioDeAvaliacao", () => {
  // Um id inventado: o de verdade não entra no repositório nem no bundle.
  const ID = "1FAIpQLSexemploDeTeste";
  const LINK = `https://docs.google.com/forms/d/e/${ID}/viewform`;
  const { idSha256: _h, ...resto } = PUBLICADO;
  const ESPELHO: EspelhoDaAvaliacao = { ...resto, idSha256: createHash("sha256").update(ID).digest("hex") };

  it("o espelho publicado guarda só o hash do id", () => {
    expect(PUBLICADO.idSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(PUBLICADO)).not.toMatch(/"id":/);
  });

  it("reconhece o link do mesmo formulário, com ou sem parâmetros, e devolve o id dele", async () => {
    expect((await formularioDeAvaliacao(LINK, ESPELHO))?.id).toBe(ID);
    expect((await formularioDeAvaliacao(`${LINK}?usp=sf_link`, ESPELHO))?.paginas).toBe(PUBLICADO.paginas);
  });

  it("outro formulário, link curto, vazio ou lixo voltam para o iframe", async () => {
    expect(await formularioDeAvaliacao("https://docs.google.com/forms/d/e/1FAIpQLSoutro/viewform", ESPELHO)).toBeNull();
    expect(await formularioDeAvaliacao("https://forms.gle/abc", ESPELHO)).toBeNull();
    expect(await formularioDeAvaliacao(null, ESPELHO)).toBeNull();
    expect(await formularioDeAvaliacao("não é link", ESPELHO)).toBeNull();
  });
});

const PEQUENO: FormularioDeAvaliacao = {
  id: "x",
  titulo: "t",
  descricao: "",
  codigo: "entry.9",
  paginas: [
    { titulo: "", ajuda: "", itens: [{ tipo: "texto", titulo: "E-mail", ajuda: "", entry: "entry.1", email: true }] },
    {
      titulo: "P",
      ajuda: "",
      itens: [
        { tipo: "aviso", titulo: "a", ajuda: "" },
        { tipo: "escala", titulo: "s", ajuda: "", entry: "entry.2", valores: ["1", "2"], rotulos: ["a", "b"] },
        {
          tipo: "grade",
          titulo: "g",
          ajuda: "",
          multipla: true,
          colunas: ["A", "B"],
          linhas: [
            { rotulo: "l1", entry: "entry.3" },
            { rotulo: "l2", entry: "entry.4" },
          ],
        },
      ],
    },
  ],
};

describe("corpoDaAvaliacao", () => {
  it("manda só o respondido, repete o entry das caixas e diz que todas as páginas foram vistas", () => {
    const corpo = corpoDaAvaliacao(PEQUENO, { "entry.1": " a@b.co ", "entry.2": "", "entry.3": ["A", "B"], "entry.77": "intruso" }, "c0d1g0");
    expect(corpo.getAll("entry.1")).toEqual(["a@b.co"]);
    expect(corpo.has("entry.2")).toBe(false);
    expect(corpo.getAll("entry.3")).toEqual(["A", "B"]);
    expect(corpo.has("entry.77")).toBe(false);
    expect(corpo.get("entry.9")).toBe("c0d1g0");
    expect(corpo.get("pageHistory")).toBe("0,1");
  });

  it("o publicado declara as 21 páginas", () => {
    expect(corpoDaAvaliacao({ ...PUBLICADO, id: "x" }, {}, null).get("pageHistory")).toBe(PUBLICADO.paginas.map((_, i) => i).join(","));
  });

  it("sem campo de código no formulário, não inventa um", () => {
    const corpo = corpoDaAvaliacao({ ...PEQUENO, codigo: null }, {}, "c0d1g0");
    expect([...corpo.keys()]).toEqual(["pageHistory"]);
  });
});

describe("andamento e e-mail", () => {
  it("conta linhas de grade como perguntas e ignora o aviso", () => {
    expect(andamentoDaPagina(PEQUENO.paginas[1], { "entry.2": "1", "entry.4": [] })).toEqual({ respondidas: 1, total: 3 });
  });

  it("e-mail vazio passa; malformado não", () => {
    expect(emailsInvalidos(PEQUENO, {})).toEqual([]);
    expect(emailsInvalidos(PEQUENO, { "entry.1": "a@b.co" })).toEqual([]);
    expect(emailsInvalidos(PEQUENO, { "entry.1": "a@b" })).toEqual(["entry.1"]);
  });
});

describe("lerRascunho", () => {
  it("devolve o que é válido e descarta o resto", () => {
    const bruto = JSON.stringify({ pagina: 9, respostas: { "entry.2": "1", "entry.3": ["A"], "entry.77": "x", "entry.4": [1] }, enviadoEm: 3 });
    expect(lerRascunho(bruto, PEQUENO)).toEqual({ pagina: 1, respostas: { "entry.2": "1", "entry.3": ["A"] }, enviadoEm: null });
  });

  it("nada, JSON quebrado ou tipo errado viram null", () => {
    expect(lerRascunho(null, PEQUENO)).toBeNull();
    expect(lerRascunho("{", PEQUENO)).toBeNull();
    expect(lerRascunho("3", PEQUENO)).toBeNull();
  });
});

describe("pedacosComLinks", () => {
  it("separa o link do texto e deixa a pontuação de fora", () => {
    expect(pedacosComLinks("Veja https://trailup.vercel.app/pesquisa. Depois volte.")).toEqual([
      { texto: "Veja ", link: false },
      { texto: "https://trailup.vercel.app/pesquisa", link: true },
      { texto: ". Depois volte.", link: false },
    ]);
  });
});
