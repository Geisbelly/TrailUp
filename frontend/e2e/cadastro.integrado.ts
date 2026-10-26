import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { localSql } from '../../scripts/e2e_cadastro/db.mjs';
import { materialDoAluno } from '../../scripts/e2e_cadastro/mobile.mjs';
import { responderQuiz } from './quiz';

const base='http://127.0.0.1:57441';
const key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const password='SenhaDeTesteLocal-123!';
const profiles=['achiever','conqueror','daredevil','mastermind','seeker','socializer','survivor'];
const client=()=>createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
const uidChecked=(id:string)=>{expect(id).toMatch(/^[0-9a-f-]{36}$/);return id;};
const countEmail=(email:string)=>{
  if(!/^[a-z0-9-]+@example\.test$/.test(email))throw Error('E-mail de teste inválido');
  return JSON.parse(localSql(`SELECT json_build_object('users',count(*),'identities',(SELECT count(*) FROM auth.identities i JOIN auth.users u ON i.user_id=u.id WHERE lower(u.email)='${email}')) FROM auth.users WHERE lower(email)='${email}'`));
};
async function linkDeConfirmacao(email:string) {
  let id='';
  await expect.poll(async()=>{
    const data=await (await fetch('http://127.0.0.1:58039/api/v1/messages')).json() as {messages:{ID:string;To:{Address:string}[]}[]};
    id=data.messages?.find((m:{ID:string;To:{Address:string}[]})=>m.To.some(to=>to.Address===email))?.ID??'';
    return Boolean(id);
  }).toBe(true);
  const mail=await (await fetch(`http://127.0.0.1:58039/api/v1/message/${id}`)).json() as {HTML:string};
  const href=String(mail.HTML).match(/href="([^"]+)"/)?.[1]?.replaceAll('&amp;','&');
  if(!href||new URL(href).origin!==base)throw Error('Link de confirmação deve ser local.');
  return href;
}
async function criarEConfirmar(browser:Browser,email:string) {
  const api=client();
  const {error}=await api.auth.signUp({email,password,options:{data:{role:'aluno'},emailRedirectTo:'http://127.0.0.1:4188/auth/confirmacao'}});
  expect(error).toBeNull();
  const context=await browser.newContext();
  await somenteLocal(context);
  const page=await context.newPage();
  await page.goto(await linkDeConfirmacao(email));
  await expect(page.getByRole('heading',{name:'Finalize seu cadastro de aluno'})).toBeVisible({timeout:20_000});
  await context.close();
  const login=await api.auth.signInWithPassword({email,password});
  expect(login.error).toBeNull();
  return {api,id:uidChecked(login.data.user!.id)};
}
async function preencherCadastro(page:Page,email:string,senha=password) {
  await page.goto('/cadastro-aluno');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(senha);
  await page.getByLabel('Confirmar senha',{exact:true}).fill(senha);
  await page.getByLabel('Data de nascimento').fill('2000-01-01');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:/Entrar ou criar/}).click();
}

// Bloqueia destinos externos, sem simular respostas de Auth, banco ou e-mail.
async function somenteLocal(context:BrowserContext) {
  await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
}
test.beforeEach(async({context})=>{ await somenteLocal(context); });

