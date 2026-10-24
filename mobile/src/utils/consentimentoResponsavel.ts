// Consentimento do responsavel pelo aluno menor e modo restrito (#195).
//
// Modulo PURO (sem AsyncStorage nem Supabase) para carregar em Node nos
// testes. A regra que vale e a do banco (`aluno_modo_restrito` e
// `aluno_finalidade_permitida`, migracao 20261024_02); aqui so se le o que a
// RPC `aluno_meu_consentimento` devolveu e se decide o que mostrar.

// As MESMAS strings de `api/alembic/versions/20261024_02_*.py`; o teste
// `test_migration_consentimento_responsavel.py` confere que batem.
export const CONSENTIMENTO_RESPONSAVEL_VERSAO = "2026-10-24-resp-v1";
export const CONSENTIMENTO_PESQUISA_VERSAO = "2026-10-24-pesq-v1";

export const FINALIDADES = ["camera", "telemetria", "emocional", "mentor", "pesquisa"] as const;
export type Finalidade = (typeof FINALIDADES)[number];
export type Finalidades = Record<Finalidade, boolean>;

export const RELACOES = [
  { valor: "mae", rotulo: "Mãe" },
  { valor: "pai", rotulo: "Pai" },
  { valor: "responsavel_legal", rotulo: "Responsável legal" },
  { valor: "outro", rotulo: "Outro responsável" },
] as const;
export type Relacao = (typeof RELACOES)[number]["valor"];

export const NENHUMA_FINALIDADE: Finalidades = {
  camera: false,
  telemetria: false,
  emocional: false,
  mentor: false,
  pesquisa: false,
};

export type DecisaoResponsavel = {
  status: "accepted" | "rejected";
  versao: string;
  metodo: "aparelho" | "papel";
  finalidades: Partial<Finalidades>;
  pesquisa_versao: string | null;
  decidido_em: string;
  vigente: boolean;
};

export type EstadoConsentimento = {
  dataNascimentoInformada: boolean;
  menor: boolean | null;
  modoRestrito: boolean;
  responsavel: DecisaoResponsavel | null;
  pesquisaAceita: boolean;
  finalidades: Finalidades;
};

// Enquanto nao se sabe nada (sem rede, RPC ainda nao respondeu), o app fica no
// modo restrito: e o mesmo que o servidor faria com quem nao tem data.
export const ESTADO_DESCONHECIDO: EstadoConsentimento = {
  dataNascimentoInformada: false,
  menor: null,
  modoRestrito: true,
  responsavel: null,
  pesquisaAceita: false,
  finalidades: NENHUMA_FINALIDADE,
};

function bool(v: unknown): boolean {
  return v === true;
}

export function lerEstadoConsentimento(raw: unknown): EstadoConsentimento {
  if (!raw || typeof raw !== "object") return ESTADO_DESCONHECIDO;
  const r = raw as Record<string, unknown>;
  const fin = (r.finalidades ?? {}) as Record<string, unknown>;
  const pesquisa = (r.pesquisa ?? null) as Record<string, unknown> | null;
  const responsavel = (r.responsavel ?? null) as DecisaoResponsavel | null;
  const menor = typeof r.menor === "boolean" ? r.menor : null;
  return {
    dataNascimentoInformada: bool(r.data_nascimento_informada),
    menor,
    // Qualquer coisa que nao seja um `false` explicito e restrito.
    modoRestrito: r.modo_restrito !== false,
    responsavel,
    pesquisaAceita: bool(pesquisa?.vigente),
    finalidades: {
      camera: bool(fin.camera),
      telemetria: bool(fin.telemetria),
      emocional: bool(fin.emocional),
      mentor: bool(fin.mentor),
      pesquisa: bool(fin.pesquisa),
    },
  };
}

export type PassoDoGate = "data_nascimento" | "responsavel" | "liberado";

// Ordem do primeiro acesso: data de nascimento; se menor sem aceite vigente, a
// tela do responsavel (separada do termo do aluno); senao, segue.
export function proximoPasso(estado: EstadoConsentimento): PassoDoGate {
  if (!estado.dataNascimentoInformada) return "data_nascimento";
  // Uma recusa/revogacao na versao vigente e respeitada: o Gate nao insiste a
  // cada abertura; o caminho para autorizar segue em Perfil > Coleta e acessos.
  const recusou = estado.responsavel?.status === "rejected" && estado.responsavel.vigente;
  if (estado.menor && estado.modoRestrito && !recusou) return "responsavel";
  return "liberado";
}

// "Hoje" em Brasilia, como o banco calcula.
export function hojeEmBrasilia(agora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
  return partes; // AAAA-MM-DD
}

