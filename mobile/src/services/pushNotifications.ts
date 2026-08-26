import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { PlataformaApp, RotinaNotificacao } from '@/services/notificacoesDb';

/**
 * Notificações pelo SO — Android/iOS, inclusive com o app fechado.
 *
 * Dois caminhos, e a diferença entre eles importa:
 *
 * - **local agendada** (`agendarRotinasLocais`): o próprio aparelho dispara no
 *   horário, sem servidor, sem rede, mesmo com o app morto. É o que faz o
 *   lembrete diário funcionar de graça e sempre.
 * - **push remoto** (token registrado no banco, disparado por `pg_net`): para o
 *   que o servidor decide DEPOIS, como uma sugestão nova da IA. Só este precisa
 *   de token e de internet.
 *
 * O Realtime do Supabase não substitui nenhum dos dois: ele só entrega enquanto
 * existe um WebSocket vivo, ou seja, enquanto o app está aberto.
 *
 * Push remoto exige build de desenvolvimento (`expo-dev-client`, já usado no
 * projeto) — não funciona no Expo Go.
 */

export const CANAL_ANDROID = 'trailup';

/** Prefixo do identificador das locais, para cancelar só as nossas. */
const PREFIXO_ROTINA = 'trailup-rotina-';

let handlerConfigurado = false;

/**
 * O que acontece quando a notificação chega com o app ABERTO.
 *
 * Mostrar o banner mesmo em foreground é deliberado: sem isso, a notificação
 * que chega durante o estudo sumiria, e o comportamento ficaria diferente do
 * que o aluno vê com o app fechado.
 */
export function configurarHandlerDeNotificacao() {
  if (handlerConfigurado) return;
  handlerConfigurado = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Canal do Android. Sem um canal de importância alta o sistema agrupa a
 * notificação silenciosamente e pode nem acordar a tela — exatamente o caso
 * "celular fechado" que este canal existe para atender.
 */
export async function garantirCanalAndroid() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
    name: 'TrailUp',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#7C5CFF',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export function resolverPlataforma(): PlataformaApp {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'web') return 'web';
  return 'desconhecida';
}

/**
 * Fuso do aparelho. É o que faz "a rotina das 19h" ser 19h para o aluno, e não
 * 19h UTC — o banco guarda este valor e agenda em cima dele.
 */
export function resolverTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function resolverVersaoApp(): string | null {
  return Constants.expoConfig?.version ?? null;
}

function resolverProjectId(): string | null {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return (
    extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId ??
    null
  );
}

export type RegistroPush = {
  token: string | null;
  permissaoConcedida: boolean;
  motivo?: string;
};

/**
 * Pede permissão e devolve o Expo push token.
 *
 * Nunca lança: a ausência de push não pode impedir o aluno de usar o app. O
 * motivo volta no retorno para a tela de preferências poder explicar por que as
 * notificações estão desligadas.
 */
export async function registrarParaPush(): Promise<RegistroPush> {
  if (Platform.OS === 'web') {
    return { token: null, permissaoConcedida: false, motivo: 'web_sem_push' };
  }

  try {
    configurarHandlerDeNotificacao();
    await garantirCanalAndroid();

    const atual = await Notifications.getPermissionsAsync();
    let status = atual.status;
    // Só pede de novo se ainda dá para pedir: em `denied` definitivo o prompt
    // não aparece mais, e insistir a cada abertura seria ruído inútil.
    if (status !== 'granted' && atual.canAskAgain !== false) {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') {
      return { token: null, permissaoConcedida: false, motivo: 'permissao_negada' };
    }

    const projectId = resolverProjectId();
    if (!projectId) {
      return { token: null, permissaoConcedida: true, motivo: 'sem_project_id_eas' };
    }

    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return { token: data || null, permissaoConcedida: true };
  } catch (erro) {
    console.warn('[pushNotifications] falha ao registrar push:', erro);
    return { token: null, permissaoConcedida: false, motivo: 'erro_ao_registrar' };
  }
}

/**
 * Agenda no APARELHO as rotinas de relógio do aluno.
 *
 * É o que faz o lembrete diário disparar com o app fechado sem depender de
 * servidor, de push token ou de internet. As rotinas por evento (`login`,
 * `tempo_uso`) não entram aqui: elas não têm relógio e são avaliadas pelo banco
 * no momento em que o evento acontece.
 *
 * Cancela e reagenda tudo a cada chamada, em vez de tentar reconciliar: o
 * estado agendado no SO não é observável de forma confiável entre reinícios, e
 * um agendamento órfão significaria o aluno recebendo o lembrete duas vezes.
 */
export async function agendarRotinasLocais(rotinas: RotinaNotificacao[]): Promise<number> {
  if (Platform.OS === 'web') return 0;

  try {
    const agendadas = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      agendadas
        .filter((n) => n.identifier.startsWith(PREFIXO_ROTINA))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );

    let total = 0;
    for (const rotina of rotinas) {
      if (!rotina.ativo || rotina.gatilho !== 'horario') continue;
      if (rotina.hora_local === null || rotina.hora_local === undefined) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: `${PREFIXO_ROTINA}${rotina.tipo}`,
        content: {
          title: rotina.titulo ?? 'TrailUp',
          body: rotina.corpo ?? 'Você tem novidades na sua trilha.',
          data: { rotina: rotina.tipo, local: true },
          sound: 'default',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour: rotina.hora_local,
          minute: rotina.minuto_local ?? 0,
          channelId: CANAL_ANDROID,
        },
      });
      total += 1;
    }
    return total;
  } catch (erro) {
    console.warn('[pushNotifications] falha ao agendar rotinas locais:', erro);
    return 0;
  }
}

/** Logout: o aluno seguinte no mesmo aparelho não pode herdar os lembretes. */
export async function cancelarRotinasLocais() {
  if (Platform.OS === 'web') return;
  try {
    const agendadas = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      agendadas
        .filter((n) => n.identifier.startsWith(PREFIXO_ROTINA))
        .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier))
    );
  } catch (erro) {
    console.warn('[pushNotifications] falha ao cancelar rotinas locais:', erro);
  }
}
