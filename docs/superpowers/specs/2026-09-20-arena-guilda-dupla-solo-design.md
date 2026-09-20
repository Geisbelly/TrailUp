# Design: Arena — guilda, dupla e solo, com pontuação no rank

## O que já existe (medido, não suposto)

O ponto de partida deste desenho não é uma tela em branco. O substrato do
desafio de guilda **já está inteiro no banco** e **não tem um chamador sequer**:

| Peça | Estado medido |
| --- | --- |
| `guilda_desafios` | 3 linhas (`velocidade`, `velocidade`, `todos`) |
| `guilda_desafio_questoes` | 9 linhas |
| `guilda_desafio_respostas` | **0 linhas** |
| `guilda_desafio_criar(uuid, text, int)` | existe; `CHECK` aceita `todos`, `velocidade`, `precisao`, **`duelo`**, **`duplo`** |
| `guilda_desafio_responder(uuid, bigint, text)` | existe |
| Chamador no monorepo | **nenhum** (`mobile/src`, `frontend/src`, `api/app`) |

Ou seja: a lista de modos **já previa duelo e dupla** — só que num lugar onde
elas nunca poderiam funcionar, e sem nada que as invocasse.

Três fatos decidem este desenho:

1. **`modo` mistura duas perguntas diferentes.** `todos`/`velocidade`/`precisao`
   respondem *como se ganha*; `duelo`/`duplo` respondem *quem joga*. Com as
   cinco na mesma coluna, "um duelo decidido por velocidade" é indizível — e é
   exatamente o que o pedido descreve.
2. **`guilda_desafios.guilda_id` é `NOT NULL`.** Duelo entre dois alunos de
   guildas diferentes, ou entre dois alunos sem guilda, não cabe na tabela.
3. **Nada disso pontua.** `guilda_desafio_responder` grava só em
   `guilda_desafio_respostas`. Não há `INSERT` em `eventos_aluno` em lugar
   nenhum do caminho, e `questao_aluno` — onde
   `guilda_chat_questao_responder` grava — **não tem gatilho algum** (conferido
   em `pg_trigger`). Desafio de guilda, hoje, vale zero ponto.

> Correção de registro: o `CLAUDE.md` afirmava que "nenhuma linha do monorepo lê
> ou escreve" as tabelas sociais e que `aberturas.social` não é lido por
> ninguém. As duas coisas deixaram de valer: há uma aba Social inteira
> (`app/(tabs)/social/index.tsx`, 4 seções, 5 componentes, 7 serviços) e
> `_layout.tsx:135` usa `aberturas.social` para revelá-la. O parágrafo foi
> reescrito junto com esta entrega.

## Objetivo

Tornar o desafio alcançável em **três formatos** — por guilda, em dupla e solo
entre jogadores —, com placar próprio e com a pontuação chegando ao rank da
turma pelo caminho que o rank já usa.

## Decisão 1 — `formato` e `modo` são colunas diferentes

`formato` (**quem joga**) entra como coluna nova, `NOT NULL DEFAULT 'guilda'`:

| `formato` | Equipe 1 | Equipe 2 |
| --- | --- | --- |
| `guilda` | membros ativos da guilda, congelados na criação | vazia (a guilda joga contra a régua do `modo`) |
| `dupla` | criador + 1 aliado | 2 adversários |
| `solo` | criador | 1 adversário |

`modo` (**como se ganha**) encolhe para as três que sempre foram dele:
`todos`, `velocidade`, `precisao`. `duelo` e `duplo` saem do `CHECK` e viram
`formato`. Isso é estreitar, não reescrever: **zero das 3 linhas existentes usa
uma das duas** — as três são `velocidade` ou `todos`, e todas viram
`formato = 'guilda'`, que é o que elas sempre foram.

Deixar as cinco no `CHECK` depois de criar `formato` seria manter duas maneiras
de dizer a mesma coisa na mesma tabela — a segunda autoridade que a regra de
fronteira do repo proíbe.

## Decisão 2 — quem joga sai de `desafio_participantes`, e só de lá

