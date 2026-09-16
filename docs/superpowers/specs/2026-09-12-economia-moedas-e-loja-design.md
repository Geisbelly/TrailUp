# Economia de moedas e loja — desenho

> Estado antes desta mudança: a pontuação já é decidida pelo banco (#164,
> `20260909_05_pontuacao_decidida_pelo_banco.py`). Moeda, carteira, item e
> compra **não existem**: `grep -riE '\b(moeda|loja|carteira|ledger|coin)\b'` no
> monorepo inteiro devolve um arquivo só, e é um teste de pontuação.

Issues: [#133](https://github.com/BitStudioLabs/trail-up/issues/133) (épico),
[#142](https://github.com/BitStudioLabs/trail-up/issues/142) (moeda separada do
XP), [#144](https://github.com/BitStudioLabs/trail-up/issues/144) (loja),
[#164](https://github.com/BitStudioLabs/trail-up/issues/164) (feito).

## A base, medida hoje (12/09/2026)

Tudo abaixo saiu de consulta ao Postgres de produção, não de estimativa.

| O que | Quanto |
| --- | --- |
| Eventos de pontuação | 443, somando **794 pontos**, num aluno só |
| Ritmo | 150 dias entre o primeiro e o último evento → **5,3 pontos/dia** |
| De onde vem o ponto | conquista 560 (70%), atividade concluída 150, revisão 44, conteúdo 30, acerto 10 |
| Atividades cadastradas | **248** |
| Atividades **com prazo** (`data_entrega`) | **0** |
| Linhas em `atividade_aluno` | 68 — **65 com `acertos_percentual = 0`**, 2 entre 1 e 59, 1 acima de 60 |
| Revisões (`atividade_revisada`) | **86 eventos em 73 atividades distintas** |

Três leituras mudam o desenho, e todas contrariam o que a leitura direta do #144
sugeriria.

**1. O item campeão do estudo de referência não tem onde pegar aqui.** O #144
traz O'Donovan et al. §5.3.2/§6.4: extensão de prazo 74 compras, refazer quiz 1,
recompensa coletiva 1, dica quase nada — e a conclusão dos autores é que o que
funcionou foi o item com valor fora do jogo. Só que em TrailUp **nenhuma das 248
atividades tem prazo**, e mesmo que tivesse, prazo aqui não faz nada:
`mobile/src/utils/prazoDaAtividade.ts` diz isso no cabeçalho — *"Atrasado é
AVISO, não porta fechada: a atividade continua aberta e continua pagando"*. Um
item que estende um prazo que não existe e não morde é um item que não vende
porque não compra nada.

**2. O que morde aqui é a nota congelada, e há demanda medida por destravá-la.**
`const revisao = jaConcluida || topicoConcluido`
(`mobile/src/app/(tabs)/trilha/[id].tsx:1296`) desvia o
caminho: com `revisao` verdadeiro, `registrarAtividadeConcluida` é pulado e o
evento vira `atividade_revisada` (2 XP). A nota da primeira tentativa fica onde
está, para sempre. E o aluno volta assim mesmo: **86 revisões em 73 atividades
distintas**, com 65 das 68 linhas de `atividade_aluno` paradas em zero. Refazer
já é o comportamento; o que falta é ele contar.

**3. Moeda por evento repetido seria moeda fabricada, e a duplicata já está na
base.** `atividade:1067` tem dois `atividade_concluida` (30 XP por uma
atividade), `conteudo:174` tem dois `conteudo_concluido`, e **13 dos 17
`conteudo_concluido` estão com `referencia` nula** — esses nem dá para
deduplicar por referência. É o [#186](https://github.com/BitStudioLabs/trail-up/issues/186)
aparecendo em dado real.

### Consequência para a ordem de entrega

O item de prazo precisa de **duas** coisas que não existem (professor marcando
prazo + prazo com consequência). O item de refazer precisa de **uma**, e ela é
uma correção de segurança que vale por si (ver §5.2). Então o carro-chefe aqui
**não é o mesmo do estudo**: é refazer. O prazo entra depois, atrás do seu
pré-requisito, e não antes.

## 1. Onde a economia mora

**No Postgres, inteira.** Regra de fronteira do `CLAUDE.md`: a API é para IA.
Carteira, preço, compra e efeito não têm modelo de linguagem no meio — e aqui
há um motivo mais forte que o de encanamento: **saldo que passa pelo cliente é
saldo que o cliente escolhe**. A única exceção candidata é a dica gerada por IA
(§5.4), que é geração de texto e por isso é da API.

A forma é a do #142 e a que a base já usa em `notificacoes_*` e
`registrar_credito_da_turma`: **livro-razão append-only + RPC
`SECURITY DEFINER`**. Saldo nunca é coluna mutável; é a soma dos lançamentos. O
cliente não tem `INSERT` no razão — só `SELECT` — então nem o preço nem o saldo
passam pelo app.

```
 evento de estudo            professor                    aluno
 (eventos_aluno)        loja_definir_ganho()          loja_comprar()
        │                        │                          │
        │ trigger AFTER INSERT   │ RPC definer              │ RPC definer
        ▼                        ▼                          ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                     moedas_lancamentos                        │
  │            (append-only; saldo = SUM(delta))                  │
  └───────────────────────────┬───────────────────────────────────┘
                              │ mesma transação
                              ▼
                      ┌────────────────┐   lido por
                      │  loja_compras  ├──────────────► efeito
                      │ (posse+estado) │   fn_prazo_efetivo()
                      └────────────────┘   trg_nota_congelada
```

## 2. Modelo de dados

### 2.1 `moedas_por_evento` — quanto cada coisa paga

Espelha `eventos_pontuacao` (#164) com uma coluna a mais: `classe_id`. Nula é o
padrão global; preenchida é o ajuste da turma, exatamente como `conquistas` faz
com escopo.

```
moedas_por_evento (
  id          bigserial primary key,
  tipo        text    not null,          -- mesmo vocabulário de eventos_aluno.tipo
  classe_id   bigint  references classe(id) on delete cascade,  -- NULL = global
  moedas      numeric not null default 0 check (moedas >= 0),
  atualizado_em timestamptz not null default now()
)
CREATE UNIQUE INDEX moedas_por_evento_unq
  ON moedas_por_evento (tipo, COALESCE(classe_id, -1));
```

O `COALESCE(classe_id, -1)` não é enfeite, e a `20260911_06` já pagou para
aprender: em índice único **NULL não colide com NULL**, então
`UNIQUE (tipo, classe_id)` cru deixaria duas linhas globais do mesmo tipo
passarem — e a resolução abaixo escolheria uma delas por sorte.

```sql
fn_moedas_do_evento(p_tipo text, p_classe_id bigint) RETURNS numeric
-- COALESCE(valor da turma, valor global, 0). Tipo desconhecido vale 0 e não é
-- recusado -- mesma decisão de fn_pontos_do_evento: um tipo novo emitido por um
-- cliente velho não pode virar erro de tela.
```

### 2.2 `moedas_lancamentos` — o livro-razão

`lancamentos` e não `ledger` porque é o único nome em inglês que entraria no
esquema; lançamento é o termo contábil equivalente.

```
moedas_lancamentos (
  id          bigserial primary key,
  aluno_id    uuid    not null references auth.users(id) on delete cascade,
  delta       numeric not null check (delta <> 0),   -- + ganho, − gasto
  motivo      text    not null,   -- 'evento'|'compra'|'estorno'|'ajuste'|'presente'
  tipo_evento text,               -- preenchido quando motivo = 'evento'
  referencia  text,               -- 'atividade:1067', 'conteudo:174'
  evento_id   bigint  references eventos_aluno(id) on delete set null,
  compra_id   bigint  references loja_compras(id)  on delete set null,
  classe_id   bigint,             -- congelada no INSERT, como eventos_aluno.classe_id
  idempotencia_key uuid,
  criado_em   timestamptz not null default now()
)
```

Três índices carregam três regras:

```sql
-- "Moeda só na primeira vez". Parcial de propósito: gasto e ajuste repetem.
CREATE UNIQUE INDEX moedas_lanc_evento_unq
  ON moedas_lancamentos (aluno_id, tipo_evento, referencia)
  WHERE motivo = 'evento' AND referencia IS NOT NULL;

-- Retentar compra não duplica compra (mesma mecânica de eventos_aluno, 20260911_02).
CREATE UNIQUE INDEX moedas_lanc_idem_unq
  ON moedas_lancamentos (idempotencia_key) WHERE idempotencia_key IS NOT NULL;

CREATE INDEX moedas_lanc_aluno_idx ON moedas_lancamentos (aluno_id, criado_em DESC);
```

**Evento sem referência não paga moeda.** É o que os 13 `conteudo_concluido`
nulos forçam: sem referência, o índice parcial não morde e o mesmo conteúdo
pagaria sem limite. O XP continua pagando esses eventos — não estamos mexendo
no contrato do #164 —, a moeda não. E quando o `ON CONFLICT` for escrito contra
esse índice, **o predicado tem de ser repetido**
(`ON CONFLICT (aluno_id, tipo_evento, referencia) WHERE motivo = 'evento' AND referencia IS NOT NULL`),
senão o Postgres não casa o índice parcial e levanta *"no unique or exclusion
constraint matching"*.

Saldo:

```sql
CREATE VIEW vw_moedas_saldo WITH (security_invoker = on) AS
  SELECT aluno_id, SUM(delta) AS saldo FROM moedas_lancamentos GROUP BY aluno_id;

fn_moedas_saldo(p_aluno uuid) RETURNS numeric  -- SECURITY DEFINER, usada dentro das RPCs
```

O custo do `SUM` é o preço de não ter uma segunda autoridade sobre o saldo. Com
2 alunos e 443 eventos ele é ruído; se crescer, vira índice coberto ou view
materializada **sem mudar a interface** — nenhum chamador lê a tabela direto.

### 2.3 `loja_itens` — o catálogo, com preço global

```
loja_itens (
  codigo     text primary key,     -- 'refazer_atividade', 'prazo_extra', ...
  nome       text not null,
  descricao  text not null,
  efeito     text not null CHECK (fn_loja_efeito_suportado(efeito)),
  preco      numeric not null CHECK (preco > 0),
  parametros jsonb   not null default '{}'::jsonb,   -- ex.: {"dias": 3}
  alvo_tipo  text    CHECK (alvo_tipo IN ('atividade','questao','classe')),
  ativo      boolean not null default true,
  ordem      integer not null default 0
)
```

`fn_loja_efeito_suportado()` é lista fechada **como correção, não como rigidez**.
A `20260911_06` mostrou o custo de não ter: 21 das 27 conquistas estavam
cadastradas com métrica que nenhum ramo do gatilho avaliava — conquista morta,
nascida com sucesso e nunca destravada, sem aviso. Item com efeito que ninguém
aplica é dinheiro cobrado por nada. **Efeito novo exige duas coisas**: o ramo em
`loja_comprar` e a entrada em `fn_loja_efeito_suportado`.

Pelo mesmo motivo, `parametros` tem chave conferida por efeito no momento da
compra: chave errada faria `COALESCE(..., 0)` valer zero e o item entregar nada.

### 2.4 `loja_compras` — posse e estado do efeito

A compra **é** o registro do efeito. Não há tabela por efeito: uma autoridade
só, que é a lição do motivo 2 da regra de fronteira.

```
loja_compras (
  id           bigserial primary key,
  aluno_id     uuid not null,
  item_codigo  text not null references loja_itens(codigo),
  preco_pago   numeric not null,      -- congelado, como eventos_aluno.valor
  parametros   jsonb not null default '{}'::jsonb,   -- congelados junto
  classe_id    bigint,                -- resolvida no INSERT e congelada
  alvo         text,                  -- 'atividade:1067' | 'classe:32' | NULL
  estado       text not null default 'ativa'
               CHECK (estado IN ('ativa','consumida','expirada','estornada')),
  criado_em    timestamptz not null default now(),
  consumido_em timestamptz
)
```

`preco_pago` e `parametros` congelam pela mesma razão que `eventos_aluno.valor`
e `classe_id` congelam (`20260910_07`, `20260911_04`): **histórico não pode
depender do presente**. Baixar o preço do item depois não pode reescrever o que
o aluno pagou, e um `UPDATE ... SET preco_pago = 0` no próprio registro não pode
passar — as colunas voltam de `OLD` em qualquer UPDATE, com a lista **completa**
de colunas no gatilho, não a lista curta que virou buraco em `eventos_aluno`.

## 3. Ganho: quanto vale cada coisa em moeda

Gatilho `AFTER INSERT ON eventos_aluno` (não `BEFORE` — o ganho depende de a
linha existir para a referência e a classe já estarem resolvidas):

```
se fn_evento_creditado(NEW.tipo)  → crédito do professor, ver §6
se NEW.referencia IS NULL         → não paga moeda
senão delta := fn_moedas_do_evento(NEW.tipo, NEW.classe_id)
      se delta > 0 → INSERT ... ON CONFLICT DO NOTHING  (a primeira vez vence)
```

Semente global, deliberadamente escassa:

| tipo | moedas | por quê |
| --- | --- | --- |
| `conteudo_concluido` | 1 | a unidade base de estudo |
| `atividade_concluida` | 2 | custa mais que ler |
| `atividade_acertada` | 1 | acerto paga, erro não tira |
| `atividade_revisada` | **0** | rever é 86 dos 443 eventos; pagar aqui faria do loop o caminho mais barato até a moeda |
| `presenca_aula` | 2 | valor fora do jogo, concedido pelo professor |
| todo o resto | 0 | abrir não é esforço |

**A conta na base real.** Com "primeira vez" e "precisa de referência": 3
conteúdos distintos com referência (não 17 eventos) + 11 atividades concluídas
distintas + 3 acertos = **28 moedas em 150 dias**. A preços de 5 e 8 (§5), isso é
umas quatro compras num semestre inteiro. É pouco de propósito: o item que
importa é o que muda a nota, e ele tem de doer no bolso. E é exatamente por a
calibragem certa depender da turma que existe o override por classe.

`loja_definir_ganho_da_turma(p_classe_id, p_tipo, p_moedas)` — RPC
`SECURITY DEFINER` com os mesmos quatro bloqueios de `registrar_credito_da_turma`
(sessão, posse da classe via `app_classes_do_professor()`, tipo na lista, valor
válido) e **teto** em `app_config.moedas_por_evento_maximo`. Sem teto, o
professor põe 10 000 e a economia vira zero — o mesmo raciocínio de
`credito_extra_maximo`.

## 4. `loja_comprar` — a RPC única

```sql
loja_comprar(p_item_codigo text, p_alvo text DEFAULT NULL,
             p_idempotencia_key uuid DEFAULT NULL) RETURNS bigint
```

`SECURITY DEFINER`, `SET search_path TO 'public','pg_temp'`, tudo numa
transação, nesta ordem:

1. **Sessão.** `auth.uid()` nulo → `RAISE EXCEPTION 'sem sessao'`.
2. **Item existe e está ativo.**
3. **Alvo compatível e do aluno.** `alvo_tipo` do item tem de casar com o
   prefixo de `p_alvo`, e a atividade/classe tem de estar numa turma em que o
   aluno está matriculado (`app_classes_do_aluno()`). Sem isso, um aluno compra
   efeito na atividade de outra turma.
4. **Teto do efeito**, quando houver (§5.1).
5. **Saldo.** `fn_moedas_saldo(auth.uid()) >= preco` → senão exceção com o
   quanto falta. Esta é a única leitura de saldo que decide alguma coisa.
6. **Insere a compra**, depois **insere o lançamento** de débito apontando para
   ela, com `idempotencia_key`.
7. **Aplica o efeito** se ele for imediato (recompensa coletiva); os demais são
   lidos na hora do uso.

Atômica de verdade: numa exceção, tudo desaparece junto. É esse o aceite do
#144, e é a razão de não ser `INSERT` com gatilho.

**A chave de idempotência nasce no cliente, antes da primeira tentativa**, e
viaja com a escrita — exatamente como `eventos_aluno.idempotencia_key`
(`20260911_02`). Gerá-la na hora de reenviar faz o oposto: duplica a compra. Dois
toques no botão com rede ruim é o caso comum, não o exótico.

## 5. Catálogo de itens e mecânica de cada efeito

> A pesquisa de aprofundamento dos itens **ainda não voltou nesta sessão**. O
> catálogo abaixo está montado sobre a evidência já levantada no #144 (O'Donovan
> et al. §5.3.2/§6.4) e sobre o que a base mede. Item novo que ela traga entra
> como linha nova — nenhuma decisão estrutural das §§1–4 depende dela.

| código | efeito | preço | alvo | pré-requisito | fase |
| --- | --- | --- | --- | --- | --- |
| `refazer_atividade` | uma tentativa que conta | 5 | atividade | congelamento da nota (§5.2) | 2 |
| `prazo_extra` | +3 dias no prazo | 8 | atividade | prazo com consequência (§5.1) | 3 |
| `dica` | pista da questão | 2 | questão | dica não existe (§5.4) | 4 |
| `recompensa_coletiva` | moeda para a turma | 15 | classe | nenhum | 4 |

### 5.1 `prazo_extra` — o item do estudo, e o que falta para ele valer

O efeito é uma função, não uma coluna: `atividades.data_entrega` continua sendo
do professor e não é reescrita pela compra do aluno.

```sql
fn_prazo_efetivo(p_aluno uuid, p_atividade bigint) RETURNS timestamptz
-- data_entrega + soma dos dias das compras 'ativa' de prazo_extra nesse alvo,
-- limitada por app_config.loja_prazo_extra_dias_maximo.
```

A função já existe, com o aluno na assinatura, e hoje devolve a `data_entrega`
do professor: a fase 3 troca só o corpo dela, para somar os dias comprados, e
nenhum chamador muda. O teto é configurável, como você pediu, e fica em
`app_config` ao lado de `credito_extra_maximo` — `CHECK` não serve, porque exige
expressão imutável (foi o que a `20260911_06` concluiu para a recompensa de
conquista).

**O pré-requisito — feito em `20260912_01_prazo_com_consequencia.py`.** Hoje o
prazo não faz nada, e o próprio código dizia por quê: *"descontar pontos exigiria
que o banco soubesse do prazo na hora de pagar — `fn_pontos_do_evento` recebe só
o tipo do evento"*. O gatilho de valor passou a consultar `fn_prazo_efetivo`
quando o evento tem referência de atividade e a multiplicar por
**`app_config.prazo_atraso_fator`, que nasce em `1.0`**. Com 1.0 nada muda para
ninguém — o mecanismo entrou desligado, e o piloto liga com um UPDATE numa linha
de configuração. Bloquear entrega continua fora: prenderia o aluno que voltou
depois de uma semana doente.

Quem decide se há atraso é a **referência**, não o tipo: `atividade:1067` olha
prazo; `conteudo:174`, `topico:3` e o UUID do ciclo caem fora no regex sem
tocar em `atividades`. Uma lista de tipos aqui seria uma segunda lista para
divergir da de `eventos_pontuacao`.

Duas coisas que a migração descobriu e que valem para quem mexer nisso:

- **O parser de `app_config` do resto do repo destruiria o fator.** As outras
  chaves são inteiras e são lidas com `regexp_replace(valor, '[^0-9]', '', 'g')`.
  Medido no Postgres desta base: esse idioma sobre `0.5` devolve `05`, isto é,
  **5** — multiplicaria a pontuação por cinco em vez de cortá-la pela metade, em
  silêncio. O parser desta chave preserva o ponto, aceita vírgula e apara o
  resultado em [0, 1].
- **`20260911_05` emendou o corpo do gatilho no lugar**, então o texto da
  `20260911_04` já não era o que rodava (faltava `NEW.motivo := OLD.motivo;`).
  Um `CREATE OR REPLACE` copiado de lá apagaria esse congelamento sem deixar
  rastro. A migração restata o corpo inteiro e põe um `DO` que confere o corpo
  vivo antes de substituir.

Enquanto `data_entrega` for nulo em 248 de 248 atividades, este item não vende
nada. Ele está desenhado e fica na fase 3, atrás do fator e de o console
começar a marcar prazo.

### 5.2 `refazer_atividade` — o carro-chefe aqui

O que a compra libera é **uma escrita de nota que conta**. Hoje isso é decidido
no cliente (`revisao = jaConcluida || topicoConcluido`) e o banco não tem opinião
— ou seja, **hoje qualquer cliente pode reescrever a própria nota quando quiser**,
e `atividade_aluno` é upsert direto do mobile. Dar a regra ao banco fecha esse
buraco e cria o item no mesmo movimento; é o mesmo desenho do #164, que tirou do
cliente a escolha de quanto vale.

```
trg_atividade_aluno_nota_congelada  BEFORE UPDATE ON atividade_aluno
  nota não mudou                                    → passa
  OLD.status::text <> 'concluido'                   → passa (primeira tentativa)
  existe compra 'ativa' de refazer_atividade no alvo → consome (estado='consumida',
                                                       consumido_em=now()) e
                                                       APARA PARA CIMA: a nota
                                                       vira GREATEST(OLD, NEW)
  senão                                             → restaura OLD e passa
```

`OLD.status::text` e não `COALESCE(OLD.status, '')`: `status` é o enum
`status_atividade`, e o `COALESCE` com `''` resolve para o tipo do enum e aborta
a transação inteira na primeira linha nula — dormindo até lá. E o rótulo é
`concluido`, com a grafia do enum.

**Restaura em vez de recusar.** Recusar quebraria a tela do aluno na cara dele;
restaurar é o que `trg_eventos_aluno_valor_upd` já faz. O app não deve depender
disso: ele só oferece "refazer valendo" quando enxerga a compra ativa — a
restauração é a rede, não o caminho.

### A nota só sobe

**Decidido: refazer mantém a MELHOR nota, não a última.** O upsert de
`atividade_aluno` hoje sobrescreve `acertos_percentual`; com o item, o gatilho
apara para cima — `GREATEST(OLD.acertos_percentual, NEW.acertos_percentual)`, e
o mesmo para `pontuacao_obtida`.

Três coisas vêm junto, e todas melhoram o desenho:

1. **Uma regra a menos no repositório, não uma a mais.**
   `personalizacao_item_progresso` já funde percentual e acertos por MÁXIMO
   (CLAUDE.md). Com esta decisão, as duas tabelas de progresso passam a
   responder a mesma coisa quando o aluno repete — em vez de uma guardar a
   melhor e a outra a última, que é a divergência que o motivo 2 da regra de
   fronteira existe para evitar.
2. **O item fica seguro de comprar, e isso é argumento de venda.** Quem está em
   20% não arrisca cair para 0 por ter tentado. O `CompraModal` diz isso com
   todas as letras: *"Se você for melhor, a nota sobe. Se for pior, fica a que
   você já tinha."* Um item que pode piorar a situação do aluno não vende — e
   não deveria.
3. **Erra para o lado de quem estuda.** É a mesma direção do `atividade_errada`
   valendo 0 em vez de −5: neste sistema, tentar nunca anda para trás.

O custo é o caso em que o aluno gasta 5 moedas, vai pior, e a tela não muda de
número. A compra foi consumida — ele usou a tentativa. Por isso a tela de
resultado precisa dizer o que aconteceu (*"você fez 15%, sua nota continua
20%"*), senão parece defeito. Silêncio aqui é o que transforma uma regra gentil
em uma reclamação de suporte.

Efeito colateral bom: das 68 linhas de `atividade_aluno`, 65 estão em zero,
parte delas resíduo do defeito que `progressoEscritas` corrigiu (o `?? 0` que
gravava zero em visita). Como zero é o piso, qualquer tentativa comprada move o
número — o `GREATEST` não atrapalha justamente onde a base está hoje.

### 5.3 `recompensa_coletiva` — moeda para a turma

Efeito imediato dentro da própria RPC: um lançamento `motivo='presente'` para
cada colega, com `referencia = 'compra:' || id`. Barato de construir porque não
inventa mecânica nenhuma — só mais linhas no razão.

**O alvo provavelmente não é a turma inteira: é a guilda.** `guildas`,
`guilda_convites`, `social_relacionamentos` e `social_mensagens` **já existem no
banco**, com 3 guildas, 5 convites e 3 relacionamentos gravados — e nenhuma
linha de código no monorepo inteiro lê ou escreve essas quatro tabelas
(conferido em `mobile/src`, `frontend/src` e `api/app`). Presentear 40 colegas
de turma é diluição; presentear os 5 da sua guilda é um gesto que alguém
percebe. Se a aba Social entrar (ver o desenho do mobile), o alvo natural deste
item passa a ser `guilda:<id>`, com `classe:<id>` como caso de turma sem guilda.

No estudo teve 1 compra. Fica na fase 4 por isso, não por dificuldade.

### 5.4 `dica` — o único item que toca a API

`questoes` não tem coluna de dica, e inventar uma joga trabalho editorial no
professor para um item que no estudo quase não vendeu. O caminho que se paga é
gerar a dica com o mesmo modelo que já personaliza o material — o que a põe do
lado da API, pela regra de fronteira (é geração, tem modelo de linguagem no
meio). A compra permanece no banco; a API só produz o texto e o grava.

Fase 4, e é a candidata natural a ser cortada se a pesquisa não trouxer
evidência a favor.

## 6. Gasto não toca XP

Nenhuma escrita da loja chega perto de `eventos_aluno.valor`. É o aceite do #142
e a razão de a moeda existir separada: gastar não pode mexer no ranking, senão
comprar vira punição no placar e ninguém compra.

O caminho inverso é o que existe: evento de estudo **gera** moeda, por gatilho.
Crédito concedido pelo professor (`presenca*`, `participacao*`, `conquista*`)
passa por `fn_evento_creditado` e paga moeda pela mesma tabela, com o mesmo
gatilho — nenhuma segunda regra.

## 7. Métricas

Duas views, as duas nascendo com `security_invoker = on` (toda view nova nasce
assim; a exceção do ranking é exceção porque agrega colegas, e aqui a RLS de
`moedas_lancamentos` já dá ao professor exatamente as linhas dos alunos dele).

**`vw_loja_metricas_aluno`** — por `(aluno, classe)`: ganho, gasto, saldo,
compras por item, e **dias de prazo usados contra o teto** (o que você pediu
que ficasse visível). É esta que a tela do aluno lê.

**`vw_loja_metricas_classe`** — por classe: quantos alunos compraram cada item,
mediana de saldo, e a métrica que justifica o épico — **nota antes × nota depois
da compra de `refazer_atividade`**. O razão guarda o instante do débito e a
compra guarda o alvo, então a comparação é uma consulta, não um instrumento
novo.

Um aviso que a `20260911_10` deixou caro: **`CREATE OR REPLACE VIEW` não preserva
`security_invoker`**. Ao trocar qualquer expressão dessas views, o
`ALTER VIEW ... SET (security_invoker = on)` faz parte da troca, e a migração
confere — sem a conferência o bypass volta calado, porque a view continua
devolvendo número.

## 8. RLS

RLS é a autorização, não defesa extra: `anon` e `authenticated` têm GRANT nas
tabelas, então a policy é a única barreira.

| tabela | aluno | professor | anon |
| --- | --- | --- | --- |
| `moedas_por_evento` | SELECT (precisa saber o que paga) | SELECT; escrita só pela RPC | nada |
| `moedas_lancamentos` | SELECT `aluno_id = auth.uid()` | SELECT via `app_alunos_do_professor()` | nada |
| `loja_itens` | SELECT `USING (ativo)` | idem | nada |
| `loja_compras` | SELECT próprias | SELECT via `app_alunos_do_professor()` | nada |

**Nenhuma tabela da economia tem policy de INSERT, UPDATE ou DELETE, e as três
recebem `REVOKE INSERT, UPDATE, DELETE ... FROM anon, authenticated`.** Sem
policy o RLS já nega, mas o REVOKE é o que sobrevive a alguém criar uma policy
larga sem perceber — é o padrão de `eventos_pontuacao` e `app_config`. Toda
escrita entra por `loja_comprar` / `loja_definir_ganho_da_turma`, que são
`SECURITY DEFINER`.

Os predicados usam os helpers existentes (`app_classes_do_aluno()`,
`app_alunos_do_professor()`, `app_classes_do_professor()`) e não repetem o
`EXISTS`: policy em tabela de turma que consulta tabela de turma entra em
recursão de RLS.

## 9. Armadilhas que a implementação vai encontrar

Todas já custaram caro neste repo; estão aqui porque este desenho passa
exatamente por cima delas.

1. **`text()` do SQLAlchemy lê `:1067` como bind parameter.** O formato de
   `alvo` é `'atividade:1067'` — dois-pontos seguido de caractere de palavra,
   que é precisamente o que derrubou a `20260911_05` com
   `A value is required for bind parameter '2026'`. **E vale dentro de comentário
   SQL também.** Monte por concatenação: `'atividade' || ':' || id::text`. Um
   teste varrendo o SQL renderizado com `(?<!:):[A-Za-z_0-9]\w*` pega antes do
   banco.
2. **`ON CONFLICT` sobre índice parcial repete o predicado** (§2.2).
3. **`COALESCE(status, '')` estoura**; use `status::text` (§5.2).
4. **Rótulos do enum têm acento**: `concluido`, `em andamento`, `não iniciado`.
5. **`COALESCE(classe_id, -1)` no índice único** (§2.1).
6. **Parênteses em `WHERE` disjuntivo**: a resolução global-ou-turma é `A OR B`;
   acrescentar `AND C` no fim faz o Postgres ler `A OR (B AND C)`. Há teste
   guardando o caso irmão em `conquistas`; este precisa do seu.
7. **`build_engine()` para qualquer script de backfill** — PgBouncer não aceita
   prepared statement nomeado, e o erro só aparece na segunda consulta.

## 10. Fases

| Fase | O que entra | Como se mede que funcionou |
| --- | --- | --- |
| 1 | `moedas_por_evento`, `moedas_lancamentos`, gatilho de ganho, saldo, RLS, métricas do aluno | moeda acumula; ninguém gasta; o aluno da base fecha em 28 |
| 2 | `loja_itens`, `loja_compras`, `loja_comprar`, `refazer_atividade`, congelamento da nota | nota sobe depois da compra; sem compra, a nota não muda |
| 3 | `prazo_extra` e o teto (o resto — `fn_prazo_efetivo` e `prazo_atraso_fator` — já foi em `20260912_01`) | prazo estendido aparece na métrica do aluno |
| 4 | `recompensa_coletiva`, `dica` | decidido pela pesquisa |

Fase 1 é entregável sozinha e sem risco: nada gasta, então nada quebra se a
calibragem estiver errada — corrige-se a tabela sem migração nova.

## 11. Dependência e riscos

- **#186 é dependência de verdade.** Enquanto o acerto em atividade personalizada
  não tiver dedup no servidor, o mesmo acerto entra duas vezes; com moeda no
  meio, deixa de ser número inflado no rank e vira **moeda fabricada**. O índice
  parcial da §2.2 cobre os eventos com referência, mas não os 13 com referência
  nula — e é por isso que evento sem referência não paga. Fechar o #186 antes de
  ligar a fase 1 é o caminho limpo.
- **Preço errado é reversível; moeda fabricada não.** Por isso a fase 1 vem
  sozinha: ela mede o ganho real antes de existir o que comprar.
- **O item do estudo pode não se repetir aqui.** A evidência de O'Donovan é de um
  contexto onde prazo bloqueava; aqui o que morde é a nota. Se o piloto mostrar o
  contrário, o que muda é a ordem das fases 2 e 3, não o modelo de dados.

## 12. Em aberto para você

1. ~~**Consequência do prazo**~~ — decidida e feita em `20260912_01`: fator
   multiplicativo em `app_config.prazo_atraso_fator`, nascendo em `1.0`, sem
   bloquear entrega. Falta o professor marcar prazo em alguma atividade: são 0
   de 248.
2. **Professor pode presentear moeda?** A mecânica já existe (`motivo='presente'`)
   e seria uma RPC de dez linhas. Fora do #144, e por isso não entrou.
3. **Estorno.** Comprou no alvo errado — devolve? Proposta: sim, só enquanto
   `estado = 'ativa'`, por RPC do próprio aluno, com lançamento de crédito
   `motivo='estorno'`. Fora do escopo do #144.
