import { describe, expect, it } from "vitest";
import {
  FORMULARIO_DE_EVENTO_VAZIO,
  dataParaCampo,
  resumoDeAbertura,
  rotuloDaJanela,
  rotuloDasPecas,
  rotuloDoStatus,
  situacaoDoEvento,
  validarEvento,
  type FormularioDeEvento,
} from "./evento";

const valido: FormularioDeEvento = {
  ...FORMULARIO_DE_EVENTO_VAZIO,
  titulo: "  Semana da Cinemática ",
  inicio: "2026-10-20T08:00",
  fim: "2026-10-27T23:59",
  pecas: ["arena", "missoes"],
  missoesIds: [4],
  pontos: "50",
};

describe("validarEvento", () => {
  it("monta o payload limpo, com as peças na ordem do catálogo", () => {
    const r = validarEvento(valido);
    expect(r.ok).toBe(true);
    expect(r.payload).toMatchObject({
      titulo: "Semana da Cinemática",
      pecas: ["missoes", "arena"],
      topico_id: null,
      guilda_tamanho_max: null,
      pontos: 50,
      moedas: 0,
      recompensa: null,
      abrir_no_inicio: true,
    });
  });

  it("evento novo sai agendado para abrir sozinho; desmarcar vai no payload (#141)", () => {
    expect(FORMULARIO_DE_EVENTO_VAZIO.abrirNoInicio).toBe(true);
    expect(validarEvento({ ...valido, abrirNoInicio: false }).payload.abrir_no_inicio).toBe(false);
  });

  it("devolve todos os erros de uma vez", () => {
    const r = validarEvento(FORMULARIO_DE_EVENTO_VAZIO);
    expect(r.ok).toBe(false);
    expect(Object.keys(r.erros).sort()).toEqual(["fim", "inicio", "pecas", "titulo"]);
  });

  it("exige fim depois do começo", () => {
    expect(validarEvento({ ...valido, fim: "2026-10-20T08:00" }).erros.fim).toMatch(/depois do começo/);
    expect(validarEvento({ ...valido, fim: "2026-10-19T08:00" }).ok).toBe(false);
  });

  it("guilda pede tamanho entre 2 e 20; sem guilda o tamanho some", () => {
    expect(validarEvento({ ...valido, modalidadeGuilda: true, guildaTamanhoMax: "" }).erros.guildaTamanhoMax).toBeTruthy();
    expect(validarEvento({ ...valido, modalidadeGuilda: true, guildaTamanhoMax: "1" }).ok).toBe(false);
    expect(validarEvento({ ...valido, modalidadeGuilda: true, guildaTamanhoMax: "21" }).ok).toBe(false);
    expect(validarEvento({ ...valido, modalidadeGuilda: true, guildaTamanhoMax: "5" }).payload.guilda_tamanho_max).toBe(5);
    expect(validarEvento({ ...valido, modalidadeGuilda: false, guildaTamanhoMax: "5" }).payload.guilda_tamanho_max).toBeNull();
  });

  it("pontos e moedas: inteiros não negativos", () => {
    expect(validarEvento({ ...valido, pontos: "-1" }).erros.pontos).toBeTruthy();
    expect(validarEvento({ ...valido, pontos: "2,5" }).erros.pontos).toBeTruthy();
    expect(validarEvento({ ...valido, moedas: "abc" }).erros.moedas).toBeTruthy();
    expect(validarEvento({ ...valido, moedas: "10000" }).ok).toBe(true);
  });

  it("medalha de destaque força a de participação (regra do banco)", () => {
    const r = validarEvento({ ...valido, medalhaParticipacao: false, medalhaDestaque: true });
    expect(r.payload).toMatchObject({ medalha_participacao: true, medalha_destaque: true });
  });

  it("tópico opcional e recompensa só com texto", () => {
    const r = validarEvento({ ...valido, topicoId: "12", recompensa: "  Sem prova surpresa  " });
    expect(r.payload).toMatchObject({ topico_id: 12, recompensa: "Sem prova surpresa" });
  });
});

