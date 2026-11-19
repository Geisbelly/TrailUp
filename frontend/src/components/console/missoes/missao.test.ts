import { describe, expect, it } from "vitest";
import {
  FORMULARIO_DE_MISSAO_VAZIO,
  agruparDesafios,
  comCriterioDaAtividade,
  faltaColunaDoDesafio,
  opcoesDePerfilDaLinha,
  percentualDeEntrega,
  prazoParaCampo,
  resumoDeEntregas,
  resumoDoDesafio,
  rotuloDoPrazo,
  rotuloDoTipoDoDesafio,
  trocasDePerfil,
  validarMissao,
  type FormularioDeMissao,
} from "./missao";
import type { Missao } from "./missoesApi";

const base = (extra: Partial<FormularioDeMissao> = {}): FormularioDeMissao => ({
  turmaId: "3",
  perfil: "",
  caminho: "entrega",
  titulo: "Cinemática em movimento",
  objetivo: "Prever e comparar tempos de queda.",
  topicoId: "12",
  prazo: "",
  moedas: "",
  pontos: "50",
  metrica: "",
  alvo: "",
  ...extra,
});

/** Caminho `meta`: não pede tópico nem nota — era a limitação que `missoes` removeu. */
const meta = (extra: Partial<FormularioDeMissao> = {}): FormularioDeMissao =>
  base({ caminho: "meta", topicoId: "", pontos: "", metrica: "minutos_totais", alvo: "30", ...extra });

describe("validarMissao", () => {
  it("monta um payload de atividade com tipo 'missao', objetivo na descrição e pontuação máxima", () => {
    const r = validarMissao(base({ titulo: "  Missão  Um ", objetivo: " alvo " }));
    expect(r.ok).toBe(true);
    expect(r.atividade).toEqual({ topico_id: 12, titulo: "Missão  Um", descricao: "alvo", tipo: "missao", data_entrega: null, pontuacao_maxima: 50, moedas: 0 });
    // O critério de `entrega` só pode ser montado depois do INSERT da atividade.
    expect(r.missao).toEqual({
      classe_id: 3, perfil_alvo: null,
      escopo: "turma", origem: "professor", titulo: "Missão  Um", descricao: "alvo",
      recompensa_tipo: "missao_concluida", janela_fim: null, criterio: null,
    });
    expect(r.erros).toBeNull();
  });

  it("o escopo do formulário vai para o payload; ausente é turma", () => {
    expect(validarMissao(meta()).missao!.escopo).toBe("turma");
    const g = validarMissao(meta({ escopo: "guilda", metrica: "atividades_concluidas", alvo: "6" }));
    expect(g.ok).toBe(true);
    expect(g.missao).toMatchObject({ escopo: "guilda", criterio: { metrica: "atividades_concluidas", minimo: 6 } });
  });

  it("guilda soma os membros: só meta, e só com métrica que soma", () => {
    // Entrega não é número — o banco recusaria com 22023.
    expect(validarMissao(base({ escopo: "guilda" })).erros!.caminho).toBeTruthy();
    // Percentual somado passaria de 100; minutos_totais não é contagem de guilda.
    for (const metrica of ["acertos_percentual", "trilha_percentual", "dias_seguidos", "minutos_totais", "topicos_concluidos"]) {
      expect(validarMissao(meta({ escopo: "guilda", metrica })).erros!.metrica).toBeTruthy();
    }
    // Na turma, as mesmas seguem valendo.
    expect(validarMissao(meta({ metrica: "acertos_percentual", alvo: "80" })).ok).toBe(true);
  });

  it("prazo preenchido vira ISO; inválido é erro", () => {
    const ok = validarMissao(base({ prazo: "2026-10-20T23:59" }));
    expect(ok.atividade!.data_entrega).toBe(new Date("2026-10-20T23:59").toISOString());
    expect(ok.missao!.janela_fim).toBe(new Date("2026-10-20T23:59").toISOString());
    expect(validarMissao(base({ prazo: "ontem" })).erros!.prazo).toBeTruthy();
  });

  it("título, objetivo, tópico e pontos são obrigatórios", () => {
    const r = validarMissao(FORMULARIO_DE_MISSAO_VAZIO);
    expect(r.ok).toBe(false);
    expect(r.missao).toBeNull();
    expect(r.atividade).toBeNull();
    expect(Object.keys(r.erros!).sort()).toEqual(["objetivo", "pontos", "titulo", "topicoId", "turmaId"]);
  });

  it("turma e perfil vão para a missão; vazio é todos os perfis", () => {
    expect(validarMissao(meta({ turmaId: "8", perfil: "achiever" })).missao).toMatchObject({ classe_id: 8, perfil_alvo: "achiever" });
    expect(validarMissao(meta({ turmaId: "8" })).missao!.perfil_alvo).toBeNull();
  });

  it("perfil fora da lista e perfil em guilda são recusados", () => {
    expect(validarMissao(meta({ perfil: "ninja" })).erros!.perfil).toBeTruthy();
    expect(validarMissao(meta({ escopo: "guilda", metrica: "atividades_concluidas", perfil: "seeker" })).erros!.perfil).toBeTruthy();
  });

  it("limites de tamanho", () => {
    expect(validarMissao(base({ titulo: "ab" })).erros!.titulo).toBeTruthy();
    expect(validarMissao(base({ titulo: "x".repeat(81) })).erros!.titulo).toBeTruthy();
    expect(validarMissao(base({ objetivo: "x".repeat(601) })).erros!.objetivo).toBeTruthy();
  });

  it("pontuação: inteiro de 1 a 1000", () => {
    for (const p of ["0", "-5", "1,5", "abc", "1001", ""]) expect(validarMissao(base({ pontos: p })).erros!.pontos).toBeTruthy();
    expect(validarMissao(base({ pontos: "1000" })).ok).toBe(true);
  });

  it("tópico precisa ser id positivo", () => {
    for (const t of ["", "0", "-2", "x"]) expect(validarMissao(base({ topicoId: t })).erros!.topicoId).toBeTruthy();
  });
});

