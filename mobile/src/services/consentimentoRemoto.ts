/**
 * Registro do consentimento de telemetria NO SERVIDOR.
 *
 * O aceite vive em `AsyncStorage` (`telemetryConsent.ts`). Isso basta para
 * decidir se a coleta roda, e não basta como prova: o ônus da prova do
 * consentimento é do controlador, e limpar os dados do app apagava a única
 * evidência que existia (item 1 da #195). Nem basta para lembrar a decisão:
 * sem o registro local o termo voltava a aparecer, então a linha também é
 * lida de volta (`registroDaDecisao`, `escolherDecisao`, no fim do arquivo).
 *
 * Aqui o aceite também vira uma linha em `consentimento_telemetria`, que é
 * append-only e carimbada pelo servidor. O módulo é separado e as dependências
 * entram por parâmetro para poder ser testado em Node — mesmo motivo de
 * `telemetriaPayload.ts` e `telemetryConsentVersao.ts`.
 */

import type { TelemetryConsentRecord } from "../utils/telemetryConsent";

/** A linha como ela vai para o banco. `registrado_em` NÃO vai: é do servidor. */
export type LinhaDeConsentimento = {
  aluno_id: string;
  versao: string;
  status: "accepted" | "rejected";
  decidido_em: string;
  preferencias: Record<string, boolean>;
  camera_permissao_concedida: boolean;
  origem: Record<string, string>;
};

/** `23505` = unique_violation: esta decisão já está registrada. */
export const CODIGO_JA_REGISTRADO = "23505";

export type Origem = { plataforma?: string | null; versaoApp?: string | null };

/**
 * Monta a linha a partir do registro local. Pura.
 *
 * `decidido_em` é o relógio do APARELHO — é o instante em que o aluno decidiu,
 * que só ele sabe. O servidor carimba `registrado_em` por conta própria, e os
 * dois convivem de propósito: um é o que o aluno diz, o outro é o que o
 * servidor viu.
 */
export function linhaDeConsentimento(
  record: TelemetryConsentRecord,
  alunoId: string,
  origem: Origem = {}
): LinhaDeConsentimento {
  return {
    aluno_id: alunoId,
    versao: record.version,
    status: record.status,
    decidido_em: record.updatedAt,
    preferencias: { ...record.preferences },
    camera_permissao_concedida: record.cameraPermissionGranted === true,
    origem: {
      ...(origem.plataforma ? { plataforma: origem.plataforma } : {}),
      ...(origem.versaoApp ? { versao_app: origem.versaoApp } : {}),
    },
  };
}

/**
 * Vale enviar esta decisão?
 *
 * Só com `aluno_id` e `versao`: sem sessão não há a quem atribuir o aceite, e
 * sem versão não dá para dizer A QUE ele consentiu — linha sem isso seria
 * prova de nada.
 */
export function precisaRegistrar(
  record: TelemetryConsentRecord | null | undefined,
  alunoId: string | null | undefined
): boolean {
  if (!alunoId) return false;
  if (!record) return false;
  if (!record.version) return false;
  if (record.status !== "accepted" && record.status !== "rejected") return false;
  return Boolean(record.updatedAt);
}

/** A tabela da prova. Exportada para o chamador nao redigitar o nome. */
export const TABELA_DE_CONSENTIMENTO = "consentimento_telemetria";

type Insercao = { error: { code?: string | null; message?: string } | null };

/**
 * A inserção entra como FUNÇÃO, não como cliente.
 *
 * Tipar o cliente do Supabase aqui não compila — o `from().insert()` real
 * devolve um builder com genéricos próprios, não um `Promise<{error}>`. E o
 * módulo não precisa saber disso: ele precisa de "algo que grava a linha e
 * diz se deu erro". Assim o teste passa uma função de três linhas em vez de
 * fingir um cliente inteiro.
 */
export type Inserir = (linha: LinhaDeConsentimento) => PromiseLike<Insercao>;

export type ResultadoDoRegistro =
  | { ok: true; motivo: "registrado" | "ja_registrado" | "nada_a_fazer" }
  | { ok: false; motivo: "erro"; detalhe: string };

/**
 * Grava a decisão. Reenvio é esperado — o mobile repete quando a rede falha —,
 * e `23505` significa "já está lá", que é sucesso, não falha. Tratar como erro
 * faria a retentativa ficar presa para sempre numa decisão já registrada.
 */
export async function registrarConsentimento(deps: {
  inserir: Inserir;
  record: TelemetryConsentRecord | null | undefined;
  alunoId: string | null | undefined;
  origem?: Origem;
}): Promise<ResultadoDoRegistro> {
  const { inserir, record, alunoId, origem } = deps;
  if (!precisaRegistrar(record, alunoId)) {
    return { ok: true, motivo: "nada_a_fazer" };
  }
  const linha = linhaDeConsentimento(record!, alunoId!, origem);
  try {
    const { error } = await inserir(linha);
    if (!error) return { ok: true, motivo: "registrado" };
    if (error.code === CODIGO_JA_REGISTRADO) {
      return { ok: true, motivo: "ja_registrado" };
    }
    return { ok: false, motivo: "erro", detalhe: error.message ?? "erro sem mensagem" };
  } catch (erro) {
    return {
      ok: false,
      motivo: "erro",
      detalhe: erro instanceof Error ? erro.message : String(erro),
    };
  }
}

