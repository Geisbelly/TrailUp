import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ACIONABILIDADE,
  calcularIcvi,
  calcularScviMedio,
  limiarDoIcvi,
  META_DO_SCVI_MEDIO,
  AJUDA_TLX,
  EXTREMOS_EFLA,
  EXTREMOS_SUS,
  ITENS_EFLA,
  ITENS_TLX,
  NAO_OBSERVEI,
  OPCOES_CONCLUSAO,
  OPCOES_TEMPO,
  PARES_UEQS,
  PERGUNTA_CONCLUSAO,
  PERGUNTA_TEMPO,
  PERGUNTA_UEQS,
  pontuarEfla,
  pontuarTlx,
  pontuarUeqs,
  BLOCOS,
  CAMPOS_DE_IDENTIFICACAO,
  COLUNAS_DAS_METRICAS,
  ESCALA_CONCORDANCIA,
  EXTREMOS_SEQ,
  FRANQUEZA,
  ITENS_SUS,
  METRICAS,
  ACESSO,
  AJUDA_DIVULGACAO,
  OPCOES_DIVULGACAO,
  PERGUNTAS_ABERTAS,
  PERGUNTA_DIVULGACAO,
  PERGUNTA_DA_TAREFA,
  PERGUNTA_SEQ,
  TAREFAS,
  linkDoFormulario,
  linkEmbutido,
  abaDaPagina,
  voltouDaConfirmacao,
  lerMeuAcesso,
  pontuarSus,
} from "./pesquisaProfessores";

const CODIGO_DO_FORMULARIO = readFileSync(
  fileURLToPath(new URL("../../../../scripts/apps-script-formulario-professores/Code.gs", import.meta.url)),
  "utf-8",
);

const noFormulario = (texto: string) => expect(CODIGO_DO_FORMULARIO).toContain(`'${texto}'`);

