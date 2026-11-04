import { describe, expect, it } from "vitest";

import {
  caminhoDoArquivo,
  lerPendente,
  limiteDoPedido,
  montarObjeto,
  ponteiroDoPayload,
  segredoConfere,
  VERSAO_DO_OBJETO,
} from "./arquivo";

const ALUNO = "0b6c1d7e-2f3a-4b5c-8d9e-0f1a2b3c4d5e";
const LOTE = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";

const linha = (extra: Record<string, unknown> = {}) => ({
  origem: "telemetria_lotes",
  origem_id: LOTE,
  aluno_id: ALUNO,
  criado_em: "2026-10-14T23:59:10.123+00:00",
  registro: { id: LOTE, aluno_id: ALUNO, active_sec: 12.5, payload: { toques: [1, 2] } },
  ...extra,
});

describe("segredoConfere", () => {
  it("aceita so' o segredo do ambiente", () => {
    expect(segredoConfere("s3gr3do", "s3gr3do")).toBe(true);
    expect(segredoConfere(" s3gr3do ", "s3gr3do")).toBe(true);
    expect(segredoConfere("outro", "s3gr3do")).toBe(false);
    expect(segredoConfere(null, "s3gr3do")).toBe(false);
  });

  it("segredo vazio no ambiente nunca autoriza", () => {
    expect(segredoConfere("", "")).toBe(false);
    expect(segredoConfere("qualquer", undefined)).toBe(false);
  });
});

describe("limiteDoPedido", () => {
  it.each([
    [{}, 300],
    [null, 300],
    [{ limite: "abc" }, 300],
    [{ limite: 50 }, 50],
    [{ limite: 0 }, 1],
    [{ limite: 99999 }, 1000],
    [{ limite: 12.9 }, 12],
  ])("%j -> %i", (corpo, esperado) => {
    expect(limiteDoPedido(corpo)).toBe(esperado);
  });
});

describe("lerPendente", () => {
  it("le a linha do RPC", () => {
    expect(lerPendente(linha())).toMatchObject({ origem: "telemetria_lotes", origem_id: LOTE, aluno_id: ALUNO });
  });

  it.each([
    ["origem desconhecida", { origem: "alunos" }],
    ["id que nao e' uuid", { origem_id: "1; DROP" }],
    ["aluno ausente", { aluno_id: null }],
    ["data invalida", { criado_em: "ontem" }],
    ["registro que nao e' objeto", { registro: [1] }],
  ])("ignora %s", (_nome, extra) => {
    expect(lerPendente(linha(extra))).toBeNull();
  });
});

describe("caminhoDoArquivo", () => {
  it("separa por origem, aluno e dia (UTC) do registro", () => {
    expect(caminhoDoArquivo(lerPendente(linha())!)).toBe(`pesquisa/lotes/${ALUNO}/2026/10/14/${LOTE}.json`);
    expect(caminhoDoArquivo({ ...lerPendente(linha())!, origem: "telemetria_eventos_app" })).toMatch(
      /^pesquisa\/eventos\//,
    );
    expect(caminhoDoArquivo({ ...lerPendente(linha())!, origem: "telemetria_sessoes" })).toMatch(
      /^pesquisa\/sessoes\//,
    );
  });

  it("e' deterministico: a mesma linha vai sempre para o mesmo objeto", () => {
    const p = lerPendente(linha())!;
    expect(caminhoDoArquivo(p)).toBe(caminhoDoArquivo({ ...p }));
  });
});

describe("ponteiroDoPayload", () => {
  it("acha o payload que a API ja' tirou para o R2", () => {
    expect(ponteiroDoPayload({ payload: { _r2: "telemetria/lotes/2026/11/03/x.json", _bucket: "b" } })).toBe(
      "telemetria/lotes/2026/11/03/x.json",
    );
  });

  it.each([
    ["payload inline", { payload: { toques: [] } }],
    ["sem payload", {}],
    ["ponteiro fora da telemetria", { payload: { _r2: "brainhex/deck.html" } }],
  ])("%s -> null", (_nome, registro) => {
    expect(ponteiroDoPayload(registro)).toBeNull();
  });
});

describe("montarObjeto", () => {
  const quando = new Date("2026-11-04T12:00:00Z");

  it("guarda o registro inteiro, com versao e origem", () => {
    const objeto = JSON.parse(montarObjeto(lerPendente(linha())!, undefined, quando));
    expect(objeto).toEqual({
      versao: VERSAO_DO_OBJETO,
      origem: "telemetria_lotes",
      arquivado_em: "2026-11-04T12:00:00.000Z",
      registro: { id: LOTE, aluno_id: ALUNO, active_sec: 12.5, payload: { toques: [1, 2] } },
    });
  });

  it("troca o ponteiro pelo payload bruto lido do R2", () => {
    const p = lerPendente(linha({ registro: { id: LOTE, payload: { _r2: "telemetria/lotes/x.json", cliente: {} } } }))!;
    const objeto = JSON.parse(montarObjeto(p, { toques: [9] }, quando));
    expect(objeto.registro.payload).toEqual({ toques: [9] });
  });
});
