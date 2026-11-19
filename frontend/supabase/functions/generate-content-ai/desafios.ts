/**
 * Modo `desafios`: a IA propõe 2 desafios de lógica e 2 cruzadinhas por conteúdo, e esta função
 * transforma a resposta do modelo em propostas que o console mostra ao professor e que
 * `missao_desafio_criar` aceita no "Aplicar".
 *
 * Três garantias, todas aqui e não no prompt (o modelo nem sempre obedece):
 *
 * - **Nada que o banco recusaria.** Cada proposta já passou pelos limites da RPC (abaixo, com a
 *   migration). A proposta que falharia no "Aplicar" é descartada e contada em `descartados`.
 * - **O desafio público nunca traz a resposta.** Ele é remontado campo a campo, então campo a mais
 *   do modelo não passa. Na lógica curta, o enunciado que já diz a resposta sai; na cruzadinha, sai
 *   a palavra cuja pista diz o próprio termo ou o termo de outra palavra da grade. Na múltipla a
 *   certa está entre as alternativas, como as outras, e nada a marca. O título do conteúdo também é
 *   texto público: a RPC o põe no título da missão ("Desafio de lógica: <conteúdo>"), então ele
 *   passa pelas mesmas regras do enunciado e das pistas.
 * - **A grade é montada por código** (`montarCruzadinha`). A IA só propõe termos e pistas.
 *
 * Sem `Deno.*` aqui dentro: o vitest do frontend testa este arquivo, e o console importa os tipos.
 */
import { letrasDaGrade, montarCruzadinha, type PalavraComPista, type PalavraNaGrade } from "./montarCruzadinha.ts";
import { chaveDoTexto, type FiltroDeRepetidas } from "./repetidas.ts";

export const PERFIS_BRAINHEX = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
] as const;
export type PerfilBrainHex = (typeof PERFIS_BRAINHEX)[number];

export type TipoDeDesafio = "logica" | "cruzadinha";

/** Perfis-alvo marcados de início na proposta. O professor muda no console. */
export const PERFIS_PADRAO: Readonly<Record<TipoDeDesafio, readonly PerfilBrainHex[]>> = {
  logica: ["mastermind", "achiever"],
  cruzadinha: ["seeker", "mastermind"],
};

/** O que o aluno lê (`missoes.desafio`): o formato público da spec, sem resposta. */
export type DesafioLogicaPublico =
  | { tipo: "logica"; enunciado: string; formato: "multipla"; alternativas: string[] }
  | { tipo: "logica"; enunciado: string; formato: "curta" };

export type DesafioCruzadinhaPublico = {
  tipo: "cruzadinha";
  linhas: number;
  colunas: number;
  palavras: PalavraNaGrade[];
};

export type DesafioPublico = DesafioLogicaPublico | DesafioCruzadinhaPublico;

/** O gabarito (`missao_desafio_gabarito.resposta`), que só o professor lê. */
export type RespostaDaLogica = { aceitas: string[] };
export type RespostaDaCruzadinha = { palavras: Record<string, string> };

export type PropostaDeDesafio =
  | { tipo: "logica"; titulo: string; desafio: DesafioLogicaPublico; resposta: RespostaDaLogica; perfis: PerfilBrainHex[] }
  | {
    tipo: "cruzadinha";
    titulo: string;
    desafio: DesafioCruzadinhaPublico;
    resposta: RespostaDaCruzadinha;
    perfis: PerfilBrainHex[];
  };

export type DesafiosNormalizados = { desafios: PropostaDeDesafio[]; descartados: number };

