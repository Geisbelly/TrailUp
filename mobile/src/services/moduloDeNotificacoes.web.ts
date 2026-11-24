// Na web não há push nem notificação local do Expo: ver `moduloDeNotificacoes.ts`.
type NotificationsModule = typeof import("expo-notifications");

export function carregarModuloDeNotificacoes(): NotificationsModule | null {
  return null;
}
