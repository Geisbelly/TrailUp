/**
 * Monta a grade da cruzadinha por código. A IA só propõe as palavras e as pistas; quem decide onde
 * cada palavra fica é esta função, e o banco (`missao_desafio_criar`, 20261117_03) só confere.
 *
 * O banco confere que cada palavra cabe na grade, tem o comprimento do `tamanho` e que toda célula
 * compartilhada recebe a mesma letra. **A numeração ele não confere** (limite registrado na
 * migration): quem garante que a mesma célula inicial tem o mesmo número em h e v, que os números
 * vêm em ordem de leitura e que nenhuma palavra encosta, encavala ou continua outra na mesma direção
 * é a montagem daqui.
 *
 * Sem dependência externa nem API de Deno ou de Node: o arquivo é importado pela edge e pelo console.
 */

export type PalavraComPista = { palavra: string; pista: string };

export type PalavraNaGrade = {
  numero: number;
  direcao: "h" | "v";
  /** Linha e coluna contadas de 0, como o banco espera. */
  linha: number;
  coluna: number;
  tamanho: number;
  pista: string;
};

export type Cruzadinha = {
  linhas: number;
  colunas: number;
  palavras: PalavraNaGrade[];
  /** Chave `${numero}${direcao}`; valor em maiúsculas, sem acento e sem espaço (`letrasDaGrade`). */
  resposta: Record<string, string>;
};

/** Os limites do banco: 4 a 10 palavras, pista de até 200 caracteres, lado de 2 a 40. */
const MIN_PALAVRAS = 4;
const MAX_PALAVRAS = 10;
const MAX_CHARS_PISTA = 200;
const LADO_MAXIMO_DO_BANCO = 40;
const LADO_PADRAO = 15;
/** Palavra de 1 ou 2 letras não serve de pista nem de cruzamento. */
const MIN_LETRAS = 3;

// A mesma tabela de `fn_missao_desafio_letras` (20261117_03), na mesma ordem. Mudou lá, mude aqui.
const ACENTOS_DE = "áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ";
const ACENTOS_PARA = "aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY";

/**
 * Fora da tabela e do ASCII, os únicos caracteres que o `upper` do libc leva para A-Z: `ı` (U+0131) e
 * `ſ` (U+017F). Medido no Postgres 17 local (en_US.utf8) em 18/11, em todos os code points. O ICU de
 * produção também os leva a I e S. Como são letras fora do conjunto aceito, a palavra que os tem nem
 * entra na grade (`soLetrasSeguras`); o mapeamento fica para `letrasDaGrade` seguir o banco.
 */
const MAIUSCULA_FORA_DA_TABELA: Record<string, string> = { "ı": "I", "ſ": "S" };

/**
 * A palavra só entra se toda letra (`\p{L}`) for ASCII ou da tabela de acentos.
 *
 * Produção usa ICU (`datlocprovider = 'i'`, en_US.UTF-8, medido em 18/11, só leitura): lá
 * `upper('ıſßçã')` dá `ISSSÇÃ`. O ICU aplica o mapeamento completo do Unicode, então `ß` vira `SS` e
 * `ﬁ` vira `FI`, e o libc os mantém (e a expressão os descarta). Com uma letra dessas, o banco contaria
 * outras letras, o `tamanho` não bateria e a RPC recusaria a cruzadinha inteira. No conjunto aceito,
 * libc e ICU dão a mesma letra em todo code point (o teste confere).
 */
function soLetrasSeguras(palavra: string): boolean {
  for (const ch of palavra) {
    if (!/\p{L}/u.test(ch)) continue;
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ACENTOS_DE.includes(ch)) continue;
    return false;
  }
  return true;
}

/**
 * As letras que a palavra ocupa na grade, igual a `fn_missao_desafio_letras`:
 * `regexp_replace(upper(translate(p, DE, PARA)), '[^A-Z0-9]', '', 'g')`.
 *
 * É letra por letra, como o banco. Não usa `toUpperCase` na palavra inteira: ele faz `ß` virar `SS`
 * e `ﬁ` virar `FI`, e o banco descarta os dois.
 */
