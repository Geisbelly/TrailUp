import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import FilaDePersonalizacao from "./FilaDePersonalizacao";
import {
  duracao,
  inicioDaSequenciaDeFalhas,
  lerKpisOperacionais,
  parametrosDaJanela,
  rotuloDoBalde,
  rotuloDoFormato,
  rotuloDoTipo,
  textoDoGatilho,
  type BaldeDaSerie,
  type KpisOperacionais,
} from "./kpisOperacionais";
import type { EstadoDosKpisOperacionais } from "./useKpisOperacionais";

const balde = (inicio: string, s: Partial<BaldeDaSerie> = {}): BaldeDaSerie => {
  const b = { inicio, pending: 0, processing: 0, completed: 0, partial: 0, failed: 0, latencia_media_seg: null, ...s };
  return { ...b, total: s.total ?? b.pending + b.processing + b.completed + b.partial + b.failed };
};

describe("lerKpisOperacionais", () => {
  it("aceita a forma da RPC", () => {
    const r = { jobs: { total: 0 }, por_tipo: [], por_formato: [], serie: [], gatilhos: [] };
    expect(lerKpisOperacionais(r)).toBe(r);
  });

  it("forma inesperada vira null, não zeros", () => {
    expect(lerKpisOperacionais(null)).toBeNull();
    expect(lerKpisOperacionais({ jobs: { total: 1 } })).toBeNull();
    expect(lerKpisOperacionais({ jobs: {}, por_tipo: [], por_formato: [], serie: [], gatilhos: [] })).toBeNull();
  });
});

describe("parametrosDaJanela", () => {
  const agora = new Date("2026-11-02T15:00:00Z");

  it("começa à meia-noite de Brasília do primeiro dia da janela", () => {
    expect(parametrosDaJanela("7d", agora)).toEqual({ p_inicio: "2026-10-27T00:00:00-03:00", p_granularidade: "dia" });
  });

  it("um ano vai em semanas", () => {
    expect(parametrosDaJanela("tudo", agora).p_granularidade).toBe("semana");
  });
});

describe("duracao", () => {
  it("sem dado é traço, nunca zero", () => {
    expect(duracao(null)).toBe("—");
    expect(duracao(undefined)).toBe("—");
  });

  it("segundos, minutos e horas", () => {
    expect(duracao(45)).toBe("45 s");
    expect(duracao(1166)).toBe("19 min");
    expect(duracao(3600)).toBe("1 h");
    expect(duracao(36763)).toBe("10 h 13 min");
  });
});

describe("rótulos", () => {
  it("tipo e formato conhecidos em português; desconhecido passa como veio", () => {
    expect(rotuloDoTipo("class_delta_sync")).toBe("Edição da trilha");
    expect(rotuloDoTipo("kind_novo")).toBe("kind_novo");
    expect(rotuloDoFormato("perfil_inteiro")).toBe("Perfil inteiro (antigo)");
  });

  it("balde por dia, semana e hora", () => {
    expect(rotuloDoBalde("2026-11-01T00:00", "dia")).toBe("01/11");
    expect(rotuloDoBalde("2026-10-26T00:00", "semana")).toBe("semana de 26/10");
    expect(rotuloDoBalde("2026-11-01T13:00", "hora")).toBe("01/11 13:00");
  });
});

describe("inicioDaSequenciaDeFalhas", () => {
  it("o primeiro balde com falha depois do último balde bom", () => {
    const serie = [
      balde("2026-10-28T00:00", { failed: 1 }),
      balde("2026-10-29T00:00", { completed: 2 }),
      balde("2026-10-30T00:00", { failed: 1 }),
      balde("2026-10-31T00:00"),
      balde("2026-11-01T00:00", { partial: 1, completed: 1 }),
    ];
    expect(inicioDaSequenciaDeFalhas(serie)?.inicio).toBe("2026-10-30T00:00");
  });

  it("falha que já passou não conta como em curso", () => {
    expect(inicioDaSequenciaDeFalhas([balde("a", { failed: 1 }), balde("b", { completed: 1 })])).toBeNull();
  });

  it("sem job nenhum: null", () => {
    expect(inicioDaSequenciaDeFalhas([balde("a"), balde("b")])).toBeNull();
  });
});

describe("textoDoGatilho", () => {
  it("nomeia o que passou da meta", () => {
    expect(textoDoGatilho({ chave: "latencia_acima_slo", ativo: true, tipos: ["class_delta_sync"] })).toBe(
      "Demora acima da meta em: Edição da trilha."
    );
    expect(textoDoGatilho({ chave: "fila_parada", ativo: true, jobs_em_aberto_acima_do_slo: 1 })).toBe(
      "1 pedido está na fila há mais tempo que a meta."
    );
    expect(
      textoDoGatilho({ chave: "falha_persistente", ativo: true, limiar_pct: 20, dias: 3, ultimos_dias_com_job: [] })
    ).toContain("mais de 20%");
  });
});

