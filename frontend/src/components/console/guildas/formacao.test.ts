import { describe, expect, it } from "vitest";
import {
  abrirSemPrazo,
  erroDoTamanho,
  dataHora,
  deCampoLocal,
  estadoDaJanela,
  fecharAgora,
  formularioDe,
  guildasAcimaDoLimite,
  mensagemDeErroDaGuilda,
  tamanhoMinimoPermitido,
  paraCampoLocal,
  resumoDaJanela,
  validarFormacao,
  validarGuilda,
  type GuildaDaTurma,
} from "./formacao";

const agora = new Date("2026-10-20T12:00:00Z");
const guilda = (nome: string, n: number): GuildaDaTurma => ({
  id: nome,
  nome,
  descricao: null,
  limite: 10,
  criadaEm: "",
  membros: Array.from({ length: n }, (_, i) => ({ alunoId: `${nome}${i}`, nome: `A${i}`, entrouEm: "" })),
});

describe("estado da janela (espelho de guilda_janela_aberta)", () => {
  it("sem início nem fim: sempre aberta, como quem nunca configurou", () => {
    expect(estadoDaJanela({ inicio: null, fim: null }, agora)).toBe("sempre_aberta");
  });
  it("antes do início: agendada; depois do fim: encerrada; no meio: aberta", () => {
    expect(estadoDaJanela({ inicio: "2026-10-21T00:00:00Z", fim: null }, agora)).toBe("agendada");
    expect(estadoDaJanela({ inicio: null, fim: "2026-10-20T11:59:59Z" }, agora)).toBe("encerrada");
    expect(estadoDaJanela({ inicio: "2026-10-19T00:00:00Z", fim: "2026-10-27T00:00:00Z" }, agora)).toBe("aberta");
    expect(estadoDaJanela({ inicio: "2026-10-19T00:00:00Z", fim: null }, agora)).toBe("aberta");
  });
  it("o fim é inclusivo, como `now() > formacao_fim` no banco", () => {
    expect(estadoDaJanela({ inicio: null, fim: agora.toISOString() }, agora)).toBe("aberta");
  });
});

describe("resumo do topo", () => {
  it("diz quando nunca foi configurada", () => {
    expect(resumoDaJanela({ configurada: false, inicio: null, fim: null }, agora)).toMatchObject({ tom: "ativo", detalhe: expect.stringMatching(/Nenhuma janela/) });
  });
  it("agendada mostra abertura e fechamento em Brasília", () => {
    const r = resumoDaJanela({ configurada: true, inicio: "2026-10-21T11:00:00Z", fim: "2026-10-28T23:00:00Z" }, agora);
    expect(r.tom).toBe("alerta");
    expect(r.detalhe).toContain("21/10/2026, 08:00");
    expect(r.detalhe).toContain("28/10/2026, 20:00");
  });
  it("fechada explica o que o aluno ainda pode fazer", () => {
    const r = resumoDaJanela({ configurada: true, inicio: null, fim: "2026-10-19T03:00:00Z" }, agora);
    expect(r).toMatchObject({ tom: "neutro", titulo: "Formação fechada" });
    expect(r.detalhe).toMatch(/Sair da guilda continua possível/);
  });
});

describe("campos de data em Brasília", () => {
  it("ida e volta", () => {
    expect(paraCampoLocal("2026-10-20T11:00:00Z")).toBe("2026-10-20T08:00");
    expect(deCampoLocal("2026-10-20T08:00")).toBe("2026-10-20T11:00:00.000Z");
    expect(paraCampoLocal(deCampoLocal("2026-12-31T23:30"))).toBe("2026-12-31T23:30");
  });
  it("21h em Brasília já é o dia seguinte em UTC", () => {
    expect(deCampoLocal("2026-10-20T21:00")).toBe("2026-10-21T00:00:00.000Z");
    expect(paraCampoLocal("2026-10-21T02:00:00Z")).toBe("2026-10-20T23:00");
  });
  it("vazio é nulo; lixo é inválido", () => {
    expect(deCampoLocal("  ")).toBeNull();
    expect(deCampoLocal("20/10/2026")).toBeUndefined();
    expect(paraCampoLocal(null)).toBe("");
    expect(dataHora("x")).toBe("");
  });
});

describe("validar e montar a configuração", () => {
  it("monta o payload de guilda_configurar_turma", () => {
    expect(validarFormacao({ tamanho: "4", inicio: "2026-10-21T08:00", fim: "" }, 65)).toEqual({
      ok: true,
      payload: { p_classe_id: 65, p_tamanho_maximo: 4, p_inicio: "2026-10-21T11:00:00.000Z", p_fim: null },
    });
  });
  it("tamanho de 2 a 10, inteiro", () => {
    for (const t of ["1", "11", "3.5", "", "x"]) {
      const r = validarFormacao({ tamanho: t, inicio: "", fim: "" }, 65);
      expect(r.ok).toBe(false);
      if ("erros" in r) expect(r.erros.tamanho).toMatch(/2 a 10/);
    }
  });
  it("fim depois do início (o banco recusa igual ou antes)", () => {
    const r = validarFormacao({ tamanho: "4", inicio: "2026-10-21T08:00", fim: "2026-10-21T08:00" }, 65);
    expect(r.ok).toBe(false);
    if ("erros" in r) expect(r.erros.fim).toMatch(/depois/);
  });
  it("o formulário parte do que está gravado", () => {
    expect(formularioDe({ tamanhoMaximo: 10, inicio: null, fim: "2026-10-28T23:00:00Z" })).toEqual({ tamanho: "10", inicio: "", fim: "2026-10-28T20:00" });
  });
});

