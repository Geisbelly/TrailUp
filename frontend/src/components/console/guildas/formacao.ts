// Regras da formação de guildas no console (fase 6 de `plano-do-que-falta`). Só funções puras.
//
// O que o banco faz, medido na produção (2026-10-20), e que esta tela espelha sem reimplementar:
// - `guilda_janela_aberta(classe)`: sem linha em `guilda_config_turma` a formação está SEMPRE
//   aberta; com linha, fecha antes de `formacao_inicio` e depois de `formacao_fim` (nulo = sem
//   limite daquele lado). Ela barra criar, entrar, convidar e aceitar convite; sair e dissolver não.
// - `guilda_configurar_turma`: só o professor da turma; tamanho de 2 a 10; fim depois do início.
//   Também aplica o tamanho a TODAS as guildas ativas da turma (`limite_membros`), e ninguém é
//   tirado de uma guilda que fique acima do limite.
// - O tamanho de quem nunca configurou é 10 (`guilda_criar`).
// - Nome da guilda de 2 a 40 caracteres e descrição até 180 (`guildas_*_check`).

export const TAMANHO_MIN = 2;
export const TAMANHO_MAX = 10;
export const TAMANHO_PADRAO = 10;
export const NOME_MIN = 2;
export const NOME_MAX = 40;
export const DESCRICAO_MAX = 180;

export type MembroDaGuilda = { alunoId: string; nome: string; entrouEm: string };
export type GuildaDaTurma = { id: string; nome: string; descricao: string | null; limite: number; membros: MembroDaGuilda[]; criadaEm: string };
export type Formacao = {
  classeId: number;
  configurada: boolean;
  tamanhoMaximo: number;
  inicio: string | null;
  fim: string | null;
  janelaAberta: boolean;
  agora: string;
  alunosNaTurma: number;
  alunosSemGuilda: number;
  guildas: GuildaDaTurma[];
};

export type EstadoDaJanela = "sempre_aberta" | "agendada" | "aberta" | "encerrada";

const instante = (iso: string | null | undefined) => {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/** A mesma regra de `guilda_janela_aberta`, para nomear o estado (o booleano vem do banco). */
export function estadoDaJanela(janela: { inicio: string | null; fim: string | null }, agora: Date): EstadoDaJanela {
  const inicio = instante(janela.inicio);
  const fim = instante(janela.fim);
  const t = agora.getTime();
  if (inicio !== null && t < inicio) return "agendada";
  if (fim !== null && t > fim) return "encerrada";
  if (inicio === null && fim === null) return "sempre_aberta";
  return "aberta";
}

/** Data e hora no fuso de Brasília. */
export function dataHora(iso: string | null | undefined): string {
  const t = instante(iso);
  if (t === null) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(t));
}

export type TomDaJanela = "ativo" | "neutro" | "alerta";

/** O selo e a frase do topo do cartão. */
export function resumoDaJanela(f: Pick<Formacao, "configurada" | "inicio" | "fim">, agora: Date): { tom: TomDaJanela; titulo: string; detalhe: string } {
  const estado = estadoDaJanela(f, agora);
  switch (estado) {
    case "sempre_aberta":
      return {
        tom: "ativo",
        titulo: "Formação aberta",
        detalhe: f.configurada
          ? "Sem prazo: os alunos criam e entram em guildas a qualquer momento."
          : "Nenhuma janela configurada: os alunos criam e entram em guildas a qualquer momento.",
      };
    case "agendada":
      return {
        tom: "alerta",
        titulo: "Formação agendada",
        detalhe: `Abre em ${dataHora(f.inicio)}${f.fim ? ` e fecha em ${dataHora(f.fim)}` : ", sem prazo para fechar"}.`,
      };
    case "aberta":
      return {
        tom: "ativo",
        titulo: "Formação aberta",
        detalhe: f.fim ? `Fecha em ${dataHora(f.fim)}.` : `Aberta desde ${dataHora(f.inicio)}, sem prazo para fechar.`,
      };
    case "encerrada":
      return {
        tom: "neutro",
        titulo: "Formação fechada",
        detalhe: `Fechou em ${dataHora(f.fim)}. Ninguém cria, entra, convida ou aceita convite. Sair da guilda continua possível.`,
      };
  }
}

