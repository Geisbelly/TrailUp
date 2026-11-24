// Carrega o `expo-notifications` no celular. Na web vale `moduloDeNotificacoes.web.ts`, que devolve
// null sem importar nada: `pushNotifications.ts` já não usava o módulo na web, mas o `require` dele
// punha a biblioteca e o que ela arrasta (`@ide/backoff`, `assert`, `util`, uns 80 KB crus, medidos no
// export de 24/11) no `__common`, baixado antes da primeira tela.
//
// `require` local, e não import estático: avaliar o módulo registra listeners nativos, e no Expo Go
// isso acontece antes de qualquer verificação (ver `carregarNotifications`). Também evita o
// async-require do Metro que o `import()` usaria.
type NotificationsModule = typeof import("expo-notifications");

export function carregarModuloDeNotificacoes(): NotificationsModule | null {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications") as NotificationsModule;
}
