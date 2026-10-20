# Plano do que falta — ranqueada, guildas, missões, eventos

Levantado em 2026-10-19, com a produção em `20261021_11` (as fases 1 a 10 do
[spec anterior](2026-10-19-eventos-missoes-ranks-modos-design.md) aplicadas).

## Como este plano foi levantado

Pela varredura **"a RPC existe × algum cliente a chama"**, que é o que achou as três lacunas
anteriores (`arena_encerrar` sem chamador, o `ELSE 0` da view do rank, o console mentindo nas
escritas de `rank_tipo`). Em números: 54 RPCs de `guilda*`, `arena*`, `evento*`, `missao*`,
`rank*` e `notificacoes*` no banco, cruzadas com todo literal correspondente em `mobile/src` e
`frontend/src`.

O resultado reordena a prioridade: **o banco está muito à frente dos clientes.** Quase tudo o
que falta é trabalho de cliente sobre superfície que já existe, testada e aplicada — e a parte
do banco que falta é pequena.

> **Defeito achado ao levantar isto, já corrigido fora do plano.** `guilda_desafio_responder`
> checava permissão por pertencer à guilda do desafio, e a fase 10 grava `guilda_id = NULL` em
> solo, dupla e turma (obrigada por `guilda_desafios_guilda_do_formato`). Medido na produção:
> os três formatos **criavam e não podiam ser respondidos**. Conserto em `20261021_12` — a
> guarda passa a ser participação, que é a mesma pergunta que `fn_arena_placar` faz para contar
> e `fn_desafio_encerrar` para pagar.

---

## O achado que reordena tudo: a batalha não é jogável

`guilda_desafio_responder` aparece em **um** lugar do código do cliente: o `types.ts` gerado.
Nenhum cliente a chama. E o cartão de desafio no chat da guilda é
`Pressable disabled={message.share.kind !== "questao" …}` — inerte.

Ou seja: as fases 1, 4, 8, 9 e 10 construíram criação, quatro eixos, aposta com piso,
pontuação, fechamento automático, varredura de abandonados e preferência por dificuldade — e
**não existe tela onde o aluno responda uma questão de desafio.** O aluno vê "Um novo desafio
foi lançado!" e não pode fazer nada. Nada do que foi construído paga ninguém.

Três coisas medidas que tornam essa fase mais barata do que parece:

- **`arena_desafio(uuid)` já é exatamente a leitura que a tela precisa**: devolve as questões
  com enunciado, tipo, alternativas e mídia, mais a minha resposta e o tempo — e revela
  `resposta_correta` **só depois** de eu ter respondido (`CASE WHEN r.questao_id IS NULL THEN
  NULL`). Exige participante `aceito`, que a fase 10 garante nos quatro formatos. **Reusar, não
  criar.**
- **`guilda_desafio_questoes` tem RLS ligada e ZERO policy.** Ler a tabela direto do cliente
  devolve lista vazia **em silêncio** — a armadilha que o CLAUDE.md descreve. Então reusar a
  RPC `SECURITY DEFINER` não é conveniência, é necessidade: é ela que atravessa a RLS sem
  expor gabarito antes da hora.
- **Existem dois caminhos de resposta, com regras diferentes**, e os dois com EXECUTE para
  `authenticated`:

  | | `guilda_desafio_responder` (fase 8) | `arena_responder` |
  | --- | --- | --- |
  | permissão | participação (desde `_12`) | participação **e** desafio aberto |
  | tentativas | conta e cobra `desafio_tentativas_*` | **primeira resposta é final** (`DO NOTHING`) |
  | tempo | acumula entre tentativas | grava, teto de 600 s |
  | fecha | `fn_desafio_encerrar` | `arena_encerrar` |
  | espera convidado | não | sim |

  **Decisão necessária:** qual fica. Ter os dois significa que a mesma partida tem duas regras
  de tentativa dependendo de quem chama.

> Uma imprecisão minha da fase 8, para constar: eu escrevi que "nada fecha o desafio". O certo
> é **nada *alcançável* fecha** — `arena_responder` já chamava `arena_encerrar`. O que faltava,
> e ainda falta, é o chamador.

---

## Área por área

### Ranqueada

O que existe: `rank_tipo` com `14/ranqueada` (fase 4) e `15/missoes` (fase 7), os ramos
correspondentes no `CASE` de `vw_rank_posicoes_por_classe_todas`, e a escada de pontos com
aposta e piso.

O que falta:

1. **Nenhuma turma tem rank dos tipos novos.** `ranks` tem **uma linha**: `tipo=2`
   (pontuação), `classe=65`, `periodo=2026.2`. Os tipos existem e ninguém os usa. O professor
   **consegue** escrever `ranks` (medido na fase 4: INSERT/UPDATE/DELETE passam), e **não**
   consegue escrever `rank_tipo` (RLS, por desenho de `20260826_09`) — mas o console não
   explica que tipo e ranking são coisas diferentes, nem oferece os tipos novos ao criar um
   ranking.
