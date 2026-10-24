import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(()=>({from:vi.fn(), rpc:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:db}));
import { alunoTemCadastro, lerPendente, tipoDoCadastro, salvarCadastroAluno, type CadastroAlunoPayload } from './cadastroAluno';
import { PERFIS_EM_ORDEM } from './brainhexOrdenacao';

const uid='11111111-1111-4111-8111-111111111111';
const payload: CadastroAlunoPayload = {
  nome:'Aluno',apelido:'Teste',modoOperacao:'Misto',modoApresentacao:'pensante',perfilInicial:'achiever',
  brainhexPercent:Object.fromEntries(PERFIS_EM_ORDEM.map((p,i)=>[p,i?14:16])),brainhexRaw:{},
  ordenacao:[...PERFIS_EM_ORDEM],ordenacaoConfirmada:true,confiancaDoPerfil:null,concordanciaDoPerfil:null,
  qualidadeDaResposta:{indice:null,desvio:1,aquiescencia:0,motivos:[]},
};
const query=(data:unknown,error:unknown=null)=>{
  const q={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),limit:vi.fn(),then:undefined};
  q.select.mockReturnValue(q);q.eq.mockReturnValue({...q,then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(resolve({data,error}))});
  q.maybeSingle.mockResolvedValue({data,error});q.limit.mockResolvedValue({data,error});
  return q;
};
beforeEach(()=>vi.clearAllMocks());
describe('retomada e persistência do cadastro',()=>{
  it('storage ausente, corrompido, bloqueado ou de outro email não impede retomada',()=>{
    for(const raw of [null,'{','{"email":"outro@example.test","tipo":"aluno"}']) expect(lerPendente('aluno@example.test',{getItem:()=>raw})).toBeNull();
    expect(lerPendente('aluno@example.test',{getItem:()=>{throw Error('bloqueado');}})).toBeNull();
    expect(tipoDoCadastro({email:'aluno@example.test',user_metadata:{role:'aluno'}})).toBe('aluno');
  });
  it('marcador confirmado dispensa reconstruir o perfil depois de adaptado',async()=>{
    db.from.mockReturnValueOnce(query({aluno_id:uid}));
    expect(await alunoTemCadastro(uid)).toBe(true);
    expect(db.from).toHaveBeenCalledTimes(1);
  });
  it('sete perfis sem medida ainda são um cadastro parcial',async()=>{
    db.from.mockReturnValueOnce(query(null)).mockReturnValueOnce(query(PERFIS_EM_ORDEM.map((_,i)=>({perfil_id:i,afinidade:i?14:16})))).mockReturnValueOnce(query([]));
    expect(await alunoTemCadastro(uid)).toBe(false);
  });
  it('legado com vetor e medida continua disponível',async()=>{
    db.from.mockReturnValueOnce(query(null)).mockReturnValueOnce(query(PERFIS_EM_ORDEM.map((_,i)=>({perfil_id:i,afinidade:i?14:16})))).mockReturnValueOnce(query([{id:1}]));
    expect(await alunoTemCadastro(uid)).toBe(true);
  });
  it('erro de consulta não é confundido com ausência de cadastro',async()=>{
    db.from.mockReturnValueOnce(query(null,new Error('rede')));
    await expect(alunoTemCadastro(uid)).rejects.toThrow('rede');
  });
  it('usa uma única RPC e envia o modo de feedback antes ignorado',async()=>{
    db.rpc.mockResolvedValueOnce({data:uid,error:null});
    await salvarCadastroAluno(uid,payload,'2000-01-01');
    expect(db.rpc).toHaveBeenCalledOnce();
    expect(db.rpc).toHaveBeenCalledWith('concluir_cadastro_aluno',expect.objectContaining({p_modo_resposta:'pensante',p_data_nascimento:'2000-01-01'}));
    expect(db.from).not.toHaveBeenCalled();
  });
  it('não grava medida inválida nem oculta falha da RPC',async()=>{
    await expect(salvarCadastroAluno(uid,{...payload,ordenacaoConfirmada:false},null)).rejects.toThrow();
    expect(db.rpc).not.toHaveBeenCalled();
    db.rpc.mockResolvedValueOnce({data:null,error:new Error('falha de transação')});
    await expect(salvarCadastroAluno(uid,payload,null)).rejects.toThrow('falha de transação');
  });
  it('resposta vazia não é sucesso',async()=>{
    db.rpc.mockResolvedValueOnce({data:null,error:null});
    await expect(salvarCadastroAluno(uid,payload,null)).rejects.toThrow('não foi confirmado');
  });
});
