# Issue #1 — validação integrada local

25/10/2026. Base desta etapa: `ddb779f1`, com #626, renumeração #628 e #629
integrados pelo time. Não houve merge ou implantação por esta sessão.

Execução final no código `017e9092`, com worktree limpa: [versões, digests e resultado](evidencias/issue-1-integracao-local.json).

## Resultado e alcance

A jornada passou com frontend real, Supabase Auth (GoTrue), SMTP/Mailpit,
PostgREST e PostgreSQL reais em contêineres locais. Isso supera a limitação dos
mocks de Auth/PostgREST das rodadas anteriores, mas não equivale à homologação
ou produção: o schema é mínimo e explícito e os materiais são sintéticos.

| Verificação | Evidência executada |
| --- | --- |
| Cadastro e confirmação | Cadastro pela página, e-mail recebido pelo SMTP local, link aberto em outro navegador sem cache de cadastro e quiz completo |
| Persistência | Sete perfis, medida e e-mail confirmado conferidos no PostgreSQL real |
| E-mail duplicado | Após confirmação, nova tentativa com caixa diferente e outra senha mantém uma conta e uma identidade; sucesso ofuscado não fornece sessão; a senha alternativa não autentica |
| Retomada do titular | Login correto no formulário retoma o quiz pendente sem nova requisição de signup |
| Perfil e material | Modelo Aluno e provider reais do mobile consultam PostgREST; sem matrícula não há material, com matrícula retorna o arquivo do perfil e seu conteúdo é acessado |
| Progresso e legado | Introdução salva e retomada; expurgo real e ausência de marcador preservam afinidades e acesso |
| Concorrência | Duas requisições HTTP sobrepostas, dois PIDs ativos observados no PostgreSQL, uma medida e sete perfis ao final |
| Atomicidade e isolamento | Data inválida tardia reverte cadastro; aluno sem matrícula não lê material da turma; não lê outros alunos; INSERT direto no marcador é negado; anônimo não conclui |

São **três cenários integrados**, cada um com múltiplas verificações. Não são três
serviços simulados nem uma estimativa estatística. Os **14 cenários anteriores**
de navegador com serviços simulados também passaram após compartilhar o helper
de preenchimento do quiz. Lint e typecheck do frontend passaram; permanecem sete
avisos de lint preexistentes. Sintaxe dos scripts, Ruff do extrator SQL, YAML e
encoding também foram conferidos. Não há mudança funcional no cálculo ou na UI
nesta etapa; a entrega é o teste reproduzível, seu runner, CI e documentação.

## Reproduzir e inspecionar

```sh
npm --prefix frontend run test:cadastro-integrado
```

Pré-requisitos, portas, limpeza, serviços e limites:
[README do teste](../../scripts/e2e_cadastro/README.md).
O CI frontend passa a executar a mesma jornada local após instalar Chromium.
A execução registra digests das imagens em `evidence.json` temporário; não grava
credenciais, JWTs ou links de confirmação nesse relatório. Os dados são
sintéticos, as portas só aceitam loopback e os serviços descartáveis são removidos
no `finally`. O teste não lê os arquivos `.env` existentes do projeto.

## Distinções necessárias para o aceite

- **Auth real local:** unicidade foi observada no GoTrue 2.197.0 com a configuração
  de confirmação deste teste, não inferida de uma resposta simulada. A resposta
  alternativa de erro para outra configuração continua coberta nos testes de UI.
  [O contrato oficial do Supabase](https://supabase.com/docs/reference/python/auth-signup)
  explica por que o resultado varia conforme as confirmações habilitadas.
- **E-mail real local:** SMTP entregou a mensagem no Mailpit e o link foi usado.
  Não se comprovou entrega pelo provedor de produção, reputação de domínio,
  templates implantados ou recebimento em provedores externos.
- **Banco real, schema mínimo:** usam-se as RPCs reais de cadastro/nascimento e
  suas migrações selecionadas. A base não recria toda a cadeia do Alembic, o
  consentimento é um helper de teste e a policy de matrícula é explícita no
  fixture. O repo mantém schema anterior ao Alembic fora do histórico.
- **Correspondência de material:** o consumidor real leu o perfil persistido e
  recuperou o arquivo correto. O worker de geração, Storage privado/R2 e a
  renderização nativa não foram executados. Não se demonstrou benefício pedagógico
  nem validade psicométrica. A [análise de evidências](issue-1-adaptacao-evidencias.md)
  continua delimitando essas alegações.
- **Migração vigente:** a antiga `20261024_06_integridade_cadastro_legado` foi
  renumerada para **`20261024_08`** no #628. Os relatórios anteriores que citam 06
  registram o estado daquela entrega; a implantação deve seguir a cadeia atual.

## O que ainda impede fechar

A implementação de e-mail/trilha do #629 está integrada. Falta integrar esta
suíte, obter execução aprovada do CI remoto e validar o ambiente implantado:
versão do frontend/mobile, migrações vigentes, SMTP/redirects reais, matrícula e
material efetivamente gerado/entregue pelo pipeline, incluindo Storage privado.
A consulta de deployments no GitHub não retornou registros para este repositório;
isso não prova ausência de deploy externo, apenas não fornece evidência de versão.

O solicitante confirmou que não existe ambiente de homologação separado de
produção. Enquanto não houver evidência da versão implantada e do pipeline, a issue
permanece aberta. Não é adequado trocar a lacuna de mocks por uma alegação de
produção baseada apenas no sucesso do stack local.
