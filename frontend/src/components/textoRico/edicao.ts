/**
 * O que a barra do `CampoTextoRico` faz com o texto (spec A): inserir fórmula ou cerca de código na
 * posição do cursor. Puro, para o teste não depender do DOM.
 */

export type Edicao = { texto: string; inicio: number; fim: number };

/** Fórmula em linha `\( … \)` ou em bloco `\[ … \]`, no lugar da seleção. O cursor vai para depois dela. */
export function inserirFormula(texto: string, inicio: number, fim: number, tex: string, emBloco: boolean): Edicao {
  const trecho = emBloco ? `\\[${tex}\\]` : `\\(${tex}\\)`;
  const antes = texto.slice(0, inicio);
  const depois = texto.slice(fim);
  // Em bloco, a fórmula fica sozinha na linha: o markdown só a centraliza assim.
  const abre = emBloco && antes !== "" && !antes.endsWith("\n") ? "\n" : "";
  const fecha = emBloco && depois !== "" && !depois.startsWith("\n") ? "\n" : "";
  const novo = `${antes}${abre}${trecho}${fecha}${depois}`;
  const cursor = antes.length + abre.length + trecho.length;
  return { texto: novo, inicio: cursor, fim: cursor };
}

/**
 * Cerca de código com a linguagem, envolvendo a seleção. A cerca sempre começa e termina numa linha
 * própria. Sem seleção, o cursor fica dentro da cerca; com seleção, ela continua selecionada.
 */
export function inserirCerca(texto: string, inicio: number, fim: number, linguagem: string): Edicao {
  const antes = texto.slice(0, inicio);
  const selecionado = texto.slice(inicio, fim).replace(/\n$/, "");
  const depois = texto.slice(fim);
  const abre = antes !== "" && !antes.endsWith("\n") ? "\n" : "";
  const fecha = depois !== "" && !depois.startsWith("\n") ? "\n" : "";
  const cabeca = `${abre}\`\`\`${linguagem}\n`;
  const novo = `${antes}${cabeca}${selecionado}\n\`\`\`${fecha}${depois}`;
  const dentro = antes.length + cabeca.length;
  return { texto: novo, inicio: dentro, fim: dentro + selecionado.length };
}

/** As linguagens que o seletor de código oferece, com o rótulo que vai na cerca. */
export const LINGUAGENS_DO_EDITOR: { rotulo: string; nome: string }[] = [
  { rotulo: "python", nome: "Python" },
  { rotulo: "javascript", nome: "JavaScript" },
  { rotulo: "typescript", nome: "TypeScript" },
  { rotulo: "java", nome: "Java" },
  { rotulo: "c", nome: "C" },
  { rotulo: "cpp", nome: "C++" },
  { rotulo: "csharp", nome: "C#" },
  { rotulo: "sql", nome: "SQL (padrão)" },
  { rotulo: "mysql", nome: "MySQL / MariaDB" },
  { rotulo: "sqlserver", nome: "SQL Server (T-SQL)" },
  { rotulo: "postgresql", nome: "PostgreSQL" },
  { rotulo: "oracle", nome: "Oracle (PL/SQL)" },
  { rotulo: "html", nome: "HTML" },
  { rotulo: "css", nome: "CSS" },
  { rotulo: "", nome: "Sem linguagem (sem cor)" },
];

/** Atalhos da paleta de fórmula: o que aparece no botão e o LaTeX que ele acrescenta. */
export const PALETA_DE_FORMULA: { rotulo: string; titulo: string; tex: string }[] = [
  { rotulo: "a/b", titulo: "Fração", tex: "\\frac{a}{b}" },
  { rotulo: "√x", titulo: "Raiz", tex: "\\sqrt{x}" },
  { rotulo: "xⁿ", titulo: "Potência", tex: "x^{2}" },
  { rotulo: "xᵢ", titulo: "Índice", tex: "x_{i}" },
  { rotulo: "vet", titulo: "Vetor", tex: "\\vec{v}" },
  { rotulo: "Σ", titulo: "Somatório", tex: "\\sum_{i=1}^{n}" },
  { rotulo: "∫", titulo: "Integral", tex: "\\int_{a}^{b}" },
  { rotulo: "H₂O", titulo: "Química", tex: "\\ce{H2O}" },
  { rotulo: "m/s", titulo: "Unidade", tex: "\\pu{10 m/s}" },
  { rotulo: "→", titulo: "Reação", tex: "\\ce{A -> B}" },
  { rotulo: "⇌", titulo: "Equilíbrio", tex: "\\ce{A <=> B}" },
];
