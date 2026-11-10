/**
 * Dialetos de SQL para o realce de código (spec A, 10/11): MySQL/MariaDB, SQL Server (T-SQL),
 * PostgreSQL e Oracle (PL/SQL), além do SQL genérico.
 *
 * O console tem uma cópia byte a byte deste arquivo, fora este cabeçalho
 * (`frontend/src/lib/textoRico/dialetosSql.ts`), e o teste de paridade de lá confere.
 */

/** O pedaço do Prism que este arquivo usa. Tipo próprio para não depender de `@types/prismjs`. */
export type PrismComDialetos = {
  languages: {
    [nome: string]: unknown;
    extend: (id: string, redefinicao: Record<string, unknown>) => Record<string, unknown>;
    insertBefore: (dentro: string, antesDe: string, inserir: Record<string, unknown>) => unknown;
  };
};

/** Funções comuns dos quatro dialetos. Só com parêntese em seguida: `LEFT JOIN` é palavra, `LEFT(` é função. */
const FUNCOES =
  /\b(?:ABS|AVG|CAST|CEIL(?:ING)?|CHAR_LENGTH|CHARINDEX|COALESCE|CONCAT(?:_WS)?|CONVERT|COUNT|DATE_ADD|DATE_FORMAT|DATE_PART|DATE_SUB|DATE_TRUNC|DATEADD|DATEDIFF|DATENAME|DATEPART|DAY|DECODE|DENSE_RANK|EXTRACT|FIRST_VALUE|FLOOR|FORMAT|GETDATE|GREATEST|GROUP_CONCAT|IFNULL|IIF|ISNULL|LAG|LAST_VALUE|LCASE|LEAD|LEAST|LEFT|LEN|LENGTH|LOWER|LPAD|LTRIM|MAX|MID|MIN|MOD|MONTH|NOW|NTILE|NULLIF|NVL2?|POSITION|POWER|RANK|REPLACE|RIGHT|ROUND|ROW_NUMBER|RPAD|RTRIM|STR_TO_DATE|STRING_AGG|SUBSTR(?:ING)?|SUM|SYSDATE|TO_CHAR|TO_DATE|TO_NUMBER|TRIM|TRUNC|UCASE|UPPER|YEAR)(?=\s*\()/i;

/** Palavras que a gramática SQL do Prism não conhece: tipos e comandos do SQL Server e do PostgreSQL. */
const PALAVRAS_DOS_DIALETOS =
  /\b(?:ARRAY|BIGSERIAL|BYTEA|CATCH|CONFLICT|EXCLUDED|GO|JSONB?|LATERAL|MONEY|NOTHING|NTEXT|NVARCHAR|ONLY|OUTPUT|PLPGSQL|POLICY|RECURSIVE|SEQUENCE|THROW|TIMESTAMPTZ|TRY|UNIQUEIDENTIFIER|UUID|WINDOW)\b/i;

// O `#` é o que separa os dialetos. No MySQL ele abre comentário; no SQL Server é tabela temporária
// (`#notas`), e no PostgreSQL é operador. Com o rótulo genérico `sql`, só vira comentário quando não
// vem colado num nome: `# nota` é comentário, `#notas` é tabela.
const COMENTARIOS = {
  "sql-generico": /(^|[^\\])(?:\/\*[\s\S]*?\*\/|--.*|#(?![#\w]).*)/,
  "sql-mysql": /(^|[^\\])(?:\/\*[\s\S]*?\*\/|--.*|#.*)/,
  "sql-tsql": /(^|[^\\])(?:\/\*[\s\S]*?\*\/|--.*)/,
  "sql-postgres": /(^|[^\\])(?:\/\*[\s\S]*?\*\/|--.*)/,
} as const;

export type DialetoSql = keyof typeof COMENTARIOS | "plsql";

/** Registra os dialetos no Prism. Precisa de `prism-sql` e `prism-plsql` já carregados. */
export function registrarDialetosSql(prism: PrismComDialetos): void {
  const linguagens = prism.languages;
  for (const [nome, comentario] of Object.entries(COMENTARIOS)) {
    if (linguagens[nome]) continue;
    linguagens[nome] = linguagens.extend("sql", {
      comment: { pattern: comentario, lookbehind: true, greedy: true },
      function: FUNCOES,
    });
    linguagens.insertBefore(nome, "variable", {
      // `[Nome do Aluno]` do SQL Server; `notas[1]` do PostgreSQL continua índice.
      "identificador-entre-colchetes": { pattern: /(^|[^\w\]])\[[A-Za-zÀ-ÿ_][^\]\n]*\]/, lookbehind: true, greedy: true },
      // `$$` e `$corpo$` delimitam o corpo de função do PostgreSQL: o que vem dentro é código.
      "delimitador-de-corpo": { pattern: /\$[A-Za-z_]*\$/, alias: "punctuation" },
      parametro: { pattern: /\$\d+\b/, alias: "variable" },
    });
    linguagens.insertBefore(nome, "keyword", {
      "palavra-do-dialeto": { pattern: PALAVRAS_DOS_DIALETOS, alias: "keyword" },
    });
    linguagens.insertBefore(nome, "operator", {
      conversao: { pattern: /::/, alias: "operator" },
    });
  }
  if (linguagens.plsql) {
    linguagens.insertBefore("plsql", "keyword", { function: FUNCOES });
  }
}
