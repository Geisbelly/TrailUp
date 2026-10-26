# Implementar o protótipo `mobile-v1` no app do aluno

Instruções para o Claude Code que vai levar o protótipo do app do aluno no celular para o código. Leia tudo antes de abrir o primeiro arquivo.

## Objetivo

Ajustar o **layout do celular** do app do aluno (`mobile/`, Expo + React Native) ao protótipo HTML em `prototipos/aluno/mobile-v1/`. As telas já existem no app: o trabalho é adaptar o layout, não criar do zero. Textos, regras de negócio, estados e dados já estão no app ou no protótipo web v4. Não invente nada.

## O que ler, nesta ordem

1. `CLAUDE.md` na raiz do repo. Tem as regras do monorepo, e as que mais importam são a de PR e a de fronteira API × banco.
2. `prototipos/aluno/prompts/mobile-v1/README.md`, com a tabela das 10 partes: tela do v4 de origem, arquivo do app hoje, prompt e tela do protótipo.
3. `prototipos/aluno/prompts/mobile-v1/00-regras-gerais.md`, as regras do celular que valem para todas as partes: moldura, áreas seguras, barra de abas, folha de baixo, toques de 44px e tema por perfil.
4. O prompt da parte em que você está, em `prototipos/aluno/prompts/mobile-v1/telas/`. Cada um tem três seções:
   - **De onde vem**: a tela do v4 e o arquivo do app hoje;
   - **O que fica igual ao v4**: não mude nada disso;
   - **O que muda no celular**: **é isso que você implementa**.
5. A tela do protótipo, em `prototipos/aluno/mobile-v1/NN-*.html`. Abra no navegador. No topo ficam o seletor de **estado** e as bolinhas de **perfil** BrainHex, e a URL aceita `?estado=` e `?perfil=`. Confira os estados e pelo menos dois perfis, um de cada modo (mapa, árvore, lista).

Peças compartilhadas do protótipo, em `prototipos/aluno/mobile-v1/assets/`:
- `tema.js`: os 7 perfis, a paleta, a barra de abas e os hexágonos;
- `app.css`: a folha de baixo, os chips, os botões e o esqueleto;
- `social.js`, `bag.js` e `tour.js`: Social, Bag e tutorial;
- `aparelho.css` e `aparelho.js`: moldura, barra de status e teclado falsos, que só existem no protótipo e **não são implementados**.

As artes vêm de `prototipos/aluno/v4/assets/`. Quase todas já existem no app; confira em `mobile/src/constants/designAssets.ts` antes de adicionar alguma.

## Onde mexer no código

- Telas: `mobile/src/app/(tabs)/...` (trilha, ranking, social, notificacoes, perfil e subtelas) e `mobile/src/app/(auth)/...` (entrada, login, recuperar senha).
- Componentes: `mobile/src/components/`.
- **Não quebre a web.** A web do aluno é o mesmo app via react-native-web. A tela larga é decidida por `useDesktopWeb()` (web e largura ≥ 1024) e usa componentes de `mobile/src/components/web/`. Tudo o que for só do celular vai no ramo em que `useDesktopWeb()` é `false`. Não mexa em `components/web/` para implementar o celular.
- Siga o estilo do arquivo em volta: nomes em português, `StyleSheet.create`, comentários curtos que explicam o porquê.

## Ordem e tamanho do trabalho

- Siga a ordem numérica das partes, de 1 a 10. A parte 1 (entrada/login) não depende de nada. A parte 2 (Trilha) cria as peças que o resto usa: barra de abas, folha de baixo e tema por perfil.
- **Um PR por parte**, ou por tela ou peça quando a parte for grande, como a 7 (Perfil, Biblioteca, Relatório e Bag). PRs pequenos.
- A cada PR: implementar, testar, commitar, abrir o PR, **parar e reportar** ao usuário antes da próxima parte.

## Regras que não se quebram

- **Nunca mesclar PR**, nem com `gh pr merge`, nem pela interface, nem por push na `main`. Só abrir; quem mescla é o time.
- Cada PR sai de um branch novo a partir da `main` atualizada e tem base `main`. Se uma parte depender de outra ainda não mesclada, empilhe o branch e diga isso na descrição do PR.
- **Nada de banco, migração ou backend.** O protótipo não pede dado novo. Se faltar dado, pare e pergunte em vez de criar tabela, RPC ou endpoint.
- Não suba a API nem o microservice: eles gravam no Supabase compartilhado.
- Não digite senhas. Para ver o app logado, peça ao usuário que faça o login.
- Arquivos em UTF-8 sem BOM.

## Antes de cada push

Em `mobile/`:

```
npm run lint
npm run typecheck
npm test
```

Os três precisam passar. Confira também `git status` e `git diff --stat` para não levar arquivo apagado ou solto (por exemplo `brainhexpdf/package-lock.json`). O teste local é o que vale: confira no GitHub se o CI está rodando antes de depender dele (já houve período parado por cota do Actions).

Se possível, confira a tela no Expo (celular ou emulador) ou na web com a janela estreita (< 1024px), comparando com o protótipo no mesmo estado e perfil. Diga no PR o que foi conferido e o que não foi.

## Commits e PR

- Mensagem no padrão do repo: `feat(mobile): <o que muda> (mobile-v1, parte N)`.
- Na descrição do PR:
  - a parte e os links do prompt e da tela do protótipo;
  - o que mudou em relação ao app;
  - o que foi conferido;
  - o que ficou de fora.
- Se for criada uma issue de acompanhamento (algo como "Implementar no app o protótipo mobile-v1"), ligue cada PR a ela.