2. **`ranks.periodo` é texto livre e nada o rotaciona.** `2026.2` foi digitado à mão. Sem
   rotação, o ranking acumula para sempre e "quem joga mais ganha" piora com o tempo — que é o
   limite de volume já registrado no spec anterior. Rotação é a forma barata de amenizar sem
   Elo.

### Guildas

O que existe: ciclo completo em RPC — criar, convidar, aceitar, recusar, entrar, sair,
dissolver, config, chat — e o desafio de guilda cooperativo funcionando ponta a ponta no banco.

O que falta: **a janela de formação não existe no cliente.** Seis RPCs com EXECUTE para
`authenticated` e nenhum chamador:

`guilda_configurar_turma`, `guilda_janela_aberta`, `guilda_congelar_composicao`,
`guilda_cancelar_convite`, `guilda_classe_atual`, `guilda_atualizar`.

`guilda_config_turma` tem **0 linhas** — nenhuma turma configurou janela. Isso significa que o
professor não tem como abrir, fechar ou congelar a formação de guildas, e que o comportamento
atual é o default de quem nunca configurou. **A conferir antes de implementar:** o que
`guilda_criar` faz quando não há linha de config — permite sempre ou nunca? Não medi.

### Missões

O que existe: `missoes` + `missao_aluno` com RLS, avaliação pelo mesmo avaliador da conquista,
diária determinística por coorte, enriquecimento por LLM com o molde como fallback, rank de
constância, e o painel do professor.

O que falta:

1. **A missão do professor é invisível para o aluno.** `missoesDoDia.ts` filtra
   `origem = 'sistema'` **e** `dia = hoje`. Missão de professor (`origem = 'professor'`, sem
   `dia`) nunca entra na lista. A policy `missoes_aluno_sel` já existe — é filtro de cliente,
   não permissão.
2. **`escopo` só sai `turma`.** `PayloadDaMissao.escopo` é o **tipo literal** `"turma"`, então
   `aluno` e `guilda` não têm caminho de criação. A missão de guilda — que estava no pedido
   original — existe no banco (escopo, mais o CHECK `missoes_guilda_da_ia_exige_aprovacao`) e
   não existe no produto.
3. **`aprovacao` não tem UI.** Aparece só em teste. A fase 2 construiu o estado de aprovação
   justamente para a missão de guilda vinda da IA; sem tela, nenhuma pode ser aprovada.
4. **Ainda não houve uma missão.** `missoes` tem 0 linhas e o cron da diária não rodou desde a
   aplicação (`cron.job_run_details` sem execução de `trailup_missao_diaria` nos últimos dois
   dias; próxima às 03:00 UTC). Há **11 coortes** possíveis na base. Vale conferir a primeira
   execução antes de concluir qualquer coisa sobre a diária em produção.

### Eventos

O que existe: `eventos_classe` + resultado + resultado por guilda, apuração com soma bruta
(fase 4), medalhas como conquista, e as quatro RPCs do ciclo — `abrir`, `definir_missoes`,
`durante`, `encerrar` — **todas chamadas pelo console**.

O que falta: **o aluno não vê evento algum.** `eventos_classe` não aparece em `mobile/src`. O
professor cria, abre, define missões, acompanha e encerra; o aluno nunca soube que havia um
evento, não vê sua posição e não vê a medalha que ganhou. A policy `eventos_classe_aluno_sel`
**já existe**, então é trabalho de cliente sem migração.

Ninguém notou porque `eventos_classe` tem **0 linhas** — nenhum evento foi criado até hoje.

---

## Fases propostas

Em ordem de desbloqueio, não de tamanho. Cada uma é mesclável sozinha.

1. **A tela de jogo do desafio (mobile).** Reusa `arena_desafio` para ler e
   `guilda_desafio_responder` para responder. Cronômetro e tentativas vêm de
   `fn_desafio_params_efetivos` (fase 7), que já devolve `tempo_seg`, `tentativas` e
   `aposta_fator`. Mostra `tentativas_restantes` e `faltam` do retorno, e o resultado quando
   `encerrou` vem preenchido. **Primeira porque sem ela nada do stack paga ninguém.**
   **Feita** — #563 (`20261021_13`, `_14`).
2. **Eventos no mobile.** Cartão do evento aberto, as missões do evento, minha posição e a
   medalha ao encerrar. Leitura direta com RLS — regra de fronteira: não tem modelo de
   linguagem no meio. **Feita** — #564, sem migração.
3. **A missão do professor no aluno.** Ampliar o filtro de `missoesDoDia` para `origem` e
   janela, mostrando prazo. Cuidado medido: hoje a chave da lista é `dia`; missão sem `dia`
   precisa de outra ordenação. **Feita** — #564, sem migração.