test('cadastro real → e-mail em outro navegador → quiz → perfil → matrícula → material e retomada',async({page,browser})=>{
  const email='jornada@example.test';
  await preencherCadastro(page,email);
  await expect(page.getByText(/Se o cadastro puder prosseguir/)).toBeVisible();
  expect(countEmail(email)).toEqual({users:1,identities:1});
  const other=await browser.newContext();
  await somenteLocal(other);
  try{
    const confirmed=await other.newPage();
    await confirmed.goto(await linkDeConfirmacao(email));
    await expect(confirmed.getByRole('heading',{name:'Finalize seu cadastro de aluno'})).toBeVisible({timeout:20_000});
    expect(await confirmed.evaluate(()=>localStorage.getItem('pending-signup:jornada@example.test'))).toBeNull();
    await responderQuiz(confirmed);
    await confirmed.getByRole('button',{name:'Confirmar conta de aluno'}).click();
    await expect(confirmed).toHaveURL(/\/aluno$/,{timeout:20_000});
    await expect(confirmed.getByText(/Você ainda não está em uma turma/)).toBeVisible();
    const api=client();const login=await api.auth.signInWithPassword({email,password});
    expect(login.error).toBeNull();const id=uidChecked(login.data.user!.id);
    const state=JSON.parse(localSql(`SELECT json_build_object('perfis',(SELECT count(*) FROM aluno_perfil WHERE aluno_id='${id}'),'medidas',(SELECT count(*) FROM aluno_perfil_medida WHERE aluno_id='${id}'),'confirmado',email_confirmed_at IS NOT NULL) FROM auth.users WHERE id='${id}'`));
    expect(state).toEqual({perfis:7,medidas:1,confirmado:true});
    expect((await materialDoAluno(api,id)).result.total).toBe(0);
    // Conteúdo sintético dos sete perfis: verifica seleção/entrega, não geração LLM.
    localSql(`INSERT INTO classe_aluno VALUES('${id}',10); INSERT INTO conteudo_personalizado(id,classe_id,topico_id,conteudo_id,brainhex_profile_key,materiais,status) SELECT row_number() OVER(),10,20,30,nome,jsonb_build_object('markdown',jsonb_build_object('arquivo_url','${base}/materials/'||nome||'.md')),'pronto' FROM perfil;`);
    await confirmed.getByRole('button',{name:'Atualizar turmas e progresso'}).click();
    await expect(confirmed.getByText(/Você tem 1 turma disponível/)).toBeVisible();
    const {profile,result}=await materialDoAluno(api,id);
    expect(result.total).toBe(1);
    expect(result.itens[0].brainhex_profile_key).toBe(profile);
    const materialUrl=result.itens[0].materiais?.markdown?.arquivo_url;
    if(!materialUrl||new URL(materialUrl).origin!==base)throw Error('Material deve ter URL local.');
    const material=await fetch(materialUrl);
    expect(material.ok).toBe(true);expect(await material.text()).toContain(`Material sintético ${profile}`);
    await confirmed.getByLabel('Uma sugestão baseada nas minhas preferências').check();
    await confirmed.getByRole('button',{name:'Concluir etapa'}).click();
    await expect(confirmed.getByText('1 de 3 etapas concluídas')).toBeVisible();
    await confirmed.reload();
    await expect(confirmed.getByText('1 de 3 etapas concluídas')).toBeVisible();
    // Expurgo real e ausência de marcador não invalidam o legado.
    const before=localSql(`SELECT json_agg(row_to_json(p) ORDER BY perfil_id) FROM aluno_perfil p WHERE aluno_id='${id}'`);
    localSql(`UPDATE aluno_perfil_medida SET expira_em=now()-interval '1 day' WHERE aluno_id='${id}'; SELECT trailup_expurgar_medidas_de_perfil(); DELETE FROM aluno_cadastro_concluido WHERE aluno_id='${id}';`);
    await confirmed.reload();await expect(confirmed.getByText('1 de 3 etapas concluídas')).toBeVisible();
    expect(localSql(`SELECT json_agg(row_to_json(p) ORDER BY perfil_id) FROM aluno_perfil p WHERE aluno_id='${id}'`)).toBe(before);
  }finally{await other.close();}
});

