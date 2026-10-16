/**
 * Nucleo puro do redirect OAuth do Google (issue #217).
 *
 * Separado de `auth.ts` para poder ser testado: aquele arquivo importa
 * `expo-auth-session` e `react-native`, e nenhum dos dois carrega em Node —
 * o runner do projeto (`node --import tsx --test`) morre no `import`.
 * Aqui nao entra nada nativo; scheme e ambiente chegam como PARAMETROS.
 */

/** Caminho do callback OAuth dentro do app. */
export const GOOGLE_CALLBACK_PATH = "auth/callback";

export interface ExpoGoEnvironment {
  executionEnvironment?: unknown;
  appOwnership?: unknown;
}

export interface GoogleRedirectOptions {
  scheme?: string;
  path: string;
}

/** Mesmo criterio de `pushNotifications.ts`: store client ou ownership expo. */
export function isExpoGoEnvironment(env: ExpoGoEnvironment): boolean {
  return (
    String(env.executionEnvironment ?? "").toLowerCase() === "storeclient" ||
    env.appOwnership === "expo"
  );
}

/** Le o scheme do app config, aceitando a forma string ou lista do Expo. */
export function resolveAppScheme(configuredScheme: unknown): string | null {
  const candidate = Array.isArray(configuredScheme) ? configuredScheme[0] : configuredScheme;
  const scheme = String(candidate ?? "").trim().replace(/:\/+$/, "");
  return scheme || null;
}

/**
 * Builds Expo AuthSession options for the active runtime. Standalone builds use
 * the app.json scheme; Expo Go derives exp:// from the current Metro runtime.
 */
export function resolveGoogleRedirectOptions(
  configuredScheme: unknown,
  expoGo: boolean,
): GoogleRedirectOptions {
  const scheme = resolveAppScheme(configuredScheme);
  if (!expoGo && !scheme) {
    throw new Error("Scheme do aplicativo não configurado para autenticação Google.");
  }
  return {
    ...(expoGo ? {} : { scheme: scheme! }),
    path: GOOGLE_CALLBACK_PATH,
  };
}

/**
 * Le os parametros do callback OAuth (query + fragmento; fragmento vence).
 * O callback da sessao nativa deve conter um codigo PKCE; tokens bearer sem
 * vinculo com a tentativa em andamento nao estabelecem uma sessao.
 */
export function parseOAuthCallbackParams(callbackUrl: string): URLSearchParams {
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  hashParams.forEach((value, key) => params.set(key, value));
  return params;
}

/** Exige o codigo vinculado ao verifier PKCE desta tentativa de login. */
export function requirePkceAuthorizationCode(params: URLSearchParams): string {
  const code = params.get("code");
  if (!code) throw new Error("Resposta OAuth incompleta.");
  return code;
}
