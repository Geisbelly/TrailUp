import { supabase } from '@/database/supabase';

/**
 * Motor de notificações — falado direto com o banco, por RPC.
 *
 * Não passa pela API de propósito (ver CLAUDE.md, "Regra de fronteira"): a API é
 * para IA, e ela hiberna no free tier do Render. Rotina, fila, login e entrega
 * não podem depender de um serviço que dorme — o Postgres não dorme.
 *
 * Toda a lógica vive em funções SQL `SECURITY DEFINER`; aqui só há a chamada e a
 * tipagem. As funções internas (entregar, processar_rotinas, enviar_push) não
 * têm GRANT para `authenticated`, então o app não consegue dispará-las em nome
 * de outro aluno mesmo que tente.
 */

export type PlataformaApp = 'android' | 'ios' | 'web' | 'desconhecida';

export type LoginResultado = {
  sessao_id: number;
  pendentes_criadas: number;
  entregues: number;
};

export type HeartbeatResultado = {
  tempo_uso_seg: number;
  pendentes_criadas: number;
  entregues: number;
};

export type RotinaNotificacao = {
  id: number;
  tipo: string;
  recorrencia: string;
  gatilho: 'horario' | 'login' | 'tempo_uso';
  titulo: string | null;
  corpo: string | null;
  hora_local: number | null;
  minuto_local: number;
  timezone: string;
  prioridade: number;
  contexto: Record<string, unknown> | null;
  ativo: boolean;
  proxima_execucao: string | null;
  /** Dias ISO (1 = segunda) em que dispara; null ou ausente = todo dia (migração 20261105_05). */
  dias_semana?: number[] | null;
  /** Minutos desde a meia-noite, em ordem; null ou ausente = só `hora_local:minuto_local`. */
  horarios?: number[] | null;
};

/**
 * Notificação é acessório: nada aqui pode derrubar a tela do aluno.
 *
 * Um erro de rede ou uma RPC indisponível viram `null` e um aviso no console,
 * nunca uma exceção que sobe para a UI.
 */
async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    // O cleanup do monitor pode ocorrer depois de SIGNED_OUT. Não chamar
    // RPCs restritas a authenticated com a sessão já encerrada.
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;
    if (!auth.session) return null;
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      console.warn(`[notificacoesDb] ${fn} falhou:`, error.message);
      return null;
    }
    return (data ?? null) as T | null;
  } catch (erro) {
    console.warn(`[notificacoesDb] ${fn} lançou:`, erro);
    return null;
  }
}

/**
 * Como `chamar`, mas devolve o código que o banco mandou (`22023` com `MESSAGE` = código):
 * as telas de escolha precisam dizer ao aluno POR QUE a escolha foi recusada.
 */
export type ResultadoRpc<T> = { data: T | null; erro: string | null };

async function chamarComMotivo<T>(fn: string, args: Record<string, unknown>): Promise<ResultadoRpc<T>> {
  try {
    const { data: auth, error: authError } = await supabase.auth.getSession();
    if (authError) throw authError;
    if (!auth.session) return { data: null, erro: 'sem_sessao' };
    const { data, error } = await supabase.rpc(fn, args);
    if (error) {
      console.warn(`[notificacoesDb] ${fn} falhou:`, error.message);
      return { data: null, erro: error.code === '22023' ? error.message : 'falha' };
    }
    return { data: (data ?? null) as T | null, erro: null };
  } catch (erro) {
    console.warn(`[notificacoesDb] ${fn} lançou:`, erro);
    return { data: null, erro: 'falha' };
  }
}

export function registrarLogin(params: {
  plataforma: PlataformaApp;
  timezone: string;
  deviceId?: string | null;
  appVersion?: string | null;
  pushToken?: string | null;
}) {
  return chamar<LoginResultado>('notificacoes_registrar_login', {
    p_plataforma: params.plataforma,
    p_timezone: params.timezone,
    p_device_id: params.deviceId ?? null,
    p_app_version: params.appVersion ?? null,
    p_push_token: params.pushToken ?? null,
  });
}

export function enviarHeartbeat(params: {
  segundos: number;
  timezone: string;
  sessaoId?: number | null;
}) {
  return chamar<HeartbeatResultado>('notificacoes_heartbeat', {
    p_segundos: params.segundos,
    p_timezone: params.timezone,
    p_sessao_id: params.sessaoId ?? null,
  });
}

export function encerrarSessao() {
  return chamar<null>('notificacoes_encerrar_sessao', {});
}

export function desativarDispositivo(pushToken: string) {
  return chamar<null>('notificacoes_desativar_dispositivo', { p_push_token: pushToken });
}

/** Rotinas do aluno — o app as usa para agendar notificação LOCAL no aparelho. */
export async function listarRotinas(): Promise<RotinaNotificacao[]> {
  const rotinas = await chamar<RotinaNotificacao[]>('notificacoes_minhas_rotinas', {});
  return rotinas ?? [];
}