describe("prazo", () => {
  it("ida e volta pelo campo datetime-local, no fuso do navegador", () => {
    const campo = "2026-10-20T23:59";
    expect(prazoParaCampo(new Date(campo).toISOString())).toBe(campo);
  });
  it("vazio ou inválido vira vazio", () => {
    expect(prazoParaCampo(null)).toBe("");
    expect(prazoParaCampo("x")).toBe("");
  });
  it("rótulo curto da lista", () => {
    expect(rotuloDoPrazo(new Date(2026, 8, 28, 12).toISOString())).toBe("28/09");
    expect(rotuloDoPrazo(null)).toBe("Sem prazo");
  });
});

describe("entregas", () => {
  it("resumo e percentual, sem dividir por zero nem passar de 100%", () => {
    expect(resumoDeEntregas(19, 34)).toBe("19/34");
    expect(resumoDeEntregas(40, 34)).toBe("34/34");
    expect(percentualDeEntrega(17, 34)).toBe(50);
    expect(percentualDeEntrega(0, 0)).toBe(0);
    expect(percentualDeEntrega(50, 34)).toBe(100);
  });
});

describe("moedas", () => {
  it("vazio é nenhuma; inteiro de 0 a 1000 passa", () => {
    expect(validarMissao(base()).atividade.moedas).toBe(0);
    expect(validarMissao(base({ moedas: "25" })).atividade.moedas).toBe(25);
    expect(validarMissao(base({ moedas: "1000" })).ok).toBe(true);
  });
  it("rejeita negativo, decimal, texto e acima do teto", () => {
    for (const m of ["-1", "2,5", "abc", "1001"]) expect(validarMissao(base({ moedas: m })).erros.moedas).toBeTruthy();
  });
});