```
desafio_participantes(
  desafio_id  uuid    -> guilda_desafios(id) ON DELETE CASCADE,
  aluno_id    uuid    -> alunos(id)          ON DELETE CASCADE,
  equipe      smallint CHECK (equipe IN (1,2)),
  estado      text     CHECK (estado IN ('convidado','aceito','recusado')),
  convidado_em, respondido_em,
  PRIMARY KEY (desafio_id, aluno_id)
)
```

`guilda_id` passa a aceitar `NULL` e vira **rótulo**, não autoridade: ele diz de
qual guilda o desafio saiu, e nada mais. Quem responde, quem pontua e quem
aparece no placar sai da tabela de participantes.

A razão é a mesma que a spec de guildas de `2026-09-12` já tinha escrito para o
snapshot de composição, e que `guilda_evento_snapshot` (0 linhas) nunca chegou a
exercer: **a composição congela na abertura.** Um desafio de guilda criado hoje
lista os membros de hoje; quem sair da guilda amanhã continua no placar, e quem
entrar depois fica de fora. Sem congelar, `guilda_listar` mudaria o placar de um
desafio já respondido toda vez que alguém entrasse ou saísse.

No formato `guilda` os membros nascem `aceito` — são colegas de guilda, não há
convite a fazer. Em `dupla` e `solo`, todo mundo que não é o criador nasce
`convidado` e precisa aceitar.

## Decisão 3 — `velocidade` precisa de um relógio, e não havia nenhum

`guilda_desafio_respostas` guarda `respondida_em` e mais nada de tempo. Com isso
o modo `velocidade` não é apenas não implementado: ele é **inavaliável**, porque
`respondida_em` mede quando a resposta chegou, não quanto a pessoa levou.

Entra `tempo_ms integer`, medido no cliente como a **latência da tentativa** — o
intervalo entre a questão aparecer e o aluno confirmar. É a mesma medida, e a
mesma forma, que `QuestionActivity` já usa para `questao_aluno.tempo_gasto_seg`
(`medirLatenciaDaTentativa`), de propósito: são a mesma grandeza, e duas contas
diferentes para ela divergiriam. O servidor apara em 10 minutos por questão.

Isso **não** substitui o escopo `question` da telemetria, que mede permanência
somada por lote. São medidas diferentes e convivem, exatamente como o
`CLAUDE.md` já registra para `questao_aluno.tempo_gasto_seg`.

## Decisão 4 — a pontuação entra pela porta que o rank já lê

O rank soma `eventos_aluno.valor` filtrando por `classe_id`. Três coisas
decorrem disso e nenhuma é negociável:

1. **O tipo começa com `desafio_`, nunca com `participacao_`.**
   `fn_evento_creditado` casa por PREFIXO e devolve o `valor` que o CHAMADOR
   mandou para `presenca*`, `participacao*` e `conquista*`. Um tipo chamado
   `participacao_desafio` deixaria o aluno escolher quanto vale a própria
   vitória. Com `desafio_*`, o gatilho descarta o que veio e lê
   `fn_pontos_do_evento` → `eventos_pontuacao`:

   | tipo | pontos |
   | --- | --- |
   | `desafio_vencido` | 12 |
   | `desafio_empate` | 6 |
   | `desafio_participou` | 3 |

2. **A referência é `classe:<id>:desafio:<uuid>`.**
   `fn_eventos_aluno_resolve_classe_id` só conhece os prefixos `topico`,
   `conteudo`, `atividade`, `classe` e `conquista`; uma referência
   `desafio:<uuid>` resolveria classe `NULL`, e classe nula **tira o evento do
   rank inteiro** (a CTE `eventos_por_classe` filtra `IS NOT NULL`) — foi
   exatamente assim que a presença concedida nunca contou, até `20260911_05`.
   O id fica no SEGUNDO segmento, como `registrar_credito_da_turma` já faz.

3. **Pagar duas vezes é impossível por construção, em dois níveis.**
   O encerramento vira `aberto → encerrado` com `FOR UPDATE` na linha: só um
   fecha. E cada evento nasce com `idempotencia_key` **derivada** de
   `(desafio_id, aluno_id, tipo)` por `md5(...)::uuid`, então uma segunda
   entrega bate em `eventos_aluno_idempotencia_unico` e devolve 23505. A chave
   é derivada e não gerada na hora de reenviar — é a mesma disciplina que
   `progressoOutbox` já segue, e pelo mesmo motivo.

