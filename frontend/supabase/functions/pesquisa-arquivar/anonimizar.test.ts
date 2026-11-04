import { describe, expect, it } from "vitest";

import { anonimizarObjetoDoArquivo, codificador, VERSAO_DO_ANONIMO } from "./anonimizar";
import { montarObjeto } from "./arquivo";

const ALUNO = "0b6c1d7e-2f3a-4b5c-8d9e-0f1a2b3c4d5e";
const SESSAO = "004a7691-5330-4f56-af8f-ff6e4d000001";
const LOTE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const EVENTO_CLIENTE = "00056626-e05d-46f5-9dc0-5abce8000002";
const SAL = "a".repeat(32) + "b".repeat(32);

// Forma de um lote de producao (chaves medidas em 04/11), com os ids que aparecem nele.
const registroDoLote = () => ({
  id: LOTE,
  sessao_id: SESSAO,
  aluno_id: ALUNO,
  classe_id: 68,
  topico_id: 206,
  conteudo_id: 282,
  atividade_id: null,
  active_sec: 12.5,
  created_at: "2026-10-14T02:07:22.434+00:00",
  payload: {
    sessao_id: SESSAO,
    classe_id: 68,
    topico_id: 206,
    item_key: "content:282:personalization:38",
    camera: { enabled: false, frames: [{ captured_at: "2026-11-01T17:50:43Z", frame_mime: "image/jpeg" }] },
    cliente: { app_version: "1.0.6", plataforma: "android" },
    eventos_app: [
      {
        client_event_id: EVENTO_CLIENTE,
        topico_id: 206,
        conteudo_id: 282,
        item_key: "activity:1367",
        event_name: "tap",
        occurred_at: "2026-10-14T02:07:17.994Z",
        payload: { material_key: "material:content:-766313939:ap", x_pct: 0.4 },
      },
    ],
    signals: [{ meta: { contentId: 282, contentItemKey: "content:282" }, type: "content_open" }],
    time_metrics: { topics: [{ key: "topic:206", topico_id: 206, active_sec: 3 }] },
  },
});

const objetoDoArquivo = (registro: Record<string, unknown>, origem = "telemetria_lotes" as const) =>
  JSON.parse(
    montarObjeto(
      { origem, origem_id: String(registro.id), aluno_id: ALUNO, criado_em: "2026-10-14T02:07:22Z", registro },
      undefined,
      new Date("2026-11-04T00:00:00Z"),
    ),
  );

async function anonimo(registro = registroDoLote(), sal = SAL) {
  const r = await anonimizarObjetoDoArquivo(objetoDoArquivo(registro), {
    origem: "telemetria_lotes",
    sal,
    perfil: "Socializer",
  });
  return { ...r, json: JSON.parse(r.corpo) };
}