export function letrasDaGrade(palavra: string): string {
  let saida = "";
  for (const original of typeof palavra === "string" ? palavra : "") {
    const indice = ACENTOS_DE.indexOf(original);
    const semAcento = indice >= 0 ? ACENTOS_PARA[indice] : original;
    const maiuscula =
      MAIUSCULA_FORA_DA_TABELA[semAcento] ??
      (semAcento >= "a" && semAcento <= "z" ? semAcento.toUpperCase() : semAcento);
    if ((maiuscula >= "A" && maiuscula <= "Z") || (maiuscula >= "0" && maiuscula <= "9")) saida += maiuscula;
  }
  return saida;
}

type Direcao = "h" | "v";

type Candidata = { letras: string; pista: string; ordem: number };

type Posta = Candidata & { direcao: Direcao; linha: number; coluna: number };

type Celula = { letra: string; h: boolean; v: boolean };

/** Pista limpa: espaços colapsados e aparados, cortada em 200 code points (o `char_length` do banco). */
function limparPista(valor: unknown): string {
  if (typeof valor !== "string") return "";
  const limpa = valor.replace(/\s+/g, " ").trim();
  return Array.from(limpa).slice(0, MAX_CHARS_PISTA).join("").trim();
}

function candidatasDaEntrada(entrada: unknown, maxLado: number): Candidata[] {
  if (!Array.isArray(entrada)) return [];
  const vistas = new Set<string>();
  const saida: Candidata[] = [];
  entrada.forEach((item, ordem) => {
    if (!item || typeof item !== "object") return;
    const { palavra, pista } = item as Record<string, unknown>;
    if (typeof palavra !== "string" || !soLetrasSeguras(palavra)) return;
    const letras = letrasDaGrade(palavra);
    const pistaLimpa = limparPista(pista);
    if (letras.length < MIN_LETRAS || letras.length > maxLado || !pistaLimpa) return;
    // Repetida é a mesma sequência de letras na grade: "Índice" e "indice" ocupam as mesmas casas.
    if (vistas.has(letras)) return;
    vistas.add(letras);
    saida.push({ letras, pista: pistaLimpa, ordem });
  });
  // Maior primeiro; no empate, a ordem de entrada.
  return saida.sort((a, b) => b.letras.length - a.letras.length || a.ordem - b.ordem);
}

const chaveDaCelula = (linha: number, coluna: number) => `${linha},${coluna}`;

function passo(direcao: Direcao): [number, number] {
  return direcao === "h" ? [0, 1] : [1, 0];
}

class Grade {
  readonly celulas = new Map<string, Celula>();
  readonly postas: Posta[] = [];
  minLinha = 0;
  maxLinha = -1;
  minColuna = 0;
  maxColuna = -1;

  constructor(private readonly maxLado: number) {}

  private letraEm(linha: number, coluna: number): Celula | undefined {
    return this.celulas.get(chaveDaCelula(linha, coluna));
  }