Nota: `desafio_*` não está em `fn_evento_de_conclusao`, então não herda a dedup
por referência. É o item 3 que protege, não o tipo.

## Decisão 5 — acesso só por RPC, e o `anon` sai na mesma migração

As 9 tabelas de guilda têm RLS ligada e **zero policies** (conferido em
`pg_policy`): o acesso direto por `authenticated` devolve nada, e tudo passa por
`SECURITY DEFINER`. `desafio_participantes` segue o mesmo padrão.

Toda função nova nasce executável por `anon` — o Supabase concede EXECUTE a
PUBLIC por padrão, e foi essa dívida que chegou a 74 funções em `20260920_04`.
Cada RPC criada aqui sai com `REVOKE ALL ... FROM PUBLIC, anon` +
`GRANT EXECUTE ... TO authenticated` e `search_path` fixo na própria criação,
e a migração termina exigindo que nenhuma das suas funções tenha sobrado
alcançável.

## RPCs

| RPC | Papel |
| --- | --- |
| `arena_desafio_criar(classe, formato, modo, quantidade, guilda, aliado, adversarios[])` | valida formato × participantes, sorteia as questões liberadas, congela a composição |
| `arena_convite_responder(desafio, aceitar)` | `convidado` → `aceito`/`recusado` |
| `arena_responder(desafio, questao, resposta, tempo_ms)` | grava resposta + latência; só participante `aceito`, só desafio `aberto` |
| `arena_encerrar(desafio)` | apura, fecha e paga — uma vez |
| `arena_listar(classe)` | desafios em que eu jogo ou fui convidado, com placar |
| `arena_desafio(desafio)` | as questões e o meu progresso nelas |

O pool de questões continua saindo de `fn_questao_liberada`: só entra questão de
conteúdo que o aluno já abriu. Um desafio não pode ser um atalho para ver
questão que a trilha ainda não liberou.

### Apuração

Pontuação individual = acertos. Pontuação da equipe = soma dos membros.

- `precisao` — vence a equipe com mais acertos.
- `velocidade` — mais acertos; empate desempata por `sum(tempo_ms)` menor.
- `todos` — mais acertos, contando só quem respondeu **todas** as questões.

Formato `guilda` não tem equipe 2: vence se a equipe 1 acertar a maioria das
questões disponíveis (`acertos * 2 >= questoes * membros`), senão é empate.
Ninguém "perde" um desafio cooperativo.

`desafio_participou` paga todo participante `aceito` com pelo menos uma
resposta — quem foi convidado e não jogou não recebe nada.

## Mobile

### Abas

Hoje são quatro: `AMIGOS | CONVITES | ENCONTRAR | GUILDAS`. Ficam quatro:

```
GUILDAS | ARENA | AMIGOS | ENCONTRAR
```

`CONVITES` sai como aba e volta como **faixa no topo de AMIGOS**, com contador
na própria aba. A razão é medida, não estética: convite é estado transitório, e
uma aba que fica vazia na maior parte do tempo gasta um quarto da largura da
tela para dizer "nada aqui". O contador na aba `AMIGOS` mostra a mesma
informação sem custar um quarto da barra, e nada fica escondido.

### Arquivos

- `services/social/arenaModel.ts` — normalização pura, **sem import de
  `@/database/supabase`**, para carregar no harness do node. É a mesma extração
  que `perfilDoMaterial.ts` e `acumuladorLote.ts` fizeram, pelo mesmo motivo: a
  regra que decide o que o aluno vê precisa de teste.
- `services/social/arenaService.ts` — as chamadas RPC.
- `components/social/ArenaSection.tsx` — lista, criação e a rodada de questões.

## O que fica de fora, declarado

- ~~**Guilda contra guilda.**~~ **Entregue na `20260920_06`** — ver a seção
  abaixo. O que ficou de fora dela: eliminatória entre várias guildas (chaveamento),
  que é outro desenho.
