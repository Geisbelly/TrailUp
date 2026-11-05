# Gamificação e personalização: material da página do site

Fonte da página `documentacao/gamificacao.html`, gerada por `scripts/site_docs/gamificacao.py`.

- `catalogo-2026-11-05.json`: retrato do catálogo em produção, só leitura, na revisão `20261105_24`. Não tem dado de aluno. Quando o catálogo mudar, crie um retrato novo com a data e aponte `CATALOGO` para ele: a data aparece na página.
- `uso-2026-11-05.json`: uso medido em produção, só leitura, na revisão `20261105_25`. Só contagens agregadas, sem aluno nem turma identificáveis. O gerador para se as somas não fecharem. Quando remedir, crie um retrato novo com a data e aponte `USO` para ele. Traz também as regras em números e a contagem de PRs por tema, feita por palavra-chave no título.
- `biblioteca/`: reduções das artes do app (ícones de 96 px, objetos de 112 px, bosses de 140 px). A página não publica os originais, que somam mais de 100 MB. As molduras vêm direto de `mobile/src/assets/design/molduras/`.
- `evidencias/`: capturas dos PRs, copiadas das branches `prints/*` do Lab, que é privado.

## Regras para acrescentar uma captura

A página é pública. Antes de copiar, abra a imagem e confira:

- só nome simulado ou conta de demonstração, sem nome, apelido ou foto de aluno ou colega real;
- nenhum e-mail, id do projeto Supabase ou segredo;
- a captura pertence ao PR citado na evidência.

Tetos anti-abuso de `app_config` não entram no retrato: saber o teto ajuda a burlá-lo.

Ficaram de fora nesta rodada: o topo do perfil (mostra o apelido da conta de teste) e as telas da Arena com um colega na lista de adversários.

## O que a página não afirma

A lista está em `NAO_AFIRMA`, no gerador, e segue `docs/tcc/sistema-para-a-monografia-2026-11-04.md`, seção 15. Remeça os números antes de citar: em 05/11/2026, eventos e guildas tinham 0 linhas, só 4 de 17 personalizações estavam prontas e todo o uso vinha de 1 aluno.
