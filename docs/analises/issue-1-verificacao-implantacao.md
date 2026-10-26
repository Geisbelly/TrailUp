# Issue #1 — verificação da implantação

Continuação em 26/10/2026. O #635 já foi integrado. Não existe homologação
separada, conforme informado pelo solicitante. Nenhum cadastro, job ou material
de teste foi criado em produção nesta rodada.

## Evidência observada

Consulta pública de leitura: [resultado JSON](evidencias/issue-1-verificacao-implantacao.json).
O SHA esperado é a base desta continuação, `019d02c0`, e não uma afirmação sobre
o deploy. A API respondeu HTTP 200, com banco acessível; seu health anterior
também indicou worker ativo. Porém não informou revisão (`render_git_commit`
era nulo). `/version.json` devolveu o HTML da SPA. **A revisão implantada não
foi comprovada, nem foi demonstrado que esteja desatualizada.** A URL direta
do backend em `frontend/vercel.json` falhou na validação TLS; a consulta via
proxy HTTPS da Vercel funcionou. Não desativamos a verificação de certificado.

Disponibilidade, versão do contrato de mídia e commit são evidências distintas.
`media_pipeline_version=2026-09-27.1` não identifica a revisão do cadastro.

## Identificação e consulta reproduzível

- O build web gera `version.json`, com `service=frontend` e `build_commit`.
  Usa `TRAILUP_BUILD_COMMIT` explícito ou `VERCEL_GIT_COMMIT_SHA`. Não lê o Git
  local nem infere revisão de arquivos. Sem SHA completo válido, informa nulo.
- API: `GET /health`, campo `details.build_commit`.
- Microserviço: `GET /api/health`, campo `build_commit`.
  Ambos usam `TRAILUP_BUILD_COMMIT`. O campo legado do Render foi preservado.
- Os Dockerfiles aceitam o argumento de build `TRAILUP_BUILD_COMMIT`. Se o
  deploy usar outro builder, fornecer a variável no mecanismo correspondente.
  Nenhuma configuração de Dokploy/Vercel foi alterada nesta sessão.

Na Vercel, conferir que a variável de sistema representa o checkout daquela
implantação e que não existe uma sobrescrita antiga. No Dokploy, associar o SHA
completo ao **mesmo checkout/imagem** efetivamente publicado, a cada build.
Exemplo para quem utiliza o Dockerfile da API:

```sh
docker build --build-arg TRAILUP_BUILD_COMMIT="$(git rev-parse HEAD)" -t trailup-api:verificacao ./api
```

Isso pressupõe checkout limpo. É identificação **declarada**, não atestado
criptográfico: configurar o SHA errado pode produzir uma declaração falsa.
Conferir também o registro de implantação do provedor, a imagem e a ausência
de alterações de código fora do checkout. O teste local de build usa um SHA
de teste para verificar a propagação; isso não publica nem certifica essa revisão.

```sh
python3 scripts/verificar_implantacao.py \
  --frontend https://trailup.vercel.app/version.json SHA_COMPLETO_DO_FRONTEND \
  --api https://trailup.vercel.app/trailup-api/health SHA_COMPLETO_DA_API
```

Para o gerador, acrescentar `--microservice URL_DO_HEALTH SHA_COMPLETO`. Cada
serviço pode estar em revisão diferente. A ferramenta faz somente GET nos
endereços explícitos, com timeout e limite de resposta; não autentica, não segue
redirecionamentos e não chama geração. HTTPS obrigatório fora de loopback.
Só exporta campos permitidos, sem copiar respostas/headers arbitrários.

Saída 0 significa que **todos os serviços solicitados declararam as revisões
esperadas** e responderam no formato saudável esperado. Saída 1 significa
revisão desconhecida/divergente ou falha de consulta; 2 é uso inválido.
Serviços omitidos não são verificados. Isso não atesta migrações, Storage,
qualidade do conteúdo, funcionamento da matrícula ou entrega de e-mail.

## Migrações: separação entre código e implantação

