// Contato do site público (#195). O envio vai pela mesma Brevo do app, numa
// função do banco (`fn_enviar_contato_publico`) que lê o destino da
// configuração do servidor. Nenhum e-mail de destino mora no frontend.

export const LIMITES_CONTATO = {
  nome: { min: 2, max: 120 },
  email: { max: 254 },
  assunto: { min: 2, max: 150 },
  mensagem: { min: 10, max: 5000 },
} as const;

export interface DadosContato {
  nome: string;
  email: string;
  assunto: string;
  mensagem: string;
  /** Campo invisível (honeypot). Pessoas deixam vazio. */
  armadilha?: string;
}

export interface ClienteRpcContato {
  rpc: (
    nome: string,
    argumentos: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
}

export type ResultadoContato = { ok: true } | { ok: false; motivo: "invalido" | "limite" | "falha"; mensagem: string };

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function validarContato(dados: DadosContato): string | null {
  const nome = dados.nome.trim();
  const email = dados.email.trim();
  const assunto = dados.assunto.trim();
  const mensagem = dados.mensagem.trim();
  if (nome.length < LIMITES_CONTATO.nome.min || nome.length > LIMITES_CONTATO.nome.max)
    return `Informe um nome entre ${LIMITES_CONTATO.nome.min} e ${LIMITES_CONTATO.nome.max} caracteres.`;
  if (email.length > LIMITES_CONTATO.email.max || !EMAIL.test(email)) return "Informe um e-mail válido.";
  if (assunto.length < LIMITES_CONTATO.assunto.min || assunto.length > LIMITES_CONTATO.assunto.max)
    return `Informe um assunto entre ${LIMITES_CONTATO.assunto.min} e ${LIMITES_CONTATO.assunto.max} caracteres.`;
  if (mensagem.length < LIMITES_CONTATO.mensagem.min || mensagem.length > LIMITES_CONTATO.mensagem.max)
    return `A mensagem deve ter entre ${LIMITES_CONTATO.mensagem.min} e ${LIMITES_CONTATO.mensagem.max} caracteres.`;
  return null;
}

export async function enviarContatoPublico(cliente: ClienteRpcContato, dados: DadosContato): Promise<ResultadoContato> {
  // Robô preencheu o campo invisível: finge sucesso e não envia nada.
  if ((dados.armadilha ?? "").trim() !== "") return { ok: true };

  const invalido = validarContato(dados);
  if (invalido) return { ok: false, motivo: "invalido", mensagem: invalido };

  const { error } = await cliente.rpc("fn_enviar_contato_publico", {
    p_nome: dados.nome.trim(),
    p_email: dados.email.trim(),
    p_assunto: dados.assunto.trim(),
    p_mensagem: dados.mensagem.trim(),
    p_armadilha: "",
  });
  if (!error) return { ok: true };
  if (/limite/i.test(error.message))
    return { ok: false, motivo: "limite", mensagem: "Muitas mensagens em pouco tempo. Tente de novo mais tarde." };
  if (/invalid/i.test(error.message))
    return { ok: false, motivo: "invalido", mensagem: "Confira os campos e tente de novo." };
  return { ok: false, motivo: "falha", mensagem: "Não foi possível enviar sua mensagem. Tente novamente." };
}
