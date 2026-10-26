import { describe, it, expect } from 'vitest';
import { etapasConcluidas, urlAppAluno } from './trilhaIntrodutoria';
describe('retomada da introdução',()=>{
  it('não infla o progresso com duplicatas e etapas desconhecidas',()=>{
    expect([...etapasConcluidas(['perfil','perfil','desconhecida','turma'])]).toEqual(['perfil','turma']);
  });
  it('não oferece link quebrado quando o app web não foi configurado',()=>{
    expect(urlAppAluno(undefined)).toBeNull();
  });
  it('não aceita script, credenciais ou tokens na URL do app',()=>{
    for(const url of ['javascript:alert(1)','http://app.example','https://a:b@app.example','https://app.example/#access_token=abc','https://app.example/?token=abc']) expect(urlAppAluno(url)).toBeNull();
    expect(urlAppAluno('https://app.example')).toBe('https://app.example/');
    expect(urlAppAluno('http://localhost:8081')).toBe('http://localhost:8081/');
  });
});
