/** Carrega modelo/provider reais do mobile com cliente Supabase real.
 * Só o bootstrap Expo é substituído; queries passam por HTTP/PostgREST.
 */
import { createServer } from '../../frontend/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';
export async function materialDoAluno(client, uid) {
 const root=fileURLToPath(new URL('../../',import.meta.url));
 const server=await createServer({root:`${root}frontend`,configFile:false,logLevel:'silent',appType:'custom',
  plugins:[{name:'isolated-mobile-bootstrap',resolveId(id){
   if(['@/database/supabase','virtual:client'].includes(id))return '\0virtual:client';
   if(id==='@/services/apiBaseUrl')return '\0virtual:api';
  },load(id){
   if(id==='\0virtual:client')return 'export let supabase; export const setClient = c => {supabase=c}; export const getSessionSafe = async () => (await supabase.auth.getSession()).data.session;';
   if(id==='\0virtual:api')return 'export const resolveApiBaseCandidates=()=>[]; export const isNetworkRequestFailedError=()=>false;';
  }}],
  resolve:{alias:[{find:/^@\/(?!database\/supabase$|services\/apiBaseUrl$)(.*)$/,replacement:`${root}mobile/src/$1`}]},
  optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},
  // tsconfigRaw em string: não resolve o `extends: expo/tsconfig.base` do mobile (expo fora do job).
  esbuild:{tsconfigRaw:'{"compilerOptions":{"target":"ESNext","useDefineForClassFields":true}}'},
 });
 try{
  (await server.ssrLoadModule('virtual:client')).setClient(client);
  const {Aluno}=await server.ssrLoadModule(`${root}mobile/src/models/Aluno.ts`);
  const {perfilVisualDoAluno}=await server.ssrLoadModule(`${root}mobile/src/utils/brainHex.ts`);
  const {TrailupApiProvider}=await server.ssrLoadModule(`${root}mobile/src/services/personalizacao/TrailupApiProvider.ts`);
  const aluno=await Aluno.fromViewRow({aluno_id:uid});
  const profile=perfilVisualDoAluno(aluno);
  const provider=new TrailupApiProvider({supabase:client,apiBaseCandidates:[]});
  const result=await provider.listarPersonalizacoesPersistidasPerfil({classeId:10,topicoId:20,conteudoId:30,brainhexProfileKey:profile});
  return {profile,result};
 }finally{await server.close();}
}
