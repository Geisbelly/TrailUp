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
6. **Janela de formação de guilda no console.** As seis RPCs sem chamador, começando por medir
   o comportamento default de `guilda_criar` sem config.

## Decisões que não são minhas

1. **Qual caminho de resposta fica** — `guilda_desafio_responder` (cobra tentativa, acumula
   tempo) ou `arena_responder` (primeira resposta final). Recomendo o primeiro, porque é o que
   torna "menos tentativas" real, e retirar o GRANT do outro.
2. **A arena revive ou vira legado?** Seis RPCs sem chamador formam um segundo caminho de jogo
   completo, com convite e adversário — coisas que o caminho de guilda não tem.
   `arena_desafio` e `arena_professor_resumo` ficam de todo modo (a primeira é a leitura da
   fase 1 deste plano; a segunda o console já usa).
3. **Rotação de período do ranking** — por bimestre, por mês, manual pelo professor?
4. Herdadas do spec anterior: **Elo versus escada acumulada**, e **medir o custo da LLM** da
   fase 6 antes de ligá-la para todas as turmas.

## O que não entra

- Reescrever a arena. Se ela revive, é extensão do que existe.
- Elo. É tabela nova e muda o significado de `ranks`; decisão 4 primeiro.
- Tornar o limite de tempo do desafio autoritativo no banco. Precisa de registro de "questão
  aberta em", que não existe — está registrado na fase 8 e segue valendo.
