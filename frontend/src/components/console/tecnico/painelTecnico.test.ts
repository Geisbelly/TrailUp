import { describe, expect, it } from "vitest";
import {
  contarAlertas,
  eMigracaoPendente,
  eSemPermissao,
  formatarDuracao,
  formatarMinutos,
  formatarPercentual,
  formatarTokens,
  haQuanto,
  lerPainel,
  ordenarFormatos,
  rotuloDoEstado,
  rotuloDoFormato,
  type Formato,
} from "./painelTecnico";

describe("lerPainel", () => {
  it("lê o que a RPC devolve", () => {
    const p = lerPainel({
      gerado_em: "2026-11-02T12:00:00Z",
      janela_horas: 168,
      fila: { jobs_pending: 2, jobs_processing: 1, pending_mais_antigo_min: 45, processing_travados: 1, alvos_pending: 9, alvos_processing: 3 },
      jobs: { total: 10, por_tipo: [{ kind: "full_sync", total: 4, pending: 1, processing: 0, completed: 2, partial: 0, failed: 1, latencia_p95_seg: 2400, slo_p95_seg: 1800, slo_violado: true }] },
      formatos: [{ formato: "audio", total: 7, pending: 0, processing: 0, completed: 6, failed: 1, skipped: 0, falha_pct: 14.3, tempo_p95_seg: 700, slo_p95_seg: 600, slo_violado: true, execucoes_medias: 2, execucoes_medias_anterior: 1 }],
      gatilhos: [{ id: "latencia_slo", titulo: "Latência", estado: "alerta", detalhe: "p95 acima do SLO em: full_sync." }],
      invariantes: [{ invariante: "I07", ok: false, linhas: 3, erro: null, rodado_em: "2026-11-02T10:00:00Z" }],
      atividade: { ultimo_job_iniciado_em: "2026-11-02T11:00:00Z", ultimo_lote_em: null, ultima_analise_em: null, analise_na_fila: 2, analise_com_erro: 1 },
    });
    expect(p?.fila.pending_mais_antigo_min).toBe(45);
    expect(p?.jobs.por_tipo[0].slo_violado).toBe(true);
    expect(p?.formatos[0].falha_pct).toBe(14.3);
    expect(p?.gatilhos[0].estado).toBe("alerta");
    expect(p?.invariantes[0].ok).toBe(false);
    expect(p?.atividade.analise_com_erro).toBe(1);
  });

  it("não confia no formato: resposta quebrada vira painel vazio, sem estourar", () => {
    expect(lerPainel(null)).toBeNull();
    expect(lerPainel("x")).toBeNull();
    expect(lerPainel([])).toBeNull();
    const vazio = lerPainel({});
    expect(vazio?.fila.jobs_pending).toBe(0);
    expect(vazio?.fila.pending_mais_antigo_min).toBeNull();
    expect(vazio?.jobs.por_tipo).toEqual([]);
    expect(vazio?.gatilhos).toEqual([]);
    expect(vazio?.atividade.ultima_analise_em).toBeNull();
  });

  it("estado de gatilho desconhecido vira sem_dado, nunca ok: o que a tela não entende não parece saudável", () => {
    const p = lerPainel({ gatilhos: [{ id: "x", titulo: "X", estado: "saudavel", detalhe: "" }, { id: "y", estado: 7 }] });
    expect(p?.gatilhos.map((g) => g.estado)).toEqual(["sem_dado", "sem_dado"]);
  });

  it("SLO ausente fica nulo, não false: 'não violou' e 'não há SLO' são coisas diferentes", () => {
    const p = lerPainel({ jobs: { por_tipo: [{ kind: "a", slo_violado: null }, { kind: "b", slo_violado: false }, { kind: "c" }] } });
    expect(p?.jobs.por_tipo.map((t) => t.slo_violado)).toEqual([null, false, null]);
  });

  it("descarta item da lista que não é objeto", () => {
    const p = lerPainel({ formatos: [null, "x", 3, { formato: "audio" }] });
    expect(p?.formatos).toHaveLength(1);
  });
});

describe("contarAlertas", () => {
  it("só 'alerta' conta; sem_dado é lacuna, não alarme", () => {
    expect(contarAlertas([{ estado: "alerta" }, { estado: "ok" }, { estado: "sem_dado" }, { estado: "alerta" }])).toBe(2);
    expect(contarAlertas([])).toBe(0);
  });
});

