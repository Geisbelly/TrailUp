export function getAuthErrorMessage(error: unknown) {
  const message = String((error as { message?: unknown })?.message ?? "").trim().toLowerCase();

  if (message.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }

  if (message.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado.";
  }

  if (message.includes("too many requests")) {
    return "Muitas tentativas de login. Tente novamente em alguns minutos.";
  }

  if (message.includes("cancel") || message.includes("dismiss")) {
    return "Login com Google cancelado.";
  }

  if (message.includes("network")) {
    return "Não foi possível conectar. Verifique sua internet e tente novamente.";
  }

  return "Não foi possível realizar o login agora.";
}
