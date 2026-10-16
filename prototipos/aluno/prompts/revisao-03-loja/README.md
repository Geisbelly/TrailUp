# Revisão 03 — Loja como página própria, Social como hub e Trilha sem seletor

Prompts para gerar a pasta `prototipos/aluno/v3/` a partir do `v2` (revisão 02) e do comentário da Geisbelly de 09/10/2026.

## De onde vem

Print do Social do v2, com a coluna da direita e o card "Loja · 240 moedas disponíveis" marcados em vermelho, e o comentário:

> "tem que destacar a loja"

A decisão do time (Rafael, 09/10) foi ir **além do destaque**: a Loja vira uma **página própria**, com um item na **barra lateral da esquerda**, igual a Trilha, Notificações, Social, Ranking e Perfil. Com a aba própria, o card da Loja **sai do Social**.

## Por que uma página, e não só o card

No app (`mobile/src/components/loja/StoreModal.tsx`) a loja é um modal aberto pelo Social. Na web, com largura sobrando, um modal de celular esconde justamente o que o desenho da economia pede para o aluno ver **antes** de precisar (`docs/superpowers/specs/2026-09-12-loja-de-moedas-design.md` §7.1):

- quanto cada ação paga;
- as unidades **gratuitas** que ele ainda tem (a dotação só cumpre o papel dela se o aluno souber que existe);
- quanto do teto de prazo da turma já usou;
- de onde veio cada moeda (extrato).

Isso não cabe num card de 60px nem num modal. Cabe numa página.

## O que já existe e a página respeita

Nada nesta revisão é inventado: catálogo, preços, regras e textos vêm do banco e do app.

| Fonte | O que dá |
|---|---|
| `api/alembic/versions/20260912_03_loja_catalogo.py` | Os 4 itens, nomes, descrições, preço base e fator de preço |
| `api/alembic/versions/20260912_01..02` | Razão de moedas e quanto cada evento paga |
| `docs/superpowers/specs/2026-09-12-loja-de-moedas-design.md` | Dotação, teto de prazo, gate de revisão da segunda chance, regra 90/10, métricas do aluno |
| `docs/superpowers/specs/2026-09-12-loja-vitrine-unica-design.md` | A vitrine é **uma seção só, "Itens"**: nada de Combos, Bônus ou Presentes |
| `docs/superpowers/specs/2026-09-13-bag-itens-pessoais-design.md` + `20260913_21_bag_itens_loja.py` | O que se compra aparece na **Bag** |
| `mobile/src/services/loja/storeTheme.ts` | Ícone de cada item e mensagens de erro da compra |
| `mobile/src/assets/utility-profiles/` | Arte por perfil: `store`, `coin`, `deadline`, `retry`, `hint`, `book` |

## Ordem de uso

1. Conversa nova na ferramenta de design. Cole `00-regras-gerais.md` inteiro.
2. `telas/12-loja.md`: tela nova. Anexe `v3/06-social.html` e `v3/08-perfil-hub.html` como referência do shell e do padrão de cabeçalho.
3. `telas/06-social.md`: tira o card da Loja do Social. Anexe `v3/06-social.html`.
4. A barra lateral com o item "Loja" (regra 2.1) vale para **todas** as telas logadas; aplique em cada arquivo.

## Índice

| Prompt | Arquivo | Tipo de mudança |
|---|---|---|
| `00-regras-gerais.md` | todas as telas logadas | Item "Loja" na sidebar; dados e textos que todas compartilham |
| `telas/12-loja.md` | `v3/12-loja.html` (**nova**) | Página da Loja |
| `telas/06-social.md` | `v3/06-social.html` | Social como hub: evento, arena (ranqueada), batalhas; card da Loja removido |
| `telas/03-trilha.md` | `v3/03-trilha.html` | Sai o seletor Mapa/Árvore/Lista; o modo vem do perfil |
| `telas/05-ranking.md` | `v3/05-ranking.html` | "Sua posição" destacada embaixo das categorias; barra de rolagem no tema (todas as telas) |
| `telas/07-notificacoes.md` | `v3/07-notificacoes.html` | Sem painel fixo: a notificação abre no próprio item; topo reorganizado; grupos por data |
| `telas/08-perfil-hub.md` | `v3/08-perfil-hub.html` | Informações da aluna embaixo do nome; conquistas em destaque no topo |
| `telas/11-configuracoes.md` | `v3/11-configuracoes.html` | Painel na largura toda, com resumo da coleta ao lado |

## Decisões para validar com a Geisbelly

| # | Decisão | Por quê |
|---|---|---|
| L1 | A Loja ganha **página própria** e item na sidebar, e o card sai do Social | Pedido do Rafael. O item na sidebar destaca a Loja em todas as telas; a página resolve o resto (dotação, teto, extrato). Dois caminhos para o mesmo lugar só disputariam espaço no Social |
| L2 | O saldo de exemplo passa de **240** para **38** moedas, em todas as telas | 240 contra preços de 4 a 12 deixava tudo de graça e escondia os estados de "faltam N moedas". 38 é coerente com as sementes de ganho (2 por conteúdo, 3 por atividade, 1 por acerto) |
| L3 | Comprar **guarda o item na Bag**; ele é usado depois, na atividade | É o que o banco faz hoje (`loja_compras` com `status = 'ativa'`, projetado na Bag) |
| L4 | Só a seção **Itens**: sem Combos, Bônus e Presentes | `loja-vitrine-unica-design.md` tirou essas seções do app |
| L5 | A Segunda chance aparece **bloqueada até o aluno revisar o material** | Gate de revisão do desenho (§6.4): verificado na compra, para não gastar moeda numa porta fechada |
| S1 | "Ranqueada" = a **Arena** do evento (classificação própria, confrontos pareados por desempenho, opt-in); "Batalha" = os desafios rápidos do banco (Duelo, Duplo, Velocidade, Precisão, Todos) | "o social tem arena, batalha, ranqueada e tudo que envolva social". Arena e eventos vêm do V9 do professor; os modos de desafio já existem em `guilda_desafios` |
| S2 | No card de amigo, "Desafiar" entra no lugar de "Desfazer", que vai para um menu | Desafiar é a ação frequente; desfazer amizade é rara |
| T1 | Sem seletor de modo na Trilha: cada perfil abre no seu (mapa, árvore ou lista). **Revoga a decisão G1 da revisão 02** | A Geis marcou o seletor e escreveu "tirar" |
| R1 | "Sua posição" vai para **embaixo das categorias**, não para o topo da tabela | Das duas sugestões dela, é a que fica sempre visível (a coluna é sticky) e ocupa o espaço vazio que ela marcou |
| N1 | Notificação abre **no próprio item** (como e-mail), em vez de painel ao lado; **revoga o mestre-detalhe da revisão 02 nesta tela** | "essa aba sempre aberta… não ficaram legais" |