test('Auth real não duplica conta/identidade com caixa diferente e senha errada; titular retoma',async({page,browser})=>{
  const email='duplicidade@example.test';
  const {api,id}=await criarEConfirmar(browser,email);
  await api.auth.signOut();
  const wrong='OutraSenhaTeste-123!';
  const duplicate=await api.auth.signUp({email:email.toUpperCase(),password:wrong});
  expect(duplicate.error).toBeNull();
  expect(duplicate.data.session).toBeNull();
  expect(duplicate.data.user?.identities).toEqual([]);
  expect(countEmail(email)).toEqual({users:1,identities:1});
  await preencherCadastro(page,email.toUpperCase(),wrong);
  await expect(page.getByText(/Se o cadastro puder prosseguir/)).toBeVisible();
  expect(countEmail(email)).toEqual({users:1,identities:1});
  const failed=await api.auth.signInWithPassword({email,password:wrong});expect(failed.error).not.toBeNull();
  let signups=0;page.on('request',req=>{if(req.url().includes('/auth/v1/signup'))signups++;});
  await page.goto('/cadastro-aluno');
  await page.getByLabel('Email',{exact:true}).fill(email);
  await page.getByLabel('Senha',{exact:true}).fill(password);
  await page.getByRole('button',{name:/Entrar ou criar/}).click();
  await expect(page.getByRole('heading',{name:'Finalize seu cadastro de aluno'})).toBeVisible();
  expect(signups).toBe(0);expect(countEmail(email)).toEqual({users:1,identities:1});
  expect(localSql(`SELECT count(*) FROM alunos WHERE id='${id}'`)).toBe('0');
});

test('duas conclusões simultâneas, erro tardio, isolamento e marcador protegido no Postgres real',async({browser})=>{
  const {api,id}=await criarEConfirmar(browser,'concorrencia@example.test');
  const medida={aluno_id:id,versao_instrumento:'2026-10-24-v3-exploratorio',ordenacao:profiles,
    afinidade:Object.fromEntries(profiles.map((p,i)=>[p,i?14:16])),confianca:null,concordancia:null,
    qualidade:{indice:null,desvio:1,aquiescencia:0,motivos:[],interpretacao:'exploratoria_nao_probabilistica',ordenacao_confirmada:true}};
  const args={p_nome:'Aluno Integrado',p_apelido:'Teste',p_modo_operacao:'Misto',p_modo_resposta:'pensante',p_perfil_ativo:'achiever',p_medida:medida,p_data_nascimento:'2000-01-01'};
  const failed=await api.rpc('concluir_cadastro_aluno',{...args,p_data_nascimento:'2999-01-01'});
  expect(failed.error).not.toBeNull();expect(localSql(`SELECT count(*) FROM alunos WHERE id='${id}'`)).toBe('0');
  // Uma espera no primeiro INSERT deixa as requisições concorrentes sobrepostas.
  localSql(`CREATE FUNCTION test_atrasar_cadastro() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.5); RETURN NEW; END $$; CREATE TRIGGER test_atrasar_cadastro BEFORE INSERT ON alunos FOR EACH ROW EXECUTE FUNCTION test_atrasar_cadastro();`);
  try{
    const pending=Promise.all([api.rpc('concluir_cadastro_aluno',args),api.rpc('concluir_cadastro_aluno',{...args,p_apelido:'Outra aba'})]);
    await expect.poll(()=>Number(localSql(`SELECT count(DISTINCT pid) FROM pg_stat_activity WHERE usename='authenticator' AND state='active' AND query LIKE '%concluir_cadastro_aluno%'`)),{intervals:[100],timeout:4000}).toBe(2);
    const results=await pending;
    for(const result of results){expect(result.error).toBeNull();expect(result.data).toBe(id);}
  }finally{localSql('DROP TRIGGER test_atrasar_cadastro ON alunos; DROP FUNCTION test_atrasar_cadastro();');}
  expect(localSql(`SELECT count(*) FROM aluno_perfil_medida WHERE aluno_id='${id}'`)).toBe('1');
  expect(localSql(`SELECT count(*) FROM aluno_perfil WHERE aluno_id='${id}'`)).toBe('7');
  const invalidMarker=await api.from('aluno_cadastro_concluido').insert({aluno_id:id});expect(invalidMarker.error?.code).toBe('42501');
  const others=await api.from('alunos').select('id').neq('id',id);expect(others.error).toBeNull();expect(others.data).toEqual([]);
  const privateMaterial=await api.from('conteudo_personalizado').select('id');expect(privateMaterial.error).toBeNull();expect(privateMaterial.data).toEqual([]);
  const anon=client();expect((await anon.rpc('concluir_cadastro_aluno',args)).error).not.toBeNull();
});
