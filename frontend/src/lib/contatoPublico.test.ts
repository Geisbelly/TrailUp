import { describe, expect, it, vi } from "vitest";
import { enviarContatoPublico, validarContato, type ClienteRpcContato } from "./contatoPublico";

const valido = { nome: "Ana", email: "ana@exemplo.test", assunto: "Dúvida", mensagem: "Tenho uma dúvida sobre o app." };

function cliente(error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ error }));
  return { rpc, cliente: { rpc } as unknown as ClienteRpcContato };
}

describe("contato público", () => {
  it("envia pela função do banco, sem e-mail de destino no payload", async () => {
    const { rpc, cliente: c } = cliente();
    expect(await enviarContatoPublico(c, { ...valido, nome: "  Ana  " })).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith("fn_enviar_contato_publico", {
      p_nome: "Ana",
      p_email: "ana@exemplo.test",
      p_assunto: "Dúvida",
      p_mensagem: "Tenho uma dúvida sobre o app.",
      p_armadilha: "",
    });
  });

  it("armadilha preenchida finge sucesso e não chama o servidor", async () => {
    const { rpc, cliente: c } = cliente();
    expect(await enviarContatoPublico(c, { ...valido, armadilha: "http://spam" })).toEqual({ ok: true });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("valida tamanhos e e-mail antes de enviar", async () => {
    const { rpc, cliente: c } = cliente();
    expect(validarContato({ ...valido, nome: "A" })).toMatch(/nome/);
    expect(validarContato({ ...valido, email: "sem-arroba" })).toMatch(/e-mail/);
    expect(validarContato({ ...valido, mensagem: "curta" })).toMatch(/mensagem/i);
    expect(validarContato({ ...valido, mensagem: "x".repeat(5001) })).toMatch(/mensagem/i);
    const r = await enviarContatoPublico(c, { ...valido, assunto: "" });
    expect(r).toMatchObject({ ok: false, motivo: "invalido" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("traduz o limite por hora do servidor", async () => {
    const { cliente: c } = cliente({ message: "contato: limite de mensagens por hora atingido" });
    expect(await enviarContatoPublico(c, valido)).toMatchObject({ ok: false, motivo: "limite" });
  });

  it("outras falhas viram mensagem genérica", async () => {
    const { cliente: c } = cliente({ message: "segredo brevo_api_key ausente no Vault" });
    expect(await enviarContatoPublico(c, valido)).toMatchObject({ ok: false, motivo: "falha" });
  });
});