describe("rótulos", () => {
  it("janela, status e peças", () => {
    expect(rotuloDaJanela("2026-10-20T12:00:00Z", "2026-10-27T12:00:00Z")).toBe("20/10 a 27/10");
    expect(rotuloDoStatus("aberto")).toBe("Aberto");
    expect(rotuloDoStatus("rascunho")).toBe("Rascunho");
    expect(rotuloDasPecas(["arena", "missoes"])).toBe("Missões · Arena");
    expect(rotuloDasPecas([])).toBe("Nenhuma peça");
    expect(dataParaCampo(null)).toBe("");
    expect(dataParaCampo("lixo")).toBe("");
  });

  it("situação depende do estado e da janela", () => {
    const e = { inicio: "2026-10-20T00:00:00Z", fim: "2026-10-27T00:00:00Z" };
    const dia = (s: string) => new Date(s);
    expect(situacaoDoEvento({ ...e, status: "encerrado" })).toBe("Encerrado");
    expect(situacaoDoEvento({ ...e, status: "rascunho" }, dia("2026-10-10T00:00:00Z"))).toMatch(/Ainda não aberto/);
    expect(situacaoDoEvento({ ...e, status: "rascunho" }, dia("2026-11-10T00:00:00Z"))).toMatch(/Janela já passou/);
    expect(situacaoDoEvento({ ...e, status: "aberto" }, dia("2026-10-10T00:00:00Z"))).toMatch(/começa em breve/);
    expect(situacaoDoEvento({ ...e, status: "aberto" }, dia("2026-10-22T00:00:00Z"))).toBe("Em andamento");
    // #141: depois do fim a varredura encerra e apura sozinha.
    expect(situacaoDoEvento({ ...e, status: "aberto" }, dia("2026-11-10T00:00:00Z"))).toMatch(/encerra sozinho/);
  });

  it("rascunho agendado diz quando abre sozinho (#141)", () => {
    const e = { inicio: "2026-10-20T12:00:00Z", fim: "2026-10-27T00:00:00Z", status: "rascunho" as const, abrirNoInicio: true };
    const dia = (s: string) => new Date(s);
    expect(situacaoDoEvento(e, dia("2026-10-10T00:00:00Z"))).toMatch(/^Abre sozinho em \d{2}\/\d{2} \d{2}:\d{2}$/);
    expect(situacaoDoEvento(e, dia("2026-10-21T00:00:00Z"))).toMatch(/Abrindo sozinho em instantes/);
    expect(situacaoDoEvento(e, dia("2026-11-10T00:00:00Z"))).toMatch(/Janela já passou/);
    expect(situacaoDoEvento({ ...e, abrirNoInicio: false }, dia("2026-10-10T00:00:00Z"))).toMatch(/Ainda não aberto/);
  });

  it("resumo de abertura avisa do congelamento só com guilda", () => {
    const base = { titulo: "E", modalidadeGuilda: false, pecas: ["arena"], inicio: "2026-10-20T12:00:00Z", fim: "2026-10-27T12:00:00Z" };
    expect(resumoDeAbertura(base).join(" ")).not.toMatch(/congeladas/);
    expect(resumoDeAbertura({ ...base, modalidadeGuilda: true }).join(" ")).toMatch(/congeladas/);
  });
});

describe("missões do evento", () => {
  it("peça Missões exige ao menos uma missão; sem a peça, a lista é ignorada", () => {
    const sem = validarEvento({ ...valido, pecas: ["missoes"], missoesIds: [] });
    expect(sem.ok).toBe(false);
    expect(sem.erros.missoes).toMatch(/missões do evento/);

    const com = validarEvento({ ...valido, pecas: ["missoes", "arena"], missoesIds: [4, 4, 9] });
    expect(com.ok).toBe(true);
    expect(com.missoes).toEqual([4, 9]);

    const semPeca = validarEvento({ ...valido, pecas: ["arena"], missoesIds: [4] });
    expect(semPeca.ok).toBe(true);
    expect(semPeca.missoes).toEqual([]);
  });

  it("no máximo 20 missões", () => {
    const muitas = Array.from({ length: 21 }, (_, i) => i + 1);
    expect(validarEvento({ ...valido, pecas: ["missoes"], missoesIds: muitas }).erros.missoes).toMatch(/No máximo 20/);
  });
});
