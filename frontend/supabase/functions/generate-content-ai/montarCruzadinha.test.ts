import { describe, expect, it } from "vitest";
import { type Cruzadinha, type PalavraComPista, letrasDaGrade, montarCruzadinha } from "./montarCruzadinha";

// A tabela de `fn_missao_desafio_letras` (20261117_03), copiada aqui de propósito: se alguém mexer na
// do módulo, este teste tem de quebrar.
const ACENTOS_DE = "áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ";
const ACENTOS_PARA = "aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY";

/**
 * O que a expressão do banco devolve para cada code point com o `upper` do libc, medido no Postgres 17
 * local (en_US.utf8) em 18/11 sobre todos os code points de 1 a U+10FFFF: fora de A-Z, a-z e 0-9, só a
 * tabela de acentos e dois caracteres geram letra, `ı` (U+0131) e `ſ` (U+017F), que viram I e S.
 */
function letraEsperadaNoLibc(cp: number): string {
  const ch = String.fromCodePoint(cp);
  if (/^[0-9A-Z]$/.test(ch)) return ch;
  if (/^[a-z]$/.test(ch)) return ch.toUpperCase();
  const i = ACENTOS_DE.indexOf(ch);
  if (i >= 0) return ACENTOS_PARA[i].toUpperCase();
  if (cp === 0x131) return "I";
  if (cp === 0x17f) return "S";
  return "";
}

/**
 * O mesmo com o `upper` do ICU, que é o de produção (`datlocprovider = 'i'`, en_US.UTF-8, medido em
 * 18/11: `upper('ıſßçã')` deu `ISSSÇÃ`). O ICU usa o mapeamento completo do Unicode, o mesmo do
 * `toUpperCase` do JS: `ß` vira `SS` e `ﬁ` vira `FI`.
 */
