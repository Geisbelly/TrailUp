import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  CONSENTIMENTO_PESQUISA_VERSAO,
  CONSENTIMENTO_RESPONSAVEL_VERSAO,
  NENHUMA_FINALIDADE,
  argumentosTermoPapel,
  rotuloDaSituacao,
  validarTermoPapel,
  type DadosTermoPapel,
} from "./termosResponsavel";

const BASE: DadosTermoPapel = {
  alunoId: "a1",
  aceito: true,
  dataAssinatura: "2026-10-20",
  nome: "Maria Souza",
  relacao: "mae",
  finalidades: { ...NENHUMA_FINALIDADE, mentor: true },
};
const agora = new Date("2026-10-24T15:00:00Z");

describe("termo do responsavel em papel (#195)", () => {
  it("valida data, nome e relacao; recusa nao exige identificacao", () => {
    expect(validarTermoPapel(BASE, agora)).toBeNull();
    expect(validarTermoPapel({ ...BASE, dataAssinatura: "" }, agora)).toMatch(/data/);
    expect(validarTermoPapel({ ...BASE, dataAssinatura: "2026-10-25" }, agora)).toMatch(/futuro/);
    expect(validarTermoPapel({ ...BASE, nome: "a" }, agora)).toMatch(/nome/);
    expect(validarTermoPapel({ ...BASE, relacao: "" }, agora)).toMatch(/relação/);
    expect(validarTermoPapel({ ...BASE, aceito: false, nome: "", relacao: "" }, agora)).toBeNull();
  });

  it("monta os argumentos da RPC com a versao vigente; pesquisa leva a versao propria", () => {
    const a = argumentosTermoPapel(BASE);
    expect(a.p_versao).toBe(CONSENTIMENTO_RESPONSAVEL_VERSAO);
    expect(a.p_pesquisa_versao).toBeNull();
    expect(a.p_finalidades).toEqual({ ...NENHUMA_FINALIDADE, mentor: true });
    const comPesquisa = argumentosTermoPapel({ ...BASE, finalidades: { ...NENHUMA_FINALIDADE, pesquisa: true } });
    expect(comPesquisa.p_pesquisa_versao).toBe(CONSENTIMENTO_PESQUISA_VERSAO);
  });

  it("recusa zera finalidades e identificacao", () => {
    const r = argumentosTermoPapel({ ...BASE, aceito: false, finalidades: { ...NENHUMA_FINALIDADE, camera: true } });
    expect(r.p_finalidades).toEqual(NENHUMA_FINALIDADE);
    expect(r.p_nome_responsavel).toBeNull();
    expect(r.p_relacao).toBeNull();
    expect(r.p_aceito).toBe(false);
  });

  it("rotulo da situacao nunca mostra data de nascimento e destaca o pendente", () => {
    expect(rotuloDaSituacao(undefined).tom).toBe("neutro");
    expect(rotuloDaSituacao({ aluno_id: "a", situacao: "maior", metodo: null, versao: null, decidido_em: null, vigente: false }).tom).toBe("neutro");
    expect(rotuloDaSituacao({ aluno_id: "a", situacao: "sem_data_nascimento", metodo: null, versao: null, decidido_em: null, vigente: false }).tom).toBe("pendente");
    const ok = rotuloDaSituacao({
      aluno_id: "a", situacao: "menor_com_termo", metodo: "papel", versao: CONSENTIMENTO_RESPONSAVEL_VERSAO,
      decidido_em: "2026-10-20T03:00:00Z", vigente: true,
    });
    expect(ok.tom).toBe("ok");
    expect(ok.texto).toContain("em papel");
    expect(ok.texto).toContain("20/10/2026");
    expect(ok.texto).toContain(CONSENTIMENTO_RESPONSAVEL_VERSAO);
  });
});
