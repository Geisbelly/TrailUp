import Constants from 'expo-constants';
import { Platform } from 'react-native';

import type { DadosDoToque } from '@/services/destinoDoToque';
import { emFocoNoAparelho } from '@/services/focoLocal';
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
type NotificationsModule = typeof import('expo-notifications');
let notificationsModule: NotificationsModule | null = null;

function executandoNoExpoGo() {
  const constants = Constants as typeof Constants & {
    executionEnvironment?: string;
    appOwnership?: string | null;
  };
  return (
    String(constants.executionEnvironment ?? '').toLowerCase() === 'storeclient' ||
    constants.appOwnership === 'expo'
  );
}

async function carregarNotifications(): Promise<NotificationsModule | null> {
  if (Platform.OS === 'web' || executandoNoExpoGo()) return null;
  // Só avaliar o módulo depois da verificação: o import estático registra
  // listeners nativos no Expo Go antes mesmo de chamar qualquer função.
  // require local também evita o async-require do Metro usado por import().
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  notificationsModule ??= require('expo-notifications') as NotificationsModule;
  return notificationsModule;
}

/**
 * O que acontece quando a notificação chega com o app ABERTO.
 *
 * Mostrar o banner mesmo em foreground é deliberado: sem isso, a notificação
 * que chega durante o estudo sumiria, e o comportamento ficaria diferente do
 * que o aluno vê com o app fechado.
 *
 * A exceção é o modo foco (#149): a notificação ainda vai para a lista do
 * sistema, mas sem banner e sem som. O push o banco já segura; o que chega
 * aqui em foco é a local agendada (revisão diária).
 */
export async function configurarHandlerDeNotificacao() {
  if (handlerConfigurado) return;
  const Notifications = await carregarNotifications();
  if (!Notifications) return;
  handlerConfigurado = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const foco = emFocoNoAparelho();
      return {
        shouldShowBanner: !foco,
        shouldShowList: true,
        shouldPlaySound: !foco,
        shouldSetBadge: false,
      };
    },
  });
}

/**
 * Canal do Android. Sem um canal de importância alta o sistema agrupa a
 * notificação silenciosamente e pode nem acordar a tela — exatamente o caso
 * "celular fechado" que este canal existe para atender.
 */
export async function garantirCanalAndroid() {
  if (Platform.OS !== 'android') return;
  const Notifications = await carregarNotifications();
  if (!Notifications) return;
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
  if (executandoNoExpoGo()) {
    return { token: null, permissaoConcedida: false, motivo: 'expo_go_sem_push' };
  }

  try {
    const Notifications = await carregarNotifications();
    if (!Notifications) {
      return { token: null, permissaoConcedida: false, motivo: 'notificacoes_indisponiveis' };
    }
    await configurarHandlerDeNotificacao();
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

/** Um disparo local: todo dia (`diaDaSemana` null) ou num dia da semana do Expo (1 = domingo). */
export type DisparoLocal = { hora: number; minuto: number; diaDaSemana: number | null };

/**
 * Os disparos de uma rotina: cada horário × cada dia escolhido. Sem dias, um disparo diário por
 * horário. O banco guarda o dia ISO (1 = segunda, 7 = domingo); o Expo conta 1 = domingo.
 */
export function disparosDaRotina(rotina: RotinaNotificacao): DisparoLocal[] {
  const minutos =
    rotina.horarios && rotina.horarios.length > 0
      ? rotina.horarios.filter((m, i, todos) => todos.indexOf(m) === i).sort((x, y) => x - y)
      : rotina.hora_local === null || rotina.hora_local === undefined
        ? []
        : [rotina.hora_local * 60 + (rotina.minuto_local ?? 0)];
  const dias =
    rotina.dias_semana && rotina.dias_semana.length > 0 && rotina.dias_semana.length < 7
      ? rotina.dias_semana
          .filter((iso, i, todos) => todos.indexOf(iso) === i)
          .sort((x, y) => x - y)
          .map((iso) => (iso % 7) + 1)
      : [null];
  return minutos.flatMap((m) =>
    dias.map((diaDaSemana) => ({ hora: Math.floor(m / 60), minuto: m % 60, diaDaSemana }))
  );
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
  const Notifications = await carregarNotifications();
  if (!Notifications) return 0;

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

      // Até 3 horários × 7 dias = 21 por rotina: longe do limite de 64 agendadas do iOS.
      for (const disparo of disparosDaRotina(rotina)) {
        const sufixo = `${disparo.hora * 60 + disparo.minuto}${disparo.diaDaSemana ? `-d${disparo.diaDaSemana}` : ''}`;
        await Notifications.scheduleNotificationAsync({
          identifier: `${PREFIXO_ROTINA}${rotina.tipo}-${sufixo}`,
          content: {
            title: rotina.titulo ?? 'TrailUp',
            body: rotina.corpo ?? 'Você tem novidades na sua trilha.',
            data: { rotina: rotina.tipo, local: true },
            sound: 'default',
          },
          trigger:
            disparo.diaDaSemana === null
              ? {
                  type: Notifications.SchedulableTriggerInputTypes.DAILY,
                  hour: disparo.hora,
                  minute: disparo.minuto,
                  channelId: CANAL_ANDROID,
                }
              : {
                  type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
                  weekday: disparo.diaDaSemana,
                  hour: disparo.hora,
                  minute: disparo.minuto,
                  channelId: CANAL_ANDROID,
                },
        });
        total += 1;
      }
    }
    return total;
  } catch (erro) {
    console.warn('[pushNotifications] falha ao agendar rotinas locais:', erro);
    return 0;
  }
}

/** Logout: o aluno seguinte no mesmo aparelho não pode herdar os lembretes. */
export async function cancelarRotinasLocais() {
  const Notifications = await carregarNotifications();
  if (!Notifications) return;
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

/** O último toque entregue, para o mesmo não abrir a tela duas vezes (ouvinte e app aberto pelo toque). */
let ultimoToque: string | null = null;

/**
 * Avisa a cada toque numa notificação do sistema, com o `data` dela (`destinoDoToque` decide a tela).
 *
 * Com o app fechado, o toque que o abre chega antes deste ouvinte existir: ele só aparece em
 * `getLastNotificationResponse`, que por isso é lido na inscrição. Depois é limpo, e o id do toque
 * fica guardado, para o layout que remonta (trocar de conta) não reabrir a mesma tela.
 */
export async function ouvirAberturaDeNotificacao(
  onOpen: (dados: DadosDoToque) => void,
): Promise<() => void> {
  const Notifications = await carregarNotifications();
  if (!Notifications) return () => {};

  const entregar = (resposta: import('expo-notifications').NotificationResponse) => {
    const chave = `${resposta.notification.request.identifier}:${resposta.actionIdentifier}`;
    if (chave === ultimoToque) return;
    ultimoToque = chave;
    onOpen(resposta.notification.request.content.data as DadosDoToque);
  };
  const inscricao = Notifications.addNotificationResponseReceivedListener(entregar);
  try {
    const abriuOApp = Notifications.getLastNotificationResponse?.();
    if (abriuOApp) {
      Notifications.clearLastNotificationResponse?.();
      entregar(abriuOApp);
    }
  } catch (erro) {
    console.warn('[pushNotifications] falha ao ler o toque que abriu o app:', erro);
  }
  return () => inscricao.remove();
}
