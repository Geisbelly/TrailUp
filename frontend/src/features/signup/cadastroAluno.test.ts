import { describe, it, expect, vi, beforeEach } from 'vitest';
const db = vi.hoisted(()=>({from:vi.fn(), rpc:vi.fn(), auth:{getUser:vi.fn()}}));
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
beforeEach(()=>{
  vi.resetAllMocks();
  db.auth.getUser.mockResolvedValue({data:{user:{id:uid}},error:null});
});
describe('retomada e persistência do cadastro',()=>{
  it('storage ausente, corrompido, bloqueado ou de outro email não impede retomada',()=>{
    for(const raw of [null,'{','{"email":"outro@example.test","tipo":"aluno"}']) expect(lerPendente('aluno@example.test',{getItem:()=>raw})).toBeNull();
    expect(lerPendente('aluno@example.test',{getItem:()=>{throw Error('bloqueado');}})).toBeNull();
    expect(tipoDoCadastro({email:'aluno@example.test',user_metadata:{role:'aluno'}})).toBe('aluno');
  });
  it('aceita o legado íntegro sem consultar marcador ou medida temporária',async()=>{
    db.rpc.mockResolvedValueOnce({data:true,error:null});
    expect(await alunoTemCadastro(uid)).toBe(true);
    expect(db.rpc).toHaveBeenCalledWith('meu_cadastro_concluido');
    expect(db.from).not.toHaveBeenCalled();
  });
  it('respeita cadastro incompleto mesmo que o cliente tenha um marcador antigo',async()=>{
    db.rpc.mockResolvedValueOnce({data:false,error:null});
    expect(await alunoTemCadastro(uid)).toBe(false);
    expect(db.from).not.toHaveBeenCalled();
  });
  it('erro ou resposta ausente não viram sucesso nem redirecionamento ao quiz',async()=>{
    db.rpc.mockResolvedValueOnce({data:null,error:new Error('rede')});
    await expect(alunoTemCadastro(uid)).rejects.toThrow('rede');
    db.rpc.mockResolvedValueOnce({data:null,error:null});
    await expect(alunoTemCadastro(uid)).rejects.toThrow('verificar');
  });
  it('troca de conta não consulta a conclusão do usuário anterior',async()=>{
    db.auth.getUser.mockResolvedValueOnce({data:{user:{id:'outro'}},error:null});
    await expect(alunoTemCadastro(uid)).rejects.toThrow('sessão mudou');
    expect(db.rpc).not.toHaveBeenCalled();
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
