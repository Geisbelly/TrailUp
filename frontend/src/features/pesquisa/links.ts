// Links da pesquisa com professores. Módulo pequeno de propósito: o console importa daqui sem
// carregar o texto inteiro da cartilha (pesquisaProfessores.ts).

const HOSTS_DO_FORMULARIO = new Set(["docs.google.com", "forms.gle"]);

/**
 * Link do formulário vindo do ambiente. Só aceita formulário do Google em
 * https; qualquer outra coisa vira null e a página mostra "ainda não aberto".
 * Sem link é o estado certo antes de a equipe abrir a inscrição.
 */
export function linkDoFormulario(bruto: unknown): string | null {
  if (typeof bruto !== "string" || !bruto.trim()) return null;
  let url: URL;
  try {
    url = new URL(bruto.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS_DO_FORMULARIO.has(url.hostname)) return null;
  if (url.hostname === "docs.google.com" && !url.pathname.startsWith("/forms/")) return null;
  return url.toString();
}

/**
 * Versão do link para dentro de um iframe. Só o link longo do Google Forms (`/viewform`) aceita
 * `embedded=true`; o curto (forms.gle) é redirecionamento e não embute, então devolve null e a tela
 * fica só com o botão de abrir em outra aba.
 */
export function linkEmbutido(link: string | null): string | null {
  if (!link) return null;
  const url = new URL(link);
  if (url.hostname !== "docs.google.com" || !url.pathname.endsWith("/viewform")) return null;
  url.searchParams.set("embedded", "true");
  return url.toString();
}

/** O que `pesquisa_meu_acesso()` devolve. null = não participa da pesquisa (a aba some). */
export type MeuAcessoNaPesquisa = {
  avaliador: boolean;
  classeId: number | null;
  alunoTesteEmail: string | null;
  linkAvaliacao: string | null;
};

export function lerMeuAcesso(bruto: unknown): MeuAcessoNaPesquisa | null {
  if (!bruto || typeof bruto !== "object") return null;
  const r = bruto as Record<string, unknown>;
  return {
    avaliador: r.avaliador === true,
    classeId: typeof r.classe_id === "number" ? r.classe_id : null,
    alunoTesteEmail: typeof r.aluno_teste_email === "string" ? r.aluno_teste_email : null,
    linkAvaliacao: linkDoFormulario(r.link_avaliacao),
  };
}
