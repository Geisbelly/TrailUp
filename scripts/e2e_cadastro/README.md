# Cadastro integrado, somente local

```sh
npm --prefix frontend ci
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:cadastro-integrado
```

Requer Node 22+, Python 3, Docker Engine/Compose iniciado e contexto Docker com
socket local Unix. O runner não inicia o Docker Desktop automaticamente. Em
Linux CI, o mesmo comando usa o Docker do runner; o job frontend já instala
Chromium com suas dependências. Não requer npm install no mobile.

O runner sobe PostgreSQL 17.6, Supabase Auth (GoTrue) 2.197.0, PostgREST 14.18 e
Mailpit 1.27. As credenciais são aleatórias por execução, em arquivo temporário
com permissão 0600, e não reutilizam `.env` do projeto. O projeto Compose tem
nome aleatório; o `finally` remove seus serviços e volumes e apaga o arquivo de
credenciais. O banco usa tmpfs. Os logs locais de falha ficam no diretório
indicado pelo runner, com permissão 0600; não devem ser publicados porque podem
conter links de confirmação de teste. Não há upload automático de logs/traces.

Portas fixas, vinculadas exclusivamente a `127.0.0.1`:

| Serviço | Porta |
| --- | --- |
| Frontend Vite | 4188 |
| Auth | 57439 |
| PostgREST | 57440 |
| Gateway HTTP de teste | 57441 |
| Caixa de e-mail Mailpit | 58039 |

A porta do PostgreSQL não é publicada. Um conflito de porta interrompe a
execução; o runner não encerra serviços alheios. O gateway roteia apenas Auth e
PostgREST e entrega os arquivos sintéticos do teste. Não é o gateway Supabase de
produção. A biblioteca Supabase e os serviços de autenticação, SMTP e banco são
reais; não há mocks de respostas nessas chamadas. O navegador bloqueia destinos
fora de loopback, e a URL de confirmação e a URL de material são verificadas.

## Escopo da evidência

- Cadastro pela página real; um e-mail recebido pelo SMTP local é aberto em
  outro contexto de navegador, sem `pending-signup`.
- Quiz completo e gravação transacional, sete perfis e uma medida.
- Matrícula e materiais sintéticos inseridos pelo fixture administrativo; o
  modelo `Aluno`, o resolvedor e o provider reais do mobile leem pelo PostgREST.
  A URL retornada é acessada e seu conteúdo é conferido.
- Introdução com progresso persistido e retomada; expurgo real de medida e
  ausência de marcador preservam o cadastro e as afinidades.
- Tentativa duplicada, inclusive caixa diferente diretamente no Auth: uma conta
  e uma identidade; senha alternativa não autentica; o titular retoma sem signup.
- Duas chamadas de conclusão simultâneas. O teste observa **dois PIDs ativos**
  no PostgreSQL enquanto um trigger temporário alonga o INSERT. Há uma única
  medida e sete perfis ao final. O trigger é removido mesmo em erro.
- Erro tardio de data de nascimento reverte o cadastro; outro aluno não lê
  registros alheios nem material de turma sem matrícula; marcador não admite
  INSERT direto; anônimo não executa a conclusão.

A configuração exige confirmação de e-mail e de telefone (este provedor fica
desabilitado). O caso de duplicidade real nesta configuração responde com um
usuário ofuscado; o teste verifica `session=null` e `identities=[]`. A resposta
com erro de duplicidade de outra configuração é coberta na suíte simulada.
Uniformidade de mensagens não comprova igualdade de tempos, códigos de resposta
em todas as configurações nem a configuração usada em produção.

## Schema e limites

O repositório não reproduz o schema anterior ao Alembic a partir do zero.
`schema.sql` é uma base mínima explícita, com RLS de posse/matrícula para a
jornada. `auth.users` e `auth.identities` são administradas pelo GoTrue real;
`auth.uid()` / `auth.jwt()` leem os claims verificados pelo PostgREST.
O helper de resumo de consentimento é uma resposta vazia de teste.

`migrations.py` extrai a RPC real de nascimento e o DDL real de retenção e aplica
as migrações de medida/cadastro `20261003_02`, `20261024_04`, `20261024_05` e
`20261024_08`. Esta última foi renumerada de 06 pelo PR #628. O teste não executa
`alembic upgrade head` nem declara que toda a cadeia de produção foi recriada.

Não executa geração por IA, Storage privado/R2, renderização nativa do aplicativo,
matrícula pela tela do professor ou entrega de e-mail na internet. O material é
sintético: a verificação prova correspondência e entrega local, não qualidade
pedagógica. Também não valida consentimento de menores, OAuth, MFA ou configurações
que não são usadas nesta jornada.

Após sucesso, `evidence.json` no diretório temporário contém data UTC, commit
base, indicação de worktree alterada, digests das imagens e limites. Não contém
contas, tokens ou credenciais. Não substitui registro da versão implantada.