  /**
   * Quantas células a palavra compartilha se for posta aqui, ou -1 se não puder. Recusa:
   * - letra diferente numa célula ocupada;
   * - célula já ocupada por uma palavra na mesma direção (uma dentro da outra);
   * - casa antes do início ou depois do fim ocupada (uma continuando a outra);
   * - célula nova com vizinha ocupada dos lados (palavra paralela encostada);
   * - grade passando de `maxLado`.
   */
  avaliar(letras: string, direcao: Direcao, linha: number, coluna: number): number {
    const [dl, dc] = passo(direcao);
    const fimLinha = linha + dl * (letras.length - 1);
    const fimColuna = coluna + dc * (letras.length - 1);
    if (this.postas.length > 0) {
      const altura = Math.max(this.maxLinha, fimLinha) - Math.min(this.minLinha, linha) + 1;
      const largura = Math.max(this.maxColuna, fimColuna) - Math.min(this.minColuna, coluna) + 1;
      if (altura > this.maxLado || largura > this.maxLado) return -1;
    } else if (letras.length > this.maxLado) {
      return -1;
    }
    if (this.letraEm(linha - dl, coluna - dc) || this.letraEm(fimLinha + dl, fimColuna + dc)) return -1;

    let cruzamentos = 0;
    for (let i = 0; i < letras.length; i += 1) {
      const l = linha + dl * i;
      const c = coluna + dc * i;
      const atual = this.letraEm(l, c);
      if (atual) {
        if (atual.letra !== letras[i] || atual[direcao]) return -1;
        cruzamentos += 1;
        continue;
      }
      // Vizinhas dos lados, perpendiculares à direção da palavra.
      if (this.letraEm(l + dc, c + dl) || this.letraEm(l - dc, c - dl)) return -1;
    }
    return cruzamentos;
  }

  por(candidata: Candidata, direcao: Direcao, linha: number, coluna: number) {
    const [dl, dc] = passo(direcao);
    for (let i = 0; i < candidata.letras.length; i += 1) {
      const l = linha + dl * i;
      const c = coluna + dc * i;
      const chave = chaveDaCelula(l, c);
      const celula = this.celulas.get(chave) ?? { letra: candidata.letras[i], h: false, v: false };
      celula[direcao] = true;
      this.celulas.set(chave, celula);
    }
    const fimLinha = linha + dl * (candidata.letras.length - 1);
    const fimColuna = coluna + dc * (candidata.letras.length - 1);
    if (this.postas.length === 0) {
      [this.minLinha, this.maxLinha, this.minColuna, this.maxColuna] = [linha, fimLinha, coluna, fimColuna];
    } else {
      this.minLinha = Math.min(this.minLinha, linha);
      this.maxLinha = Math.max(this.maxLinha, fimLinha);
      this.minColuna = Math.min(this.minColuna, coluna);
      this.maxColuna = Math.max(this.maxColuna, fimColuna);
    }
    this.postas.push({ ...candidata, direcao, linha, coluna });
  }

  /**
   * O melhor lugar para a palavra: o cruzamento com mais células compartilhadas; no empate, o
   * primeiro na ordem das palavras já postas, depois a letra da palavra nova e depois a da posta.
   */
  melhorLugar(candidata: Candidata): { direcao: Direcao; linha: number; coluna: number } | null {
    let melhor: { direcao: Direcao; linha: number; coluna: number } | null = null;
    let melhorCruzamentos = 0;
    for (const posta of this.postas) {
      const direcao: Direcao = posta.direcao === "h" ? "v" : "h";
      const [pdl, pdc] = passo(posta.direcao);
      const [dl, dc] = passo(direcao);
      for (let i = 0; i < candidata.letras.length; i += 1) {
        for (let j = 0; j < posta.letras.length; j += 1) {
          if (candidata.letras[i] !== posta.letras[j]) continue;
          const linha = posta.linha + pdl * j - dl * i;
          const coluna = posta.coluna + pdc * j - dc * i;
          const cruzamentos = this.avaliar(candidata.letras, direcao, linha, coluna);
          if (cruzamentos > melhorCruzamentos) {
            melhorCruzamentos = cruzamentos;
            melhor = { direcao, linha, coluna };
          }
        }
      }
    }
    return melhor;
  }
}

/**
 * Posiciona as palavras pelo guloso de maior palavra:
 * - a maior vai na horizontal, como âncora; se com ela não saem 4 palavras, a âncora passa a ser a
 *   seguinte na ordem, e vale o primeiro resultado com 4 ou mais;
 * - cada seguinte entra no cruzamento perpendicular com mais células compartilhadas;
 * - a que não cruza fica para uma nova passada (outra palavra posta depois pode abrir lugar) e, se
 *   nenhuma passada a encaixar, é descartada.
 *
 * Ignora palavra com menos de 3 letras, mais longa que `maxLado`, sem pista, repetida (mesmas
 * letras na grade) ou com letra fora do ASCII e da tabela de acentos (`soLetrasSeguras`). Para em 10 palavras. Devolve `null` com menos de 4 palavras postas: cruzadinha
 * `null` não é proposta.
 */
