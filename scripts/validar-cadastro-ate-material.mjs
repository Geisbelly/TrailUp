/** Integração local: cliente de cadastro → RPC real/PGlite → vetor persistido →
 * resolvedor mobile → provider de materiais. Transporte PostgREST é adaptado
 * para SQL local; materiais são fixtures, não geração por IA nem Auth real.
 */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from '../frontend/node_modules/vite/dist/node/index.js';

export async function validarCadastroAteMaterial(db, test) {
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const clientId = 'virtual:cadastro-client';
  const server = await createServer({
    root: `${repo}frontend`, configFile: false, logLevel: 'silent', appType: 'custom',
    plugins: [{ name: 'isolated-clients',
      resolveId(id) {
        if (['@/integrations/supabase/client', '@/database/supabase', clientId].includes(id)) return `\0${clientId}`;
        if (id === '@/services/apiBaseUrl') return '\0virtual:api-base';
      },
      load(id) {
        if (id === `\0${clientId}`) return 'export const supabase = {}; export const getSessionSafe = async () => null;';
        if (id === '\0virtual:api-base') return 'export const resolveApiBaseCandidates = () => []; export const isNetworkRequestFailedError = () => false;';
      },
    }],
    resolve: { alias: [{ find: "@/lib/dataNascimento", replacement: `${repo}frontend/src/lib/dataNascimento.ts` }, { find: /^@\/(?!integrations\/supabase\/client$|database\/supabase$|services\/apiBaseUrl$)(.*)$/, replacement: `${repo}mobile/src/$1` }] },
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true },
  });
  try {
    const { supabase } = await server.ssrLoadModule(clientId);
    const { salvarCadastroAluno } = await server.ssrLoadModule(`${repo}frontend/src/features/signup/cadastroAluno.ts`);
    const { Aluno } = await server.ssrLoadModule(`${repo}mobile/src/models/Aluno.ts`);
    const { perfilVisualDoAluno } = await server.ssrLoadModule(`${repo}mobile/src/utils/brainHex.ts`);
    const { TrailupApiProvider } = await server.ssrLoadModule(`${repo}mobile/src/services/personalizacao/TrailupApiProvider.ts`);
    const profiles = ['achiever','conqueror','daredevil','mastermind','seeker','socializer','survivor'];
    supabase.rpc = async (name, args) => {
      assert.equal(name, 'concluir_cadastro_aluno');
      const r = await db.query(`SELECT concluir_cadastro_aluno($1,$2,$3,$4,$5,$6,$7) AS id`,
        [args.p_nome,args.p_apelido,args.p_modo_operacao,args.p_modo_resposta,args.p_perfil_ativo,args.p_medida,args.p_data_nascimento]);
      return {data:r.rows[0].id,error:null};
    };
    supabase.from = table => {
      assert.ok(['alunos','aluno_perfil'].includes(table));
      let uid;
      const run = async () => {
        const sql = table === 'alunos'
          ? 'SELECT perfil_ativo FROM alunos WHERE id=$1'
          : `SELECT ap.afinidade::float8 AS afinidade, jsonb_build_object('id',p.id,'nome',p.nome) AS perfil
             FROM aluno_perfil ap JOIN perfil p ON p.id=ap.perfil_id WHERE aluno_id=$1
             ORDER BY ap.afinidade DESC`;
        const {rows}=await db.query(sql,[uid]);
        return {data:table==='alunos'?rows[0]:rows,error:null};
      };
      return {select(){return this;},order(){return this;},
        eq(key,value){assert.equal(key,table==='alunos'?'id':'aluno_id');uid=value;return this;},
        maybeSingle:run, then(resolve,reject){return run().then(resolve,reject);},
      };
    };
    // Schema mínimo da leitura; RLS de matrícula simulada explicitamente.
    await db.exec(`RESET ROLE;
      CREATE TABLE jornada_matriculas(aluno_id uuid, classe_id int);
      CREATE TABLE jornada_materiais(id int PRIMARY KEY, classe_id int, topico_id int, conteudo_id int, record jsonb);
      GRANT SELECT ON jornada_matriculas, jornada_materiais TO authenticated;
      ALTER TABLE jornada_materiais ENABLE ROW LEVEL SECURITY;
      CREATE POLICY matriculado ON jornada_materiais TO authenticated USING (
        EXISTS(SELECT 1 FROM jornada_matriculas m WHERE m.aluno_id=auth.uid() AND m.classe_id=jornada_materiais.classe_id));
    `);
    for (const [i, profile] of profiles.entries()) {
      const record = {id:i+1, classe_id:10, topico_id:20, conteudo_id:30, brainhex_profile_key:profile,
        materiais:{markdown:{arquivo_url:`https://example.test/brainhex/${profile}/material.md`}}};
      await db.query('INSERT INTO jornada_materiais VALUES($1,10,20,30,$2)',[i+1,record]);
    }
    // Adaptador mínimo de PostgREST; filtros e paginação são executados no banco.
    const provider = new TrailupApiProvider({apiBaseCandidates:[],supabase:{from(table) {
      assert.ok(['conteudo_personalizado','cards_personalizados'].includes(table));
      const filters=[]; let start=0, count=1000;
      return {select(){return this;}, order(){return this;},
        eq(key,value){ assert.ok(['classe_id','topico_id','conteudo_id'].includes(key)); filters.push([key,value]); return this; },
        range(from,to){start=from;count=to-from+1;return this;}, limit(n){count=n;return this;},
        async then(resolve,reject) {
          try {
            if (table==='cards_personalizados') return resolve({data:[],error:null});
            const where=filters.map(([key],i)=>`${key}=$${i+1}`).join(' AND ');
            const values=filters.map(([,value])=>value);
            const r=await db.query(`SELECT record FROM jornada_materiais WHERE ${where} ORDER BY id LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,count,start]);
            return resolve({data:r.rows.map(r=>r.record),error:null});
          } catch(error) { return reject(error); }
        },
      };
    }}});
    for (const [i, active] of profiles.entries()) {
      await test(`cadastro persistido → escolha ${active} → material correspondente, com e sem turma`, async()=>{
        const id=`77777777-7777-4777-8777-77777777777${i}`;
        await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${id}';`);
        const dominant=profiles[(i+1)%7];
        const percent=Object.fromEntries(profiles.map(p=>[p,p===dominant?40:p===active?35:5]));
        const payload={nome:'Aluno Teste',apelido:'Teste',modoOperacao:'Misto',modoApresentacao:'pensante',
          perfilInicial:active,brainhexPercent:percent,ordenacao:profiles,ordenacaoConfirmada:true,
          confiancaDoPerfil:null,concordanciaDoPerfil:null,qualidadeDaResposta:{indice:null,desvio:1,aquiescencia:0,motivos:[]}};
        await salvarCadastroAluno(id,payload,'2000-01-01');
        const aluno=await Aluno.fromViewRow({aluno_id:id});
        assert.equal(aluno.perfis.length,7);
        assert.equal(aluno.perfilAtivo,active);
        assert.deepEqual(Object.fromEntries(aluno.perfis.map(p=>[p.nome,p.afinidade])),percent);
        // A escolha persistida é o segundo perfil elegível, não o dominante.
        const selected=perfilVisualDoAluno(aluno);
        assert.equal(selected,active);
        const params={classeId:10,topicoId:20,conteudoId:30,brainhexProfileKey:selected};
        assert.equal((await provider.listarPersonalizacoesPersistidasPerfil(params)).total,0);
        await db.exec('RESET ROLE');
        await db.query('INSERT INTO jornada_matriculas VALUES($1,10)',[id]);
        await db.exec(`SET ROLE authenticated; SET request.jwt.claim.sub = '${id}';`);
        const result=await provider.listarPersonalizacoesPersistidasPerfil(params);
        assert.equal(result.total,1);
        assert.equal(result.itens[0].brainhex_profile_key,active);
        assert.equal(result.itens[0].materiais.markdown.arquivo_url,`https://example.test/brainhex/${active}/material.md`);
        assert.equal((await provider.listarPersonalizacoesPersistidasPerfil({...params,classeId:11})).total,0);
        // Retry com outra escolha não sobrescreve o perfil já salvo.
        await salvarCadastroAluno(id,{...payload,perfilInicial:dominant},'2000-01-01');
        assert.equal((await db.query('SELECT perfil_ativo FROM alunos WHERE id=$1',[id])).rows[0].perfil_ativo,active);
      });
    }
  } finally { await server.close(); }
}
