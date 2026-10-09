/**
 * Registro do consentimento de telemetria NO SERVIDOR.
 *
 * O aceite vive em `AsyncStorage` (`telemetryConsent.ts`). Isso basta para
 * decidir se a coleta roda, e não basta como prova: o ônus da prova do
 * consentimento é do controlador, e limpar os dados do app apagava a única
 * evidência que existia (item 1 da #195).
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