// Limites de `missao_desafio_criar` em api/alembic/versions/20261117_03_missao_desafio_criar.py
// (PR #1149). Mudou lá, mude aqui:
// - enunciado de 1 a 1000 caracteres (`char_length`, que conta caractere, não unidade UTF-16);
// - de 1 a 20 respostas aceitas, alternativas e respostas de 1 a 200 caracteres;
// - múltipla com 2 a 8 alternativas diferentes e cada aceita entre elas (aqui são 4, como a spec);
// - toda comparação por `fn_missao_desafio_normalizar`: minúsculas, sem acento, espaços colapsados;
// - cruzadinha com grade de 2 a 40 linhas e colunas, 4 a 10 palavras, tamanho de pelo menos 2,
//   pista de 1 a 200 e resposta com exatamente as chaves da grade;
// - perfis entre os 7, em minúsculas.
const MAX_ENUNCIADO = 1000;
const MAX_TEXTO = 200;
const MAX_ACEITAS = 20;
const ALTERNATIVAS_DA_MULTIPLA = 4;
const LADO_MINIMO = 2;
const LADO_MAXIMO = 40;
const MIN_PALAVRAS = 4;
const MAX_PALAVRAS = 10;
/** O CHECK de `missoes.titulo` (a RPC monta o próprio; este é o que o console mostra). */
const MAX_TITULO = 120;
/** O pedido é de 2 de cada; o que o modelo mandar a mais fica de fora sem contar como descarte. */
const POR_TIPO = 2;
/** Uma resposta com tudo o que foi pedido: a edge para de tentar de novo quando chega aqui. */
export const DESAFIOS_COMPLETOS = POR_TIPO * 2;

const TITULO_PADRAO: Record<TipoDeDesafio, string> = { logica: "Desafio de lógica", cruzadinha: "Cruzadinha" };

type JsonObject = Record<string, unknown>;

function objeto(valor: unknown): JsonObject | null {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as JsonObject) : null;
}

function caracteres(texto: string): number {
  return Array.from(texto).length;
}

/** Texto do modelo aparado. `NUL` sai: o jsonb do Postgres recusa `\u0000`. */
function texto(valor: unknown): string {
  return typeof valor === "string" ? valor.split("\u0000").join("").trim() : "";
}

/** Texto de uma linha só: espaços colapsados. Para alternativa, resposta, pista e título. */
function linha(valor: unknown): string {
  return texto(valor).replace(/\s+/g, " ");
}

/**
 * A forma de comparar da lógica, mais grossa que `fn_missao_desafio_normalizar`: tudo o que o banco
 * iguala esta também iguala (o acento da tabela do banco sai pelo NFD, e aqui sai qualquer marca), e
 * ela ainda junta umas formas que o banco separa. Por isso serve para recusar alternativas
 * repetidas sem deixar passar nenhuma que o banco recusaria. A aceita da múltipla é gravada com o
 * texto da própria alternativa, então a conferência do banco sempre a encontra.
 */
