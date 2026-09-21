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
};

/**
 * Notificação é acessório: nada aqui pode derrubar a tela do aluno.
 *
 * Um erro de rede ou uma RPC indisponível viram `null` e um aviso no console,
 * nunca uma exceção que sobe para a UI.
 */
async function chamar<T>(fn: string, args: Record<string, unknown>): Promise<T | null> {
  try {
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
}) {
  return chamar<{ id: number; proxima_execucao: string | null }>(
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
    }
  );
}
