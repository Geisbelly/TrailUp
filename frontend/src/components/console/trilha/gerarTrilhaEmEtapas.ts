import type { AiTopico } from "./proposta";

/**
 * Gera a trilha em várias requisições à edge function `generate-content-ai`:
 * uma para o esqueleto (`trail-skeleton`) e uma por tópico (`trail-topic`).
 *
 * O modo `trail` antigo fazia tudo numa requisição só — o esqueleto e, em
 * série, um pedido ao Gemini por tópico, com até 3 tentativas cada. Com 6
 * tópicos isso passava do tempo de relógio do worker do Supabase (150 s no
 * plano Free): o gateway devolvia 504 e o worker morria com 546
 * (`WORKER_LIMIT`), sem corpo, e o professor perdia a trilha inteira.
 * Dividido, cada requisição carrega um pedaço que cabe no tempo.
 */

/** Tópico do esqueleto, como a função devolve em `trail-skeleton`. */
export type TopicoDoEsqueleto = {
  nome: string;
  descricao: string;
  ordem: number;
  depende: number[];
  next: number[];
  arquivos_relacionados?: string[];
};

export type ProgressoDaTrilha = { feitos: number; total: number };

export type ResultadoDaTrilha = {
  topicos: AiTopico[];
  /** Tópicos que vieram só com nome e ligações: a IA não devolveu o material deles. */
  semMaterial: Array<{ nome: string; ordem: number; erro: string }>;
};

type Opcoes = {
  /** Chama a edge function com o corpo dado e devolve o `data` (ou lança com a mensagem já legível). */
  invocar: (corpo: Record<string, unknown>) => Promise<unknown>;
  /** O corpo comum a todas as etapas: descrição, fontes, número de tópicos etc. */
  corpo: Record<string, unknown>;
  /**
   * Tópicos em paralelo. Baixo de propósito: as chaves do Gemini estão no
   * tier free, com limite de pedidos por minuto, e um 429 a mais custa uma
   * volta inteira de rotação de chaves.
   */
  concorrencia?: number;
  /** Tentativas por tópico; cada uma é uma requisição nova, com o tempo inteiro de novo. */
  tentativasPorTopico?: number;
  aoProgredir?: (progresso: ProgressoDaTrilha) => void;
};

const ehRegistro = (valor: unknown): valor is Record<string, unknown> =>
  Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);

function lerEsqueleto(data: unknown): TopicoDoEsqueleto[] {
  const topicos = ehRegistro(data) ? data.topicos : undefined;
  if (!Array.isArray(topicos) || topicos.length === 0) throw new Error("Resposta invalida da IA.");
  return topicos as TopicoDoEsqueleto[];
}

function lerTopico(data: unknown): AiTopico {
  const topico = ehRegistro(data) ? data.topico : undefined;
  if (!ehRegistro(topico) || !Array.isArray(topico.conteudos)) throw new Error("Resposta invalida da IA.");
  return topico as unknown as AiTopico;
}

const mensagemDe = (erro: unknown) => (erro instanceof Error && erro.message ? erro.message : "Erro ao gerar o tópico.");

/** O tópico do esqueleto, sem material: entra na proposta para o grafo não perder o nó. */
const topicoVazio = (t: TopicoDoEsqueleto): AiTopico => ({
  nome: t.nome,
  descricao: t.descricao,
  ordem: t.ordem,
  depende: t.depende ?? [],
  next: t.next ?? [],
  conteudos: [],
  cards: [],
  atividades: [],
});

export async function gerarTrilhaEmEtapas({
  invocar,
  corpo,
  concorrencia = 2,
  tentativasPorTopico = 2,
  aoProgredir,
}: Opcoes): Promise<ResultadoDaTrilha> {
  const esqueleto = lerEsqueleto(await invocar({ ...corpo, mode: "trail-skeleton" }));
  const total = esqueleto.length;
  let feitos = 0;
  aoProgredir?.({ feitos, total });

  const detalhar = async (topico: TopicoDoEsqueleto, indice: number) => {
    let ultimoErro: unknown = null;
    for (let tentativa = 1; tentativa <= Math.max(1, tentativasPorTopico); tentativa += 1) {
      try {
        return { ok: true as const, topico: lerTopico(await invocar({ ...corpo, mode: "trail-topic", topic: topico, topicIndex: indice, totalTopics: total })) };
      } catch (erro) {
        ultimoErro = erro;
      }
    }
    return { ok: false as const, erro: mensagemDe(ultimoErro) };
  };

  const resultados: Array<Awaited<ReturnType<typeof detalhar>>> = new Array(total);
  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < total) {
      const indice = proximo;
      proximo += 1;
      resultados[indice] = await detalhar(esqueleto[indice], indice);
      feitos += 1;
      aoProgredir?.({ feitos, total });
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concorrencia), total) }, trabalhador));

  // Nenhum tópico veio: é falha da geração (cota, rede), não da proposta.
  // Devolver uma trilha só de nomes esconderia o erro atrás de uma tela "pronta".
  if (resultados.every((r) => !r.ok)) {
    const primeiro = resultados.find((r) => !r.ok);
    throw new Error(primeiro && !primeiro.ok ? primeiro.erro : "Erro ao gerar trilha.");
  }

  const topicos: AiTopico[] = [];
  const semMaterial: ResultadoDaTrilha["semMaterial"] = [];
  resultados.forEach((r, i) => {
    if (r.ok) {
      topicos.push(r.topico);
      return;
    }
    topicos.push(topicoVazio(esqueleto[i]));
    semMaterial.push({ nome: esqueleto[i].nome, ordem: esqueleto[i].ordem, erro: r.erro });
  });
  return { topicos, semMaterial };
}
