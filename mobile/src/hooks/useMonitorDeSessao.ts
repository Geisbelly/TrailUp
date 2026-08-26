import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { useUsuario } from '@/context/SessaoContext';
import {
  desativarDispositivo,
  encerrarSessao,
  enviarHeartbeat,
  listarRotinas,
  registrarLogin,
} from '@/services/notificacoesDb';
import {
  agendarRotinasLocais,
  cancelarRotinasLocais,
  configurarHandlerDeNotificacao,
  registrarParaPush,
  resolverPlataforma,
  resolverTimezone,
  resolverVersaoApp,
} from '@/services/pushNotifications';

/**
 * Monitora o login e o tempo de uso, e liga as notificações do SO.
 *
 * Quatro coisas acontecem aqui — as quatro que faltavam para as tabelas de
 * notificação funcionarem de ponta a ponta:
 *
 * 1. **login** → RPC no banco, que libera as pendentes com gatilho `login`
 *    (literalmente "as que aguardavam o login do usuário");
 * 2. **heartbeat** → soma o tempo de uso do dia, que alimenta o gatilho
 *    `tempo_uso`;
 * 3. **push token** → registra o aparelho, sem o que nada chega com o app
 *    fechado por decisão do servidor;
 * 4. **rotinas locais** → agenda no próprio aparelho o lembrete diário, que
 *    dispara com o app fechado sem servidor nenhum.
 *
 * Tudo direto no Supabase: a API é para IA e hiberna no free tier (CLAUDE.md).
 */

// 60s: o banco trata a batida como DELTA, então este intervalo é a
// granularidade do tempo de uso e também o pior caso de tempo perdido se o app
// for morto. Mais curto gasta bateria e rede sem ganho real de precisão.
export const HEARTBEAT_MS = 60_000;

// Abaixo disso a batida é puro custo — acontece quando o app volta do
// background por um instante.
const MIN_SEGUNDOS_PARA_ENVIAR = 5;

export function useMonitorDeSessao() {
  const { usuario, autenticado } = useUsuario();
  const router = useRouter();

  const sessaoIdRef = useRef<number | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const ultimaBatidaRef = useRef<number>(Date.now());
  const alunoAtivoRef = useRef<string | null>(null);

  const enviarTempoAcumulado = useCallback(async () => {
    const agora = Date.now();
    const segundos = Math.round((agora - ultimaBatidaRef.current) / 1000);
    // O relógio avança sempre, mesmo se a chamada falhar: reaproveitar o mesmo
    // intervalo numa próxima tentativa contaria o tempo duas vezes.
    ultimaBatidaRef.current = agora;

    if (segundos < MIN_SEGUNDOS_PARA_ENVIAR) return;

    await enviarHeartbeat({
      segundos,
      timezone: resolverTimezone(),
      sessaoId: sessaoIdRef.current,
    });
  }, []);

  // --- login / logout -------------------------------------------------
  useEffect(() => {
    const alunoId = autenticado ? usuario?.id ?? null : null;

    if (!alunoId) {
      // Logout: encerra a sessão, desliga o push e apaga os lembretes locais.
      // Sem isso, o próximo aluno a usar o mesmo celular herdaria as
      // notificações do anterior.
      const tokenAnterior = pushTokenRef.current;
      if (alunoAtivoRef.current) {
        void encerrarSessao();
        void cancelarRotinasLocais();
        if (tokenAnterior) void desativarDispositivo(tokenAnterior);
      }
      alunoAtivoRef.current = null;
      sessaoIdRef.current = null;
      pushTokenRef.current = null;
      return;
    }

    if (alunoAtivoRef.current === alunoId) return;
    alunoAtivoRef.current = alunoId;

    let cancelado = false;
    void (async () => {
      configurarHandlerDeNotificacao();
      const registro = await registrarParaPush();
      if (cancelado) return;
      pushTokenRef.current = registro.token;

      const resultado = await registrarLogin({
        plataforma: resolverPlataforma(),
        timezone: resolverTimezone(),
        appVersion: resolverVersaoApp(),
        pushToken: registro.token,
      });
      if (cancelado) return;

      sessaoIdRef.current = resultado?.sessao_id ?? null;
      ultimaBatidaRef.current = Date.now();

      // O login acabou de garantir/atualizar as rotinas no banco; reagendar em
      // seguida mantém o aparelho em dia com o que o aluno configurou (e com
      // uma eventual troca de fuso).
      const rotinas = await listarRotinas();
      if (cancelado) return;
      await agendarRotinasLocais(rotinas);
    })();

    return () => {
      cancelado = true;
    };
  }, [autenticado, usuario?.id]);

  // --- heartbeat + ciclo de vida do app -------------------------------
  useEffect(() => {
    if (!autenticado) return;

    ultimaBatidaRef.current = Date.now();
    const intervalo = setInterval(() => {
      void enviarTempoAcumulado();
    }, HEARTBEAT_MS);

    const aoMudarEstado = (estado: AppStateStatus) => {
      if (estado === 'active') {
        // Zera o relógio ao voltar: tempo em background não é tempo de uso, e
        // contá-lo transformaria "deixei o app aberto a noite toda" em 8h de
        // estudo.
        ultimaBatidaRef.current = Date.now();
        return;
      }
      void enviarTempoAcumulado();
    };

    const inscricao = AppState.addEventListener('change', aoMudarEstado);

    return () => {
      inscricao.remove();
      clearInterval(intervalo);
      void enviarTempoAcumulado();
    };
  }, [autenticado, enviarTempoAcumulado]);

  // --- toque na notificação do SO -------------------------------------
  useEffect(() => {
    const inscricao = Notifications.addNotificationResponseReceivedListener((resposta) => {
      const dados = resposta.notification.request.content.data as
        | { notificacao_id?: number | string }
        | undefined;
      const id = dados?.notificacao_id;
      // Sem id conhecido (caso das locais), abre a lista: melhor levar o aluno
      // ao lugar certo do que não reagir ao toque.
      router.push(id ? `/notificacoes/${id}` : '/notificacoes');
    });
    return () => inscricao.remove();
  }, [router]);
}
