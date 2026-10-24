# Issue #1 — conclusão do cadastro e introdução independente de turma

Data: 24/10/2026. Continuação do PR #617, já integrado. Base desta continuação:
`1eed6013` (inclui a renumeração da migração BrainHex para `20261024_04`).

## Comportamento entregue

A confirmação deixa de depender de `pending-signup` no navegador de origem.
O tipo do formulário vem dos metadados da conta autenticada, com o cache local
como alternativa para contas antigas. Esses metadados escolhem a interface;
não concedem acesso no banco. Contas sem tipo podem escolher o formulário.
A data de nascimento é solicitada novamente quando o cache não está disponível,
sem transferi-la para o JWT. O callback verifica o usuário no servidor, processa
um link explícito antes de aceitar uma sessão anterior e remove o token consumido
da URL. Recarregar a confirmação retoma a sessão.

`concluir_cadastro_aluno` salva aluno, vetor dos sete perfis, perfil ativo, modo
de operação, modo de feedback, descrição inicial, medida e data de nascimento
em uma transação. Erro de qualquer escrita reverte as demais. A conta de Auth
é uma etapa anterior: a transação **não** abrange o serviço de autenticação.
A identidade vem de `auth.uid()` e o e-mail do JWT; o ID da medida deve coincidir.
A função é `SECURITY INVOKER`, mantém a RLS e só é executável por autenticados.
Não cria vínculo com professores nem matrícula em turma.

O marcador `aluno_cadastro_concluido` e o lock por aluno tornam uma nova chamada
após resposta perdida repetível, sem duplicar a medida ou sobrescrever um perfil
posteriormente adaptado. Cadastros parciais antigos podem ser reparados pela RPC.
A interface considera o legado concluído quando há vetor completo e medida;
só existir uma linha em `alunos` não é suficiente. O marcador não é autorização
para acessar turmas e não constitui evidência psicométrica.

O cadastro concluído e o login de aluno levam a `/aluno`. Conforme a escolha
explícita do solicitante de oferecer **ambas** as alternativas, essa área contém:

- Uma introdução ao uso do TrailUp em três etapas, acessível sem turma, com
  explicação, pergunta de compreensão e progresso salvo por aluno no banco.
- A situação das matrículas e orientação para pedir inclusão ao professor,
  além de acesso à instalação do aplicativo. A versão web do app pode ser
  vinculada por `VITE_ALUNO_APP_URL`, sem tokens, credenciais ou parâmetros.

A introdução explica preferências exploratórias, o percurso de materiais/perguntas
e o acesso à turma. Não é uma trilha curricular personalizada, não gera XP/nota
e não implica eficácia pedagógica demonstrada. Os conteúdos da turma continuam
no aplicativo do aluno, sob suas regras de matrícula. Não se transfere sessão
entre origens; no aplicativo, o aluno entra com a mesma conta.

As duas tabelas novas seguem a política `vida_da_conta` da #195, com remoção por
FK `ON DELETE CASCADE`. O teste de inventário de retenção foi corrigido para
reconhecer políticas explicitamente inseridas por migrações posteriores à 03,
sem criar isenções ou deixar de exigir política para tabelas novas.

## Evidências e limites

Executados na continuação:

| Verificação | Resultado |
| --- | --- |
| Frontend, suíte Vitest | 1.182 testes aprovados, 119 arquivos |
| Chromium/Playwright | 7 jornadas aprovadas |
| PostgreSQL/WASM PGlite | 11 cenários aprovados |
| Python, migrações e política de retenção | 41 testes aprovados |
| Typecheck, lint e build do frontend | Aprovados; avisos de lint preexistentes |

Os testes de navegador exercitam as páginas reais com respostas de Auth/PostgREST
simuladas: confirmação sem cache, quiz inteiro, erro e retry de gravação,
retomada de cadastro parcial, login, conta existente sem novo signup, mensagem
genérica para duplicidade, OTP consumido uma vez e introdução com erro de rede
mais retomada do progresso. Não comprovam envio de e-mail, unicidade no serviço
Auth real ou a implantação Supabase.

O teste PGlite executa as RPCs reais de cadastro e nascimento e a tabela real
de medidas, em schema base mínimo. O resumo de consentimento é um helper
simulado. Verifica rollback de erro tardio, validação, isolamento de contas,
retries, reparo parcial, progresso sem turma, rollback/reimplantação e remoção
em cascata. Não executa toda a cadeia nem simula concorrência entre servidores
PostgreSQL independentes.

Reprodução:

```sh
npm --prefix frontend ci
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend exec -- playwright install chromium
npm --prefix frontend run test:cadastro
npm --prefix frontend run test:cadastro-banco
npm --prefix frontend run build
```

Após atualizar a base, o lint também identificou um `any` introduzido na função
de avaliação de redações da main. Ele foi substituído pelo tipo inferido de
`createClient`, sem alteração de comportamento.

Os dois novos comandos de testes também fazem parte do job frontend no CI.
A verificação de banco precisa de `python3` para extrair o SQL das migrações;
não lê `.env` nem abre conexão com o Supabase.

A [fundamentação científica da adaptação](issue-1-adaptacao-evidencias.md)
continua aplicável: testes de software não validam os pesos, os sete construtos
ou ganhos de aprendizagem. Esta continuação não modifica o modelo de pontuação.
Também retira uma alegação remanescente de estilo cognitivo do seletor de ordem
e uma descrição de aprendizagem atribuída ao Daredevil.

## Implantação e aceite

Aplicar as migrações até `20261024_05` **antes** de publicar este frontend. A 05
vem depois da 04, já renumerada na main. Sem a RPC/tabelas, a interface apresenta
erro e permite tentar novamente; não cai na antiga escrita parcial. O downgrade
da 05 remove a RPC, mas preserva os marcadores, o progresso e as políticas de
retenção, para evitar perda de dados e sobrescrita em uma reimplantação.
Nenhuma migração foi aplicada em produção por esta continuação.

O aceite original que exige anunciar publicamente “e-mail já existe” continua
incompatível com a proteção contra enumeração adotada na #329. A implementação
preserva mensagens genéricas, encaminha o titular autenticado para sua conta e
não faz novo signup quando o login funciona. Recomenda-se explicitar essa regra
no aceite antes de fechar a issue. Não se deve reabrir a enumeração para atender
literalmente à redação antiga.

O fechamento ainda depende de integração/implantação e confirmação em ambiente
integrado de teste. Os resultados locais não substituem essa validação nem a
aprovação do CI remoto.
