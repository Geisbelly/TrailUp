import { type Href, useRouter, useSegments } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';

import { useUsuario } from '@/context/SessaoContext';
import { destinoDoToque } from '@/services/destinoDoToque';
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
  ouvirAberturaDeNotificacao,
  registrarParaPush,
  resolverPlataforma,
  resolverTimezone,
  resolverVersaoApp,
} from '@/services/pushNotifications';
import { registrarAcaoDeMoldura } from "@/services/molduras";
import { estaNaTrilhaDeEstudo } from '@/utils/presencaDeEstudo';
import { criarRelogioDaTrilha } from '@/utils/tempoNaTrilha';

/**
 * Monitora o login e o tempo de uso, e liga as notificações do SO.
 *
 * Quatro coisas acontecem aqui — as quatro que faltavam para as tabelas de
 * notificação funcionarem de ponta a ponta:
 *
 * 1. **login** → RPC no banco, que libera as pendentes com gatilho `login`
 *    (literalmente "as que aguardavam o login do usuário");
 * 2. **heartbeat** → soma o tempo de uso do dia e, à parte, o tempo passado
 *    num módulo da trilha. Só este alimenta o gatilho `tempo_uso` (a pausa
 *    saudável), e o que tem esse gatilho só é entregue enquanto o aluno está
 *    na trilha: antes a pausa contava o app inteiro e chegava em qualquer tela;
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
  const segmentos = useSegments();
  const naTrilha = estaNaTrilhaDeEstudo(segmentos as readonly string[]);

  const sessaoIdRef = useRef<number | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const ultimaBatidaRef = useRef<number>(Date.now());
  const alunoAtivoRef = useRef<string | null>(null);
  const relogioDaTrilhaRef = useRef(criarRelogioDaTrilha());

  useEffect(() => {
    relogioDaTrilhaRef.current.definirNaTrilha(naTrilha, Date.now());
  }, [naTrilha]);

  const enviarTempoAcumulado = useCallback(async () => {
    if (!alunoAtivoRef.current) return;
    const agora = Date.now();
    const segundos = Math.round((agora - ultimaBatidaRef.current) / 1000);
    const segundosNaTrilha = Math.min(
      segundos,
      Math.round(relogioDaTrilhaRef.current.colher(agora) / 1000)
    );
    // O relógio avança sempre, mesmo se a chamada falhar: reaproveitar o mesmo
    // intervalo numa próxima tentativa contaria o tempo duas vezes.
    ultimaBatidaRef.current = agora;

    if (segundos < MIN_SEGUNDOS_PARA_ENVIAR) return;

    await enviarHeartbeat({
      segundos,
      timezone: resolverTimezone(),
      sessaoId: sessaoIdRef.current,
      segundosNaTrilha,
      // Indo para segundo plano o estado já não é `active`: a batida de saída
      // não entrega a pausa para quem acabou de fechar o app.
      naTrilha:
        relogioDaTrilhaRef.current.naTrilha() && AppState.currentState === 'active',
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
      await configurarHandlerDeNotificacao();
      const registro = await registrarParaPush();
      if (cancelado) return;
      // Sem aviso: pipocar um diálogo no login seria ruído. A moldura aparece na coleção.
      if (registro.permissaoConcedida) void registrarAcaoDeMoldura("ativar_notificacoes");
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
        // estudo. O mesmo vale para o tempo de trilha.
        ultimaBatidaRef.current = Date.now();
        relogioDaTrilhaRef.current.retomar(ultimaBatidaRef.current);
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
    let cancelado = false;
    let remover = () => {};

    void ouvirAberturaDeNotificacao((dados) => {
      // Mensagem privada abre a conversa; o resto, o detalhe da notificação ou,
      // sem id conhecido (caso das locais), a lista: melhor levar o aluno ao
      // lugar certo do que não reagir ao toque.
      const destino = destinoDoToque(dados);
      if (destino.modo === 'navigate') router.navigate(destino.rota as Href);
      else router.push(destino.rota as Href);
    }).then((removerListener) => {
      if (cancelado) {
        removerListener();
      } else {
        remover = removerListener;
      }
    });

    return () => {
      cancelado = true;
      remover();
    };
  }, [router]);
}