// ---------------------------------------------------------------------------
// Leitura de volta: o aceite é da CONTA, não do aparelho.
//
// Até aqui a linha só era escrita, e o Gate decidia pelo AsyncStorage. Então
// reinstalar o app, trocar de aparelho ou abrir a versão web noutro navegador
// pedia o termo de novo a quem já tinha aceitado — em produção, uma conta
// aceitou a v6 treze vezes em uma semana, entre web, Android e iOS. O que
// segue transforma a última decisão gravada para a versão vigente de volta em
// registro local.
// ---------------------------------------------------------------------------

/** A linha como o `select` a devolve. `preferencias` é o JSONB cru. */
export type DecisaoLida = {
  versao: string | null;
  status: string | null;
  decidido_em: string | null;
  preferencias: unknown;
};

/** As colunas que a leitura pede. Exportadas para o chamador não redigitar. */
export const COLUNAS_DA_DECISAO = "versao,status,decidido_em,preferencias";

function booleano(valor: unknown, padrao: boolean): boolean {
  return typeof valor === "boolean" ? valor : padrao;
}

/**
 * Transforma a decisão gravada em registro local. Pura.
 *
 * Só vale para a versão vigente: aceitar a v5 não é aceitar a v6, e uma linha
 * de versão antiga devolvida por engano faria o termo novo nunca aparecer.
 *
 * A câmera volta DESLIGADA, sempre. A permissão do sistema é do aparelho (este
 * pode nunca ter concedido) e consentimento para dado biométrico não vem
 * pré-marcado (LGPD art. 11; #195). Quem quiser a câmera neste aparelho liga
 * em Perfil > Coleta e acessos, que pede a permissão.
 *
 * `updatedAt` é o `decidido_em` gravado, de propósito: se o Gate reenviar este
 * registro, a chave única `(aluno_id, versao, decidido_em)` devolve 23505 e
 * nenhuma linha nova nasce — não é uma decisão nova, é a mesma lida de volta.
 */
export function registroDaDecisao(
  linha: DecisaoLida | null | undefined,
  versaoVigente: string
): TelemetryConsentRecord | null {
  if (!linha || linha.versao !== versaoVigente) return null;
  if (linha.status !== "accepted" && linha.status !== "rejected") return null;
  if (!linha.decidido_em || Number.isNaN(Date.parse(linha.decidido_em))) return null;
  const aceitou = linha.status === "accepted";
  const p = (linha.preferencias && typeof linha.preferencias === "object"
    ? linha.preferencias
    : {}) as Record<string, unknown>;
  return {
    version: linha.versao,
    status: linha.status,
    updatedAt: linha.decidido_em,
    cameraPermissionRequested: false,
    cameraPermissionGranted: false,
    preferences: {
      cameraEnabled: false,
      usageEnabled: aceitou && booleano(p.usageEnabled, true),
      performanceEnabled: aceitou && booleano(p.performanceEnabled, true),
      chatEnabled: aceitou && booleano(p.chatEnabled, true),
    },
  };
}

function instante(iso: string | null | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

/**
 * Qual decisão vale neste aparelho: a local ou a da conta? Pura.
 *
 * - Sem registro local da versão vigente (app reinstalado, aparelho novo,
 *   outro navegador, termo que mudou desde o último uso aqui), vale a do
 *   servidor, se houver.
 * - Com os dois, vale a mais recente. Decidir noutro aparelho (recusar no
 *   celular depois de aceitar na web) chega aqui também. Empate fica com a
 *   local, que é a mesma decisão.
 * - Quando a do servidor vence e as duas são aceite, a câmera fica como
 *   estava NESTE aparelho: ela depende da permissão do sistema daqui, que a
 *   outra decisão não tem como saber.
 *
 * Devolve `null` quando nenhuma das duas vale para a versão vigente — é
 * quando o termo deve aparecer.
 */
export function escolherDecisao(
  local: TelemetryConsentRecord | null | undefined,
  remota: TelemetryConsentRecord | null | undefined,
  versaoVigente: string
): TelemetryConsentRecord | null {
  const localVale = local && local.version === versaoVigente ? local : null;
  const remotaVale = remota && remota.version === versaoVigente ? remota : null;
  if (!remotaVale) return localVale;
  if (!localVale) return remotaVale;
  if (instante(remotaVale.updatedAt) <= instante(localVale.updatedAt)) return localVale;
  if (remotaVale.status !== "accepted" || localVale.status !== "accepted") return remotaVale;
  return {
    ...remotaVale,
    cameraPermissionRequested: localVale.cameraPermissionRequested,
    cameraPermissionGranted: localVale.cameraPermissionGranted,
    preferences: { ...remotaVale.preferences, cameraEnabled: localVale.preferences.cameraEnabled },
  };
}

/**
 * Corre contra um prazo. Pura. Rede lenta não pode segurar o Gate para
 * sempre: estourou, vale `null` e o termo aparece como antes desta leitura.
 */
export function comPrazo<T>(promessa: PromiseLike<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const relogio = setTimeout(() => resolve(null), ms);
    Promise.resolve(promessa).then(
      (valor) => {
        clearTimeout(relogio);
        resolve(valor);
      },
      () => {
        clearTimeout(relogio);
        resolve(null);
      }
    );
  });
}