function formaDeComparar(valor: string): string {
  return valor.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * A regra de vazamento da lógica só vale para resposta de 3 caracteres ou mais (na chave). Com 1 ou
 * 2, ela derrubaria quase toda proposta e não protegeria nada: "a", "e" e "o" estão em quase todo
 * enunciado em português, então a resposta "E" de uma sequência cairia pela conjunção; e uma letra
 * ou um número curto solto no enunciado não entrega a resposta, porque não diz que é ela.
 */
function vazaNoEnunciado(enunciado: string, aceita: string): boolean {
  const chave = chaveDoTexto(aceita);
  if (chave.length <= 2) return false;
  // Número só como palavra inteira; o resto também no plural ("índices" entrega "Índice").
  return textoContem(enunciado, aceita, /^[0-9 ]+$/.test(chave));
}

/** O termo aparece no texto como palavra inteira (`inteiro`) ou no começo de uma (o plural também). */
function textoContem(onde: string, termo: string, inteiro: boolean): boolean {
  const chave = chaveDoTexto(termo);
  if (!chave) return false;
  const palheiro = ` ${chaveDoTexto(onde)} `;
  return palheiro.includes(inteiro ? ` ${chave} ` : ` ${chave}`);
}

function titulo(valor: unknown, tipo: TipoDeDesafio): string {
  const limpo = Array.from(linha(valor)).slice(0, MAX_TITULO).join("").trim();
  return limpo || TITULO_PADRAO[tipo];
}

/** FNV-1a de 32 bits sobre as unidades do texto (a chave é ASCII): determinístico e sem dependência. */
function fnv1a(valor: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < valor.length; i += 1) {
    hash ^= valor.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * A certa vai para uma posição que sai do enunciado, não da ordem do modelo: o modelo costuma pôr a
 * certa em primeiro, e a posição a entregaria. As outras mantêm a ordem entre si. Sem `Math.random`,
 * para a mesma resposta do modelo dar a mesma proposta.
 */
function comACertaEm(certa: string, outras: string[], enunciado: string): string[] {
  const posicao = fnv1a(chaveDoTexto(enunciado)) % (outras.length + 1);
  return [...outras.slice(0, posicao), certa, ...outras.slice(posicao)];
}

/** Formas de uma resposta: "a | b" vira duas (a regra da lacuna ensina o modelo a escrever assim). */
function formas(valor: unknown): string[] {
  if (typeof valor !== "string") return [];
  return valor
    .split("|")
    .map(linha)
    .filter((forma) => forma && caracteres(forma) <= MAX_TEXTO);
}

function normalizarLogica(item: unknown, filtro: FiltroDeRepetidas, tituloDoConteudo: string): PropostaDeDesafio | null {
  const registro = objeto(item);
  if (!registro) return null;

  const enunciado = texto(registro.enunciado);
  if (!enunciado || caracteres(enunciado) > MAX_ENUNCIADO) return null;

  let desafio: DesafioLogicaPublico;
  let aceitas: string[];

  if (registro.formato === "multipla") {
    if (!Array.isArray(registro.alternativas) || registro.alternativas.length !== ALTERNATIVAS_DA_MULTIPLA) return null;
    const alternativas = registro.alternativas.map(linha);
    if (alternativas.some((a) => !a || caracteres(a) > MAX_TEXTO)) return null;
    const vistas = new Set(alternativas.map(formaDeComparar));
    if (vistas.size !== alternativas.length) return null;
    const resposta = formaDeComparar(linha(registro.resposta));
    const certa = alternativas.find((a) => formaDeComparar(a) === resposta);
    if (!resposta || !certa) return null;
    const outras = alternativas.filter((a) => a !== certa);
    // O enunciado que cita a certa e nenhuma outra aponta para ela (palavra inteira; ver vazaNoEnunciado).
    const cita = (alternativa: string) => chaveDoTexto(alternativa).length > 2 && textoContem(enunciado, alternativa, true);
    // A outra alternativa só serve de álibi se ela também for citada pela mesma regra: "A" ou "E" casariam
    // com o artigo e a conjunção de quase todo enunciado.
    if (cita(certa) && !outras.some(cita)) return null;
    // O título do conteúdo vai no título da missão, à vista do aluno: a mesma regra, à parte do
    // enunciado (a outra citada no enunciado não desfaz a certa citada sozinha no título).
    const citaNoTitulo = (alternativa: string) =>
      chaveDoTexto(alternativa).length > 2 && textoContem(tituloDoConteudo, alternativa, true);
    if (citaNoTitulo(certa) && !outras.some(citaNoTitulo)) return null;
    desafio = { tipo: "logica", enunciado, formato: "multipla", alternativas: comACertaEm(certa, outras, enunciado) };
    aceitas = [certa];
  } else if (registro.formato === "curta") {
    const principais = formas(registro.resposta);
    if (principais.length === 0) return null;
    const sinonimos = Array.isArray(registro.sinonimos) ? registro.sinonimos.flatMap(formas) : [];
    const vistas = new Set<string>();
    aceitas = [];
    for (const forma of [...principais, ...sinonimos]) {
      const chave = formaDeComparar(forma);
      if (!chave || vistas.has(chave)) continue;
      vistas.add(chave);
      aceitas.push(forma);
      if (aceitas.length >= MAX_ACEITAS) break;
    }
    // O enunciado que já diz a resposta entrega o desafio (regra e exceções em vazaNoEnunciado).
    // Caso aceito: a chave tira a pontuação, então "1,125" vira as palavras "1" e "125", e a resposta
    // "125" derruba o enunciado que cita 1,125. Perde-se um desafio; a resposta não vaza.
    if (aceitas.some((aceita) => vazaNoEnunciado(enunciado, aceita))) return null;
    // O título da missão leva o do conteúdo ("Desafio de lógica: Recursão"): vale a mesma regra.
    if (aceitas.some((aceita) => vazaNoEnunciado(tituloDoConteudo, aceita))) return null;
    desafio = { tipo: "logica", enunciado, formato: "curta" };
  } else {
    return null;
  }

  // Por último: o que foi descartado por outro motivo não ocupa o filtro.
  if (!filtro.aceitar(enunciado)) return null;

  return {
    tipo: "logica",
    titulo: titulo(registro.titulo, "logica"),
    desafio,
    resposta: { aceitas },
    perfis: [...PERFIS_PADRAO.logica],
  };
}

/** As mesmas conferências da RPC sobre a grade montada. `montarCruzadinha` já as cumpre. */
function cabeNoBanco(linhas: number, colunas: number, palavras: PalavraNaGrade[], resposta: Record<string, string>): boolean {
  const lado = (n: number) => Number.isInteger(n) && n >= LADO_MINIMO && n <= LADO_MAXIMO;
  if (!lado(linhas) || !lado(colunas)) return false;
  if (palavras.length < MIN_PALAVRAS || palavras.length > MAX_PALAVRAS) return false;
  const chaves = new Set<string>();
  const celulas = new Map<string, string>();
  for (const p of palavras) {
    if (p.direcao !== "h" && p.direcao !== "v") return false;
    const chave = `${p.numero}${p.direcao}`;
    if (chaves.has(chave) || !Number.isInteger(p.numero) || p.numero < 1) return false;
    chaves.add(chave);
    if (!Number.isInteger(p.linha) || !Number.isInteger(p.coluna) || p.linha < 0 || p.coluna < 0) return false;
    if (!Number.isInteger(p.tamanho) || p.tamanho < 2) return false;
    if (!p.pista.trim() || caracteres(p.pista.trim()) > MAX_TEXTO) return false;
    if (p.direcao === "h" ? p.linha >= linhas || p.coluna + p.tamanho > colunas : p.coluna >= colunas || p.linha + p.tamanho > linhas) {
      return false;
    }
    const letras = letrasDaGrade(resposta[chave] ?? "");
    if (letras.length !== p.tamanho) return false;
    for (let i = 0; i < p.tamanho; i += 1) {
      const celula = p.direcao === "h" ? `${p.linha},${p.coluna + i}` : `${p.linha + i},${p.coluna}`;
      const anterior = celulas.get(celula);
      if (anterior !== undefined && anterior !== letras[i]) return false;
      celulas.set(celula, letras[i]);
    }
  }
  return Object.keys(resposta).length === chaves.size && Object.keys(resposta).every((chave) => chaves.has(chave));
}

function normalizarCruzadinha(item: unknown, tituloDoConteudo: string): PropostaDeDesafio | null {
  const registro = objeto(item);
  if (!registro || !Array.isArray(registro.termos)) return null;

  let candidatas: PalavraComPista[] = [];
  for (const bruto of registro.termos) {
    const termo = objeto(bruto);
    if (!termo) continue;
    const palavra = linha(termo.termo);
    const pista = linha(termo.pista);
    if (!palavra || !pista) continue;
    candidatas.push({ palavra, pista });
  }

  // O termo que o título do conteúdo escreve (nem no plural) está no título da missão, à vista do
  // aluno: a palavra sai antes de montar. Se sobrarem poucas, a grade não monta e a cruzadinha sai.
  candidatas = candidatas.filter((c) => !textoContem(tituloDoConteudo, c.palavra, false));

  // Nenhuma pista pode escrever (nem no plural) o termo de uma palavra da grade, o dela ou o de
  // outra. A palavra dessa pista sai e a grade é montada de novo; cada volta tira uma palavra, então
  // termina. A pista que cita um termo que não entrou na grade não entrega nada e fica.
  for (;;) {
    const grade = montarCruzadinha(candidatas);
    if (!grade) return null;
    const escritoPor = new Map<string, string>();
    for (const c of candidatas) {
      const letras = letrasDaGrade(c.palavra);
      if (!escritoPor.has(letras)) escritoPor.set(letras, c.palavra);
    }
    const entrega = grade.palavras.find((p) =>
      Object.values(grade.resposta).some((letras) =>
        textoContem(p.pista, letras, false) || textoContem(p.pista, escritoPor.get(letras) ?? "", false)
      )
    );
    if (entrega) {
      const fora = grade.resposta[`${entrega.numero}${entrega.direcao}`];
      candidatas = candidatas.filter((c) => letrasDaGrade(c.palavra) !== fora);
      continue;
    }

    // Remontado campo a campo: o que a montagem acrescentar um dia não chega ao aluno sem passar aqui.
    const palavras: PalavraNaGrade[] = grade.palavras.map((p) => ({
      numero: p.numero,
      direcao: p.direcao,
      linha: p.linha,
      coluna: p.coluna,
      tamanho: p.tamanho,
      pista: p.pista,
    }));
    const resposta = { ...grade.resposta };
    if (!cabeNoBanco(grade.linhas, grade.colunas, palavras, resposta)) return null;
    return {
      tipo: "cruzadinha",
      titulo: titulo(registro.titulo, "cruzadinha"),
      desafio: { tipo: "cruzadinha", linhas: grade.linhas, colunas: grade.colunas, palavras },
      resposta: { palavras: resposta },
      perfis: [...PERFIS_PADRAO.cruzadinha],
    };
  }
}

/**
 * A resposta do modelo como propostas. Fica até `POR_TIPO` de cada tipo, na ordem em que vieram; o
 * que o banco recusaria, o repetido (enunciado da lógica, ou a cruzadinha com as mesmas palavras de
 * outra) e a cruzadinha que não monta contam em `descartados`. O filtro
 * vale para o enunciado da lógica (as perguntas que o tópico já tem e as desta geração).
 *
 * `tituloDoConteudo` é o `conteudos.titulo` que `missao_desafio_criar` põe no título da missão. A
 * resposta que ele escreve sai como a que o enunciado escreve.
 */
export function normalizarDesafios(bruto: unknown, filtro: FiltroDeRepetidas, tituloDoConteudo = ""): DesafiosNormalizados {
  const registro = objeto(bruto) ?? {};
  const desafios: PropostaDeDesafio[] = [];
  let descartados = 0;

  const juntar = (itens: unknown, normalizar: (item: unknown) => PropostaDeDesafio | null) => {
    if (!Array.isArray(itens)) return;
    let aceitos = 0;
    for (const item of itens) {
      if (aceitos >= POR_TIPO) break;
      const proposta = normalizar(item);
      if (proposta) {
        desafios.push(proposta);
        aceitos += 1;
      } else {
        descartados += 1;
      }
    }
  };

  juntar(registro.logicas, (item) => normalizarLogica(item, filtro, tituloDoConteudo));
  // A segunda cruzadinha com as mesmas palavras na grade (em qualquer ordem) é a mesma cruzadinha.
  const grades = new Set<string>();
  juntar(registro.cruzadinhas, (item) => {
    const proposta = normalizarCruzadinha(item, tituloDoConteudo);
    if (proposta?.tipo !== "cruzadinha") return null;
    const letras = Object.values(proposta.resposta.palavras).sort().join("|");
    if (grades.has(letras)) return null;
    grades.add(letras);
    return proposta;
  });
  return { desafios, descartados };
}

/**
 * Termos pedidos por cruzadinha. É pedido, não regra: se o modelo ignorar o schema, a montagem
 * aceita de 4 a 10 palavras na grade e corta o resto.
 */
const TERMOS_PEDIDOS = { min: 6, max: 10 } as const;

/**
 * `responseSchema` do Gemini. Campo novo que o normalizador ler entra aqui junto (teste ao lado).
 * Os `minItems`/`maxItems` só orientam o modelo: a múltipla fora de 4 é descartada pelo normalizador.
 */
export const DESAFIOS_SCHEMA = {
  type: "OBJECT",
  required: ["logicas", "cruzadinhas"],
  properties: {
    logicas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["titulo", "enunciado", "formato", "resposta"],
        properties: {
          titulo: { type: "STRING" },
          enunciado: { type: "STRING" },
          formato: { type: "STRING", enum: ["multipla", "curta"] },
          alternativas: { type: "ARRAY", minItems: ALTERNATIVAS_DA_MULTIPLA, maxItems: ALTERNATIVAS_DA_MULTIPLA, items: { type: "STRING" } },
          resposta: { type: "STRING" },
          sinonimos: { type: "ARRAY", items: { type: "STRING" } },
        },
      },
    },
    cruzadinhas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        required: ["titulo", "termos"],
        properties: {
          titulo: { type: "STRING" },
          termos: {
            type: "ARRAY",
            minItems: TERMOS_PEDIDOS.min,
            maxItems: TERMOS_PEDIDOS.max,
            items: {
              type: "OBJECT",
              required: ["termo", "pista"],
              properties: {
                termo: { type: "STRING" },
                pista: { type: "STRING" },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Os blocos que o modo `content` já monta, prontos para o prompt. */
export type ContextoDosDesafios = {
  /** Contexto pedagógico e guia de tema. */
  contexto: string;
  topico: string;
  descricaoDoTopico: string;
  /** Os conteúdos selecionados, um por linha. */
  conteudos: string;
  /** O material do professor e o aviso do material anexado. */
  material: string;
  orientacao: string;
  existentes: string;
  regrasDeTermos: string;
  idioma: string;
  /** Muda a cada tentativa: vai por último, para o começo do pedido ser reaproveitado pelo cache. */
  variacao: string;
};

export function promptDeDesafios(ctx: ContextoDosDesafios): string {
  return `Você é especialista em design instrucional e cria desafios curtos de engajamento a partir de um conteúdo de aula. Os desafios viram missões extras para o aluno: não valem nota.

Retorne SOMENTE JSON válido (sem markdown) com:
- "logicas": exatamente 2 desafios de lógica que exijam raciocínio sobre o que o material ensinou (sequência, dedução, padrão, causa e efeito). Não pergunte definição nem a lembrança literal de uma frase do texto.
  - "formato": "multipla", com exatamente 4 alternativas em "alternativas", só uma correta e em posição variada; ou "curta", sem alternativas, quando a resposta é uma palavra, um número ou um termo curto.
  - "resposta": na múltipla, o texto exato da alternativa correta; na curta, a forma principal da resposta.
  - "sinonimos": só na curta, as outras formas que devem ser aceitas (sinônimo, sigla, número por extenso). Não junte formas com "|" na resposta.
  - O enunciado não pode conter a resposta. Enunciado com até 1000 caracteres; alternativas e respostas com até 200.
  - "titulo": nome curto do desafio, sem numeração.
- "cruzadinhas": exatamente 2 listas, cada uma com 6 a 10 termos do próprio conteúdo em "termos".
  - "termo": a palavra ou a expressão curta que o material usa, de 3 a 15 letras sem contar espaço e hífen.
  - "pista": até 80 caracteres. Leva ao termo sem escrevê-lo (nem no plural) e sem escrever outro termo da mesma lista.
  - As duas listas não repetem termo. Prefira termos que compartilhem letras: a grade é montada por código, e o termo que não cruza fica de fora.
  - "titulo": nome curto da cruzadinha, sem numeração.

Regras obrigatórias:
${ctx.regrasDeTermos}
- Nos desafios, essas regras valem para os termos e as respostas; os sinônimos vão em "sinonimos", nunca na resposta.
- Use só o que está no material e nos conteúdos abaixo.
- Nenhum enunciado pode repetir, nem com outras palavras, uma pergunta que o tópico já tem.
- Não use índices nem prefixos como "Desafio 1" em nenhum campo.
- ${ctx.idioma}
${ctx.contexto}
Tópico de trabalho: "${ctx.topico}"
${ctx.descricaoDoTopico ? `Descrição do tópico: "${ctx.descricaoDoTopico}"` : ""}
Conteúdo selecionado (base obrigatória):
${ctx.conteudos}${ctx.material}
${ctx.orientacao}${ctx.existentes}
Identificador de variação desta tentativa: ${ctx.variacao}
`;
}