4. **Escopo e aprovação no console.** `escopo` deixa de ser tipo literal; tela de aprovação da
   missão de guilda. Fecha a missão de guilda do pedido original.
   **Feita** — #567, com `20261021_15`. O console lê `escopo` (`aluno | turma | guilda`) em vez
   do literal e oferece "A guilda, junta" no formulário; a pendente tem fila própria com Aprovar
   e Recusar (motivo obrigatório); missão que não é do professor perdeu o "Editar" (o
   `trg_missoes_guarda` descartava a mudança em silêncio); a diária do sistema saiu da lista.
   **Decisão de produto: progresso da guilda = soma do progresso dos membros.** O avaliador
   passou a cumprir a missão de guilda pela guilda: soma a contribuição de cada membro no
   período da missão intersectado com a filiação datada de `guilda_membros`, e, quando atinge o
   alvo, conclui e paga uma vez cada membro ativo. Só métricas que somam (contagem de evento,
   atividades concluídas, minutos do dia); a guarda recusa o resto com 22023.
   Pontos em aberto: quem entra na guilda pouco antes da conclusão recebe sem ter contribuído;
   aluno sem guilda vê a missão de guilda da turma sem progresso; ninguém gera missão `pendente`
   ainda (nenhum código grava `origem = 'ia'`).
5. **Rank: os tipos novos e o período.** O console passa a oferecer ranqueada e missões ao
   criar um ranking, e a rotação de `periodo` entra — provavelmente no banco, por ser relógio
   (a regra de fronteira manda; a API hiberna, o Postgres não).
   **Feita** — #568, com `20261021_16` (depois da `_15` do #567). **Decisão de produto: rotação
   manual, o professor abre o período novo** — então não há relógio: o botão "Novo período" do
   console chama `fn_rank_novo_periodo`, que trava a linha, congela a classificação em
   `rank_podio_congelado`, fecha o atual (`fim = now()`) e abre o seguinte com o mesmo tipo e
   turma. O ranking ganhou janela (`inicio`/`fim`, um só aberto por tipo + turma), e a view
   filtra pela data do evento nos critérios de soma (pontos, ranqueada, missões); os de estado
   (percentual, tempo, acertos) seguem sendo o progresso atual. O período fechado fica como
   histórico só de leitura, com o pódio congelado (default a confirmar), e o banco recusa excluí-lo
   (decisão da Geisbelly; só a cascata da turma o leva). O console também passou a
   explicar o que cada tipo mede, exige turma ("Geral" dava 42501) e sugere o período; o mobile
   vê só o período aberto.
6. **Janela de formação de guilda no console.** As seis RPCs sem chamador, começando por medir
   o comportamento default de `guilda_criar` sem config.
   **Feita** — #569, com `20261021_17` (depois da `_16` do #568). Medido: sem linha em
   `guilda_config_turma`, `guilda_janela_aberta` devolve true, então a formação fica **sempre
   aberta**, com tamanho 10. A janela barra criar, entrar, convidar e aceitar convite; sair e
   dissolver não passam por ela. O console ganhou a aba Guildas:
   - estado da janela (aberta, agendada, fechada, sempre aberta) pelo relógio do banco;
   - tamanho máximo e as datas de abrir e fechar (em Brasília), com "Fechar agora" e
     "Abrir sem prazo";
   - tamanho abaixo de uma guilda existente é recusado, com o mínimo permitido na tela;
   - as guildas ativas com os membros, e editar nome e descrição.

   Decidido pela Geisbelly (2026-10-20), aplicado no mesmo PR:
   1. Sair e dissolver **não** respeitam a janela fechada. Fica como está.
   2. Tamanho abaixo do número de membros de uma guilda: **bloqueia.**
      `guilda_configurar_turma` recusa com `guilda_tamanho_abaixo_dos_membros` (22023, mínimo no
      HINT), travando as guildas antes de contar. Antes ela só baixava o limite.
   3. "Fechar agora" **não** cancela convites pendentes. Fica como está; eles só não podem ser
      aceitos com a janela fechada.
   4. O aluno **vê** a janela no app: estado e datas em Brasília na tela de guildas, por
      `guilda_janela_da_turma` (só janela e tamanho, só para colega da turma). Nada expunha as
      datas ao aluno antes. `guilda_janela_fechada` virou texto amigável, com as datas.

   Como `guilda_config_turma` não tem policy nem GRANT e `guilda_listar` só responde a colega
   de turma, a leitura é uma RPC nova: `guilda_formacao_da_turma`, só para o professor.
   Correção do levantamento: `guilda_congelar_composicao` **tem** chamador, porque
   `evento_classe_abrir` a chama ao abrir um evento de guilda. `guilda_classe_atual` é
   auxiliar de `guilda_criar`, e `guilda_cancelar_convite` é do aluno (mobile). Nenhuma das três
   é do console.

