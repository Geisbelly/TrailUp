/**
 * Quais `EXPO_PUBLIC_*` um build EAS precisa — e o que falta quando falta.
 *
 * ## Por que isto existe
 *
 * As `EXPO_PUBLIC_*` são inlined no bundle em tempo de BUILD. Não existe `.easignore`, e o
 * `.gitignore` tem `.env` — então o EAS não envia o arquivo. As chaves do Supabase vêm das EAS
 * Environment Variables do projeto; a URL da API, que não é segredo, está declarada no `env` dos
 * profiles `preview`, `production` e `productionAAB` do `eas.json` (#97).
 *
 * Ela precisa ser HTTPS com certificado válido: os domínios `*.traefik.me` servem o certificado
 * autoassinado do Traefik, o `fetch` do aparelho falha como erro de rede e o resultado é o mesmo
 * de faltar a variável (150 lotes sem análise em out/2026).
 *
 * O efeito de faltar não é erro: `EXPO_PUBLIC_APITRAIUP_URL` ausente faz `montarCandidatos`
 * cair nos palpites locais, que num aparelho real não resolvem. O `fetch` falha, o app vai
 * direto ao Supabase, a telemetria grava com `analysis_ciclo_id` nulo e a análise nunca roda —
 * foi assim que 33 lotes chegaram sem análise nenhuma.
 *
 * Por isso a conferência é no build e não em tempo de execução: depois de gerado, é tarde.
 *
 * ## Por que a lista depende do profile
 *
 * Num build `development` o app acha o Metro pelo IP e a URL da API é dispensável. Nos profiles
 * que viram APK/AAB não há Metro nenhum, e aí a ausência é o defeito de #96/#97.
 */

/** Sempre necessárias: sem elas o aluno nem entra. */
export const SEMPRE = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_ANON_KEY"] as const;

/** Necessária fora do `development`, onde o Metro cobre. */
export const FORA_DO_DEV = ["EXPO_PUBLIC_APITRAIUP_URL"] as const;

export type Conferencia = {
  profile: string;
  exigidas: string[];
  faltando: string[];
  invalidas: { nome: string; motivo: string }[];
  ok: boolean;
};

const ABSOLUTA = /^https?:\/\/[^\s/]+/i;

export function conferirEnvDoBuild(
  ambiente: Record<string, string | undefined>,
  profile = ambiente.EAS_BUILD_PROFILE ?? "development",
): Conferencia {
  const exigidas = [...SEMPRE, ...(profile === "development" ? [] : FORA_DO_DEV)];

  const faltando: string[] = [];
  const invalidas: { nome: string; motivo: string }[] = [];

  for (const nome of exigidas) {
    const valor = (ambiente[nome] ?? "").trim();
    if (!valor) {
      faltando.push(nome);
      continue;
    }
    // URL relativa ou sem esquema não vira `fetch` nenhum no aparelho.
    if (nome.endsWith("_URL") && !ABSOLUTA.test(valor)) {
      invalidas.push({ nome, motivo: "precisa ser absoluta, com http:// ou https://" });
    }
  }

  return { profile, exigidas, faltando, invalidas, ok: faltando.length === 0 && invalidas.length === 0 };
}

/** A mensagem que o build imprime. Diz O QUE falta e ONDE se define. */
export function mensagemDaConferencia(c: Conferencia): string {
  if (c.ok) {
    return `[env] build "${c.profile}": as ${c.exigidas.length} variáveis exigidas estão definidas.`;
  }

  const linhas = [`[env] build "${c.profile}" não tem o que precisa:`];
  for (const nome of c.faltando) linhas.push(`  - ${nome}: ausente`);
  for (const { nome, motivo } of c.invalidas) linhas.push(`  - ${nome}: ${motivo}`);
  linhas.push(
    "",
    "Defina em EAS Environment Variables (eas env:create) ou no .env para build local.",
    "A lista canônica, com o que cada uma significa, está em mobile/.env.example.",
    "",
    "Sem elas o build GERA normalmente e falha em silêncio no aparelho: o app cai no",
    "acesso direto ao Supabase e a análise de telemetria nunca roda (#96, #97).",
  );
  return linhas.join("\n");
}