A documentação de `e2e_economia` ainda descrevia rollback silencioso como
pendente. O executor já estava corrigido no **#545**. Removemos o monkeypatch
redundante do alias local e atualizamos a orientação para o Alembic oficial.

Novos testes executam o `api/alembic/env.py` real, SQLAlchemy, Alembic e
PostgreSQL 17.6 em Docker descartável, sem `.env` ou DSN externo:

1. DDL, dado e revisão persistem após o processo terminar; retry é no-op.
2. Falha posterior a DDL/DML desfaz ambos e preserva a revisão anterior.
3. Dois processos distintos são observados aguardando a mesma trava; ambos
   terminam com sucesso e a migração não idempotente é aplicada uma vez.

São revisões sintéticas para testar o executor. Não é um upgrade completo do
schema real. A primeira rodada detectou duas pontas na base `362d5576`; a
atualização para `019d02c0` trouxe a correção que o time integrou no #637.
A cadeia então passou no teste existente de cabeça única e continuidade.

```sh
cd api
TRAILUP_TEST_DOCKER=1 .venv/bin/python -m pytest tests/test_migrations_postgres.py
```

Para comprovar o banco implantado, ainda é necessária consulta de metadados
com acesso autorizado. Não temos conexão administrativa local nesta sessão.
Exemplo somente leitura, sem consultar alunos ou chamar as funções:

```sql
BEGIN TRANSACTION READ ONLY;
SELECT version_num FROM public.alembic_version;
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef, p.proconfig,
       md5(pg_get_functiondef(p.oid)) AS definicao_md5,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_executa,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS aluno_executa
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'concluir_cadastro_aluno', 'cadastro_perfis_integros',
  'meu_cadastro_concluido', 'registrar_conclusao_cadastro');
SELECT has_table_privilege('authenticated',
       'public.aluno_cadastro_concluido', 'INSERT') AS aluno_insere_marcador;
ROLLBACK;
```

Comparar definições/ACL com a cadeia vigente que inclui `20261024_08`. O hash
ajuda a comparar definições, mas não é prova de segurança. Revisão carimbada
isoladamente não comprova ausência de drift. Policies e comportamento devem
ser confrontados com o schema autorizado em um banco local isolado.

## Validação e limite para fechamento

- 62 testes Python direcionados aprovados, incluindo os três casos PostgreSQL.
- 9 testes do manifesto web; typecheck/lint frontend aprovados (7 avisos prévios).
- 32 testes de servidor/contrato do microserviço; typecheck aprovado.
- Build web e consulta HTTP local do manifesto registrados nesta entrega.

Ainda não há credenciais locais de IA em `api/.env`, `microservice/.env` ou
`brainhexpdf/.env`. Os testes de cadastro anteriores usam materiais sintéticos.
Para reduzir essa lacuna sem homologação externa, será preciso executar a API,
gerador, renderizador e Storage num ambiente local isolado, com entradas
sintéticas e credenciais de IA configuradas de modo seguro. É necessário
conferir a geração, persistência, autorização e leitura do material dos sete
perfis, sem utilizar dados reais de alunos. Renderização nativa e matrícula
pela UI do professor permanecem sem evidência integrada nesta rodada.

**Manter a issue aberta** até haver evidência da implantação/migrações e do
pipeline real, além de resolver o bloqueio do CI. O sucesso dos testes de
software não demonstra validade psicométrica ou eficácia pedagógica. A base
de pesquisa e seus limites continuam em [adaptação por evidências](issue-1-adaptacao-evidencias.md).

## Fontes técnicas primárias

- [Vercel — variáveis de sistema](https://vercel.com/docs/environment-variables/system-environment-variables):
  origem documentada de `VERCEL_GIT_COMMIT_SHA`.
- [Dokploy — Build Type](https://docs.dokploy.com/docs/core/applications/build-type):
  configuração de argumentos de build no Dockerfile.
- [SQLAlchemy — transações e autobegin](https://docs.sqlalchemy.org/en/20/core/connections.html):
  a primeira execução inicia uma transação até commit/rollback. A validação
  local verifica o comportamento no executor do projeto, além da documentação.
