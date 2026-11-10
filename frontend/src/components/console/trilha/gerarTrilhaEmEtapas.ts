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
 *
 * `aoAtualizar` entrega a proposta como está depois do esqueleto e de cada
 * tópico: é o que o console grava no rascunho, para um erro no meio não jogar
 * fora o que já veio. `completarTopicos` gera de novo só os tópicos que
 * ficaram sem material, a partir desse rascunho.
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

type Comum = {
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
  /** A proposta inteira, como está, depois de cada etapa concluída. */
  aoAtualizar?: (topicos: AiTopico[]) => void;
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
  // Guardado para "gerar o que falta" pedir o tópico com os mesmos arquivos.
  arquivos_relacionados: t.arquivos_relacionados ?? [],
});

/** O tópico ainda não tem material: é o que "gerar o que falta" pede de novo. */
export const semMaterialAinda = (t: AiTopico) => (t.conteudos?.length ?? 0) === 0;

const comoEsqueleto = (t: AiTopico): TopicoDoEsqueleto => ({
  nome: t.nome,
  descricao: t.descricao,
  ordem: t.ordem,
  depende: t.depende ?? [],
  next: t.next ?? [],
  arquivos_relacionados: t.arquivos_relacionados ?? [],
});

/**
 * Pede o material dos tópicos em `indices`, `concorrencia` por vez, sobre a
 * proposta `base`. Devolve a proposta nova e os que continuaram sem material.
 */
async function detalhar(
  base: AiTopico[],
  indices: number[],
  { invocar, corpo, concorrencia = 2, tentativasPorTopico = 2, aoProgredir, aoAtualizar }: Comum,
): Promise<ResultadoDaTrilha> {
  const topicos = [...base];
  const total = indices.length;
  const falhas = new Map<number, string>();
  let feitos = 0;
  aoProgredir?.({ feitos, total });

  const detalharUm = async (indice: number) => {
    const alvo = comoEsqueleto(topicos[indice]);
    let ultimoErro: unknown = null;
    for (let tentativa = 1; tentativa <= Math.max(1, tentativasPorTopico); tentativa += 1) {
      try {
        const data = await invocar({ ...corpo, mode: "trail-topic", topic: alvo, topicIndex: indice, totalTopics: topicos.length });
        return { ok: true as const, topico: lerTopico(data) };
      } catch (erro) {
        ultimoErro = erro;
      }
    }
    return { ok: false as const, erro: mensagemDe(ultimoErro) };
  };

  let proximo = 0;
  const trabalhador = async () => {
    while (proximo < total) {
      const indice = indices[proximo];
      proximo += 1;
      const r = await detalharUm(indice);
      if (r.ok) topicos[indice] = r.topico;
      else falhas.set(indice, r.erro);
      feitos += 1;
      aoProgredir?.({ feitos, total });
      aoAtualizar?.([...topicos]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concorrencia), total) }, trabalhador));

  const semMaterial = indices
    .filter((i) => falhas.has(i))
    .map((i) => ({ nome: topicos[i].nome, ordem: topicos[i].ordem, erro: falhas.get(i) ?? "Erro ao gerar o tópico." }));
  return { topicos, semMaterial };
}

export async function gerarTrilhaEmEtapas(opcoes: Comum): Promise<ResultadoDaTrilha> {
  const esqueleto = lerEsqueleto(await opcoes.invocar({ ...opcoes.corpo, mode: "trail-skeleton" }));
  const base = esqueleto.map(topicoVazio);
  // O esqueleto já é trabalho feito: vai para o rascunho antes de qualquer tópico.
  opcoes.aoAtualizar?.([...base]);

  const resultado = await detalhar(
    base,
    base.map((_, i) => i),
    opcoes,
  );

  // Nenhum tópico veio: é falha da geração (cota, rede), não da proposta.
  // Devolver uma trilha só de nomes esconderia o erro atrás de uma tela
  // "pronta". O esqueleto continua no rascunho, para gerar o que falta depois.
  if (resultado.semMaterial.length === base.length) {
    throw new Error(resultado.semMaterial[0]?.erro ?? "Erro ao gerar trilha.");
  }
  return resultado;
}

/**
 * Gera só os tópicos que ainda não têm material (de um rascunho, ou os que
 * falharam), mantendo os outros como estão. Não lança quando falham: a
 * proposta continua de pé, e `semMaterial` diz o que faltou.
 */
export async function completarTopicos(opcoes: Comum & { topicos: AiTopico[] }): Promise<ResultadoDaTrilha> {
  const indices = opcoes.topicos.map((t, i) => (semMaterialAinda(t) ? i : -1)).filter((i) => i >= 0);
  if (indices.length === 0) return { topicos: [...opcoes.topicos], semMaterial: [] };
  return detalhar(opcoes.topicos, indices, opcoes);
}