// Converte "DD/MM/AAAA" digitado para "AAAA-MM-DD"; null se invalida.
export function parseDataBr(texto: string, agora: Date = new Date()): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texto.trim());
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const dia = Number(dd);
  const mes = Number(mm);
  const ano = Number(aaaa);
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) {
    return null;
  }
  const iso = `${aaaa}-${mm}-${dd}`;
  const hoje = hojeEmBrasilia(agora);
  if (iso > hoje) return null;
  if (ano < Number(hoje.slice(0, 4)) - 120) return null;
  return iso;
}

export function ehMenorDeIdade(isoNascimento: string, agora: Date = new Date()): boolean {
  const hoje = hojeEmBrasilia(agora);
  const limite = `${Number(hoje.slice(0, 4)) - 18}${hoje.slice(4)}`;
  return isoNascimento > limite;
}

export const MENSAGEM_MODO_RESTRITO =
  "Você está no modo restrito: trilhas, questões e progresso funcionam normalmente, " +
  "mas câmera, análise de emoções, telemetria de uso, mentor de IA e pesquisa ficam " +
  "desligados até você informar sua data de nascimento e, se tiver menos de 18 anos, " +
  "até seu responsável autorizar.";

export function mensagemDoModo(estado: EstadoConsentimento): string | null {
  if (!estado.modoRestrito) return null;
  if (!estado.dataNascimentoInformada) {
    return "Informe sua data de nascimento em Perfil › Coleta e acessos para liberar câmera, mentor de IA e telemetria.";
  }
  if (estado.menor) {
    return "Como você tem menos de 18 anos, câmera, análise de emoções, telemetria, mentor de IA e pesquisa ficam desligados até seu responsável autorizar (no app ou pelo termo em papel entregue ao professor).";
  }
  return MENSAGEM_MODO_RESTRITO;
}

export type ParametrosAceiteResponsavel = {
  aceito: boolean;
  nome: string;
  relacao: Relacao | null;
  declaracao: boolean;
  finalidades: Finalidades;
};

// Argumentos da RPC `responsavel_registrar_no_aparelho`.
export function argumentosAceiteResponsavel(p: ParametrosAceiteResponsavel, agora: Date = new Date()) {
  const finalidades = p.aceito ? p.finalidades : NENHUMA_FINALIDADE;
  return {
    p_versao: CONSENTIMENTO_RESPONSAVEL_VERSAO,
    p_aceito: p.aceito,
    p_nome_responsavel: p.aceito ? p.nome.trim() : null,
    p_relacao: p.aceito ? p.relacao : null,
    p_declaracao: p.aceito && p.declaracao,
    p_finalidades: finalidades,
    p_pesquisa_versao: finalidades.pesquisa ? CONSENTIMENTO_PESQUISA_VERSAO : null,
    p_decidido_em: agora.toISOString(),
    p_origem: { canal: "app" },
  };
}

export function aceiteResponsavelValido(p: ParametrosAceiteResponsavel): string | null {
  if (!p.aceito) return null;
  const nome = p.nome.trim();
  if (nome.length < 3 || nome.length > 120) return "Informe o nome completo do responsável.";
  if (!p.relacao) return "Informe a relação com o aluno.";
  if (!p.declaracao) return "O responsável precisa confirmar a declaração.";
  return null;
}

// A API responde 403 `{detail: {codigo: "modo_restrito", mensagem}}` no mentor
// e em /emocoes. Este erro carrega a mensagem para a UI mostrar como esta.
export class ModoRestritoError extends Error {
  readonly codigo = "modo_restrito";
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ModoRestritoError";
  }
}

export function erroDeModoRestrito(detail: unknown): ModoRestritoError | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as { codigo?: unknown; mensagem?: unknown };
  if (d.codigo !== "modo_restrito") return null;
  return new ModoRestritoError(
    typeof d.mensagem === "string" && d.mensagem ? d.mensagem : MENSAGEM_MODO_RESTRITO
  );
}

// A preferencia local so liga o que o servidor tambem libera. Aplicado por
// cima do termo do proprio aluno: camera so com `camera`, uso/desempenho so com
// `telemetria`. Nunca liga nada que o aluno desligou.
export function preferenciasEfetivas<
  P extends { cameraEnabled: boolean; usageEnabled: boolean; performanceEnabled: boolean; chatEnabled: boolean },
>(preferencias: P, estado: EstadoConsentimento): P {
  const f = estado.finalidades;
  return {
    ...preferencias,
    cameraEnabled: preferencias.cameraEnabled && f.camera && f.emocional,
    usageEnabled: preferencias.usageEnabled && f.telemetria,
    performanceEnabled: preferencias.performanceEnabled && f.telemetria,
    chatEnabled: preferencias.chatEnabled && f.telemetria,
  };
}
