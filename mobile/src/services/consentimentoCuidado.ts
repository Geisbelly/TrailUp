/**
 * Consentimento do modo de cuidado (spec `2026-11-20-modo-de-cuidado-design.md`, seção 1).
 *
 * Fala com as RPCs da `20261121_01`: `aluno_registrar_consentimento_cuidado`,
 * `responsavel_registrar_cuidado` e `aluno_meu_cuidado_permitido`, e lê a última decisão do
 * aluno em `consentimento_cuidado` (policy `consentimento_cuidado_aluno_sel`). Direto no
 * Supabase: nada aqui tem modelo de linguagem.
 *
 * O cliente é injetado para o teste montar o seu; `consentimentoResponsavelApi.ts` liga o
 * Supabase de verdade. Nenhuma função daqui lança: o consentimento do cuidado é um extra, e a
 * falta dele nunca pode travar o aluno. Leitura que falha devolve `null`, e quem desenha a tela
 * não mostra o item (o mesmo princípio do `AceiteDosTermos` do console).
 */
import { CONSENTIMENTO_CUIDADO_VERSAO, type Relacao } from "@/utils/consentimentoResponsavel";

export type ClienteDoConsentimentoCuidado = {
  rpc: (funcao: string, argumentos?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
  from: (tabela: string) => any;
};

export type DecisaoDeCuidado = { status: "accepted" | "rejected"; versao: string };

export type LeituraDoCuidado = {
  /** A última decisão do PRÓPRIO aluno, em qualquer versão; `null` se nunca decidiu. */
  decisao: DecisaoDeCuidado | null;
  /** A resposta do banco (`aluno_meu_cuidado_permitido`): o que vale de fato. */
  permitido: boolean;
};

export type ResultadoDoCuidado =
  | { ok: true; permitido: boolean }
  // `sem_aceite_do_responsavel` vem do banco; `falha` é rede, RPC ausente ou versão recusada.
  | { ok: false; motivo: string; erro: string };

export const ERRO_PADRAO_DO_CUIDADO = "Não foi possível salvar agora. Tente de novo em instantes.";
export const ERRO_SEM_ACEITE_DO_RESPONSAVEL =
  "Primeiro o responsável precisa dar a autorização geral, na tela do responsável.";

function decisao(linha: unknown): DecisaoDeCuidado | null {
  if (!linha || typeof linha !== "object") return null;
  const l = linha as Record<string, unknown>;
  if ((l.status !== "accepted" && l.status !== "rejected") || typeof l.versao !== "string") return null;
  return { status: l.status, versao: l.versao };
}

/** A decisão do aluno e o que o banco libera. `null` quando não deu para saber. */
export async function lerLeituraDoCuidado(
  cliente: ClienteDoConsentimentoCuidado,
  alunoId: string,
): Promise<LeituraDoCuidado | null> {
  try {
    const [linha, permitido] = await Promise.all([
      cliente
        .from("consentimento_cuidado")
        .select("status, versao")
        .eq("aluno_id", alunoId)
        .order("decidido_em", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
      cliente.rpc("aluno_meu_cuidado_permitido"),
    ]);
    if (!linha || linha.error || !permitido || permitido.error) return null;
    if (typeof permitido.data !== "boolean") return null;
    return { decisao: decisao(linha.data), permitido: permitido.data };
  } catch {
    return null;
  }
}

/** Só a resposta do banco; `false` quando não deu para saber. */
export async function lerCuidadoPermitidoCom(cliente: ClienteDoConsentimentoCuidado): Promise<boolean> {
  try {
    const { data, error } = await cliente.rpc("aluno_meu_cuidado_permitido");
    return !error && data === true;
  } catch {
    return false;
  }
}

/** O aluno já decidiu (aceitou ou recusou) o termo do cuidado que está valendo. */
export function decidiuNaVersaoVigente(leitura: LeituraDoCuidado | null): boolean {
  return leitura?.decisao?.versao === CONSENTIMENTO_CUIDADO_VERSAO;
}

/** O aluno aceitou o termo vigente. Para o menor, ainda falta o responsável. */
export function aceitouNaVersaoVigente(leitura: LeituraDoCuidado | null): boolean {
  return decidiuNaVersaoVigente(leitura) && leitura?.decisao?.status === "accepted";
}

/**
 * O portão do termo mostra o item novo ao adulto que ainda não decidiu na versão vigente. Leitura
 * que falhou (`null`) não mostra: banco fora do ar ou migração ainda não aplicada não podem
 * prender o aluno numa tela que não salva.
 */
export function deveMostrarItemNovo(params: { menor: boolean | null; leitura: LeituraDoCuidado | null }): boolean {
  if (params.menor !== false) return false;
  if (!params.leitura) return false;
  return !decidiuNaVersaoVigente(params.leitura);
}

function resultado(data: unknown, error: unknown): ResultadoDoCuidado {
  if (error || !data || typeof data !== "object") {
    return { ok: false, motivo: "falha", erro: ERRO_PADRAO_DO_CUIDADO };
  }
  const d = data as Record<string, unknown>;
  if (d.ok === true) return { ok: true, permitido: d.permitido === true };
  const motivo = typeof d.motivo === "string" ? d.motivo : "falha";
  return {
    ok: false,
    motivo,
    erro: motivo === "sem_aceite_do_responsavel" ? ERRO_SEM_ACEITE_DO_RESPONSAVEL : ERRO_PADRAO_DO_CUIDADO,
  };
}

/** Argumentos de `aluno_registrar_consentimento_cuidado`. A versão é sempre a do app. */
export function argumentosConsentimentoCuidado(aceito: boolean, agora: Date = new Date()) {
  return {
    p_aceito: aceito,
    p_versao: CONSENTIMENTO_CUIDADO_VERSAO,
    p_decidido_em: agora.toISOString(),
    p_origem: { canal: "app" },
  };
}

/** O aluno aceita ou revoga. Revogar apaga os momentos guardados (o banco faz). */
export async function registrarConsentimentoCuidadoCom(
  cliente: ClienteDoConsentimentoCuidado,
  aceito: boolean,
  agora: Date = new Date(),
): Promise<ResultadoDoCuidado> {
  try {
    const { data, error } = await cliente.rpc(
      "aluno_registrar_consentimento_cuidado",
      argumentosConsentimentoCuidado(aceito, agora),
    );
    return resultado(data, error);
  } catch {
    return { ok: false, motivo: "falha", erro: ERRO_PADRAO_DO_CUIDADO };
  }
}

export type ParametrosCuidadoDoResponsavel = {
  aceito: boolean;
  nome: string;
  relacao: Relacao | null;
  declaracao: boolean;
};

/** Mesmas regras do banco para autorizar; revogar não pede nada. */
export function cuidadoDoResponsavelValido(p: ParametrosCuidadoDoResponsavel): string | null {
  if (!p.aceito) return null;
  const nome = p.nome.trim();
  if (nome.length < 3 || nome.length > 120) return "Informe o nome completo do responsável.";
  if (!p.relacao) return "Informe a relação com o aluno.";
  if (!p.declaracao) return "O responsável precisa confirmar a declaração.";
  return null;
}

/** Argumentos de `responsavel_registrar_cuidado`. Revogar não reenvia nome nem relação. */
export function argumentosCuidadoDoResponsavel(p: ParametrosCuidadoDoResponsavel, agora: Date = new Date()) {
  return {
    p_aceito: p.aceito,
    p_nome: p.aceito ? p.nome.trim() : null,
    p_relacao: p.aceito ? p.relacao : null,
    p_declaracao: p.aceito && p.declaracao,
    p_decidido_em: agora.toISOString(),
  };
}

/**
 * O responsável aceita ou revoga SÓ o cuidado. O banco copia a última autorização vigente dele e
 * muda só a chave `cuidado`: as outras finalidades não são reescritas. Sem autorização geral
 * vigente, devolve `sem_aceite_do_responsavel`.
 */
export async function registrarCuidadoDoResponsavelCom(
  cliente: ClienteDoConsentimentoCuidado,
  p: ParametrosCuidadoDoResponsavel,
  agora: Date = new Date(),
): Promise<ResultadoDoCuidado> {
  try {
    const { data, error } = await cliente.rpc("responsavel_registrar_cuidado", argumentosCuidadoDoResponsavel(p, agora));
    return resultado(data, error);
  } catch {
    return { ok: false, motivo: "falha", erro: ERRO_PADRAO_DO_CUIDADO };
  }
}

export type SituacaoDoCuidadoNoPerfil = {
  /** O interruptor: o aceite do próprio aluno na versão vigente. */
  ligado: boolean;
  /** Linha extra para o menor; `null` para o adulto. */
  nota: string | null;
  /** Qual tela do responsável abrir: só o item novo, a autorização completa ou nenhuma. */
  telaDoResponsavel: "item_novo" | "completa" | null;
};

/**
 * O que o interruptor do modo de cuidado mostra em Perfil › Coleta e acessos. O menor precisa do
 * próprio aceite E do responsável; o interruptor é o dele, e a nota diz o que falta.
 */
export function situacaoDoCuidadoNoPerfil(params: {
  menor: boolean | null;
  leitura: LeituraDoCuidado;
  responsavelComAutorizacaoGeral: boolean;
  responsavelAutorizouCuidado: boolean;
}): SituacaoDoCuidadoNoPerfil {
  const ligado = aceitouNaVersaoVigente(params.leitura);
  if (params.menor !== true) return { ligado, nota: null, telaDoResponsavel: null };
  const tela = params.responsavelComAutorizacaoGeral ? "item_novo" : "completa";
  if (ligado && params.leitura.permitido) {
    return { ligado, nota: "Seu responsável autorizou. O modo de cuidado está valendo.", telaDoResponsavel: tela };
  }
  if (params.responsavelAutorizouCuidado) {
    return {
      ligado,
      nota: ligado
        ? "Seu responsável autorizou. Se ainda não valeu, peça a ele para autorizar de novo."
        : "Seu responsável já autorizou. Falta você ligar aqui.",
      telaDoResponsavel: tela,
    };
  }
  return {
    ligado,
    nota:
      tela === "item_novo"
        ? "Precisa do seu responsável: entregue o aparelho a ele para autorizar o modo de cuidado."
        : "Precisa do seu responsável: o modo de cuidado está na autorização dele, na tela do responsável acima.",
    telaDoResponsavel: tela,
  };
}
