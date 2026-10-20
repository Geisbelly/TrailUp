/**
 * A janela de formação de guildas, do lado do aluno (decisão de 2026-10-20: o aluno vê as datas).
 *
 * Vem de `guilda_janela_da_turma(p_classe_id)` (`20261021_17`), que devolve só a janela e o tamanho.
 * `janela_aberta` é a mesma função que barra criar/entrar/convidar/aceitar no banco, e `agora` é o
 * relógio do banco: a tela não decide sozinha se está aberta, só explica.
 */
export type JanelaDaFormacao = {
  classeId: number;
  configurada: boolean;
  tamanhoMaximo: number;
  inicio: string | null;
  fim: string | null;
  aberta: boolean;
  agora: string | null;
};

export type EstadoDaJanela = "sempre_aberta" | "aberta" | "agendada" | "encerrada";

const textoOuNulo = (v: unknown) => (typeof v === "string" && v ? v : null);

export function normalizeJanela(value: unknown): JanelaDaFormacao | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const tamanho = Number(row.tamanho_maximo);
  return {
    classeId: Number(row.classe_id) || 0,
    configurada: row.configurada === true,
    tamanhoMaximo: Number.isInteger(tamanho) && tamanho > 0 ? tamanho : 10,
    inicio: textoOuNulo(row.formacao_inicio),
    fim: textoOuNulo(row.formacao_fim),
    // Sem o campo, aberta: é o que o banco faz com turma sem configuração.
    aberta: row.janela_aberta !== false,
    agora: textoOuNulo(row.agora),
  };
}

const instante = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

export function estadoDaJanela(j: JanelaDaFormacao): EstadoDaJanela {
  const agora = instante(j.agora) ?? Date.now();
  const inicio = instante(j.inicio);
  if (j.aberta) return j.fim ? "aberta" : "sempre_aberta";
  return inicio !== null && agora < inicio ? "agendada" : "encerrada";
}

// Brasília é UTC-3 fixo desde 2019 (sem horário de verão). Conta à mão para não depender do
// suporte a `timeZone` do Intl no Hermes.
const BRASILIA_MS = -3 * 60 * 60 * 1000;
const dois = (n: number) => String(n).padStart(2, "0");

export function dataHoraBrasilia(iso: string | null): string {
  const t = instante(iso);
  if (t === null) return "";
  const d = new Date(t + BRASILIA_MS);
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)} às ${dois(d.getUTCHours())}h${dois(d.getUTCMinutes())}`;
}

export type ResumoDaJanela = { estado: EstadoDaJanela; titulo: string; detalhe: string };

export function resumoDaJanela(j: JanelaDaFormacao): ResumoDaJanela {
  const estado = estadoDaJanela(j);
  const tamanho = `Guildas de até ${j.tamanhoMaximo} pessoas.`;
  switch (estado) {
    case "sempre_aberta":
      return { estado, titulo: "Formação aberta", detalhe: `${tamanho} Sem prazo para fechar.` };
    case "aberta":
      return { estado, titulo: "Formação aberta", detalhe: `${tamanho} Fecha em ${dataHoraBrasilia(j.fim)} (Brasília).` };
    case "agendada":
      return {
        estado,
        titulo: "Formação ainda não abriu",
        detalhe: `Abre em ${dataHoraBrasilia(j.inicio)}${j.fim ? ` e fecha em ${dataHoraBrasilia(j.fim)}` : ""} (Brasília).`,
      };
    case "encerrada":
      return {
        estado,
        titulo: "Formação encerrada",
        detalhe: j.fim ? `Fechou em ${dataHoraBrasilia(j.fim)} (Brasília). Fale com o professor para reabrir.` : "Fale com o professor para reabrir.",
      };
  }
}

/** Pode criar, entrar, convidar e aceitar convite? Sair e dissolver não dependem da janela. */
export const formacaoAberta = (j: JanelaDaFormacao | null) => j === null || j.aberta;

/** O texto amigável para os erros das RPCs de guilda (o código vem no texto da exceção). */
export function mensagemDeErroDaGuilda(error: unknown, janela: JanelaDaFormacao | null = null): string {
  const value = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  if (value.includes("janela_fechada")) {
    if (janela) {
      const r = resumoDaJanela(janela);
      if (r.estado === "agendada" || r.estado === "encerrada") return `${r.titulo}. ${r.detalhe}`;
    }
    return "A formação de guildas está fechada nesta turma. Fale com o professor.";
  }
  if (value.includes("cheia")) return "Esta guilda já está completa.";
  if (value.includes("tamanho_abaixo_dos_membros")) return "O tamanho pedido é menor que o número de membros da guilda.";
  if (value.includes("perfil_incompativel")) return "Esse colega não pertence ao perfil escolhido para esta guilda.";
  if (value.includes("membro_existente")) return "Você já participa de uma guilda nesta turma.";
  return "Não foi possível concluir a ação.";
}