describe("caminho meta", () => {
  it("não cria atividade e grava o critério com a chave que o avaliador lê", () => {
    const r = validarMissao(meta({ metrica: "minutos_totais", alvo: "45" }));
    expect(r.ok).toBe(true);
    expect(r.atividade).toBeNull();
    expect(r.missao!.criterio).toEqual({ metrica: "minutos_totais", minutos: 45 });
  });

  it("não pede tópico nem nota — `missoes` não tem `topico_id`", () => {
    const r = validarMissao(meta({ topicoId: "", pontos: "" }));
    expect(r.ok).toBe(true);
    expect(r.erros).toBeNull();
  });

  it("métrica e alvo são obrigatórios", () => {
    const r = validarMissao(meta({ metrica: "", alvo: "" }));
    expect(Object.keys(r.erros!).sort()).toEqual(["alvo", "metrica"]);
  });

  it("métrica fora da lista do professor é recusada", () => {
    // O banco aceita as 12; esta tela oferece 6. `evento_medalha` é das que ficam fora.
    expect(validarMissao(meta({ metrica: "evento_medalha" })).erros!.metrica).toBeTruthy();
  });

  it("alvo respeita o teto da métrica", () => {
    expect(validarMissao(meta({ metrica: "acertos_percentual", alvo: "101" })).erros!.alvo).toBeTruthy();
    expect(validarMissao(meta({ metrica: "acertos_percentual", alvo: "100" })).ok).toBe(true);
    expect(validarMissao(meta({ metrica: "dias_seguidos", alvo: "366" })).erros!.alvo).toBeTruthy();
  });

  it("alvo zero, negativo, decimal e texto são recusados", () => {
    for (const a of ["0", "-3", "1,5", "abc", ""]) {
      expect(validarMissao(meta({ alvo: a })).erros!.alvo).toBeTruthy();
    }
  });
});

describe("comCriterioDaAtividade", () => {
  it("completa o critério de entrega depois do INSERT", () => {
    const r = validarMissao(base());
    expect(r.missao!.criterio).toBeNull();
    const pronta = comCriterioDaAtividade(r.missao!, 77);
    expect(pronta.criterio).toEqual({ metrica: "atividade_especifica", atividade_id: 77 });
    // Não muda mais nada.
    expect({ ...pronta, criterio: null }).toEqual(r.missao);
  });
});

const comum = (id: number, extra: Partial<Missao> = {}): Missao => ({
  id,
  classeId: 7,
  perfilAlvo: null,
  titulo: `M${id}`,
  objetivo: "obj",
  prazo: null,
  criterio: { metrica: "minutos_totais", minutos: 30 },
  criterioRotulo: "Minutos de estudo: 30 minutos",
  origem: "professor",
  aprovacao: "nao_requer",
  motivoRecusa: null,
  escopo: "turma",
  ativa: true,
  caminho: "meta",
  atividadeId: null,
  topicoId: null,
  topicoNome: "—",
  pontos: 0,
  moedas: 0,
  entregues: 0,
  total: 10,
  desafio: null,
  desafioGrupo: null,
  conteudoId: null,
  perfis: [],
  linhasDoDesafio: [],
  ...extra,
});

/** Uma linha de missão-desafio como `mapearMissao` a deixa: um perfil por linha. */
const linhaDoDesafio = (id: number, grupo: string, perfil: string, extra: Partial<Missao> = {}): Missao =>
  comum(id, {
    titulo: "Desafio de lógica: Frações",
    origem: "ia",
    aprovacao: "aprovada",
    escopo: "aluno",
    criterio: { metrica: "desafio" },
    perfilAlvo: perfil,
    desafio: { tipo: "logica", formato: "curta", enunciado: "Quanto é 1/2 + 1/4?" },
    desafioGrupo: grupo,
    conteudoId: 30,
    perfis: [perfil],
    linhasDoDesafio: [{ id, perfilAlvo: perfil, ativa: extra.ativa ?? true }],
    ...extra,
  });