describe("formatação", () => {
  it("duração usa a unidade que cabe no número; nulo é traço, não zero", () => {
    expect(formatarDuracao(null)).toBe("—");
    expect(formatarDuracao(0)).toBe("0 s");
    expect(formatarDuracao(45)).toBe("45 s");
    expect(formatarDuracao(60)).toBe("1 min");
    expect(formatarDuracao(2400)).toBe("40 min");
    expect(formatarDuracao(3600)).toBe("1 h");
    expect(formatarDuracao(7500)).toBe("2 h 5 min");
    expect(formatarDuracao(-5)).toBe("0 s");
  });
  it("minutos e percentual", () => {
    expect(formatarMinutos(null)).toBe("—");
    expect(formatarMinutos(90)).toBe("1 h 30 min");
    expect(formatarPercentual(null)).toBe("—");
    expect(formatarPercentual(14.3)).toBe("14,3%");
    expect(formatarPercentual(0)).toBe("0%");
  });
  it("há quanto tempo, e 'nunca' quando não há registro", () => {
    const agora = new Date("2026-11-02T12:00:00Z");
    expect(haQuanto(null, agora)).toBe("nunca");
    expect(haQuanto("2026-11-02T11:59:50Z", agora)).toBe("agora");
    expect(haQuanto("2026-11-02T11:15:00Z", agora)).toBe("há 45 min");
    expect(haQuanto("2026-11-02T07:00:00Z", agora)).toBe("há 5 h");
    expect(haQuanto("2026-10-31T12:00:00Z", agora)).toBe("há 2 dias");
    expect(haQuanto("2026-11-01T12:00:00Z", agora)).toBe("há 1 dia");
  });
  it("rótulos", () => {
    expect(rotuloDoEstado("alerta")).toBe("Atenção");
    expect(rotuloDoEstado("ok")).toBe("Dentro do esperado");
    expect(rotuloDoEstado("sem_dado")).toBe("Sem dado");
    expect(rotuloDoFormato("audio")).toBe("Áudio");
    expect(rotuloDoFormato("perfil_inteiro")).toBe("Perfil inteiro (legado)");
    expect(rotuloDoFormato("novo_formato")).toBe("novo_formato");
  });
});

describe("ordenarFormatos", () => {
  const f = (formato: string): Formato => ({ formato, total: 1, pending: 0, processing: 0, completed: 1, failed: 0, skipped: 0, falha_pct: 0, tempo_p95_seg: null, slo_p95_seg: null, slo_violado: null, execucoes_medias: null, execucoes_medias_anterior: null });
  it("na ordem do pipeline, formato desconhecido por último, sem mutar a lista", () => {
    const lista = [f("apresentacao"), f("zeta"), f("texto"), f("audio"), f("enriquecimento")];
    expect(ordenarFormatos(lista).map((x) => x.formato)).toEqual(["enriquecimento", "texto", "audio", "apresentacao", "zeta"]);
    expect(lista[0].formato).toBe("apresentacao");
  });
});

describe("erros da RPC", () => {
  it("42501 é falta de permissão (não é o dono)", () => {
    expect(eSemPermissao({ code: "42501" })).toBe(true);
    expect(eSemPermissao({ code: "22023" })).toBe(false);
    expect(eSemPermissao(null)).toBe(false);
  });
  it("função ausente é migration pendente", () => {
    expect(eMigracaoPendente({ code: "42883" })).toBe(true);
    expect(eMigracaoPendente({ code: "PGRST202" })).toBe(true);
    expect(eMigracaoPendente({ message: "Could not find the function public.painel_tecnico in the schema cache" })).toBe(true);
    expect(eMigracaoPendente({ code: "42501", message: "Só o dono" })).toBe(false);
    expect(eMigracaoPendente(null)).toBe(false);
  });
});

describe("custo em tokens (20261103_14)", () => {
  const base = { fila: {}, jobs: {}, formatos: [], gatilhos: [], invariantes: [], atividade: {} };

  it("lê o custo e ordena os modelos pelo que mais gastou", () => {
    const p = lerPainel({
      ...base,
      custo: {
        tokens_por_alvo: 1200, tokens_por_alvo_anterior: 900, alvos_medidos: 8, alvos_medidos_anterior: 6,
        por_modelo: {
          "gpt-4o-mini-tts": { chamadas: 2, tokens_entrada: 0, tokens_saida: 0, caracteres: 900 },
          "gemini-flash": { chamadas: 10, tokens_entrada: 8000, tokens_saida: 2000, caracteres: 0 },
        },
      },
    });
    expect(p?.custo?.tokens_por_alvo).toBe(1200);
    expect(p?.custo?.por_modelo.map((m) => m.modelo)).toEqual(["gemini-flash", "gpt-4o-mini-tts"]);
  });

  it("janela sem alvo medido fica nula, não zero; banco antigo não tem a seção", () => {
    const p = lerPainel({ ...base, custo: { tokens_por_alvo: null, alvos_medidos: 0, por_modelo: {} } });
    expect(p?.custo?.tokens_por_alvo).toBeNull();
    expect(lerPainel(base)?.custo).toBeNull();
  });

  it("formata tokens por ordem de grandeza", () => {
    expect(formatarTokens(null)).toBe("—");
    expect(formatarTokens(950)).toBe("950");
    expect(formatarTokens(12_340)).toBe("12,3 mil");
    expect(formatarTokens(2_500_000)).toBe("2,5 mi");
  });
});