describe("cartilha e formulário dizem a mesma coisa", () => {
  it.each(TAREFAS.map(t => [t.id, t] as const))("tarefa %s", (_id, tarefa) => {
    noFormulario(tarefa.id);
    noFormulario(tarefa.titulo);
    tarefa.passos.forEach(noFormulario);
  });

  it.each(BLOCOS.map(b => [b.titulo, b] as const))("bloco %s", (_titulo, bloco) => {
    noFormulario(bloco.titulo);
    noFormulario(bloco.sobre);
    bloco.itens.forEach(noFormulario);
    expect(CODIGO_DO_FORMULARIO).toMatch(new RegExp(`'${bloco.titulo}', ${bloco.opcional}`));
  });

  it("identificação e forma de divulgação", () => {
    for (const campo of CAMPOS_DE_IDENTIFICACAO) {
      noFormulario(campo.pergunta);
      campo.opcoes?.forEach(noFormulario);
    }
    const camposNoScript = CODIGO_DO_FORMULARIO.match(/^ {2}\['[^']+', (null|\[)/gm) ?? [];
    expect(camposNoScript).toHaveLength(CAMPOS_DE_IDENTIFICACAO.length);
    noFormulario(PERGUNTA_DIVULGACAO);
    noFormulario(AJUDA_DIVULGACAO);
    expect(OPCOES_DIVULGACAO).toHaveLength(3);
    OPCOES_DIVULGACAO.forEach(noFormulario);
  });

  it("escalas, métricas, SUS e abertas", () => {
    [ACESSO, FRANQUEZA, PERGUNTA_SEQ, PERGUNTA_DA_TAREFA, ...EXTREMOS_SEQ, ...ESCALA_CONCORDANCIA].forEach(noFormulario);
    [...METRICAS, ...COLUNAS_DAS_METRICAS, ...PERGUNTAS_ABERTAS].forEach(noFormulario);
    expect(ITENS_SUS).toHaveLength(10);
    ITENS_SUS.forEach(noFormulario);
    EXTREMOS_SUS.forEach(noFormulario);
  });

  it("perguntas de cada tarefa", () => {
    [PERGUNTA_CONCLUSAO, ...OPCOES_CONCLUSAO, PERGUNTA_TEMPO, ...OPCOES_TEMPO, NAO_OBSERVEI].forEach(noFormulario);
  });

  it("EFLA, acionabilidade, Raw TLX e UEQ-S", () => {
    expect(ITENS_EFLA).toHaveLength(8);
    ITENS_EFLA.flatMap(i => [i.id, i.dimensao, i.texto]).forEach(noFormulario);
    EXTREMOS_EFLA.forEach(noFormulario);
    [ACIONABILIDADE.agiria, ACIONABILIDADE.qualAcao, ACIONABILIDADE.realidade, ...ACIONABILIDADE.extremosRealidade].forEach(
      noFormulario,
    );
    expect(ITENS_TLX).toHaveLength(6);
    noFormulario(AJUDA_TLX);
    ITENS_TLX.flat().forEach(noFormulario);
    expect(PARES_UEQS).toHaveLength(8);
    PARES_UEQS.flat().forEach(noFormulario);
    noFormulario(PERGUNTA_UEQS);
  });

  it("o formulário não tem tarefa ou bloco a mais", () => {
    const tarefasNoScript = CODIGO_DO_FORMULARIO.match(/\['T\d+', '/g) ?? [];
    expect(tarefasNoScript).toHaveLength(TAREFAS.length);
    const blocosNoScript = CODIGO_DO_FORMULARIO.match(/^ {2}\['[^']+', (true|false), \[/gm) ?? [];
    expect(blocosNoScript).toHaveLength(BLOCOS.length);
  });
});

describe("contra o viés de cortesia", () => {
  it("a forma de divulgação é a última pergunta do formulário de avaliação", () => {
    const corpo = CODIGO_DO_FORMULARIO.slice(
      CODIGO_DO_FORMULARIO.indexOf("function criarFormulario() {"),
      CODIGO_DO_FORMULARIO.indexOf("function criarFormularioDeAtualizacao()"),
    );
    const divulgacao = corpo.indexOf(".setTitle(DIVULGACAO[0])");
    expect(divulgacao).toBeGreaterThan(corpo.indexOf("PERGUNTAS_ABERTAS.forEach"));
    expect(corpo.slice(divulgacao)).not.toMatch(/form\.add(?!MultipleChoiceItem)/);
  });

  it("existe o formulário para trocar a escolha depois", () => {
    expect(CODIGO_DO_FORMULARIO).toContain("function criarFormularioDeAtualizacao()");
  });
});

describe("inscrição antes da avaliação", () => {
  const funcao = (nome: string) => {
    const ini = CODIGO_DO_FORMULARIO.indexOf(`function ${nome}() {`);
    const fim = CODIGO_DO_FORMULARIO.indexOf("\nfunction ", ini + 1);
    return CODIGO_DO_FORMULARIO.slice(ini, fim === -1 ? undefined : fim);
  };

  it("o termo e a identificação ficam na inscrição, não na avaliação", () => {
    expect(funcao("criarFormularioDeInscricao")).toContain("CONFIG.tcle.forEach");
    expect(funcao("criarFormularioDeInscricao")).toContain("IDENTIFICACAO.forEach");
    expect(funcao("criarFormularioDeInscricao")).toContain("ACESSO");
    expect(funcao("criarFormulario")).not.toContain("IDENTIFICACAO.forEach");
  });

  it("a avaliação começa pedindo o e-mail cadastrado", () => {
    const avaliacao = funcao("criarFormulario");
    expect(avaliacao.indexOf("E-mail cadastrado na inscrição")).toBeLessThan(avaliacao.indexOf("TAREFAS.forEach"));
  });
});

describe("pontuarSus", () => {
  it("segue Brooke (1996)", () => {
    expect(pontuarSus([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
    expect(pontuarSus([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
    expect(pontuarSus([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
  });

  it("não pontua resposta incompleta", () => {
    expect(pontuarSus([5, 1, 5, 1, 5, 1, 5, 1, 5])).toBeNull();
    expect(pontuarSus([5, 1, 5, 1, null, 1, 5, 1, 5, 1])).toBeNull();
  });
});

describe("pontuações", () => {
  it("EFLA: 0 a 100 por dimensão e no geral (Scheffel et al., 2017)", () => {
    const tudo = (n: number) => Object.fromEntries(ITENS_EFLA.map(i => [i.id, n]));
    expect(pontuarEfla(tudo(10)).geral).toBe(100);
    expect(pontuarEfla(tudo(1)).geral).toBe(0);
    const metade = pontuarEfla({ ...tudo(10), D1: 1, D2: 1 });
    expect(metade.dimensoes.Dados).toBe(0);
    expect(metade.geral).toBe(75);
    const faltando = pontuarEfla({ ...tudo(5), A2: null });
    expect(faltando.dimensoes["Consciência"]).toBeNull();
    expect(faltando.geral).toBeNull();
  });

  it("UEQ-S: −3 a +3, pragmática e hedônica", () => {
    expect(pontuarUeqs([7, 7, 7, 7, 1, 1, 1, 1])).toEqual({ pragmatica: 3, hedonica: -3, geral: 0 });
    expect(pontuarUeqs([4, 4, 4, 4, 4, 4, 4])).toBeNull();
  });

  it("Raw TLX: 0 a 100, com Desempenho invertido", () => {
    expect(pontuarTlx([0, 0, 0, 10, 0, 0])).toBe(0);
    expect(pontuarTlx([10, 10, 10, 0, 10, 10])).toBe(100);
    expect(pontuarTlx([5, 5, 5, 5, 5])).toBeNull();
  });
});

describe("piloto de validade de conteúdo", () => {
  it("existe e julga as mesmas constantes da avaliação, sem a SUS", () => {
    const ini = CODIGO_DO_FORMULARIO.indexOf("function secoesDoPiloto_() {");
    const fim = CODIGO_DO_FORMULARIO.indexOf("function criarFormularioDoPilotoIvc() {");
    expect(ini).toBeGreaterThan(-1);
    const secoes = CODIGO_DO_FORMULARIO.slice(ini, fim);
    for (const fonte of ["TAREFAS", "ITENS_TLX", "ITENS_EFLA", "ACIONABILIDADE", "PARES_UEQS", "BLOCOS", "PERGUNTAS_ABERTAS"]) {
      expect(secoes).toContain(fonte);
    }
    expect(secoes).not.toContain("ITENS_SUS");
  });

  it("I-CVI, S-CVI/Ave e limiares (Lynn, 1986; Polit; Beck, 2006)", () => {
    expect(calcularIcvi([4, 4, 3, 4, 3])).toBe(1);
    expect(calcularIcvi([4, 2, 3, 4, 1])).toBe(0.6);
    expect(calcularIcvi([4, null, 3])).toBe(1);
    expect(calcularIcvi([null, undefined])).toBeNull();
    expect(calcularScviMedio([1, 0.8, null])).toBe(0.9);
    expect(limiarDoIcvi(5)).toBe(1);
    expect(limiarDoIcvi(8)).toBe(0.78);
    expect(META_DO_SCVI_MEDIO).toBe(0.9);
  });
});

describe("linkDoFormulario", () => {
  it("aceita só formulário do Google em https", () => {
    expect(linkDoFormulario("https://docs.google.com/forms/d/e/abc/viewform")).toBe(
      "https://docs.google.com/forms/d/e/abc/viewform",
    );
    expect(linkDoFormulario(" https://forms.gle/xyz ")).toBe("https://forms.gle/xyz");
    expect(linkDoFormulario("http://forms.gle/xyz")).toBeNull();
    expect(linkDoFormulario("https://docs.google.com/document/d/abc")).toBeNull();
    expect(linkDoFormulario("https://forms.gle.exemplo.com/x")).toBeNull();
    expect(linkDoFormulario("javascript:alert(1)")).toBeNull();
    expect(linkDoFormulario(undefined)).toBeNull();
  });
});

describe("linkEmbutido", () => {
  it("põe embedded=true no link longo do Google Forms", () => {
    expect(linkEmbutido("https://docs.google.com/forms/d/e/abc/viewform?usp=sf_link")).toBe(
      "https://docs.google.com/forms/d/e/abc/viewform?usp=sf_link&embedded=true",
    );
  });

  it("não embute o link curto nem a ausência de link", () => {
    expect(linkEmbutido("https://forms.gle/abc")).toBeNull();
    expect(linkEmbutido(null)).toBeNull();
  });
});

describe("abas da página pública", () => {
  it("abre a cartilha por padrão e a inscrição só com ?aba=inscricao", () => {
    expect(abaDaPagina("")).toBe("cartilha");
    expect(abaDaPagina("?aba=qualquer")).toBe("cartilha");
    expect(abaDaPagina("?aba=inscricao&confirmado=1")).toBe("inscricao");
  });

  it("reconhece a volta do link de confirmação", () => {
    expect(voltouDaConfirmacao("?aba=inscricao&confirmado=1")).toBe(true);
    expect(voltouDaConfirmacao("?confirmado=0")).toBe(false);
  });
});

describe("lerMeuAcesso", () => {
  it("null quando o banco não reconhece o professor", () => {
    expect(lerMeuAcesso(null)).toBeNull();
  });

  it("só aceita link de formulário do Google", () => {
    expect(lerMeuAcesso({ avaliador: true, classe_id: 7, aluno_teste_email: "a@t.app", link_avaliacao: "https://evil.example/x" })).toEqual({
      avaliador: true, classeId: 7, alunoTesteEmail: "a@t.app", linkAvaliacao: null,
    });
    expect(lerMeuAcesso({ avaliador: false, link_avaliacao: "https://docs.google.com/forms/d/e/x/viewform" })?.linkAvaliacao).toBe(
      "https://docs.google.com/forms/d/e/x/viewform",
    );
  });
});
