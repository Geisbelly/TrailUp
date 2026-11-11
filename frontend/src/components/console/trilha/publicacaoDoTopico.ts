/**
 * Visibilidade do tópico para o aluno (`topicos.publicacao`, migration 20261110_10).
 *
 * - `rascunho`: só o professor vê. Tópico novo nasce assim.
 * - `publicado`: o aluno vê.
 * - `agendado`: abre sozinho em `publicar_em`. Não há cron: o banco compara com a hora na
 *   leitura (`app_topico_liberado`), então depois da hora o estado continua `agendado`, mas o
 *   aluno já vê. Aqui é a mesma regra, para o console mostrar o que o aluno está vendo.
 */

export type Publicacao = "rascunho" | "publicado" | "agendado";

export type ComPublicacao = { publicacao?: string | null; publicar_em?: string | null };

export type Situacao = {
  /** O que o aluno vê agora. */
  liberado: boolean;
  estado: Publicacao;
  /** "Rascunho", "Abre em 12/11 às 08:00", "Publicado". */
  rotulo: string;
};

const formatarQuando = (data: Date) =>
  `${data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às ${data.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;

export function situacaoDoTopico(topico: ComPublicacao, agora: Date = new Date()): Situacao {
  // Sem a coluna (banco ainda sem a migration), tudo era visível: continua sendo.
  const estado = (topico.publicacao ?? "publicado") as Publicacao;
  if (estado === "rascunho") return { liberado: false, estado, rotulo: "Rascunho" };
  if (estado === "agendado") {
    const quando = topico.publicar_em ? new Date(topico.publicar_em) : null;
    if (!quando || Number.isNaN(quando.getTime())) return { liberado: false, estado, rotulo: "Agendado" };
    if (quando.getTime() <= agora.getTime()) return { liberado: true, estado, rotulo: "Publicado" };
    return { liberado: false, estado, rotulo: `Abre em ${formatarQuando(quando)}` };
  }
  return { liberado: true, estado: "publicado", rotulo: "Publicado" };
}

/** ISO → valor de `<input type="datetime-local">` no fuso do navegador. */
export function paraCampoLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())}T${dois(data.getHours())}:${dois(
    data.getMinutes(),
  )}`;
}

export type AlteracaoDaPublicacao = { publicacao: Publicacao; publicar_em: string | null };

/**
 * O que gravar a partir da escolha do professor. Agendar exige data futura: no passado,
 * o tópico abriria na hora, e o professor que queria agendar não perceberia.
 */
export function alteracaoDaPublicacao(
  escolha: Publicacao,
  campoLocal: string,
  agora: Date = new Date(),
): AlteracaoDaPublicacao | { erro: string } {
  if (escolha === "rascunho") return { publicacao: "rascunho", publicar_em: null };
  if (escolha === "publicado") return { publicacao: "publicado", publicar_em: null };
  if (!campoLocal) return { erro: "Escolha a data e a hora em que o tópico abre." };
  const quando = new Date(campoLocal);
  if (Number.isNaN(quando.getTime())) return { erro: "Data inválida." };
  if (quando.getTime() <= agora.getTime()) return { erro: "Escolha uma data no futuro, ou publique agora." };
  return { publicacao: "agendado", publicar_em: quando.toISOString() };
}

/** Tópicos que ainda não aparecem para o aluno (rascunho ou agendado no futuro). */
export const ocultosDoAluno = <T extends ComPublicacao>(topicos: T[], agora: Date = new Date()) =>
  topicos.filter((t) => !situacaoDoTopico(t, agora).liberado);