describe("fechar agora e abrir sem prazo", () => {
  it("fechar agora mantém um início passado e põe o fim agora", () => {
    expect(fecharAgora({ classeId: 65, tamanhoMaximo: 4, inicio: "2026-10-19T00:00:00Z" }, agora)).toEqual({
      p_classe_id: 65, p_tamanho_maximo: 4, p_inicio: "2026-10-19T00:00:00Z", p_fim: agora.toISOString(),
    });
  });
  it("fechar agora uma janela agendada derruba o início (senão o fim ficaria antes dele)", () => {
    expect(fecharAgora({ classeId: 65, tamanhoMaximo: 4, inicio: "2026-10-25T00:00:00Z" }, agora).p_inicio).toBeNull();
  });
  it("abrir sem prazo limpa as duas datas e mantém o tamanho", () => {
    expect(abrirSemPrazo({ classeId: 65, tamanhoMaximo: 6 })).toEqual({ p_classe_id: 65, p_tamanho_maximo: 6, p_inicio: null, p_fim: null });
  });
});

describe("tamanho menor que uma guilda existente: bloqueia", () => {
  const gs = [guilda("Lobos", 5), guilda("Corujas", 2)];
  it("o mínimo é a maior guilda, nunca abaixo de 2", () => {
    expect(tamanhoMinimoPermitido(gs)).toBe(5);
    expect(tamanhoMinimoPermitido([])).toBe(2);
    expect(tamanhoMinimoPermitido([guilda("Solo", 1)])).toBe(2);
  });
  it("lista quem fica acima e diz o mínimo", () => {
    expect(guildasAcimaDoLimite(gs, 4).map((g) => g.nome)).toEqual(["Lobos"]);
    expect(erroDoTamanho(gs, 4)).toBe("O mínimo agora é 5: Lobos (5) já tem mais membros que 4.");
    expect(erroDoTamanho([guilda("Lobos", 5), guilda("Corujas", 4)], 3)).toMatch(/mínimo agora é 5: Lobos \(5\), Corujas \(4\) já têm/);
    expect(erroDoTamanho(gs, 5)).toBeNull();
  });
  it("validarFormacao recusa e não monta payload", () => {
    const r = validarFormacao({ tamanho: "4", inicio: "", fim: "" }, 65, gs);
    expect("erros" in r && r.erros.tamanho).toMatch(/mínimo agora é 5/);
    expect(validarFormacao({ tamanho: "5", inicio: "", fim: "" }, 65, gs)).toMatchObject({ ok: true });
  });
  it("o erro do banco usa o mínimo do HINT", () => {
    expect(mensagemDeErroDaGuilda({ code: "22023", message: "guilda_tamanho_abaixo_dos_membros", hint: "6" })).toBe(
      "Uma guilda já tem 6 membros. O tamanho mínimo agora é 6.",
    );
    expect(mensagemDeErroDaGuilda({ code: "22023", message: "guilda_tamanho_abaixo_dos_membros", details: "A maior guilda da turma tem 3 membros." })).toBe(
      "A maior guilda da turma tem 3 membros.",
    );
  });
});

describe("nome e descrição da guilda", () => {
  it("nome de 2 a 40 e descrição até 180, sem espaços nas pontas", () => {
    expect(validarGuilda("  Corujas  ", " Grupo ")).toEqual({ ok: true, nome: "Corujas", descricao: "Grupo" });
    const curto = validarGuilda(" A ", "");
    expect(curto.ok).toBe(false);
    if ("erros" in curto) expect(curto.erros.nome).toMatch(/2 a 40/);
    const longa = validarGuilda("Lobos", "x".repeat(181));
    if ("erros" in longa) expect(longa.erros.descricao).toMatch(/180/);
    expect(longa.ok).toBe(false);
  });
});

describe("erros das RPCs", () => {
  it("o código vem no texto da exceção", () => {
    expect(mensagemDeErroDaGuilda({ message: "guilda_config_invalida" })).toMatch(/2 a 10/);
    expect(mensagemDeErroDaGuilda({ message: "guilda_sem_permissao", code: "P0001" })).toMatch(/permissão/);
    expect(mensagemDeErroDaGuilda({ code: "42501" })).toMatch(/permissão/);
    expect(mensagemDeErroDaGuilda({ code: "23514" })).toMatch(/2 a 40/);
    expect(mensagemDeErroDaGuilda({ code: "PGRST202" })).toMatch(/banco/);
    expect(mensagemDeErroDaGuilda(null)).toMatch(/Não foi possível/);
  });
});