describe("agruparDesafios", () => {
  it("agruparDesafios junta as linhas do mesmo grupo e mantém as comuns", () => {
    const lista = [
      comum(1),
      linhaDoDesafio(10, "g1", "mastermind"),
      comum(2),
      linhaDoDesafio(11, "g1", "achiever"),
      linhaDoDesafio(12, "g2", "seeker"),
    ];
    const r = agruparDesafios(lista);
    // O grupo fica onde apareceu a primeira linha; as comuns não mudam de ordem nem de forma.
    expect(r.map((m) => m.id)).toEqual([1, 10, 2, 12]);
    expect(r[0]).toBe(lista[0]);
    expect(r[2]).toBe(lista[2]);
    expect(r[1].perfis).toEqual(["mastermind", "achiever"]);
    expect(r[1].linhasDoDesafio.map((l) => l.id).sort()).toEqual([10, 11]);
    expect(r[3].perfis).toEqual(["seeker"]);
  });

  it("os perfis seguem a ordem dos 7, não a do banco", () => {
    const r = agruparDesafios([linhaDoDesafio(11, "g", "mastermind"), linhaDoDesafio(10, "g", "seeker")]);
    expect(r[0].perfis).toEqual(["seeker", "mastermind"]);
    expect(r[0].linhasDoDesafio.map((l) => l.perfilAlvo)).toEqual(["seeker", "mastermind"]);
  });

  it("o grupo está ativo se alguma linha estiver; desativado só com todas desligadas", () => {
    const meio = agruparDesafios([linhaDoDesafio(10, "g", "seeker", { ativa: false }), linhaDoDesafio(11, "g", "mastermind")]);
    expect(meio[0].ativa).toBe(true);
    const todas = agruparDesafios([linhaDoDesafio(10, "g", "seeker", { ativa: false }), linhaDoDesafio(11, "g", "mastermind", { ativa: false })]);
    expect(todas[0].ativa).toBe(false);
  });

  it("sem desafio, devolve a mesma lista", () => {
    const lista = [comum(1), comum(2)];
    expect(agruparDesafios(lista)).toEqual(lista);
    expect(agruparDesafios([])).toEqual([]);
  });
});

describe("troca de perfis do desafio", () => {
  const linhas = [
    { id: 10, perfilAlvo: "mastermind", ativa: true },
    { id: 11, perfilAlvo: "achiever", ativa: true },
  ];

  it("cada linha oferece o próprio perfil e os que nenhuma outra linha tem, salvo ou no rascunho", () => {
    expect(opcoesDePerfilDaLinha(linhas, {}, 10)).toEqual(["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer"]);
    // A outra linha passou a seeker no rascunho: seeker sai, e achiever (o que ela tem salvo) continua fora.
    expect(opcoesDePerfilDaLinha(linhas, { 11: "seeker" }, 10)).toEqual(["survivor", "daredevil", "mastermind", "conqueror", "socializer"]);
  });

  it("só as linhas que mudaram viram UPDATE", () => {
    expect(trocasDePerfil(linhas, {})).toEqual([]);
    expect(trocasDePerfil(linhas, { 10: "mastermind" })).toEqual([]);
    expect(trocasDePerfil(linhas, { 10: "seeker" })).toEqual([{ id: 10, perfil: "seeker" }]);
  });

  it("recusa rascunho com o mesmo perfil em duas linhas, que o índice único do grupo recusaria", () => {
    expect(() => trocasDePerfil(linhas, { 10: "seeker", 11: "seeker" })).toThrow(/mesmo perfil/);
    // Trocar dois perfis entre si passaria por um estado repetido no meio do caminho.
    expect(() => trocasDePerfil(linhas, { 10: "achiever", 11: "mastermind" })).toThrow(/um de cada vez/);
  });

  it("recusa perfil fora dos 7", () => {
    expect(() => trocasDePerfil(linhas, { 10: "Mago" })).toThrow(/perfil/);
  });
});