## Decisões que não são minhas

1. **Qual caminho de resposta fica** — `guilda_desafio_responder` (cobra tentativa, acumula
   tempo) ou `arena_responder` (primeira resposta final). Com a arena de volta (decisão 2), os
   dois **ficam, cada um com o seu tipo de desafio**, e o banco cobra a separação
   (`20261021_19`): cooperativo (sem equipe 2) só pelo `guilda_desafio_responder`; com
   adversário só pelo `arena_responder`. Unificar ficou decidido como **não**, por agora (ver
   "Decidido", item 1).
2. ~~**A arena revive ou vira legado?**~~ Decidido (2026-10-20): **"A arena volta, com o Elo
   valendo."** Feito no PR depois do #570 (`20261021_19`): as quatro funções que só existiam em
   produção (`arena_desafio_criar`, `arena_listar`, `arena_convite_responder`,
   `arena_responder`) passam a ter fonte no git, e o mobile ganha a aba **Arena** no Social
   (duelo 1x1, dupla 2x2, guilda contra guilda; aceitar/recusar; jogar no `DesafioModal`).
3. ~~**Rotação de período do ranking** — por bimestre, por mês, manual pelo professor?~~
   Decidido (2026-10-20): manual, o professor abre o período novo (fase 5).
4. Herdadas do spec anterior: ~~**Elo versus escada acumulada**~~ — decidido (2026-10-20):
   **Elo**, feito no #570 (`20261021_18`, depois do #569): rating por aluno e turma em
   `ranqueada_elo`, ao lado dos pontos (como o spec anterior pedia), ligado em
   `fn_desafio_encerrar`, que é o fechamento dos dois caminhos de resposta. Só se move em
   ranqueada com adversário (equipe 2), e só a arena cria esse desafio — que, com a decisão 2,
   voltou a ter caminho no app. Segue aberto **medir o custo da LLM**
   da fase 6 antes de ligá-la para todas as turmas.

## Decidido

As 10 decisões da arena e do Elo, abertas no #571. Resposta da Geisbelly (2026-10-20): **"Segue
suas recomendações nas 10"**. As que mudam código foram aplicadas no próprio #571
(`20261021_19`).

1. **Os dois "responder" ficam separados**, cada um com o seu tipo de desafio, e o banco cobra a
   separação. Não muda nada.
2. **Tudo na arena vale Elo**, sem duelo de treino. Não muda nada.
3. **O convite da arena tem janela própria de 24 h**, no lugar dos 30 min:
   `arena_convite_expira_min` = 1440 em `app_config`, lido pela `fn_desafio_varrer_abandonados`
   para desafio com equipe 2. O cooperativo continua com `desafio_encerra_apos_min` (30). A janela
   conta de `created_at` e vale para a partida inteira.
4. **Recusa fecha na hora**: quando a equipe 2 fica sem ninguém, `arena_convite_responder` fecha
   como `sem_adversario`, sem Elo e sem esperar a varredura. Se a recusa deixa todo mundo
   respondido e nenhum convite pendente, fecha com o resultado normal.
5. **Limite diário contra o mesmo adversário: 3 partidas ranqueadas por dia** (horário de
   Brasília), em `arena_limite_diario_mesmo_adversario` (0 desliga). Quem cobra é
   `fn_arena_cobrar_limite_diario`, ao criar e ao aceitar, com o erro
   `arena_limite_diario_adversario` (o HINT traz o limite). O mobile traduz. Conta só partida
   aceita pelos dois em lados opostos, fora `sem_adversario`; convite pendente não conta.
6. **Valores do Elo confirmados**: 1000, K 32, K 40 nas 10 primeiras partidas, média do time.
   Não muda nada.
7. **Quem nunca jogou aparece com 1000.** Não muda nada.
8. **Desafio de evento não conta para o Elo.** Não muda nada.
9. **Sem reset por período.** Não muda nada.
10. **O aluno vê a variação de Elo** ("+20 Elo") no fim da partida e no histórico da aba Arena.
    `arena_listar` e `arena_desafio` devolvem `meu_elo`, só a linha de `auth.uid()` em
    `ranqueada_elo_partida`. A tabela continua sem grant para o cliente.

## O que não entra

- Reescrever a arena. Se ela revive, é extensão do que existe.
- ~~Elo.~~ Entrou no #570 depois da decisão 4, como tabela ao lado: `ranks` segue somando pontos,
  e o Elo é um tipo de ranking a mais (`criterio = 'elo'`).
- Tornar o limite de tempo do desafio autoritativo no banco. Precisa de registro de "questão
  aberta em", que não existe — está registrado na fase 8 e segue valendo.