function letraEsperadaNoIcu(cp: number): string {
  const ch = String.fromCodePoint(cp);
  const i = ACENTOS_DE.indexOf(ch);
  return (i >= 0 ? ACENTOS_PARA[i] : ch).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** O conjunto aceito por `montarCruzadinha`: o que não é letra, a letra ASCII e a letra da tabela. */
function aceitoNaGrade(cp: number): boolean {
  const ch = String.fromCodePoint(cp);
  return !/\p{L}/u.test(ch) || /^[A-Za-z]$/.test(ch) || ACENTOS_DE.includes(ch);
}

const VOCABULARIO: PalavraComPista[] = [
  { palavra: "Normalização", pista: "Processo que reduz redundância nas tabelas." },
  { palavra: "Chave primária", pista: "Identifica cada linha de forma única." },
  { palavra: "Tabela", pista: "Estrutura com linhas e colunas." },
  { palavra: "Índice", pista: "Acelera a busca por uma coluna." },
  { palavra: "Consulta", pista: "Pedido de dados ao banco." },
  { palavra: "Coluna", pista: "Atributo de uma tabela." },
  { palavra: "Registro", pista: "Outro nome para a linha." },
  { palavra: "Atributo", pista: "Característica de uma entidade." },
];

type Celula = string;
const celula = (l: number, c: number): Celula => `${l},${c}`;

/** As células de cada palavra, com a letra que a resposta põe nelas. */
function celulasDasPalavras(cruz: Cruzadinha) {
  return cruz.palavras.map((p) => {
    const letras = cruz.resposta[`${p.numero}${p.direcao}`];
    return Array.from({ length: p.tamanho }, (_, i) => ({
      l: p.linha + (p.direcao === "v" ? i : 0),
      c: p.coluna + (p.direcao === "h" ? i : 0),
      letra: letras[i],
    }));
  });
}

/** O mapa célula → letra, falhando se duas palavras discordarem numa célula. */
function mapaDaGrade(cruz: Cruzadinha): Map<Celula, string> {
  const mapa = new Map<Celula, string>();
  for (const celulas of celulasDasPalavras(cruz)) {
    for (const { l, c, letra } of celulas) {
      const atual = mapa.get(celula(l, c));
      if (atual !== undefined) expect(atual).toBe(letra);
      mapa.set(celula(l, c), letra);
    }
  }
  return mapa;
}

/** As mesmas checagens de `missao_desafio_criar` na cruzadinha, para o banco nunca recusar a saída. */
function conferirComoOBanco(cruz: Cruzadinha) {
  expect(cruz.linhas).toBeGreaterThanOrEqual(2);
  expect(cruz.linhas).toBeLessThanOrEqual(40);
  expect(cruz.colunas).toBeGreaterThanOrEqual(2);
  expect(cruz.colunas).toBeLessThanOrEqual(40);
  expect(cruz.palavras.length).toBeGreaterThanOrEqual(4);
  expect(cruz.palavras.length).toBeLessThanOrEqual(10);
  const chaves = cruz.palavras.map((p) => `${p.numero}${p.direcao}`);
  expect(new Set(chaves).size).toBe(chaves.length);
  expect(Object.keys(cruz.resposta).sort()).toEqual([...chaves].sort());
  for (const p of cruz.palavras) {
    expect(Number.isInteger(p.numero) && p.numero >= 1).toBe(true);
    expect(["h", "v"]).toContain(p.direcao);
    expect(p.linha).toBeGreaterThanOrEqual(0);
    expect(p.coluna).toBeGreaterThanOrEqual(0);
    expect(p.tamanho).toBeGreaterThanOrEqual(2);
    const pista = p.pista.trim();
    expect(Array.from(pista).length).toBeGreaterThanOrEqual(1);
    expect(Array.from(pista).length).toBeLessThanOrEqual(200);
    if (p.direcao === "h") {
      expect(p.linha).toBeLessThan(cruz.linhas);
      expect(p.coluna + p.tamanho).toBeLessThanOrEqual(cruz.colunas);
    } else {
      expect(p.coluna).toBeLessThan(cruz.colunas);
      expect(p.linha + p.tamanho).toBeLessThanOrEqual(cruz.linhas);
    }
    const resposta = cruz.resposta[`${p.numero}${p.direcao}`];
    expect(letrasDaGrade(resposta)).toBe(resposta);
    expect(resposta.length).toBe(p.tamanho);
  }
  mapaDaGrade(cruz);
}

/**
 * Toda sequência de 2 ou mais letras seguidas numa direção é exatamente uma palavra daquela direção.
 * Pega palavra paralela encostada, uma dentro da outra e uma continuando a outra sem casa vazia.
 */
function sequenciasDaGrade(cruz: Cruzadinha, direcao: "h" | "v"): string[] {
  const mapa = mapaDaGrade(cruz);
  const externas = direcao === "h" ? cruz.linhas : cruz.colunas;
  const internas = direcao === "h" ? cruz.colunas : cruz.linhas;
  const achadas: string[] = [];
  for (let a = 0; a < externas; a += 1) {
    let inicio = -1;
    for (let b = 0; b <= internas; b += 1) {
      const [l, c] = direcao === "h" ? [a, b] : [b, a];
      const cheia = b < internas && mapa.has(celula(l, c));
      if (cheia && inicio < 0) inicio = b;
      if (!cheia && inicio >= 0) {
        if (b - inicio >= 2) {
          const [li, ci] = direcao === "h" ? [a, inicio] : [inicio, a];
          achadas.push(`${li},${ci},${b - inicio}`);
        }
        inicio = -1;
      }
    }
  }
  return achadas.sort();
}

function conferirSequencias(cruz: Cruzadinha) {
  for (const direcao of ["h", "v"] as const) {
    const declaradas = cruz.palavras
      .filter((p) => p.direcao === direcao)
      .map((p) => `${p.linha},${p.coluna},${p.tamanho}`)
      .sort();
    expect(sequenciasDaGrade(cruz, direcao)).toEqual(declaradas);
  }
}

describe("letrasDaGrade", () => {
  it("normaliza acento e espaço", () => {
    expect(letrasDaGrade("CORAÇÃO")).toBe("CORACAO");
    expect(letrasDaGrade("Coração")).toBe("CORACAO");
    expect(letrasDaGrade("banco de dados")).toBe("BANCODEDADOS");
    expect(letrasDaGrade("  Chave primária ")).toBe("CHAVEPRIMARIA");
  });

  it("tira hífen e pontuação e mantém dígito", () => {
    expect(letrasDaGrade("guarda-chuva")).toBe("GUARDACHUVA");
    expect(letrasDaGrade("IPv6")).toBe("IPV6");
    expect(letrasDaGrade("Web 2.0")).toBe("WEB20");
    expect(letrasDaGrade("C++")).toBe("C");
    expect(letrasDaGrade("")).toBe("");
  });

  it("fora do conjunto aceito, segue o libc (e montarCruzadinha descarta a palavra)", () => {
    // No libc, ß e ﬁ saem; no ICU de produção viram SS e FI. Por isso a palavra que os tem não entra
    // na grade, e o valor daqui não chega ao banco.
    expect(letrasDaGrade("straße")).toBe("STRAE");
    expect(letrasDaGrade("ﬁo")).toBe("O");
    expect(letrasDaGrade("\u0130\u212A")).toBe(""); // U+0130 e o sinal de Kelvin (U+212A) saem, como no banco
  });

  it("no conjunto aceito, dá a mesma letra que fn_missao_desafio_letras no libc e no ICU", () => {
    const divergentes: string[] = [];
    let aceitos = 0;
    for (let cp = 1; cp <= 0x10ffff; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      if (!aceitoNaGrade(cp)) continue;
      aceitos += 1;
      const letras = letrasDaGrade(String.fromCodePoint(cp));
      if (letras !== letraEsperadaNoLibc(cp) || letras !== letraEsperadaNoIcu(cp)) divergentes.push(cp.toString(16));
    }
    expect(divergentes).toEqual([]);
    expect(aceitos).toBeGreaterThan(900_000);
  });

  it("fora do conjunto aceito, libc e ICU divergem em algum caractere: é por isso que a palavra sai", () => {
    expect(letraEsperadaNoLibc(0xdf)).toBe(""); // ß
    expect(letraEsperadaNoIcu(0xdf)).toBe("SS");
    expect(letraEsperadaNoLibc(0xfb01)).toBe(""); // ﬁ
    expect(letraEsperadaNoIcu(0xfb01)).toBe("FI");
  });

  it("é letra por letra: a palavra inteira é a concatenação das letras", () => {
    const texto = "Ação-ſımples Ÿ ñ 42 ";
    const porLetra = Array.from(texto, (ch) => letrasDaGrade(ch)).join("");
    expect(letrasDaGrade(texto)).toBe(porLetra);
    expect(letrasDaGrade(texto)).toBe("ACAOSIMPLESN42");
  });
});

describe("montarCruzadinha", () => {
  it("monta uma grade que o banco aceita", () => {
    const cruz = montarCruzadinha(VOCABULARIO);
    expect(cruz).not.toBeNull();
    conferirComoOBanco(cruz!);
  });

  it("devolve null com menos de 4 palavras posicionadas", () => {
    expect(montarCruzadinha([])).toBeNull();
    expect(montarCruzadinha(VOCABULARIO.slice(0, 3))).toBeNull();
    // Cinco palavras, mas só três cruzam: QWYZ e XKFJ não têm letra em comum com nenhuma outra.
    expect(
      montarCruzadinha([
        { palavra: "Tabela", pista: "a" },
        { palavra: "Coluna", pista: "b" },
        { palavra: "Banco", pista: "c" },
        { palavra: "QWYZ", pista: "d" },
        { palavra: "XKFJ", pista: "e" },
      ]),
    ).toBeNull();
  });

  it("toda célula compartilhada tem a mesma letra", () => {
    const cruz = montarCruzadinha(VOCABULARIO)!;
    const mapa = new Map<Celula, string>();
    let compartilhadas = 0;
    for (const celulas of celulasDasPalavras(cruz)) {
      for (const { l, c, letra } of celulas) {
        const atual = mapa.get(celula(l, c));
        if (atual !== undefined) {
          compartilhadas += 1;
          expect(atual).toBe(letra);
        }
        mapa.set(celula(l, c), letra);
      }
    }
    // Toda palavra depois da primeira cruza ao menos uma: há pelo menos (n - 1) cruzamentos.
    expect(compartilhadas).toBeGreaterThanOrEqual(cruz.palavras.length - 1);
  });

  it("descarta palavra que não cruza e mantém as outras", () => {
    const cruz = montarCruzadinha([...VOCABULARIO.slice(0, 5), { palavra: "QWJX", pista: "Sem letra em comum." }])!;
    expect(cruz).not.toBeNull();
    const respostas = Object.values(cruz.resposta);
    expect(respostas).not.toContain("QWJX");
    expect(respostas.sort()).toEqual(["CHAVEPRIMARIA", "CONSULTA", "INDICE", "NORMALIZACAO", "TABELA"]);
    expect(cruz.palavras.map((p) => p.pista)).not.toContain("Sem letra em comum.");
  });

  it("normaliza acento e espaço na resposta e no tamanho", () => {
    const cruz = montarCruzadinha([
      { palavra: "Coração", pista: "Órgão que bombeia o sangue." },
      { palavra: "banco de dados", pista: "Onde os dados ficam guardados." },
      { palavra: "Artéria", pista: "Leva o sangue do coração." },
      { palavra: "Sangue", pista: "Circula pelo corpo." },
      { palavra: "Oxigênio", pista: "O sangue o leva às células." },
    ])!;
    expect(cruz).not.toBeNull();
    const respostas = Object.values(cruz.resposta);
    expect(respostas).toContain("CORACAO");
    expect(respostas).toContain("BANCODEDADOS");
    for (const p of cruz.palavras) {
      const resposta = cruz.resposta[`${p.numero}${p.direcao}`];
      expect(resposta).toMatch(/^[A-Z0-9]+$/);
      expect(resposta.length).toBe(p.tamanho);
    }
    const coracao = cruz.palavras.find((p) => cruz.resposta[`${p.numero}${p.direcao}`] === "CORACAO")!;
    expect(coracao.tamanho).toBe(7);
    conferirComoOBanco(cruz);
  });

  it("ignora palavra repetida e palavra com menos de 3 letras", () => {
    const cruz = montarCruzadinha([
      ...VOCABULARIO.slice(0, 5),
      { palavra: "tabela", pista: "Repetida sem caixa." },
      { palavra: "TABELA ", pista: "Repetida com espaço." },
      { palavra: "Indice", pista: "Repetida sem acento." },
      { palavra: "BD", pista: "Curta demais." },
      { palavra: "a-b", pista: "Duas letras depois de limpar." },
      { palavra: "Consulta", pista: "   " },
    ])!;
    const respostas = Object.values(cruz.resposta);
    expect(respostas.filter((r) => r === "TABELA")).toHaveLength(1);
    expect(respostas.filter((r) => r === "INDICE")).toHaveLength(1);
    expect(respostas).not.toContain("BD");
    expect(respostas).not.toContain("AB");
    const pistas = cruz.palavras.map((p) => p.pista);
    expect(pistas).toContain("Estrutura com linhas e colunas.");
    expect(pistas).not.toContain("Repetida sem caixa.");
    expect(pistas).not.toContain("Repetida sem acento.");
  });

  it("descarta palavra sem pista e corta a pista em 200 caracteres", () => {
    const longa = "á".repeat(250);
    const cruz = montarCruzadinha([
      { palavra: "Tabela", pista: longa },
      { palavra: "Coluna", pista: "" },
      ...VOCABULARIO.slice(0, 2),
      ...VOCABULARIO.slice(3, 6),
    ])!;
    const tabela = cruz.palavras.find((p) => cruz.resposta[`${p.numero}${p.direcao}`] === "TABELA")!;
    expect(tabela.pista).toBe("á".repeat(200));
    // "Coluna" sem pista não entra; a outra "Coluna", com pista, entra.
    const colunas = cruz.palavras.filter((p) => cruz.resposta[`${p.numero}${p.direcao}`] === "COLUNA");
    expect(colunas.map((p) => p.pista)).toEqual(["Atributo de uma tabela."]);
    conferirComoOBanco(cruz);
  });

  it("numeração em ordem de leitura, e a mesma célula inicial tem o mesmo número para h e v", () => {
    const entradas = [VOCABULARIO, VOCABULARIO.slice().reverse(), VOCABULARIO.slice(2)];
    let inicioCompartilhado = 0;
    for (const entrada of entradas) {
      const cruz = montarCruzadinha(entrada)!;
      const porInicio = new Map<Celula, number>();
      for (const p of cruz.palavras) {
        const chave = celula(p.linha, p.coluna);
        const visto = porInicio.get(chave);
        if (visto !== undefined) {
          inicioCompartilhado += 1;
          expect(p.numero).toBe(visto);
        }
        porInicio.set(chave, p.numero);
      }
      // Números distintos ↔ células iniciais distintas, de 1 a n, na ordem linha a linha, coluna a coluna.
      const inicios = [...porInicio.entries()].sort(([a], [b]) => {
        const [la, ca] = a.split(",").map(Number);
        const [lb, cb] = b.split(",").map(Number);
        return la - lb || ca - cb;
      });
      expect(inicios.map(([, numero]) => numero)).toEqual(inicios.map((_, i) => i + 1));
    }
    // Garante que o caso "h e v na mesma célula" foi exercitado por pelo menos uma das entradas.
    const cruzComum = montarCruzadinha([
      { palavra: "CASA", pista: "a" },
      { palavra: "CAMA", pista: "b" },
      { palavra: "SALA", pista: "c" },
      { palavra: "MALA", pista: "d" },
    ]);
    if (cruzComum) {
      for (const p of cruzComum.palavras) {
        const outra = cruzComum.palavras.find(
          (q) => q !== p && q.linha === p.linha && q.coluna === p.coluna,
        );
        if (outra) {
          inicioCompartilhado += 1;
          expect(outra.numero).toBe(p.numero);
        }
      }
    }
    expect(inicioCompartilhado).toBeGreaterThan(0);
  });

  it("devolve as palavras pela numeração, h antes de v", () => {
    const cruz = montarCruzadinha(VOCABULARIO)!;
    const ordem = cruz.palavras.map((p) => [p.numero, p.direcao] as const);
    const ordenada = [...ordem].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));
    expect(ordem).toEqual(ordenada);
  });

  it("nenhuma palavra encosta, encavala ou continua outra na mesma direção", () => {
    const entradas: PalavraComPista[][] = [
      VOCABULARIO,
      VOCABULARIO.slice().reverse(),
      [
        { palavra: "BANCO", pista: "a" },
        { palavra: "BANCO DE DADOS", pista: "b" },
        { palavra: "DADOS", pista: "c" },
        { palavra: "SQL", pista: "d" },
        { palavra: "LINHA", pista: "e" },
        { palavra: "ANO", pista: "f" },
        { palavra: "NADA", pista: "g" },
        { palavra: "SALA", pista: "h" },
        { palavra: "ASA", pista: "i" },
        { palavra: "OLA", pista: "j" },
      ],
      ["ARARA", "ARAR", "RARA", "ARA", "ARAR", "RAIA", "AIA", "ARIA"].map((palavra, i) => ({
        palavra,
        pista: `pista ${i}`,
      })),
    ];
    let conferidas = 0;
    for (const entrada of entradas) {
      const cruz = montarCruzadinha(entrada);
      if (!cruz) continue;
      conferidas += 1;
      conferirComoOBanco(cruz);
      conferirSequencias(cruz);
    }
    expect(conferidas).toBeGreaterThanOrEqual(3);
  });

  it("em 300 entradas sorteadas, toda grade passa no banco, na numeração e na vizinhança", () => {
    // Gerador fixo (LCG): a mesma semente dá as mesmas entradas a cada rodada.
    let semente = 20261118;
    const sortear = (n: number) => {
      semente = (semente * 1103515245 + 12345) % 2147483648;
      return semente % n;
    };
    // Alfabeto pequeno, para haver muito cruzamento e muita chance de encostar.
    const alfabeto = "AEIOSRNTLC";
    let montadas = 0;
    for (let rodada = 0; rodada < 300; rodada += 1) {
      const entrada = Array.from({ length: 4 + sortear(9) }, (_, i) => ({
        palavra: Array.from({ length: 3 + sortear(8) }, () => alfabeto[sortear(alfabeto.length)]).join(""),
        pista: `pista ${i}`,
      }));
      const cruz = montarCruzadinha(entrada, { maxLado: 8 + sortear(8) });
      if (!cruz) continue;
      montadas += 1;
      conferirComoOBanco(cruz);
      conferirSequencias(cruz);
      const porInicio = new Map<Celula, number>();
      for (const p of cruz.palavras) {
        const chave = celula(p.linha, p.coluna);
        expect(porInicio.get(chave) ?? p.numero).toBe(p.numero);
        porInicio.set(chave, p.numero);
      }
      const ordem = [...porInicio.entries()].sort(([a], [b]) => {
        const [la, ca] = a.split(",").map(Number);
        const [lb, cb] = b.split(",").map(Number);
        return la - lb || ca - cb;
      });
      expect(ordem.map(([, n]) => n)).toEqual(ordem.map((_, i) => i + 1));
    }
    expect(montadas).toBeGreaterThan(200);
  });

  it("descarta palavra com letra que o banco converte diferente: Straße", () => {
    const base = VOCABULARIO.slice(0, 5);
    const controle = montarCruzadinha([...base, { palavra: "Strae", pista: "Controle sem ß." }])!;
    expect(Object.values(controle.resposta)).toContain("STRAE");
    const cruz = montarCruzadinha([...base, { palavra: "Straße", pista: "Rua, em alemão." }])!;
    const respostas = Object.values(cruz.resposta);
    expect(respostas).not.toContain("STRAE");
    expect(respostas).not.toContain("STRASSE");
    expect(cruz.palavras.map((p) => p.pista)).not.toContain("Rua, em alemão.");
  });

  it("descarta palavra com letra que o banco converte diferente: ﬁo e ﬁltro", () => {
    const base = VOCABULARIO.slice(0, 5);
    const controle = montarCruzadinha([...base, { palavra: "filtro", pista: "Controle sem ligadura." }])!;
    expect(Object.values(controle.resposta)).toContain("FILTRO");
    const cruz = montarCruzadinha([
      ...base,
      { palavra: "ﬁo", pista: "Com ligadura, curta." },
      { palavra: "ﬁltro", pista: "Com ligadura." },
    ])!;
    const respostas = Object.values(cruz.resposta);
    for (const r of ["O", "FIO", "LTRO", "FILTRO"]) expect(respostas).not.toContain(r);
    const pistas = cruz.palavras.map((p) => p.pista);
    expect(pistas).not.toContain("Com ligadura.");
    expect(pistas).not.toContain("Com ligadura, curta.");
  });

  it("descarta toda palavra com letra fora do ASCII e da tabela de acentos", () => {
    const fora = ["Ærøskøbing", "İstanbul", "ıslak", "ſtern", "\u212Aelvin", "Ÿonne", "Łódź", "Ωmega"];
    const cruz = montarCruzadinha([
      ...VOCABULARIO.slice(0, 5),
      ...fora.map((palavra) => ({ palavra, pista: `fora: ${palavra}` })),
    ])!;
    expect(cruz.palavras.map((p) => p.pista).filter((p) => p.startsWith("fora:"))).toEqual([]);
    // Acento da tabela, dígito, espaço e hífen continuam aceitos.
    const dentro = montarCruzadinha([
      ...VOCABULARIO.slice(0, 4),
      { palavra: "Ação-2", pista: "dentro" },
    ]);
    expect(dentro?.palavras.map((p) => p.pista)).toContain("dentro");
  });

  it("troca de âncora quando a mais longa não cruza com nenhuma", () => {
    const entrada = ["XYZWXYZW", "CASA", "CAMA", "SALA", "MALA"].map((palavra, i) => ({ palavra, pista: `pista ${i}` }));
    const cruz = montarCruzadinha(entrada);
    expect(cruz).not.toBeNull();
    expect(Object.values(cruz!.resposta)).not.toContain("XYZWXYZW");
    expect(Object.values(cruz!.resposta).sort()).toEqual(["CAMA", "CASA", "MALA", "SALA"]);
    conferirComoOBanco(cruz!);
    conferirSequencias(cruz!);
    expect(montarCruzadinha(entrada)).toEqual(cruz);
  });

  it("passa por várias âncoras, na ordem, até uma que monte", () => {
    // As três mais longas não cruzam com nada; a 4ª âncora (CASA) é a primeira que monta.
    const entrada = ["XYZWXYZW", "QJXQJXQ", "WYWYWY", "CASA", "CAMA", "SALA", "MALA"].map((palavra, i) => ({
      palavra,
      pista: `pista ${i}`,
    }));
    const cruz = montarCruzadinha(entrada);
    expect(cruz).not.toBeNull();
    expect(Object.values(cruz!.resposta).sort()).toEqual(["CAMA", "CASA", "MALA", "SALA"]);
  });

  it("no máximo 10 palavras, o teto do banco", () => {
    const muitas = [
      ...VOCABULARIO,
      { palavra: "Relacionamento", pista: "Ligação entre entidades." },
      { palavra: "Entidade", pista: "Algo do mundo real modelado." },
      { palavra: "Transação", pista: "Unidade de trabalho atômica." },
      { palavra: "Esquema", pista: "Estrutura lógica do banco." },
      { palavra: "Gatilho", pista: "Roda sozinho num evento." },
      { palavra: "Visão", pista: "Consulta guardada com nome." },
    ];
    const cruz = montarCruzadinha(muitas)!;
    expect(cruz.palavras.length).toBe(10);
    conferirComoOBanco(cruz);
    conferirSequencias(cruz);
  });

  it("grade cabe em maxLado (padrão 15) e é aparada sem borda vazia", () => {
    for (const maxLado of [undefined, 15, 9]) {
      const cruz = montarCruzadinha(VOCABULARIO, maxLado === undefined ? undefined : { maxLado });
      expect(cruz).not.toBeNull();
      const limite = maxLado ?? 15;
      expect(cruz!.linhas).toBeLessThanOrEqual(limite);
      expect(cruz!.colunas).toBeLessThanOrEqual(limite);
      const mapa = mapaDaGrade(cruz!);
      const cheia = (l: number, c: number) => mapa.has(celula(l, c));
      const linhaTem = (l: number) => Array.from({ length: cruz!.colunas }, (_, c) => cheia(l, c)).some(Boolean);
      const colunaTem = (c: number) => Array.from({ length: cruz!.linhas }, (_, l) => cheia(l, c)).some(Boolean);
      expect(linhaTem(0)).toBe(true);
      expect(linhaTem(cruz!.linhas - 1)).toBe(true);
      expect(colunaTem(0)).toBe(true);
      expect(colunaTem(cruz!.colunas - 1)).toBe(true);
      conferirComoOBanco(cruz!);
    }
    // Com lado 9, as palavras de 12 e 13 letras não cabem e ficam de fora.
    const pequena = montarCruzadinha(VOCABULARIO, { maxLado: 9 })!;
    const respostas = Object.values(pequena.resposta);
    expect(respostas).not.toContain("NORMALIZACAO");
    expect(respostas).not.toContain("CHAVEPRIMARIA");
  });

  it("determinística: a mesma entrada dá a mesma saída", () => {
    const a = montarCruzadinha(VOCABULARIO);
    const b = montarCruzadinha(VOCABULARIO.map((p) => ({ ...p })));
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("não muda a entrada", () => {
    const entrada = VOCABULARIO.map((p) => ({ ...p }));
    const copia = JSON.parse(JSON.stringify(entrada));
    montarCruzadinha(entrada);
    expect(entrada).toEqual(copia);
  });

  it("ignora item que não é palavra com pista", () => {
    const sujo = [
      ...VOCABULARIO.slice(0, 5),
      null,
      { palavra: 42, pista: "x" },
      { palavra: "Coluna" },
    ] as unknown as PalavraComPista[];
    const cruz = montarCruzadinha(sujo)!;
    expect(cruz).not.toBeNull();
    expect(Object.values(cruz.resposta)).not.toContain("COLUNA");
    conferirComoOBanco(cruz);
  });
});