describe("resumoDoDesafio", () => {
  it("lógica: o enunciado, numa linha só", () => {
    expect(resumoDoDesafio({ tipo: "logica", formato: "curta", enunciado: "  Se 2, 4, 8,\n  qual vem depois?  " })).toBe(
      "Se 2, 4, 8, qual vem depois?",
    );
  });

  it("múltipla: só o enunciado, nunca as alternativas", () => {
    const resumo = resumoDoDesafio({ tipo: "logica", formato: "multipla", enunciado: "Qual comando só lê?", alternativas: ["SELECT", "DELETE"] });
    expect(resumo).toBe("Qual comando só lê?");
  });

  it("cruzadinha: as 3 primeiras pistas, pela numeração da grade", () => {
    const palavras = [
      { numero: 3, direcao: "h", linha: 0, coluna: 0, tamanho: 5, pista: "Terceira" },
      { numero: 1, direcao: "v", linha: 0, coluna: 0, tamanho: 5, pista: "Primeira vertical" },
      { numero: 1, direcao: "h", linha: 0, coluna: 0, tamanho: 5, pista: "Primeira horizontal" },
      { numero: 2, direcao: "h", linha: 0, coluna: 0, tamanho: 5, pista: "Segunda" },
    ];
    expect(resumoDoDesafio({ tipo: "cruzadinha", linhas: 9, colunas: 9, palavras })).toBe(
      "Pistas: Primeira horizontal · Primeira vertical · Segunda",
    );
  });

  it("só lê enunciado e pistas: campo a mais no desafio não aparece", () => {
    expect(resumoDoDesafio({ tipo: "logica", formato: "curta", enunciado: "Que técnica é essa?", resposta: "Recursão" })).not.toContain(
      "Recursão",
    );
    expect(
      resumoDoDesafio({ tipo: "cruzadinha", palavras: [{ numero: 1, direcao: "h", pista: "Pista", resposta: "TERMO" }], resposta: { "1h": "TERMO" } }),
    ).toBe("Pistas: Pista");
  });

  it("desafio sem o que mostrar devolve vazio", () => {
    expect(resumoDoDesafio(null)).toBe("");
    expect(resumoDoDesafio({ tipo: "logica" })).toBe("");
    expect(resumoDoDesafio({ tipo: "cruzadinha", palavras: "x" })).toBe("");
    expect(resumoDoDesafio({ tipo: "cruzadinha", palavras: [{ pista: "  " }, null] })).toBe("");
  });
});

describe("rotuloDoTipoDoDesafio", () => {
  it("lógica traz o formato; cruzadinha é só cruzadinha", () => {
    expect(rotuloDoTipoDoDesafio({ tipo: "logica", formato: "multipla" })).toBe("Lógica · múltipla escolha");
    expect(rotuloDoTipoDoDesafio({ tipo: "logica", formato: "curta" })).toBe("Lógica · resposta curta");
    expect(rotuloDoTipoDoDesafio({ tipo: "cruzadinha" })).toBe("Cruzadinha");
    expect(rotuloDoTipoDoDesafio(null)).toBe("Desafio");
  });
});

describe("faltaColunaDoDesafio", () => {
  it("coluna que o banco ainda não tem (antes da #1149) é 42703 ou PGRST204", () => {
    for (const code of ["42703", "PGRST204"]) expect(faltaColunaDoDesafio({ code })).toBe(true);
    expect(faltaColunaDoDesafio({ code: "42501" })).toBe(false);
    // PGRST100 é erro de sintaxe da consulta, não coluna que falta: repetir sem o filtro o esconderia.
    expect(faltaColunaDoDesafio({ code: "PGRST100" })).toBe(false);
    expect(faltaColunaDoDesafio(null)).toBe(false);
  });
});