export function salvarRotina(params: {
  tipo: string;
  recorrencia?: string;
  gatilho?: 'horario' | 'login' | 'tempo_uso';
  titulo?: string | null;
  corpo?: string | null;
  horaLocal?: number | null;
  minutoLocal?: number;
  timezone: string;
  prioridade?: number;
  contexto?: Record<string, unknown>;
  ativo?: boolean;
  /** Omitido mantém os dias de antes; os 7 dias voltam a "todo dia". */
  diasSemana?: number[];
  /** Minutos desde a meia-noite, até 4. Omitido mantém a lista de antes. */
  horarios?: number[];
}) {
  return chamarComMotivo<{
    id: number;
    proxima_execucao: string | null;
    dias_semana: number[] | null;
    horarios: number[] | null;
  }>(
    'notificacoes_salvar_rotina',
    {
      p_tipo: params.tipo,
      p_recorrencia: params.recorrencia ?? 'diaria',
      p_gatilho: params.gatilho ?? 'horario',
      p_titulo: params.titulo ?? null,
      p_corpo: params.corpo ?? null,
      p_hora_local: params.horaLocal ?? null,
      p_minuto_local: params.minutoLocal ?? 0,
      p_timezone: params.timezone,
      p_prioridade: params.prioridade ?? 0,
      p_contexto: params.contexto ?? {},
      p_ativo: params.ativo ?? true,
      p_dias_semana: params.diasSemana ?? null,
      p_horarios: params.horarios ?? null,
    }
  );
}

/** Por que o banco recusou a rotina ou o silêncio, em palavras do aluno. */
export function motivoDaRecusa(codigo: string | null): string {
  switch (codigo) {
    case 'horarios_demais':
      return 'Dá para escolher até 4 horários.';
    case 'horarios_perto_demais':
      return 'Deixe pelo menos 4 horas entre um horário e outro.';
    case 'horario_no_silencio':
      return 'Esse horário cai no seu silêncio. Mude o horário ou o silêncio.';
    case 'dias_invalidos':
      return 'Escolha pelo menos um dia.';
    case 'silencio_duracao':
      return 'O silêncio precisa ter de 6 a 14 horas.';
    default:
      return 'Tente novamente em instantes.';
  }
}

/** Silêncio que vale para o aluno: o dele (`proprio`) ou o padrão. Horas locais. */
export type SilencioDoAluno = {
  inicio: number;
  fim: number;
  proprio: boolean;
  padrao_inicio: number;
  padrao_fim: number;
  duracao_min_h: number;
  duracao_max_h: number;
};

export function meuSilencio() {
  return chamar<SilencioDoAluno>('notificacoes_meu_silencio', {});
}

/** `null` nos dois volta ao padrão. */
export function salvarSilencio(inicio: number | null, fim: number | null) {
  return chamarComMotivo<SilencioDoAluno>('notificacoes_salvar_silencio', { p_inicio: inicio, p_fim: fim });
}

/**
 * Modo foco e silenciar (#149). O banco decide a entrega; aqui só a chamada.
 *
 * Em foco, nada é entregue: a fila segura e, ao sair, chega só a mais recente de cada
 * tipo, dentro do teto diário. `origem = 'estudo'` é o foco que o próprio banco liga
 * enquanto o aluno estuda concentrado (estado de atenção recente).
 */
export type EstadoFoco = {
  em_foco: boolean;
  origem: 'aluno' | 'estudo' | null;
  /** Fim do foco ligado pelo aluno (ISO), ou null. */
  ate: string | null;
  /** Notificações esperando o fim do foco. */
  seguradas: number;
  /** Só em `encerrarFoco`: quantas saíram ao encerrar. */
  entregues?: number;
};

export function meuFoco() {
  return chamar<EstadoFoco>('notificacoes_meu_foco', {});
}

export function iniciarFoco(minutos: number) {
  return chamar<EstadoFoco>('notificacoes_iniciar_foco', { p_minutos: minutos });
}

export function encerrarFoco() {
  return chamar<EstadoFoco>('notificacoes_encerrar_foco', {});
}

/**
 * Tipos que o aluno pode silenciar: os que passam pela fila do motor. Mesma lista de
 * `tipos_silenciaveis` em `notificacoes_config` (migração 20261102_18); um tipo fora
 * dela é recusado pelo banco.
 */
export const TIPOS_SILENCIAVEIS: Record<string, string> = {
  lembrete: 'Lembretes de estudo',
  suporte: 'Mensagens de apoio',
  rank: 'Sua posição no ranking',
  amigo_rank: 'Amizades que sobem no ranking',
  novo_material: 'Material novo',
  sequencia: 'Sequência de estudo',
};

export function podeSilenciar(tipo: string | null | undefined): tipo is string {
  return !!tipo && Object.prototype.hasOwnProperty.call(TIPOS_SILENCIAVEIS, tipo);
}

/** Silenciar é também sinal de perfil: o banco guarda o perfil do momento junto. */
export function silenciarTipo(params: { tipo: string; silenciar: boolean; notificacaoId?: number | null }) {
  return chamar<{ tipo: string; silenciado: boolean; mudou: boolean }>('notificacoes_silenciar_tipo', {
    p_tipo: params.tipo,
    p_silenciar: params.silenciar,
    p_notificacao_id: params.notificacaoId ?? null,
  });
}

/** Tipos silenciados do próprio aluno (RLS `notificacoes_silenciadas_sel`). */
export async function listarSilenciados(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('notificacoes_silenciadas')
      .select('tipo')
      .order('silenciada_em', { ascending: false });
    if (error) {
      console.warn('[notificacoesDb] notificacoes_silenciadas falhou:', error.message);
      return [];
    }
    return (data ?? []).map((linha: { tipo: string }) => linha.tipo);
  } catch (erro) {
    console.warn('[notificacoesDb] notificacoes_silenciadas lançou:', erro);
    return [];
  }
}
