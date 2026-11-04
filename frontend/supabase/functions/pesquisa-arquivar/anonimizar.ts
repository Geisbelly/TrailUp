// Copia anonima do arquivo da pesquisa (#17, migracao `20261104_03`).
//
// Quando o aluno que consentiu pesquisa pede exclusao, cada objeto dele em `pesquisa/` vira uma copia
// em `pesquisa/anonimo/` antes de o identificavel sair. Todo identificador vira HMAC(sal, tipo:valor),
// com um sal aleatorio POR EXCLUSAO que o banco apaga ao concluir: dentro da copia de um aluno os
// codigos batem entre si (o mesmo topico tem o mesmo codigo em `topico_id` e em `topic:206`), e
// depois que o sal some nao existe caminho de volta - nem entre dois alunos excluidos.
//
// Por que tambem a turma, o topico e o conteudo, e nao so o aluno: o id do topico entrega a turma, e
// numa turma de 2 alunos isso entrega a pessoa. As regras sairam das chaves medidas nos payloads de
// producao em 04/11 (nenhum texto livre hoje; ids numericos, UUIDs e ids dentro de `item_key`).
//
// Puro (Web Crypto, sem Deno) para o vitest testar direto.

import { type Origem } from "./arquivo.ts";

export const VERSAO_DO_ANONIMO = 1;

const PASTA: Record<Origem, string> = {
  telemetria_sessoes: "sessoes",
  telemetria_lotes: "lotes",
  telemetria_eventos_app: "eventos",
};

/** O `id` de cada origem e' de que tipo: assim o `id` da sessao e o `sessao_id` do lote batem. */
const TIPO_DO_ID: Record<Origem, string> = {
  telemetria_sessoes: "sessao",
  telemetria_lotes: "lote",
  telemetria_eventos_app: "evento",
};

/** Chave -> tipo do identificador. Rotulo dentro de texto (`content:230`) usa a mesma tabela. */
const TIPO_DA_CHAVE: Record<string, string> = {
  aluno_id: "aluno",
  sessao_id: "sessao",
  lote_id: "lote",
  classe_id: "classe",
  topico_id: "topico",
  topico_inicial_id: "topico",
  topic: "topico",
  conteudo_id: "conteudo",
  contentid: "conteudo",
  content: "conteudo",
  atividade_id: "atividade",
  activity: "atividade",
  questao_id: "questao",
  question: "questao",
  personalization: "personalizacao",
  client_event_id: "evento_cliente",
  analysis_ciclo_id: "ciclo",
};

/** Chaves cujo valor e' texto com ids dentro (`content:230:personalization:38`). */
const CHAVES_COM_IDS_NO_TEXTO = new Set(["item_key", "key", "material_key", "contentitemkey"]);

/**
 * Sai inteiro: o que pode identificar a pessoa por si so'. Hoje nenhum aparece nos payloads; a lista
 * existe para o dia em que alguem acrescentar um campo assim no coletor.
 */
const CHAVES_REMOVIDAS = new Set([
  "nome",
  "name",
  "apelido",
  "email",
  "texto",
  "text",
  "mensagem",
  "message",
  "resposta",
  "answer",
  "prompt",
  "ip",
  "device_id",
  "push_token",
  "token",
  "user_agent",
  "foto",
  "avatar",
  "imagem",
  "image",
  "frame",
  "frame_base64",
  "base64",
  "data_url",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERO = /^-?\d+$/;

export type Codificador = (tipo: string, valor: string) => Promise<string>;

/** HMAC-SHA256(sal, `tipo:valor`), 16 hex. 64 bits bastam: o espaco e' o de uma turma, nao do mundo. */
export async function codificador(sal: string): Promise<Codificador> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sal),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const cache = new Map<string, string>();
  return async (tipo, valor) => {
    const entrada = `${tipo}:${valor}`;
    const pronto = cache.get(entrada);
    if (pronto) return pronto;
    const assinatura = new Uint8Array(await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(entrada)));
    const codigo = Array.from(assinatura.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
    cache.set(entrada, codigo);
    return codigo;
  };
}

