// Correção da dissertativa com a resposta esperada lida no servidor (`20261108_01`).
//
// Com `questaoId`, a função não recebe mais a resposta esperada do app: lê a questão pela chave
// de serviço (`questao_correcao_ia_contexto`, que confere matrícula e prazo) e grava a nota da IA
// (`questao_registrar_correcao_ia`). Sem `questaoId` vale o contrato antigo: o console do professor
// e o app 1.0.x mandam `respostaProfessor`. Ver docs/analises/2026-11-08-gabarito-fora-do-app-do-aluno.md.
//
// Puro, para o vitest do frontend.

export interface ContextoDaQuestao {
  enunciado: string;
  respostaEsperada: string;
  notaEstabelecida: unknown;
  /** `dissertativa` ou `codigo` (`20261110_02`); vazio na RPC antiga. */
  tipo: string;
  /** Linguagem do código, de `config_resposta.linguagem`; vazio se ausente ou estranha. */
  linguagem: string;
  /** Critérios do professor (`questao_gabarito.criterios`), uma linha cada. */
  criterios: string[];
}

const MAX_CRITERIOS = 20;
const MAX_CHARS_CRITERIO = 300;
// Vai cru para o prompt: só um nome curto de linguagem passa (python, c++, c#, javascript...).
const LINGUAGEM_VALIDA = /^[a-z0-9+#.\- ]{1,30}$/;

function lerCriterios(valor: unknown): string[] {
  const itens = Array.isArray(valor) ? valor : typeof valor === "string" ? valor.split(/\r?\n/) : [];
  const textos = itens.map((item) => {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      const objeto = item as Record<string, unknown>;
      const texto = objeto.texto ?? objeto.descricao;
      return typeof texto === "string" ? texto : "";
    }
    return "";
  });
  return textos
    .map((t) => t.replace(/\s+/g, " ").trim().slice(0, MAX_CHARS_CRITERIO))
    .filter((t) => t !== "")
    .slice(0, MAX_CRITERIOS);
}

function lerLinguagem(config: unknown): string {
  if (!config || typeof config !== "object") return "";
  const bruta = (config as Record<string, unknown>).linguagem;
  const linguagem = typeof bruta === "string" ? bruta.trim().toLowerCase() : "";
  return LINGUAGEM_VALIDA.test(linguagem) ? linguagem : "";
}

/** `questaoId` do corpo: inteiro positivo, ou null (fluxo antigo). */
export function lerQuestaoId(valor: unknown): number | null {
  const numero = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  return typeof numero === "number" && Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/** O que `questao_correcao_ia_contexto` devolve, sem confiar na forma. */
export function lerContexto(bruto: unknown): ContextoDaQuestao {
  const linha = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {};
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    enunciado: texto(linha.enunciado),
    respostaEsperada: texto(linha.resposta_esperada),
    notaEstabelecida: linha.nota_estabelecida ?? null,
    tipo: texto(linha.tipo),
    linguagem: lerLinguagem(linha.config_resposta),
    criterios: lerCriterios(linha.criterios),
  };
}

// As exceções das RPCs (`RAISE EXCEPTION '<codigo>'`) viram status HTTP. O app traduz
// `prazo_expirado` como na resposta da objetiva.
const STATUS_DO_ERRO: Record<string, number> = {
  questao_sem_sessao: 401,
  questao_sem_permissao: 403,
  questao_inexistente: 404,
  questao_nao_dissertativa: 400,
  prazo_expirado: 409,
};

export function respostaDoErroDaRpc(mensagem: unknown): { status: number; error: string } {
  const texto = typeof mensagem === "string" ? mensagem : "";
  for (const [codigo, status] of Object.entries(STATUS_DO_ERRO)) {
    if (texto.includes(codigo)) return { status, error: codigo };
  }
  return { status: 500, error: "falha_no_banco" };
}

/** Segundos na questão, como `questao_responder` aceita: inteiro de 0 a 3600, ou null. */
export function lerTempo(valor: unknown): number | null {
  const numero = Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(numero)) return null;
  return Math.min(3600, Math.max(0, Math.round(numero)));
}