- **Tempo real.** O placar atualiza no `refresh` da tela, não por Realtime.
- **`guilda_evento_snapshot`** continua com 0 linhas. `desafio_participantes`
  congela a composição do desafio; o snapshot foi desenhado para um motor de
  eventos da turma que ainda não existe.
- **`guilda_desafio_criar` / `guilda_desafio_responder` antigas** continuam de
  pé e delegando, para não quebrar as 3 linhas nem um cliente publicado.

## Critério de conclusão

A migração aplicada, as RPCs fora do alcance do `anon`, a aba ARENA criando e
resolvendo desafio nos três formatos, e um desafio encerrado movendo o rank da
turma — medido antes e depois na mesma classe.


## Guilda contra guilda (`20260920_06`)

O formato `guilda` passou a ter dois modos de existência, separados por uma
coluna e não por uma dedução:

| `guilda_rival_id` | O que é | Resultado possível |
| --- | --- | --- |
| nulo | **treino** — a guilda joga contra a régua do `modo` | `vitoria` ou `empate`; ninguém perde |
| preenchido | **disputa** — guilda × guilda | `vitoria`, `empate` ou `sem_adversario` |

### Por que a coluna, e não o placar

A `20260920_05` decidia "é cooperativo" olhando *integrantes da equipe 2 = 0*.
Isso está errado por dois motivos ao mesmo tempo:

1. Uma disputa em que o outro lado ainda não aceitou tem equipe 2 vazia e fica
   **idêntica** a um treino. Guilda × guilda era indizível.
2. **Dava para farmar vitória sozinho.** Medido nesta base, em transação
   revertida: A desafia B em solo → B nunca aceita → A responde as 3 questões
   certas → A chama `arena_encerrar` → `vencedor_equipe = 1`,
   `desafio_vencido = 12`. Repetível contra qualquer colega, sem a participação
   dele.

Hoje: **cooperativo é `formato = 'guilda' AND guilda_rival_id IS NULL`**, e toda
disputa exige que os dois lados tenham pelo menos um jogador que respondeu.
Quando não têm, `resultado = 'sem_adversario'` e paga-se apenas
`desafio_participou`. O mesmo roteiro do farm passou de 15 para 3 pontos.

`resultado` é coluna própria porque `vencedor_equipe IS NULL` serve para empate
**e** para rodada que não aconteceu — o cliente não consegue separar os dois.

### Aproveitamento, não acerto bruto

Pontuação de equipe é soma, então guilda grande venceria por ser grande. A
comparação passou a ser `acertos / (questões × integrantes)`, por multiplicação
cruzada (`p1 * n2 > p2 * n1`) para ficar no inteiro. É a mesma régua de 50% que
o treino já usava.

Medido: **4 acertos em 2 jogadores (50%) perde para 3 acertos em 1 jogador
(75%).** Solo e dupla têm times de tamanho igual por construção, então a ordem
não muda lá. O desempate de `velocidade` virou tempo médio pela mesma razão.

### Quem aceita pela guilda

**Cada membro por si.** Não há papel de líder no domínio — `criado_por` é quem
criou, não quem manda —, e deixar uma pessoa comprometer a guilda inteira num
desafio que paga ponto seria inventar um governo que o produto não tem. Cada
membro ativo da rival nasce `convidado`; quem não aceitar não joga, e o
aproveitamento normaliza o tamanho de quem apareceu.

A rival é avisada **no chat dela**, além do convite individual: sem isso, guilda
parada nunca saberia que foi desafiada.

### Guardas

- A rival tem de estar `ativa`, na **mesma turma** e com ao menos um membro
  (`arena_rival_sem_membros`).
- `CHECK (guilda_rival_id IS NULL OR (formato = 'guilda' AND guilda_rival_id <> guilda_id))`
  — sem a segunda metade, a guilda se enfrentaria com os mesmos alunos nas duas
  equipes.
- `dupla` e `solo` recusam `p_guilda_rival` no corpo da RPC, e não só no CHECK:
  erro de domínio é melhor que erro de constraint.
- A assinatura antiga de 7 argumentos de `arena_desafio_criar` é **derrubada**.
  Duas candidatas deixariam o PostgREST escolher — é o defeito que
  `guilda_criar` tem hoje (chamada posicional de 4 argumentos é ambígua).