export function montarCruzadinha(entrada: PalavraComPista[], opcoes?: { maxLado?: number }): Cruzadinha | null {
  const pedido = Math.floor(Number(opcoes?.maxLado ?? LADO_PADRAO));
  const maxLado = Number.isFinite(pedido)
    ? Math.min(LADO_MAXIMO_DO_BANCO, Math.max(MIN_LETRAS, pedido))
    : LADO_PADRAO;

  const candidatas = candidatasDaEntrada(entrada, maxLado);
  if (candidatas.length < MIN_PALAVRAS) return null;

  // Âncora: a mais longa. Se com ela não saem 4 palavras, a seguinte, na ordem; vale a primeira que der.
  // Toda âncora é tentada: a de trás ainda usa as palavras da frente dela.
  for (let ancora = 0; ancora < candidatas.length; ancora += 1) {
    const grade = posicionar(candidatas, ancora, maxLado);
    if (grade.postas.length >= MIN_PALAVRAS) return numerar(grade);
  }
  return null;
}

/** A âncora na horizontal e as outras, na ordem, pelo guloso; a que não cruza volta na passada seguinte. */
function posicionar(candidatas: Candidata[], ancora: number, maxLado: number): Grade {
  const grade = new Grade(maxLado);
  grade.por(candidatas[ancora], "h", 0, 0);

  let pendentes = candidatas.filter((_, i) => i !== ancora);
  let avancou = true;
  while (avancou && pendentes.length > 0 && grade.postas.length < MAX_PALAVRAS) {
    avancou = false;
    const sobraram: Candidata[] = [];
    for (const candidata of pendentes) {
      if (grade.postas.length >= MAX_PALAVRAS) break;
      const lugar = grade.melhorLugar(candidata);
      if (!lugar) {
        sobraram.push(candidata);
        continue;
      }
      grade.por(candidata, lugar.direcao, lugar.linha, lugar.coluna);
      avancou = true;
    }
    pendentes = sobraram;
  }
  return grade;
}

function numerar(grade: Grade): Cruzadinha {
  // Apara: a grade começa na primeira linha e na primeira coluna com letra.
  const postas = grade.postas.map((p) => ({ ...p, linha: p.linha - grade.minLinha, coluna: p.coluna - grade.minColuna }));

  // Numeração em ordem de leitura, por célula inicial: h e v que começam na mesma célula dividem o número.
  const inicios = [...new Set(postas.map((p) => chaveDaCelula(p.linha, p.coluna)))]
    .map((chave) => chave.split(",").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const numeroDoInicio = new Map(inicios.map(([l, c], i) => [chaveDaCelula(l, c), i + 1]));

  const palavras: PalavraNaGrade[] = postas
    .map((p) => ({
      numero: numeroDoInicio.get(chaveDaCelula(p.linha, p.coluna))!,
      direcao: p.direcao,
      linha: p.linha,
      coluna: p.coluna,
      tamanho: p.letras.length,
      pista: p.pista,
    }))
    .sort((a, b) => a.numero - b.numero || (a.direcao === b.direcao ? 0 : a.direcao === "h" ? -1 : 1));

  const resposta: Record<string, string> = {};
  for (const p of postas) {
    resposta[`${numeroDoInicio.get(chaveDaCelula(p.linha, p.coluna))}${p.direcao}`] = p.letras;
  }

  return {
    linhas: grade.maxLinha - grade.minLinha + 1,
    colunas: grade.maxColuna - grade.minColuna + 1,
    palavras,
    resposta,
  };
}
