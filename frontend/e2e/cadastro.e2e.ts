import { test, expect, type Page } from '@playwright/test';
const uid = '11111111-1111-4111-8111-111111111111';
const user = { id: uid, email: 'aluno@example.test', email_confirmed_at: '2026-10-24T00:00:00Z',
  role: 'authenticated', aud: 'authenticated', created_at:'2026-10-24T00:00:00Z',
  app_metadata: { provider:'email', providers:['email'] }, user_metadata: { role:'aluno' } };

async function ambiente(page: Page, opts: { marker?: boolean; complete?: boolean; session?: boolean; failSave?: boolean; failProgress?: boolean } = {}) {
  const state = { complete: opts.complete ?? false, saveCalls: [] as Record<string, unknown>[],
    progress: [] as string[], signups: 0, confirmations: 0, failProgress: opts.failProgress ?? false, unexpected: [] as string[] };
  const session = { access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub:uid, exp:Math.floor(Date.now()/1000)+3600, role:'authenticated' })).toString('base64url')}.test`,
    token_type:'bearer', expires_in:3600, expires_at:Math.floor(Date.now()/1000)+3600, refresh_token:'test-only', user };
  if (opts.session !== false) await page.addInitScript(s => {
    localStorage.setItem('sb-cadastro-test-auth-token', JSON.stringify(s));
  }, session);
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4187') return route.continue();
    if (url.origin !== 'https://cadastro-test.supabase.co') return route.abort();
    const path = url.pathname, method = route.request().method();
    const reply = (body: unknown, status=200) => route.fulfill({ status, contentType:'application/json', body:JSON.stringify(body) });
    if (path === '/auth/v1/user') return reply(user);
    if (path === '/auth/v1/token') return reply(session);
    if (path === '/auth/v1/verify') { state.confirmations++; return reply(session); }
    if (path === '/auth/v1/signup') { state.signups++; return reply(session); }
    if (path === '/rest/v1/professor') return reply(null);
    if (path === '/rest/v1/alunos') return reply(state.complete ? {id:uid} : null);
    if (path === '/rest/v1/aluno_perfil') return reply([]);
    if (path === '/rest/v1/rpc/meu_cadastro_concluido') return reply(state.complete);
    if (path === '/rest/v1/aluno_cadastro_concluido') return reply((opts.marker ?? state.complete) ? { aluno_id:uid } : null);
    if (path === '/rest/v1/classe_aluno') return reply([]);
    if (path === '/rest/v1/rpc/concluir_cadastro_aluno') {
      state.saveCalls.push(route.request().postDataJSON());
      if (opts.failSave && state.saveCalls.length === 1) return reply({message:'falha simulada', code:'XX000'},500);
      state.complete = true; return reply(uid);
    }
    if (path === '/rest/v1/aluno_introducao') {
      if (method === 'GET') return reply(state.progress.map(etapa => ({etapa})));
      if (state.failProgress) { state.failProgress=false; return reply({message:'falha simulada'},500); }
      state.progress = [...new Set([...state.progress, route.request().postDataJSON().etapa])];
      return reply(null,201);
    }
    state.unexpected.push(`${method} ${path}`);
    return reply({message:'Endpoint não previsto no teste'},500);
  });
  return state;
}

async function responderQuiz(page: Page) {
  await page.getByLabel('Data de nascimento').fill('2000-01-01');
  await page.getByLabel('Nome completo').fill('Aluno Teste');
  await page.getByLabel('Apelido').fill('Aluno');
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  await page.getByText('Misto', {exact:true}).click();
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  await page.getByText('Pensante', {exact:true}).click();
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  await page.getByRole('button', {name:'Próximo', exact:true}).click();
  for (let i=0;i<7;i++) {
    for (const button of await page.getByRole('button', {name:'3', exact:true}).all()) await button.click();
    await page.getByRole('button', {name: i<6 ? 'Próximo' : /Finalizar/, exact:i<6}).click();
  }
  await expect(page.getByRole('button', {name:'Concluir', exact:true})).toBeDisabled();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', {name:'Concluir', exact:true}).click();
  await expect(page.getByRole('heading', {name:'Suas preferências iniciais'})).toBeVisible();
}

test('confirmação sem cache → quiz → falha preserva respostas → retry → introdução sem turma', async ({page}) => {
  const state = await ambiente(page, {failSave:true});
  await page.goto('/auth/confirmacao');
  await expect(page.getByRole('heading',{name:'Finalize seu cadastro de aluno'})).toBeVisible();
  await responderQuiz(page);
  await page.getByRole('button',{name:'Confirmar conta de aluno'}).click();
  await expect.poll(()=>state.saveCalls.length).toBe(1);
  await expect(page.getByRole('heading',{name:'Suas preferências iniciais'})).toBeVisible();
  await expect(page).toHaveURL(/auth\/confirmacao/);
  await page.getByRole('button',{name:'Confirmar conta de aluno'}).click();
  await expect(page).toHaveURL(/\/aluno$/);
  await expect(page.getByRole('heading',{name:'Trilha introdutória'})).toBeVisible();
  await expect(page.getByText(/Você ainda não está em uma turma/)).toBeVisible();
  expect(state.saveCalls).toHaveLength(2);
  expect(state.saveCalls[1]).toEqual(state.saveCalls[0]);
  expect(state.saveCalls[0].p_modo_resposta).toBe('pensante');
  const medida = state.saveCalls[0].p_medida as {afinidade: Record<string,number>; confianca:null};
  expect(Object.values(medida.afinidade).reduce((a,b)=>a+b,0)).toBe(100);
  expect(medida.confianca).toBeNull();
  expect(state.unexpected).toEqual([]);
});

test('introdução exige resposta correta, trata falha e recupera progresso ao recarregar', async ({page}) => {
  const state = await ambiente(page,{complete:true,failProgress:true});
  await page.goto('/aluno');
  await page.getByLabel('Uma medida da minha capacidade de aprender').check();
  await page.getByRole('button',{name:'Concluir etapa'}).click();
  await expect(page.getByText('Releia a explicação e tente novamente.')).toBeVisible();
  expect(state.progress).toEqual([]);
  await page.getByLabel('Uma sugestão baseada nas minhas preferências').check();
  await page.getByRole('button',{name:'Concluir etapa'}).click();
  await expect(page.getByText(/Não foi possível salvar/)).toBeVisible();
  await page.getByRole('button',{name:'Concluir etapa'}).click();
  await expect(page.getByText('1 de 3 etapas concluídas')).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 de 3 etapas concluídas')).toBeVisible();
  await page.getByLabel('Conferir o feedback e voltar ao material quando necessário').check();
  await page.getByRole('button',{name:'Concluir etapa'}).click();
  await page.getByLabel('Pedir ao professor a inclusão da minha conta').check();
  await page.getByRole('button',{name:'Concluir etapa'}).click();
  await expect(page.getByText(/Introdução concluída!/)).toBeVisible();
  expect(state.progress).toEqual(['perfil','sessao','turma']);
  expect(state.unexpected).toEqual([]);
});

test('login de aluno leva à área de estudos sem novo signup', async ({page}) => {
  const state = await ambiente(page,{complete:true,session:false});
  await page.goto('/login');
  await page.getByLabel('Email', {exact:true}).fill(user.email);
  await page.getByLabel('Senha', {exact:true}).fill('SenhaTeste123!');
  await page.getByRole('button',{name:'Entrar',exact:true}).click();
  await expect(page).toHaveURL(/\/aluno$/);
  await expect(page.getByRole('heading',{name:'Trilha introdutória'})).toBeVisible();
  expect(state.signups).toBe(0);
  expect(state.unexpected).toEqual([]);
});

test('marcador antigo sem perfis não libera a área e retoma o quiz', async ({page}) => {
  await ambiente(page,{marker:true});
  await page.goto('/aluno');
  await expect(page).toHaveURL(/auth\/confirmacao/);
  await expect(page.getByRole('heading',{name:'Finalize seu cadastro de aluno'})).toBeVisible();
});

test('legado sem marcador nem medida segue para a trilha sem novo quiz', async ({page}) => {
  const state = await ambiente(page,{complete:true,marker:false,session:false});
  await page.goto('/cadastro-aluno');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Senha',{exact:true}).fill('SenhaTeste123!');
  await page.getByRole('button',{name:/Entrar ou criar/}).click();
  await expect(page).toHaveURL(/\/aluno$/);
  expect(state.signups).toBe(0);
  await expect(page.getByText('0 de 3 etapas concluídas')).toBeVisible();
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow','0');
});

test('e-mail duplicado com senha errada mantém resposta genérica e não finaliza cadastro', async ({page}) => {
  const state = await ambiente(page,{session:false});
  await page.route('**/auth/v1/token*', route=>route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Invalid login credentials',error_code:'invalid_credentials'})}));
  await page.route('**/auth/v1/signup*', route=>route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({message:'User already registered',error_code:'user_already_exists'})}));
  await page.goto('/cadastro-aluno');
  await page.getByLabel('Email',{exact:true}).fill(user.email);
  await page.getByLabel('Senha',{exact:true}).fill('SenhaErrada123!');
  await page.getByLabel('Confirmar senha',{exact:true}).fill('SenhaErrada123!');
  await page.getByLabel('Data de nascimento').fill('2000-01-01');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:/Entrar ou criar/}).click();
  await expect(page.getByText("E-mail ou senha incorretos.", {exact:true})).toBeVisible();
  await expect(page).toHaveURL(/cadastro-aluno/);
  expect(state.saveCalls).toEqual([]);
});


test('link OTP é consumido uma vez e recarregar retoma o formulário sem cache', async ({page}) => {
  const state = await ambiente(page,{session:false});
  await page.goto('/auth/confirmacao?token_hash=teste&type=signup');
  await expect(page).toHaveURL(/auth\/confirmacao$/);
  await expect(page.getByRole('heading',{name:'Finalize seu cadastro de aluno'})).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading',{name:'Finalize seu cadastro de aluno'})).toBeVisible();
  expect(state.confirmations).toBe(1);
  expect(state.unexpected).toEqual([]);
});
