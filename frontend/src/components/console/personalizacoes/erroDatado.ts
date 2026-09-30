/**
 * Erro de geração acompanhado da data em que foi registrado.
 *
 * `last_error` fica gravado na linha do job até a geração seguinte
 * sobrescrevê-lo. Sem data, um erro de dias atrás aparece na tela como se
 * fosse o estado de agora: em 28/09/2026 o console exibia, nos 7 perfis, um
 * erro de 13/09 — já corrigido em 22/09 — e a investigação foi atrás de um
 * bug que não existia mais.
 *
 * Olhando a tela não dava para distinguir "falhou agora" de "falhou no mês
 * passado e ninguém regerou". A data é o que separa as duas coisas.
 */
export function descreverErroDatado(
  erro: string | null | undefined,
  registradoEm: string | null | undefined
): string | null {
  const texto = (erro ?? "").trim();
  if (!texto) return null;

  const data = registradoEm ? new Date(registradoEm) : null;
  // Sem data utilizável, mostrar o erro puro ainda é melhor do que escondê-lo.
  if (!data || Number.isNaN(data.getTime())) return texto;

  return `${texto} · falha registrada em ${data.toLocaleString("pt-BR")}`;
}