describe("anonimizarObjetoDoArquivo", () => {
  it("nao sobra nenhum identificador original, em lugar nenhum", async () => {
    const { corpo, caminho } = await anonimo();
    for (const original of [ALUNO, SESSAO, LOTE, EVENTO_CLIENTE, ":282", ":206", ":1367", ":38", "-766313939"]) {
      expect(corpo).not.toContain(original);
      expect(caminho).not.toContain(original);
    }
    for (const numero of [68, 206, 282]) {
      expect(corpo).not.toMatch(new RegExp(`:${numero}[,}]`));
    }
  });

  it("guarda o que e' dado da pesquisa: tempos, datas, tipos de evento, perfil", async () => {
    const { json } = await anonimo();
    expect(json.versao_anonimo).toBe(VERSAO_DO_ANONIMO);
    expect(json.perfil_dominante).toBe("Socializer");
    expect(json.registro.active_sec).toBe(12.5);
    expect(json.registro.created_at).toBe("2026-10-14T02:07:22.434+00:00");
    expect(json.registro.payload.eventos_app[0].event_name).toBe("tap");
    expect(json.registro.payload.eventos_app[0].payload.x_pct).toBe(0.4);
    expect(json.registro.payload.camera.frames[0].frame_mime).toBe("image/jpeg");
    expect(json.registro.payload.cliente).toEqual({ app_version: "1.0.6", plataforma: "android" });
    expect(json.registro.atividade_id).toBeNull();
  });

  it("dentro da copia de um aluno, o mesmo id vira o mesmo codigo em toda forma", async () => {
    const { json } = await anonimo();
    const r = json.registro;
    const topico = r.topico_id;
    expect(r.payload.topico_id).toBe(topico);
    expect(r.payload.eventos_app[0].topico_id).toBe(topico);
    expect(r.payload.time_metrics.topics[0].topico_id).toBe(topico);
    expect(r.payload.time_metrics.topics[0].key).toBe(`topic:${topico}`);

    const conteudo = r.conteudo_id;
    expect(r.payload.item_key).toMatch(new RegExp(`^content:${conteudo}:personalization:[0-9a-f]{16}$`));
    expect(r.payload.signals[0].meta.contentId).toBe(conteudo);
    expect(r.payload.signals[0].meta.contentItemKey).toBe(`content:${conteudo}`);
    expect(r.payload.sessao_id).toBe(r.sessao_id);
    expect(json.titular).toBe(r.aluno_id);
  });

  it("o id da sessao e o sessao_id do lote batem", async () => {
    const sessao = await anonimizarObjetoDoArquivo(
      objetoDoArquivo({ id: SESSAO, aluno_id: ALUNO, classe_id: 68 }, "telemetria_sessoes" as never),
      { origem: "telemetria_sessoes", sal: SAL, perfil: null },
    );
    const { json } = await anonimo();
    expect(JSON.parse(sessao.corpo).registro.id).toBe(json.registro.sessao_id);
  });

  it("tipos diferentes com o mesmo numero nao viram o mesmo codigo", async () => {
    const { json } = await anonimo({ ...registroDoLote(), topico_id: 282, conteudo_id: 282 });
    expect(json.registro.topico_id).not.toBe(json.registro.conteudo_id);
  });

  it("sem o sal nao ha volta: outra exclusao do mesmo aluno da' outros codigos", async () => {
    const a = await anonimo(registroDoLote(), SAL);
    const b = await anonimo(registroDoLote(), "c".repeat(64));
    expect(a.json.titular).not.toBe(b.json.titular);
    expect(a.json.registro.topico_id).not.toBe(b.json.registro.topico_id);
    expect(a.caminho).not.toBe(b.caminho);
  });

  it("e' deterministico com o mesmo sal: refazer sobrescreve a mesma copia", async () => {
    const a = await anonimo();
    const b = await anonimo();
    expect(a.caminho).toBe(b.caminho);
    expect(a.json).toEqual(b.json);
  });

  it("caminho: pesquisa/anonimo/<pasta>/<titular>/<codigo>.json", async () => {
    const { caminho, json } = await anonimo();
    expect(caminho).toBe(`pesquisa/anonimo/lotes/${json.titular}/${json.registro.id}.json`);
  });

  it("tira o que poderia identificar por si so'", async () => {
    const registro = {
      ...registroDoLote(),
      payload: { nome: "Ana", email: "a@b.c", mensagem: "oi, sou a Ana", frame_base64: "AAAA", camera: { image: "x" } },
    };
    const { corpo } = await anonimo(registro);
    for (const fora of ["Ana", "a@b.c", "AAAA", '"image"', '"nome"', '"email"', '"mensagem"']) {
      expect(corpo).not.toContain(fora);
    }
  });

  it("recusa objeto sem registro, sem aluno ou sem id", async () => {
    const params = { origem: "telemetria_lotes" as const, sal: SAL, perfil: null };
    await expect(anonimizarObjetoDoArquivo(null, params)).rejects.toThrow();
    await expect(anonimizarObjetoDoArquivo({ registro: [] }, params)).rejects.toThrow();
    await expect(anonimizarObjetoDoArquivo({ registro: { id: LOTE } }, params)).rejects.toThrow();
  });
});

describe("codificador", () => {
  it("16 hex, estavel para o mesmo sal", async () => {
    const c = await codificador(SAL);
    const x = await c("topico", "206");
    expect(x).toMatch(/^[0-9a-f]{16}$/);
    expect(await c("topico", "206")).toBe(x);
    expect(await (await codificador(SAL))("topico", "206")).toBe(x);
  });
});
