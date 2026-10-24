/** Teste isolado em PostgreSQL/WASM (PGlite), sem .env ou conexão externa.
 * npm install --prefix /tmp/trailup-brainhex-verificacao --no-audit --no-fund @electric-sql/pglite@0.5.11
 * node scripts/testar-migracao-perfil-v3.mjs /tmp/trailup-brainhex-verificacao/node_modules/@electric-sql/pglite/dist/index.js
 * Executa o SQL emitido pelas migrations reais, com helpers mínimos de identidade.
 * Não substitui testar a cadeia completa do Alembic/Supabase.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

if (!process.argv[2]) throw new Error("Informe o caminho do módulo PGlite instalado para o teste");
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const repo = fileURLToPath(new URL("../", import.meta.url));
const emitido = JSON.parse(execFileSync("python3", ["-c", `
import json, runpy, sys, types
statements = []
sys.modules['alembic'] = types.SimpleNamespace(op=types.SimpleNamespace(execute=statements.append))
legacy = runpy.run_path('api/alembic/versions/20261003_02_medida_do_perfil_brainhex.py')
current = runpy.run_path('api/alembic/versions/20261024_03_perfil_exploratorio_sem_confianca.py')
result = {}
for name, fn in [('legacy', legacy['upgrade']), ('upgrade', current['upgrade']), ('downgrade', current['downgrade'])]:
    statements.clear()
    fn()
    result[name] = list(statements)
assert current['down_revision'] == '20261024_02'
print(json.dumps(result))
`], { cwd: repo, encoding: "utf8" }));
const db = await PGlite.create();
const aprovados = [];
const aluno = "11111111-1111-4111-8111-111111111111";
const outro = "22222222-2222-4222-8222-222222222222";
const v3 = "2026-10-24-v3-exploratorio";
const v2 = "2026-10-02-v2-reversos-e-ordenacao";
const ordem = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"];
const insert = (versao, confianca, id = aluno) => db.query(`
  INSERT INTO public.aluno_perfil_medida (aluno_id, versao_instrumento, ordenacao, afinidade, confianca)
  VALUES ($1, $2, $3, $4, $5) RETURNING id, confianca`,
  [id, versao, ordem, JSON.stringify(Object.fromEntries(ordem.map((p, i) => [p, i ? 14 : 16]))), confianca]);
const run = async (nome, fn) => { await fn(); aprovados.push(nome); };
const transaction = statements => db.transaction(async tx => {
  for (const sql of statements) await tx.exec(sql);
});

try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION public.app_alunos_do_professor() RETURNS SETOF uuid LANGUAGE sql AS
      $$ SELECT NULL::uuid WHERE false $$;
  `);
  await transaction(emitido.legacy);
  await insert(v2, 0.8);
  await transaction(emitido.upgrade);
  await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${aluno}';`);
  await run("v3 grava ausência de confiança como NULL sob RLS", async () => {
    const r = await insert(v3, null);
    assert.equal(r.rows[0].confianca, null);
  });
  await run("v3 recusa número mesmo dentro de 0..1", async () => {
    await assert.rejects(() => insert(v3, 0.8), e => e.code === "23514");
    await assert.rejects(() => insert(v3, 0), e => e.code === "23514");
  });
  await run("cliente legado v2 continua gravando", async () => {
    assert.equal(Number((await insert(v2, 0.6)).rows[0].confianca), 0.6);
  });
  await run("restrição numérica legada continua ativa", async () => {
    await assert.rejects(() => insert(v2, 2), e => e.code === "23514");
  });
  await run("aluno não grava medida de outro aluno", async () => {
    await assert.rejects(() => insert(v3, null, outro), e => e.code === "42501");
  });
  await db.exec("RESET ROLE");
  await run("migração preserva a medida v2 histórica", async () => {
    const r = await db.query("SELECT confianca FROM public.aluno_perfil_medida WHERE id = 1");
    assert.equal(Number(r.rows[0].confianca), 0.8);
  });
  await run("rollback com medidas v3 falha sem fabricar confiança nem perder dados", async () => {
    await assert.rejects(() => transaction(emitido.downgrade), e => e.code === "23502");
    const r = await db.query("SELECT count(*)::int AS n FROM public.aluno_perfil_medida WHERE confianca IS NULL");
    assert.equal(r.rows[0].n, 1);
    await assert.rejects(() => insert(v3, 0.5), e => e.code === "23514");
  });
  await run("rollback sem medidas v3 restaura NOT NULL", async () => {
    // Remove somente o fixture do banco efêmero para testar a outra condição.
    await db.exec("DELETE FROM public.aluno_perfil_medida WHERE confianca IS NULL");
    await transaction(emitido.downgrade);
    await assert.rejects(() => insert(v3, null), e => e.code === "23502");
    assert.equal(Number((await insert(v2, 0.7)).rows[0].confianca), 0.7);
  });
  console.log(JSON.stringify({ motor: "PostgreSQL/WASM PGlite 0.5.11", aprovados,
    limite: "Tabela real da migration e helpers mínimos; não é a cadeia completa nem produção." }, null, 2));
} finally {
  await db.close();
}