// A forma que a RPC devolve (os números do e2e da migration 20261102_12).
const status = (s: Partial<Record<"pending" | "processing" | "completed" | "partial" | "failed", number>>) => ({
  pending: 0, processing: 0, completed: 0, partial: 0, failed: 0, ...s,
});
const alvo = (s: Partial<Record<"pending" | "processing" | "completed" | "failed" | "skipped", number>>) => ({
  pending: 0, processing: 0, completed: 0, failed: 0, skipped: 0, ...s,
});
const formato = (f: string, extra: Record<string, unknown> = {}) => ({
  formato: f, total: 0, por_status: alvo({}), geracoes_medidas: 0, tempo_geracao_medio_seg: null,
  tempo_geracao_p95_seg: null, base_reprocessamento: 0, reprocessados: 0, taxa_reprocessamento_pct: null,
  slo_geracao_p95_seg: 300, slo_violado: null, ...extra,
});
const KPIS = {
  classe_id: 1,
  inicio: "2026-10-04T03:00:00Z",
  fim: "2026-11-02T15:00:00Z",
  granularidade: "dia",
  jobs: {
    total: 4, por_status: status({ pending: 1, completed: 1, partial: 1, failed: 1 }), em_aberto: 1, terminados: 3,
    latencia_media_seg: 1600, latencia_p95_seg: 2820, espera_media_seg: 33, pedidos_de_reprocessamento: 1,
  },
  por_tipo: [
    { kind: "class_delta_sync", total: 3, por_status: status({ pending: 1, completed: 1, failed: 1 }), em_aberto: 1,
      terminados: 2, latencia_media_seg: 1800, latencia_p95_seg: 2880, espera_media_seg: 45,
      slo_latencia_p95_seg: 1800, slo_violado: true },
  ],
  por_formato: [
    formato("capitulo", { total: 2, por_status: alvo({ completed: 2 }), geracoes_medidas: 2, tempo_geracao_medio_seg: 200,
      tempo_geracao_p95_seg: 290, base_reprocessamento: 2, reprocessados: 1, taxa_reprocessamento_pct: 50, slo_violado: false }),
    formato("audio", { total: 2, por_status: alvo({ completed: 1, failed: 1 }), geracoes_medidas: 1,
      tempo_geracao_p95_seg: 900, slo_geracao_p95_seg: 600, slo_violado: true }),
  ],
  serie: [
    balde("2026-10-31T00:00", { completed: 1, latencia_media_seg: 600 }),
    balde("2026-11-01T00:00", { failed: 1, partial: 1, pending: 1 }),
    balde("2026-11-02T00:00"),
  ],
  gatilhos: [
    { chave: "falha_persistente", ativo: false, limiar_pct: 20, dias: 3, ultimos_dias_com_job: [] },
    { chave: "latencia_acima_slo", ativo: true, tipos: ["class_delta_sync"] },
    { chave: "geracao_acima_slo", ativo: true, formatos: ["audio"] },
    { chave: "fila_parada", ativo: false, jobs_em_aberto_acima_do_slo: 0 },
  ],
} as unknown as KpisOperacionais;

const html = (turmaUnica: number | null, estado: Partial<EstadoDosKpisOperacionais>) =>
  renderToStaticMarkup(
    createElement(FilaDePersonalizacao, { turmaUnica, estado: { kpis: null, carregando: false, erro: null, ...estado } })
  );

describe("FilaDePersonalizacao", () => {
  it("mostra os alertas ativos, os totais e onde a falha começou", () => {
    const h = html(1, { kpis: KPIS });
    expect(h).toContain("Demora acima da meta em: Edição da trilha.");
    expect(h).toContain("Geração acima da meta em: Áudio.");
    expect(h).not.toContain("na fila há mais tempo");
    expect(h).toContain("Falhas seguidas desde 01/11.");
    expect(h).toContain("27 min"); // média 1600 s
    expect(h).toContain("meta 30 min");
    expect(h).toContain("50% (1 de 2)");
  });

  it("acima da meta vai por texto, não só por cor", () => {
    expect(html(1, { kpis: KPIS }).match(/\(acima\)/g)).toHaveLength(2);
  });

  it("estados sem número: todas as turmas, erro e janela sem pedido", () => {
    expect(html(null, {})).toContain("Escolha uma turma");
    expect(html(1, { erro: "permission denied" })).toContain('role="alert"');
    const vazio = { ...KPIS, jobs: { ...KPIS.jobs, total: 0 } };
    expect(html(1, { kpis: vazio })).toContain("Nenhum pedido de geração");
  });
});
