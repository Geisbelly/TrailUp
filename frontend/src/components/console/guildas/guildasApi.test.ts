import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: sb.rpc } }));

import { lerFormacao, mapearFormacao, mapearGuilda, renomearGuilda, salvarFormacao } from "./guildasApi";

beforeEach(() => sb.rpc.mockReset());

describe("mapear", () => {
  it("formação nunca configurada cai nos defaults do banco", () => {
    expect(mapearFormacao({}, 65)).toMatchObject({ classeId: 65, configurada: false, tamanhoMaximo: 10, inicio: null, fim: null, janelaAberta: true, guildas: [] });
  });
  it("guilda com membros; nome vazio vira Guilda", () => {
    expect(
      mapearGuilda({ id: "g", nome: " ", limite_membros: "4", membros: [{ aluno_id: "a", nome: null, entrou_em: "2026-10-19T00:00:00Z" }] }),
    ).toEqual({ id: "g", nome: "Guilda", descricao: null, limite: 4, criadaEm: "", membros: [{ alunoId: "a", nome: "Sem nome", entrouEm: "2026-10-19T00:00:00Z" }] });
  });
  it("janela fechada só quando o banco diz false", () => {
    expect(mapearFormacao({ janela_aberta: false, configurada: true, tamanho_maximo: 4, formacao_fim: "2026-10-19T00:00:00Z" }, 65)).toMatchObject({
      janelaAberta: false, configurada: true, tamanhoMaximo: 4, fim: "2026-10-19T00:00:00Z",
    });
  });
});

describe("chamadas", () => {
  it("lê pela turma e propaga erro", async () => {
    sb.rpc.mockResolvedValue({ data: { classe_id: 65, guildas: [{ id: "g", nome: "Lobos" }] }, error: null });
    const f = await lerFormacao(65);
    expect(sb.rpc).toHaveBeenCalledWith("guilda_formacao_da_turma", { p_classe_id: 65 });
    expect(f.guildas[0].nome).toBe("Lobos");
    sb.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(lerFormacao(65)).rejects.toMatchObject({ code: "42501" });
  });
  it("salva pela RPC existente com os nomes de parâmetro dela", async () => {
    sb.rpc.mockResolvedValue({ data: {}, error: null });
    await salvarFormacao({ p_classe_id: 65, p_tamanho_maximo: 4, p_inicio: null, p_fim: "2026-10-20T12:00:00.000Z" });
    expect(sb.rpc).toHaveBeenCalledWith("guilda_configurar_turma", { p_classe_id: 65, p_tamanho_maximo: 4, p_inicio: null, p_fim: "2026-10-20T12:00:00.000Z" });
  });
  it("renomear mantém o emblema (nulo) e manda a descrição", async () => {
    sb.rpc.mockResolvedValue({ data: {}, error: null });
    await renomearGuilda("g", "Corujas", "");
    expect(sb.rpc).toHaveBeenCalledWith("guilda_atualizar", { p_guilda_id: "g", p_nome: "Corujas", p_descricao: "", p_emblema: null });
    sb.rpc.mockResolvedValue({ data: null, error: { message: "guilda_sem_permissao" } });
    await expect(renomearGuilda("g", "X1", "")).rejects.toMatchObject({ message: "guilda_sem_permissao" });
  });
});
