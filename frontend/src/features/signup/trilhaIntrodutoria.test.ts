import { describe, it, expect } from 'vitest';
import { entradaDoAppAluno, etapasConcluidas, urlAppAluno } from './trilhaIntrodutoria';
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
describe('entrada de quem já tem conta de aluno',()=>{
  it('vai ao app do mesmo site quando a URL não foi configurada ou é inválida',()=>{
    expect(entradaDoAppAluno(undefined)).toBe('/aluno/');
    expect(entradaDoAppAluno('  ')).toBe('/aluno/');
    expect(entradaDoAppAluno('javascript:alert(1)')).toBe('/aluno/');
  });
  it('usa a URL configurada do app',()=>{
    expect(entradaDoAppAluno('https://app.example')).toBe('https://app.example/');
  });
});
