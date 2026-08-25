# 06. Implementacao

Data de atualizacao: 2026-04-19

## 1. Stack e padroes adotados
- backend: FastAPI, SQLAlchemy async, LangGraph, Alembic;
- mobile: Expo Router + React Native + Supabase client;
- web professor: React + Vite + Supabase;
- microservico multimidia: Node/TS + Gemini + Supabase Storage.

## 2. Estrategia de modularizacao
- separacao por contexto funcional (personalizacao, progresso, ranking, auth, ingestao);
- repositorios para acesso a dados;
- services para orquestracao de caso de uso;
- schemas/DTO para contratos estaveis entre camadas.

## 3. Pipeline de personalizacao implementado
1. resolve contexto;
2. define plano;
3. gera materiais;
4. aplica quality gate;
5. persiste payload canonico;
6. publica status por formato;
7. permite reprocessamento incremental.

## 4. Pipeline de midia implementado
- requisicao assincrona para microservico especializado;
- upload de artefatos em storage;
- retorno de referencias e status;
- merge seguro sem sobrescrever conteudo ja finalizado.

## 5. Interfaces entre componentes
- REST para chamadas de operacao e consulta;
- banco e storage como camada de estado compartilhado;
- view SQL para consumo de ranking sem recalculo no cliente.

## 6. Configuracao e ambientes
- `.env` com chaves por servico;
- separacao dev/homolog/prod;
- configuracao de URL publica correta para mobile em dispositivo fisico/emulador.

## 7. Qualidade de codigo
- lint e tipagem estrita;
- tratamento de erro com fallback controlado;
- compatibilidade retroativa em contratos sensiveis;
- logs estruturados por contexto de negocio.

## 8. Testabilidade
- testes unitarios para regras de negocio e serializacao;
- testes de integracao para rotas e repositorios criticos;
- validacao manual guiada para fluxos de UX e multimidia.

## 9. Operacao e deploy
- deploy independente por repositorio;
- migracoes de banco versionadas;
- rollout gradual de recursos com monitoramento de erro/latencia.

## 10. Checklist de release
- migracoes aplicadas;
- contratos validados entre clientes e API;
- smoke test de login, trilha, personalizacao e ranking;
- verificacao de dashboards e logs pos-deploy.