// --- Campos de data: `datetime-local` não tem fuso; o console fala em horário de Brasília. ---------
// O Brasil não tem horário de verão desde 2019, então Brasília é sempre UTC-3.

const CAMPO_LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** ISO do banco -> valor do `<input type="datetime-local">` em Brasília. */
export function paraCampoLocal(iso: string | null | undefined): string {
  const t = instante(iso);
  if (t === null) return "";
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(t));
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00";
  return `${p("year")}-${p("month")}-${p("day")}T${p("hour")}:${p("minute")}`;
}

/** Valor do campo (Brasília) -> ISO em UTC. Vazio vira `null`; formato inválido, `undefined`. */
export function deCampoLocal(valor: string): string | null | undefined {
  const v = valor.trim();
  if (!v) return null;
  if (!CAMPO_LOCAL.test(v)) return undefined;
  const d = new Date(`${v}:00-03:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

// --- Formulário da janela -------------------------------------------------------------------------

export type FormularioDaFormacao = { tamanho: string; inicio: string; fim: string };
export type ErrosDaFormacao = Partial<Record<keyof FormularioDaFormacao, string>>;
export type PayloadDaFormacao = { p_classe_id: number; p_tamanho_maximo: number; p_inicio: string | null; p_fim: string | null };

export const formularioDe = (f: Pick<Formacao, "tamanhoMaximo" | "inicio" | "fim">): FormularioDaFormacao => ({
  tamanho: String(f.tamanhoMaximo),
  inicio: paraCampoLocal(f.inicio),
  fim: paraCampoLocal(f.fim),
});

export function validarFormacao(
  form: FormularioDaFormacao,
  classeId: number,
  guildas: GuildaDaTurma[] = [],
): { ok: true; payload: PayloadDaFormacao } | { ok: false; erros: ErrosDaFormacao } {
  const erros: ErrosDaFormacao = {};
  const tamanho = Number(form.tamanho);
  if (!form.tamanho.trim() || !Number.isInteger(tamanho) || tamanho < TAMANHO_MIN || tamanho > TAMANHO_MAX) {
    erros.tamanho = `O tamanho vai de ${TAMANHO_MIN} a ${TAMANHO_MAX} alunos.`;
  } else {
    const abaixo = erroDoTamanho(guildas, tamanho);
    if (abaixo) erros.tamanho = abaixo;
  }
  const inicio = deCampoLocal(form.inicio);
  const fim = deCampoLocal(form.fim);
  if (inicio === undefined) erros.inicio = "Data de início inválida.";
  if (fim === undefined) erros.fim = "Data de fim inválida.";
  if (inicio && fim && new Date(fim).getTime() <= new Date(inicio).getTime()) erros.fim = "O fim precisa ser depois do início.";
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, payload: { p_classe_id: classeId, p_tamanho_maximo: tamanho, p_inicio: inicio ?? null, p_fim: fim ?? null } };
}

/** "Fechar agora": o fim vira agora. Um início no futuro sairia depois do fim, então ele cai. */
export function fecharAgora(f: Pick<Formacao, "classeId" | "tamanhoMaximo" | "inicio">, agora: Date): PayloadDaFormacao {
  const inicio = instante(f.inicio);
  return {
    p_classe_id: f.classeId,
    p_tamanho_maximo: f.tamanhoMaximo,
    p_inicio: inicio !== null && inicio < agora.getTime() ? f.inicio : null,
    p_fim: agora.toISOString(),
  };
}

/** "Abrir sem prazo": sem início nem fim, mantendo o tamanho. */
export const abrirSemPrazo = (f: Pick<Formacao, "classeId" | "tamanhoMaximo">): PayloadDaFormacao => ({
  p_classe_id: f.classeId,
  p_tamanho_maximo: f.tamanhoMaximo,
  p_inicio: null,
  p_fim: null,
});

/** Guildas que ficariam acima do tamanho novo. */
export const guildasAcimaDoLimite = (guildas: GuildaDaTurma[], tamanho: number) => guildas.filter((g) => g.membros.length > tamanho);

/**
 * O menor tamanho que o banco aceita: o da maior guilda ativa, nunca abaixo de TAMANHO_MIN.
 * Decisão de 2026-10-20: tamanho abaixo dos membros é recusado (`guilda_tamanho_abaixo_dos_membros`).
 */
export const tamanhoMinimoPermitido = (guildas: GuildaDaTurma[]) => Math.max(TAMANHO_MIN, ...guildas.map((g) => g.membros.length));

export function erroDoTamanho(guildas: GuildaDaTurma[], tamanho: number): string | null {
  const acima = guildasAcimaDoLimite(guildas, tamanho);
  if (acima.length === 0) return null;
  const nomes = acima.map((g) => `${g.nome} (${g.membros.length})`).join(", ");
  return `O mínimo agora é ${tamanhoMinimoPermitido(guildas)}: ${nomes} já ${acima.length === 1 ? "tem" : "têm"} mais membros que ${tamanho}.`;
}

// --- Guilda: nome e descrição ---------------------------------------------------------------------

export type ErrosDaGuilda = { nome?: string; descricao?: string };

export function validarGuilda(nome: string, descricao: string): { ok: true; nome: string; descricao: string } | { ok: false; erros: ErrosDaGuilda } {
  const erros: ErrosDaGuilda = {};
  const n = nome.trim();
  const d = descricao.trim();
  if (n.length < NOME_MIN || n.length > NOME_MAX) erros.nome = `O nome vai de ${NOME_MIN} a ${NOME_MAX} caracteres.`;
  if (d.length > DESCRICAO_MAX) erros.descricao = `A descrição vai até ${DESCRICAO_MAX} caracteres.`;
  if (Object.keys(erros).length > 0) return { ok: false, erros };
  return { ok: true, nome: n, descricao: d };
}

/** As RPCs de guilda levantam o código no texto (`guilda_config_invalida`), não em `code`. */
export function mensagemDeErroDaGuilda(
  erro: { code?: string | null; message?: string | null; details?: string | null; hint?: string | null } | null | undefined,
): string {
  const texto = erro?.message ?? "";
  if (texto.includes("guilda_tamanho_abaixo_dos_membros")) {
    // O banco manda o mínimo no HINT. Alguém pode ter entrado numa guilda depois que a tela carregou.
    const minimo = Number(erro?.hint);
    return Number.isInteger(minimo) && minimo > 0
      ? `Uma guilda já tem ${minimo} membros. O tamanho mínimo agora é ${minimo}.`
      : (erro?.details ?? "O tamanho não pode ficar abaixo do número de membros da maior guilda.");
  }
  if (texto.includes("guilda_config_invalida")) return `Configuração recusada: o tamanho vai de ${TAMANHO_MIN} a ${TAMANHO_MAX} e o fim precisa ser depois do início.`;
  if (texto.includes("guilda_sem_permissao")) return "Você não tem permissão para editar esta guilda.";
  switch (erro?.code) {
    case "42501":
      return "Turma não encontrada ou sem permissão.";
    case "23514":
      return `O nome vai de ${NOME_MIN} a ${NOME_MAX} caracteres e a descrição até ${DESCRICAO_MAX}.`;
    case "PGRST202":
      return "O banco ainda não tem a leitura da formação de guildas. Tente de novo depois da atualização.";
    default:
      return "Não foi possível salvar. Tente de novo.";
  }
}
