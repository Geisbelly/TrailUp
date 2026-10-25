/** PostgreSQL/WASM isolado. Usa SQL real da RPC e policies de posse equivalentes
 * às migrations; schema base mínimo explícito, não um Supabase E2E.
 * Uso: node scripts/testar-cadastro-atomico.mjs /caminho/pglite/dist/index.js
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const { PGlite } = await import(pathToFileURL(resolve(process.argv[2])).href);
const root = fileURLToPath(new URL('../', import.meta.url));
const statements = JSON.parse(execFileSync('python3', ['-c', String.raw`
import json, runpy, sys, types, re
statements=[]
sys.modules['alembic']=types.SimpleNamespace(op=types.SimpleNamespace(execute=statements.append))
for file in ['20261003_02_medida_do_perfil_brainhex.py','20261024_04_perfil_exploratorio_sem_confianca.py','20261024_05_cadastro_aluno_atomico.py']:
    runpy.run_path('api/alembic/versions/'+file)['upgrade']()
birth = runpy.run_path('api/alembic/versions/20261024_02_consentimento_do_responsavel.py')['CLIENTE_SQL']
statements.insert(0, re.search(r'CREATE OR REPLACE FUNCTION public.aluno_registrar_data_nascimento.*?\$function\$;', birth, re.S).group())
retention = runpy.run_path('api/alembic/versions/20261024_03_retencao_e_expurgo.py')['TABELAS_SQL']
statements.insert(0, re.search(r'CREATE TABLE IF NOT EXISTS public.retencao_politica.*?\n\);', retention, re.S).group())
migration = runpy.run_path('api/alembic/versions/20261024_05_cadastro_aluno_atomico.py')
upgrade = list(statements)
statements.clear()
migration['downgrade']()
print(json.dumps({'upgrade':upgrade,'downgrade':statements,'cadastro':migration['SQL'], 'integridade':runpy.run_path('api/alembic/versions/20261024_06_integridade_cadastro_legado.py')['SQL']}))
`], { cwd: root, encoding: 'utf8' }));
const db = await PGlite.create();
const uid = '11111111-1111-4111-8111-111111111111';
const legacy = '33333333-3333-4333-8333-333333333333';
const poisoned = '44444444-4444-4444-8444-444444444444';
const noMeasure = '55555555-5555-4555-8555-555555555555';
const other = '22222222-2222-4222-8222-222222222222';
const profiles = ['achiever','conqueror','daredevil','mastermind','seeker','socializer','survivor'];
const measure = id => ({ aluno_id: id, versao_instrumento:'2026-10-24-v3-exploratorio',
  ordenacao: profiles, afinidade: Object.fromEntries(profiles.map((p,i)=>[p,i ? 14 : 16])),
  confianca:null, concordancia:null, qualidade:{indice:null, desvio:1, aquiescencia:0,
    interpretacao:'exploratoria_nao_probabilistica', ordenacao_confirmada:true, motivos:[]} });
const call = (m=measure(uid), date='2000-01-01') => db.query(`SELECT concluir_cadastro_aluno('Aluno Teste','Teste','Misto','pensante','achiever',$1,$2)`,[m,date]);
const scalar = async sql => (await db.query(sql)).rows[0].n;
const login = async id => { await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${id}';`); };
const passed=[];
async function test(name, fn) { await fn(); passed.push(name); }
try {
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon;
    CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth TO authenticated;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('email', 'aluno@example.test') $$;
    CREATE FUNCTION app_alunos_do_professor() RETURNS SETOF uuid LANGUAGE sql AS $$ SELECT NULL::uuid WHERE false $$;
    CREATE TYPE modo_resposta_type AS ENUM ('imediato','pensante');
    CREATE TABLE "modoOperacao" (id bigint PRIMARY KEY, nome text);
    INSERT INTO "modoOperacao" VALUES (1,'Misto');
    CREATE TABLE perfil (id bigint PRIMARY KEY, nome text UNIQUE);
    CREATE TABLE alunos (id uuid PRIMARY KEY, nome text, email text, apelido text, descricao text, modooperacao_id bigint REFERENCES "modoOperacao", modo_resposta modo_resposta_type, perfil_ativo text);
    CREATE TABLE aluno_perfil (aluno_id uuid REFERENCES alunos ON DELETE CASCADE, perfil_id bigint REFERENCES perfil, afinidade numeric, PRIMARY KEY(aluno_id,perfil_id));
    CREATE TABLE "iaDescricao" (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, aluno_id uuid REFERENCES alunos ON DELETE CASCADE, "modoOperacao" text, "perfisDetectados" jsonb, insights json, "recomendacaoTrilha" text);
    CREATE TABLE aluno_nascimento (aluno_id uuid PRIMARY KEY REFERENCES alunos ON DELETE CASCADE, data_nascimento date, registrado_por uuid);
    CREATE FUNCTION aluno_meu_consentimento() RETURNS jsonb LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
    GRANT SELECT ON "modoOperacao", perfil TO authenticated;
    GRANT SELECT,INSERT,UPDATE ON alunos,aluno_perfil,"iaDescricao",aluno_nascimento TO authenticated;
    GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
    ALTER TABLE alunos ENABLE ROW LEVEL SECURITY;
    CREATE POLICY self ON alunos TO authenticated USING(id=auth.uid()) WITH CHECK(id=auth.uid());
  `);
  for (const table of ['aluno_perfil','iaDescricao','aluno_nascimento']) await db.exec(`
    ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;
    CREATE POLICY self ON "${table}" TO authenticated USING(aluno_id=auth.uid()) WITH CHECK(aluno_id=auth.uid());`);
  for (const [i,p] of profiles.entries()) await db.query('INSERT INTO perfil VALUES($1,$2)',[i+1,p]);
  for (const sql of statements.upgrade) await db.exec(sql);
  // Estado realista anterior à correção: marcadores forjados e legado sem medida.
  for (const id of [legacy,poisoned,noMeasure]) {
    await db.query("INSERT INTO alunos(id,nome,email,perfil_ativo) VALUES($1,'Legado','legado@example.test','socializer')",[id]);
  }
  for (const id of [legacy,noMeasure]) {
    for (let i=0;i<7;i++) await db.query('INSERT INTO aluno_perfil VALUES($1,$2,$3)',[id,i+1,80.5-i*5]);
  }
  await db.query('INSERT INTO aluno_cadastro_concluido(aluno_id) VALUES($1)',[poisoned]);
  await db.query(`INSERT INTO aluno_perfil_medida(aluno_id,versao_instrumento,ordenacao,afinidade,confianca)
    VALUES($1,'v2',$2,$3,0.7)`,[legacy,profiles,measure(legacy).afinidade]);
  const snapshot = async id => ({aluno:(await db.query('SELECT * FROM alunos WHERE id=$1',[id])).rows,
    perfis:(await db.query('SELECT * FROM aluno_perfil WHERE aluno_id=$1 ORDER BY perfil_id',[id])).rows});
  const beforeLegacy = await snapshot(legacy), beforeNoMeasure = await snapshot(noMeasure);
  await db.exec(statements.integridade);
  await test('migração limpa marcador falso e reconhece legados sem alterar afinidades',async()=>{
    assert.equal((await db.query('SELECT count(*)::int n FROM aluno_cadastro_concluido WHERE aluno_id=$1',[poisoned])).rows[0].n,0);
    assert.equal((await db.query('SELECT count(*)::int n FROM aluno_cadastro_concluido WHERE aluno_id IN ($1,$2)',[legacy,noMeasure])).rows[0].n,2);
    assert.deepEqual(await snapshot(legacy),beforeLegacy);
    assert.deepEqual(await snapshot(noMeasure),beforeNoMeasure);
  });
  await login(poisoned);
  await test('escrita direta e helper não concluem conta sem perfil; RPC repara',async()=>{
    await assert.rejects(()=>db.query('INSERT INTO aluno_cadastro_concluido(aluno_id) VALUES($1)',[poisoned]),e=>e.code==='42501');
    await assert.rejects(()=>db.query('SELECT registrar_conclusao_cadastro()'),e=>e.code==='23514');
    assert.equal((await db.query('SELECT meu_cadastro_concluido() AS ok')).rows[0].ok,false);
    await call(measure(poisoned));
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil'),7);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil_medida'),1);
    assert.equal((await db.query('SELECT meu_cadastro_concluido() AS ok')).rows[0].ok,true);
  });
  await login(noMeasure);
  await test('legado sem medida conserva preferências e não ganha medida inventada',async()=>{
    assert.equal((await db.query('SELECT meu_cadastro_concluido() AS ok')).rows[0].ok,true);
    await call(measure(noMeasure));
    assert.deepEqual(await snapshot(noMeasure),beforeNoMeasure);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil_medida'),0);
  });
  await db.exec('RESET ROLE;');
  await db.query("UPDATE aluno_perfil_medida SET expira_em=now()-interval '1 day' WHERE aluno_id=$1",[legacy]);
  await db.query('SELECT trailup_expurgar_medidas_de_perfil()');
  await db.query('DELETE FROM aluno_cadastro_concluido WHERE aluno_id=$1',[legacy]);
  await login(legacy);
  await test('expurgo e ausência do marcador não refazem o quiz nem sobrescrevem adaptação',async()=>{
    assert.equal((await db.query('SELECT meu_cadastro_concluido() AS ok')).rows[0].ok,true);
    await call(measure(legacy));
    assert.deepEqual(await snapshot(legacy),beforeLegacy);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil_medida'),0);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_cadastro_concluido'),1);
    await assert.rejects(()=>db.query('UPDATE aluno_cadastro_concluido SET concluido_em=now()'),e=>e.code==='42501');
    await assert.rejects(()=>db.query('DELETE FROM aluno_cadastro_concluido'),e=>e.code==='42501');
  });
  await login(poisoned);
  await test('marcador existente não encobre vetor inválido; nova conclusão repara',async()=>{
    for (const invalid of [null,-1,101,'NaN','Infinity']) {
      await db.query('UPDATE aluno_perfil SET afinidade=$1 WHERE perfil_id=1',[invalid]);
      assert.equal((await db.query('SELECT meu_cadastro_concluido() AS ok')).rows[0].ok,false);
      await assert.rejects(()=>db.query('SELECT registrar_conclusao_cadastro()'),e=>e.code==='23514');
    }
    await db.query('UPDATE aluno_perfil SET afinidade=0');
    assert.equal((await db.query('SELECT meu_cadastro_concluido() AS ok')).rows[0].ok,false);
    await call(measure(poisoned));
    assert.equal((await db.query('SELECT meu_cadastro_concluido() AS ok')).rows[0].ok,true);
    assert.equal(await scalar('SELECT sum(afinidade)::int n FROM aluno_perfil'),100);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_cadastro_concluido'),1);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil_medida'),2);
  });
  await login(uid);
  await test('rejeita aluno alheio sem criar conta', async()=>{
    await assert.rejects(()=>call(measure(other)));
    assert.equal(await scalar('SELECT count(*)::int n FROM alunos'),0);
  });
  await test('rejeita vetores inválidos, confiança e ordem não confirmada', async()=>{
    const invalid=[];
    let m=measure(uid); m.afinidade.achiever=15; invalid.push(m);
    m=measure(uid); m.ordenacao=[...profiles.slice(1),'survivor']; invalid.push(m);
    m=measure(uid); m.confianca=0.8; invalid.push(m);
    m=measure(uid); m.qualidade.ordenacao_confirmada=false; invalid.push(m);
    for (const value of invalid) await assert.rejects(()=>call(value));
    assert.equal(await scalar('SELECT count(*)::int n FROM alunos'),0);
  });
  await test('erro tardio de nascimento reverte aluno, perfis, medida e descrição', async()=>{
    await assert.rejects(()=>call(measure(uid),'2999-01-01'));
    for (const table of ['alunos','aluno_perfil','aluno_perfil_medida','iaDescricao','aluno_cadastro_concluido'])
      assert.equal(await scalar(`SELECT count(*)::int n FROM "${table}"`),0);
  });
  await test('salva sete perfis, medida e preferências numa conclusão',async()=>{
    await call();
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil'),7);
    assert.equal(await scalar('SELECT sum(afinidade)::int n FROM aluno_perfil'),100);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil_medida'),1);
    assert.equal((await db.query('SELECT modo_resposta,perfil_ativo FROM alunos')).rows[0].modo_resposta,'pensante');
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_cadastro_concluido'),1);
  });
  await test('repetição após resposta perdida não duplica nem sobrescreve perfil adaptado',async()=>{
    await db.exec("UPDATE alunos SET perfil_ativo='seeker'");
    await Promise.all([call(),call()]);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil_medida'),1);
    assert.equal(await scalar('SELECT count(*)::int n FROM "iaDescricao"'),1);
    assert.equal((await db.query('SELECT perfil_ativo FROM alunos')).rows[0].perfil_ativo,'seeker');
  });
  await test('introdução funciona sem turma, repete sem duplicar e bloqueia outro aluno',async()=>{
    await db.query("INSERT INTO aluno_introducao(aluno_id,etapa) VALUES($1,'perfil') ON CONFLICT DO NOTHING",[uid]);
    await db.query("INSERT INTO aluno_introducao(aluno_id,etapa) VALUES($1,'perfil') ON CONFLICT DO NOTHING",[uid]);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_introducao'),1);
    await assert.rejects(()=>db.query("INSERT INTO aluno_introducao(aluno_id,etapa) VALUES($1,'sessao')",[other]));
    await assert.rejects(()=>db.query("INSERT INTO aluno_introducao(aluno_id,etapa) VALUES($1,'inventada')",[uid]));
  });
  await login(other);
  await test('outra conta não lê conclusão, introdução nem medida alheias',async()=>{
    assert.equal((await db.query('SELECT cadastro_perfis_integros($1) AS ok',[legacy])).rows[0].ok,false);
    for (const table of ['aluno_perfil_medida','aluno_cadastro_concluido','aluno_introducao'])
      assert.equal(await scalar(`SELECT count(*)::int n FROM ${table}`),0);
  });
  await test('repara cadastro legado parcial sem criar outro aluno',async()=>{
    await db.query("INSERT INTO alunos(id,nome,email) VALUES($1,'Parcial','parcial@example.test')",[other]);
    await db.query('INSERT INTO aluno_perfil VALUES($1,1,100)',[other]);
    await call(measure(other));
    assert.equal(await scalar('SELECT count(*)::int n FROM alunos'),1);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil'),7);
    assert.equal(await scalar('SELECT sum(afinidade)::int n FROM aluno_perfil'),100);
  });
  await db.exec('RESET ROLE; SET ROLE anon;');
  await test('anônimo não pode concluir cadastro ou registrar introdução',async()=>{
    await assert.rejects(()=>call());
    await assert.rejects(()=>db.query('SELECT meu_cadastro_concluido()'));
    await assert.rejects(()=>db.query('SELECT registrar_conclusao_cadastro()'));
    await assert.rejects(()=>db.query("INSERT INTO aluno_introducao(aluno_id,etapa) VALUES($1,'perfil')",[uid]));
  });
  await db.exec('RESET ROLE;');
  await test('reaplicar a 05 após seu downgrade e reaplicar a 06 preserva conclusões, medidas e progresso',async()=>{
    for (const sql of statements.downgrade) await db.exec(sql);
    await db.exec(statements.cadastro);
    await db.exec(statements.integridade);
    await login(uid);
    await call();
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_perfil_medida'),1);
    assert.equal(await scalar('SELECT count(*)::int n FROM aluno_introducao'),1);
    assert.equal((await db.query('SELECT perfil_ativo FROM alunos')).rows[0].perfil_ativo,'seeker');
  });
  await db.exec('RESET ROLE;');
  await test('política de vida da conta registrada e exclusão remove os dados novos',async()=>{
    assert.equal(await scalar("SELECT count(*)::int n FROM retencao_politica WHERE acao='vida_da_conta'"),2);
    await db.query('DELETE FROM alunos WHERE id=$1',[uid]);
    for (const table of ['aluno_cadastro_concluido','aluno_introducao']) {
      const r = await db.query(`SELECT count(*)::int n FROM ${table} WHERE aluno_id=$1`,[uid]);
      assert.equal(r.rows[0].n,0);
    }
  });
  console.log(JSON.stringify({aprovados:passed, limite:'Schema base mínimo e helper de resumo de consentimento simulado; RPCs reais de cadastro/nascimento; não é Auth/Supabase E2E.'},null,2));
} finally { await db.close(); }