function tipoDaChave(chave: string): string | null {
  const normal = chave.toLowerCase();
  if (TIPO_DA_CHAVE[normal]) return TIPO_DA_CHAVE[normal];
  if (normal.endsWith("_id")) return normal.slice(0, -3);
  return null;
}

/** `content:230:personalization:38` -> cada numero vira codigo, com o tipo do rotulo anterior. */
async function anonimizarTextoComIds(texto: string, codigo: Codificador): Promise<string> {
  const partes = texto.split(":");
  let rotulo = "id";
  const saida: string[] = [];
  for (const parte of partes) {
    if (NUMERO.test(parte) || UUID.test(parte)) {
      saida.push(await codigo(TIPO_DA_CHAVE[rotulo.toLowerCase()] ?? rotulo.toLowerCase(), parte.toLowerCase()));
    } else {
      rotulo = parte;
      saida.push(parte);
    }
  }
  return saida.join(":");
}

async function anonimizarValor(chave: string | null, valor: unknown, codigo: Codificador): Promise<unknown> {
  if (valor === null || valor === undefined) return valor;
  if (Array.isArray(valor)) {
    return Promise.all(valor.map((item) => anonimizarValor(chave, item, codigo)));
  }
  if (typeof valor === "object") {
    return anonimizarObjeto(valor as Record<string, unknown>, codigo);
  }
  const tipo = chave ? tipoDaChave(chave) : null;
  if (tipo && (typeof valor === "number" || typeof valor === "string")) {
    return codigo(tipo, String(valor).toLowerCase());
  }
  if (typeof valor === "string") {
    if (UUID.test(valor)) return codigo("uuid", valor.toLowerCase());
    if (chave && CHAVES_COM_IDS_NO_TEXTO.has(chave.toLowerCase())) return anonimizarTextoComIds(valor, codigo);
  }
  return valor;
}

async function anonimizarObjeto(objeto: Record<string, unknown>, codigo: Codificador): Promise<Record<string, unknown>> {
  const saida: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(objeto)) {
    if (CHAVES_REMOVIDAS.has(chave.toLowerCase())) continue;
    saida[chave] = await anonimizarValor(chave, valor, codigo);
  }
  return saida;
}

export interface Anonimo {
  caminho: string;
  corpo: string;
}

/**
 * Do objeto identificavel (o que `montarObjeto` gravou) para a copia anonima e o caminho dela:
 * `pesquisa/anonimo/<pasta>/<titular>/<codigo do registro>.json`. Nada no caminho liga ao aluno.
 */
export async function anonimizarObjetoDoArquivo(
  bruto: unknown,
  params: { origem: Origem; sal: string; perfil: string | null },
): Promise<Anonimo> {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) throw new Error("objeto do arquivo invalido");
  const registro = (bruto as { registro?: unknown }).registro;
  if (!registro || typeof registro !== "object" || Array.isArray(registro)) throw new Error("objeto sem registro");

  const codigo = await codificador(params.sal);
  const original = registro as Record<string, unknown>;
  const aluno = original.aluno_id;
  const id = original.id;
  if (typeof aluno !== "string" || (typeof id !== "string" && typeof id !== "number")) {
    throw new Error("registro sem aluno_id ou id");
  }

  const tipoDoId = TIPO_DO_ID[params.origem];
  const anon = await anonimizarObjeto(original, codigo);
  anon.id = await codigo(tipoDoId, String(id).toLowerCase());
  const titular = await codigo("aluno", aluno.toLowerCase());

  return {
    caminho: `pesquisa/anonimo/${PASTA[params.origem]}/${titular}/${anon.id}.json`,
    corpo: JSON.stringify({
      versao_anonimo: VERSAO_DO_ANONIMO,
      origem: params.origem,
      titular,
      perfil_dominante: params.perfil,
      registro: anon,
    }),
  };
}
