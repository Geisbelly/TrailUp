/** Stack isolado: credenciais aleatórias, portas em loopback, dados descartáveis.
 * Não carrega .env do projeto. O finally remove somente este projeto Compose.
 */
import { createServer as httpServer, request } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, openSync, closeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const root=fileURLToPath(new URL('../../',import.meta.url));
const composeFile=join(root,'scripts/e2e_cadastro/compose.yml');
if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw Error('Somente Docker local é permitido.');
const host=execFileSync('docker',['context','inspect','--format','{{(index .Endpoints "docker").Host}}'],{encoding:'utf8'}).trim();
if (!host.startsWith('unix://')) throw Error('O contexto Docker deve usar socket local.');
const dir=mkdtempSync(join(tmpdir(),'trailup-cadastro-integrado-'));
const envFile=join(dir,'env');
const project=`trailup-issue1-${randomBytes(5).toString('hex')}`;
const password=randomBytes(24).toString('hex'), secret=randomBytes(32).toString('hex');
writeFileSync(envFile,`TEST_DB_PASSWORD=${password}\nTEST_JWT_SECRET=${secret}\n`,{mode:0o600});
const environment={...process.env,TEST_DB_PASSWORD:password,TEST_JWT_SECRET:secret};
const compose=['compose','--env-file',envFile,'-f',composeFile,'-p',project];
const log= openSync(join(dir,'services.log'),'w',0o600);
let interrupted=false;
const children=new Set();
const stop=()=>{interrupted=true;for(const child of children)child.kill('SIGTERM');};
process.once('SIGINT',stop);process.once('SIGTERM',stop);
const run=(cmd,args,options={})=>new Promise((resolve,reject)=>{
  const child=spawn(cmd,args,{cwd:root,env:environment,stdio:['ignore',log,log],...options});
  children.add(child);
  child.on('error',reject);child.on('exit',code=>{children.delete(child);code===0?resolve():reject(Error(`${cmd} terminou com código ${code}; logs locais em ${dir}`));});
});
const sql=text=>execFileSync('docker',[...compose,'exec','-T','db','psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],{cwd:root,env:environment,input:text,encoding:'utf8',stdio:['pipe','pipe',log]});
const jwt=role=>{
 const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
 const body=`${encode({alg:'HS256',typ:'JWT'})}.${encode({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+7200})}`;
 return `${body}.${createHmac('sha256',secret).update(body).digest('base64url')}`;
};
const anon=jwt('anon');
const waitFor=async(url)=>{
 for(let n=0;n<60;n++){
  if(interrupted)throw Error('Teste interrompido.');
  try {const r=await fetch(url,{signal:AbortSignal.timeout(1500)});if(r.ok)return;}catch{}
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 throw Error(`Serviço local indisponível: ${url}`);
};
const profiles=new Set(['achiever','conqueror','daredevil','mastermind','seeker','socializer','survivor']);
const gateway=httpServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:4188');
 res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,range,range-unit,accept-profile,content-profile,x-supabase-api-version');
 res.setHeader('Access-Control-Allow-Methods','GET,POST,PATCH,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 if(req.url?.startsWith('/materials/')){
  const profile=req.url.slice('/materials/'.length).replace(/\.md$/,'');
  res.writeHead(profiles.has(profile)?200:404,{'Content-Type':'text/markdown'});
  res.end(profiles.has(profile)?`# Material sintético ${profile}\nConteúdo de teste para verificar entrega, sem alegar adaptação pedagógica.`:'');return;
 }
 const isAuth=req.url?.startsWith('/auth/v1/'), isRest=req.url?.startsWith('/rest/v1/');
 if(!isAuth&&!isRest){res.writeHead(404);res.end();return;}
 const prefix=isAuth?'/auth/v1':'/rest/v1';
 const upstream=request({hostname:'127.0.0.1',port:isAuth?57439:57440,path:req.url.slice(prefix.length),method:req.method,headers:{...req.headers,host:`127.0.0.1:${isAuth?57439:57440}`}},response=>{
  const headers={...response.headers,'access-control-allow-origin':'http://127.0.0.1:4188'};
  res.writeHead(response.statusCode??502,headers);response.pipe(res);
 });
 upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
});
let opened=false;
try {
 console.log('Iniciando PostgreSQL e caixa de e-mail locais...');
 await run('docker',[...compose,'up','-d','--wait','db','mail']);
 sql(`CREATE SCHEMA auth; CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${password}'; GRANT anon,authenticated,service_role TO authenticator;`);
 await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(57441,'127.0.0.1',resolve);});opened=true;
 console.log('Iniciando Auth real e aplicando migrações de cadastro...');
 await run('docker',[...compose,'up','-d','--no-deps','auth']);
 await waitFor('http://127.0.0.1:57439/health');
 sql(readFileSync(join(root,'scripts/e2e_cadastro/schema.sql'),'utf8'));
 sql(execFileSync('python3',[join(root,'scripts/e2e_cadastro/migrations.py')],{cwd:root,encoding:'utf8'}));
 await run('docker',[...compose,'up','-d','--no-deps','rest']);
 await waitFor('http://127.0.0.1:57440/');
 await waitFor('http://127.0.0.1:58039/api/v1/messages');
 console.log('Executando navegador e verificações em Auth/PostgREST/PostgreSQL reais...');
 await run('npm',['exec','--','playwright','test','--config','playwright.integrado.config.ts'],{
  cwd:join(root,'frontend'),stdio:'inherit',env:{...environment,
   TRAILUP_TEST_COMPOSE_PROJECT:project,TRAILUP_TEST_ENV_FILE:envFile,
   VITE_SUPABASE_URL:'http://127.0.0.1:57441',VITE_SUPABASE_PUBLISHABLE_KEY:anon,
  },
 });
 const images=['postgres:17.6-alpine','supabase/gotrue:v2.197.0','postgrest/postgrest:v14.18','axllent/mailpit:v1.27'];
 const evidence={timestamp:new Date().toISOString(),baseCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
   worktreeDirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),
   images:images.map(image=>({image,digest:execFileSync('docker',['image','inspect',image,'--format','{{index .RepoDigests 0}}'],{encoding:'utf8'}).trim()})),
   testedMigrations:['20261003_02','20261024_04','20261024_05','20261024_08'],
   limits:['Schema base mínimo e helper de consentimento explícitos','Material sintético, sem geração LLM/Storage real','Não é implantação nem schema completo de produção']};
 writeFileSync(join(dir,'evidence.json'),JSON.stringify(evidence,null,2));
 console.log(`Versões e limites registrados em ${join(dir,'evidence.json')}`);
 console.log('Validação integrada local aprovada. Encerrando serviços descartáveis.');
} catch(error) {
 await run('docker',[...compose,'logs','--no-color']).catch(()=>{});
 throw error;
} finally {
 if(opened)await new Promise(resolve=>gateway.close(resolve));
 await run('docker',[...compose,'down','-v']).catch(error=>console.error(error.message));
 closeSync(log);rmSync(envFile,{force:true});
}
