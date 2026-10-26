import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { confirmarSessao } from './confirmarSessao';

function authFixture() {
  let user = { id:'antigo', email:'antigo@example.test', email_confirmed_at:'2026-10-24' };
  const auth = {
    getSession:vi.fn(async()=>({data:{session:{user}},error:null})),
    getUser:vi.fn(async()=>({data:{user},error:null})),
    verifyOtp:vi.fn(async()=>{user={...user,id:'novo',email:'novo@example.test'};return {error:null};}),
    exchangeCodeForSession:vi.fn(async()=>{user={...user,id:'novo',email:'novo@example.test'};return {error:null};}),
  };
  return { mock:auth, auth:auth as unknown as SupabaseClient['auth'] };
}

describe('confirmação da conta correta',()=>{
  it('troca o OTP antes de aceitar a sessão de outra conta',async()=>{
    const {auth,mock}=authFixture();
    expect((await confirmarSessao(auth,new URL('https://site.test/auth/confirmacao?token_hash=abc&type=signup'))).id).toBe('novo');
    expect(mock.verifyOtp).toHaveBeenCalledOnce();
    expect(mock.verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(mock.getUser.mock.invocationCallOrder[0]);
  });
  it('prioriza o código PKCE explícito',async()=>{
    const {auth,mock}=authFixture();
    expect((await confirmarSessao(auth,new URL('https://site.test/auth/confirmacao?code=abc'))).id).toBe('novo');
    expect(mock.exchangeCodeForSession).toHaveBeenCalledWith('abc');
  });
  it('sem link retoma uma conta confirmada',async()=>{
    const {auth,mock}=authFixture();
    expect((await confirmarSessao(auth,new URL('https://site.test/auth/confirmacao'))).id).toBe('antigo');
    expect(mock.verifyOtp).not.toHaveBeenCalled();
  });
  it('erro do link não cai silenciosamente na conta anterior',async()=>{
    const {auth,mock}=authFixture();
    mock.verifyOtp.mockRejectedValueOnce(new Error('expirado'));
    await expect(confirmarSessao(auth,new URL('https://site.test/?token_hash=abc&type=signup'))).rejects.toThrow('expirado');
    expect(mock.getUser).not.toHaveBeenCalled();
  });
  it('não consome link de recuperação como cadastro',async()=>{
    const {auth,mock}=authFixture();
    await expect(confirmarSessao(auth,new URL('https://site.test/?token_hash=abc&type=recovery'))).rejects.toThrow('Tipo');
    expect(mock.verifyOtp).not.toHaveBeenCalled();
  });
  it('exige confirmação verificada no servidor',async()=>{
    const {auth,mock}=authFixture();
    mock.getUser.mockResolvedValueOnce({data:{user:{id:'novo',email:'novo@example.test',email_confirmed_at:''}},error:null});
    await expect(confirmarSessao(auth,new URL('https://site.test/'))).rejects.toThrow('ainda não confirmado');
  });
});
