# Loja de moedas — mecânica de ponta a ponta

**Data:** 2026-09-12
**Issues:** [#142](https://github.com/BitStudioLabs/trail-up/issues/142) (moedas), [#144](https://github.com/BitStudioLabs/trail-up/issues/144) (loja), dentro do épico [#133](https://github.com/BitStudioLabs/trail-up/issues/133)
**Depende de:** [#186](https://github.com/BitStudioLabs/trail-up/issues/186) (dedup do acerto), [#177](https://github.com/BitStudioLabs/trail-up/issues/177) (prazo)
**Estado:** desenho aprovado, sem implementação

---

## 1. O que este documento decide

A loja inteira vive no **banco**. A API não muda: ela é para IA, e nada aqui tem
modelo de linguagem no meio. Saldo, preço, compra, efeito e métrica são
funções, gatilhos e policies do Postgres; o mobile chama RPC e lê view.

Isso não é preferência de estilo. A API dorme no free tier do Render, e uma
economia que hiberna junto é uma economia que some no meio da aula.

---

## 2. As decisões que amarram o resto

| # | Decisão | Por quê |
|---|---|---|
| 1 | **Carteira e preços globais por aluno** | Um saldo só, um preço só. Simples de explicar a 20 adultos. |
| 2 | **O ganho é por turma, sobrepondo um padrão global** | `eventos_pontuacao` já existe e decide quanto vale cada evento; o professor sobrepõe só o que quiser na turma dele. |
| 3 | **Moeda tem valor próprio, ao lado do XP** | Permite pagar moeda por algo que não vale XP, e o contrário. O professor calibra os dois separadamente. |
| 4 | **Gasto nunca toca XP nem posição no rank** | Aceite do #142. XP mede esforço acumulado e precisa ser monotônico. |
| 5 | **Moeda só na primeira vez, por `(aluno, tipo, referência)`** | Sem isso, reabrir a mesma atividade é a forma mais barata de enriquecer. |
| 6 | **Extensão de prazo aplica sozinha, até um teto do professor** | A decisão pedagógica é o teto, tomada uma vez na configuração, em vez de uma aprovação por compra. Sem fila, sem espera. |
| 7 | **Refazer usa 90% da melhor tentativa + 10% da pior** | Ver §6.2: é a única variante com dado direto a favor. |
| 8 | **Livro-razão append-only, saldo derivado** | Aceite do #142. Sem histórico não há como auditar de onde veio a moeda. |
| 9 | **Compra é uma RPC atômica** | Aceite do #144: debita e concede, ou não faz nada. |
| 10 | **Aba Social nova na barra** | Hub de guildas, amigos, chats, loja, carteira e resumo. Agora nascem carteira e loja; o resto é lugar reservado. |
| 11 | **Dotação inicial igual para todos** | Moeda compra só unidades *adicionais*. Sem isso, quem está atrás fica sem justamente o item que o ajudaria (§6.3). |
| 12 | **Segunda chance exige revisar o material antes** | Em Illinois o gate derrubou a taxa de retake de 49% para 34% **com nota idêntica** — filtrou quem só ia rolar o dado (§6.4). |

A decisão 1 tem uma consequência que vale dizer em voz alta: com carteira única
e ganho por turma, **o aluno acumula na turma generosa e gasta na rígida**. O
professor rígido não controla o saldo que chega à aula dele — controla o teto de
prazo e quais itens ficam ligados na turma dele (§5.3). Foi uma escolha
consciente, não um descuido.

---

## 3. Modelo de dados

Oito objetos novos. Nenhuma tabela existente muda de forma, com uma exceção
declarada em §3.2.

### 3.1 `moedas_ledger` — a única fonte de saldo

```sql
CREATE TABLE public.moedas_ledger (
  id           bigserial PRIMARY KEY,
  aluno_id     uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  delta        numeric     NOT NULL CHECK (delta <> 0),
  motivo       text        NOT NULL CHECK (motivo IN
                 ('evento','dotacao','compra','estorno','concessao')),
  evento_tipo  text        NULL,
  referencia   text        NULL,
  classe_id    bigint      NULL REFERENCES public.classe(id) ON DELETE SET NULL,
  compra_id    bigint      NULL,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
```

**Saldo é `SUM(delta)`, nunca uma coluna.** Com 20 alunos num piloto o custo é
irrelevante; se crescer vira índice parcial ou vista materializada sem mudar a
interface pública.

A idempotência do ganho é um índice único **parcial**:

```sql
CREATE UNIQUE INDEX moedas_ledger_ganho_unico
  ON public.moedas_ledger (aluno_id, evento_tipo, referencia)
  WHERE motivo = 'evento';
```

> Convenção do repositório: `ON CONFLICT` sobre índice parcial **exige repetir o
> predicado** — `ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo =
> 'evento'`. Sem ele o Postgres não casa o índice e levanta "no unique or
> exclusion constraint matching".

`classe_id` fica no razão para a métrica saber **de qual turma veio cada moeda**.
Ele não participa do saldo.

### 3.2 `eventos_pontuacao` ganha uma coluna, e um irmão por turma

A tabela global criada em `20260909_05` decide hoje quantos **pontos** vale cada
tipo de evento. Ganha `moedas`:

```sql
ALTER TABLE public.eventos_pontuacao
  ADD COLUMN moedas numeric NOT NULL DEFAULT 0 CHECK (moedas >= 0);
```

E o professor sobrepõe por turma:

```sql
CREATE TABLE public.eventos_pontuacao_classe (
  classe_id  bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  tipo       text    NOT NULL,
  pontos     numeric NULL CHECK (pontos >= 0),
  moedas     numeric NULL CHECK (moedas >= 0),
  PRIMARY KEY (classe_id, tipo)
);
```

`NULL` significa "herda o global". Quem não mexe em nada continua com o padrão —
nenhuma turma precisa ser configurada para funcionar.

**Semente de moedas** (valores iniciais, ajustáveis sem migração nova):

| tipo | pontos (hoje) | moedas (proposto) |
|---|---|---|
| `conteudo_concluido` | 10 | 2 |
| `atividade_concluida` | 15 | 3 |
| `atividade_acertada` | 5 | 1 |
| `atividade_errada` | 0 | 0 |
| `atividade_revisada` | 2 | **0** |
| todo o resto | 0 | 0 |

`atividade_revisada` paga **zero moeda de propósito**. São 86 eventos desse tipo
num único aluno de demonstração; a 1 moeda cada, revisar seria a melhor fonte de
renda do sistema.

### 3.3 `loja_itens` — catálogo global

```sql
CREATE TABLE public.loja_itens (
  codigo       text PRIMARY KEY,
  nome         text    NOT NULL,
  descricao    text    NOT NULL,
  efeito       text    NOT NULL CHECK (efeito IN
                 ('prazo_extra','segunda_chance','dica','troca_formato')),
  preco_base   numeric NOT NULL CHECK (preco_base > 0),
  preco_fator  numeric NOT NULL DEFAULT 1 CHECK (preco_fator >= 1),
  parametros   jsonb   NOT NULL DEFAULT '{}'::jsonb,
  ativo        boolean NOT NULL DEFAULT true,
  ordem        integer NOT NULL DEFAULT 0
);
```

`preco_fator` é o preço crescente: a **n**-ésima compra do mesmo item para o
mesmo alvo custa `preco_base * preco_fator^(n-1)`, arredondado. Com
`preco_fator = 2`, o segundo dia de prazo custa o dobro do primeiro. É a prática
convergente nas políticas de *late days* de Tufts, Cornell e UMD, e o que
transforma "folga" em "folga com custo" — o mecanismo que Sharif & Shu (JMR
2017) mostram ser o que produz persistência, e não a folga em si.

### 3.4 `loja_config_classe` — o que o professor controla

```sql
CREATE TABLE public.loja_config_classe (
  classe_id            bigint PRIMARY KEY REFERENCES public.classe(id) ON DELETE CASCADE,
  prazo_max_dias_total integer NOT NULL DEFAULT 2  CHECK (prazo_max_dias_total  BETWEEN 0 AND 14),
  prazo_max_por_ativ   integer NOT NULL DEFAULT 2  CHECK (prazo_max_por_ativ    BETWEEN 0 AND 14),
  retry_max_por_topico integer NOT NULL DEFAULT 1  CHECK (retry_max_por_topico  BETWEEN 0 AND 5),
  itens_desligados     text[]  NOT NULL DEFAULT '{}'::text[],
  atualizado_em        timestamptz NOT NULL DEFAULT now()
);
```

**`prazo_max_dias_total` é o teto que você pediu**, e é o que aparece nas
métricas do aluno (§7.1). Turma sem linha aqui usa os defaults.

### 3.5 `loja_compras` — a posse

```sql
CREATE TABLE public.loja_compras (
  id               bigserial PRIMARY KEY,
  aluno_id         uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  classe_id        bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  item_codigo      text    NOT NULL REFERENCES public.loja_itens(codigo),
  origem           text    NOT NULL DEFAULT 'compra'
                     CHECK (origem IN ('compra','dotacao','concessao')),
  preco_pago       numeric NOT NULL DEFAULT 0 CHECK (preco_pago >= 0),
  alvo_tipo        text    NULL CHECK (alvo_tipo IN ('atividade','topico','questao')),
  alvo_id          bigint  NULL,
  status           text    NOT NULL DEFAULT 'ativa'
                     CHECK (status IN ('ativa','consumida','estornada')),
  idempotency_key  text    NOT NULL,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  consumido_em     timestamptz NULL,
  UNIQUE (aluno_id, idempotency_key)
);
```

A chave de idempotência é do **cliente**, gerada antes de chamar. Serve para o
caso em que o pedido chegou e a resposta se perdeu: repetir a chamada devolve a
mesma compra em vez de cobrar duas vezes.

`origem` é o que faz a dotação (§6.3) caber na mesma tabela: uma unidade dada é
uma posse como outra qualquer, com `preco_pago = 0`. A distinção importa em
exatamente dois lugares, e em nenhum outro:

- **preço** — a escalada de `preco_fator` conta só as posses com
  `origem = 'compra'`. Ganhar unidades não encarece as seguintes;
- **teto** — o teto do professor conta **todas** as posses, dotação inclusa. O
  teto é decisão pedagógica sobre quanto prazo é aceitável, não sobre quanto o
  aluno pagou.

### 3.6 `loja_dotacao` — quantas unidades todo mundo ganha

```sql
CREATE TABLE public.loja_dotacao (
  classe_id   bigint  NOT NULL REFERENCES public.classe(id) ON DELETE CASCADE,
  item_codigo text    NOT NULL REFERENCES public.loja_itens(codigo),
  quantidade  integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  PRIMARY KEY (classe_id, item_codigo)
);
```

A concessão é **preguiçosa**, não um gatilho de matrícula: `loja_saldo_item()`
calcula `dotação_da_turma − usadas + compradas`. Materializar no momento da
matrícula criaria a pergunta insolúvel do que fazer quando o professor mudar a
dotação depois — quem entrou antes fica com a antiga? Derivando, mudar o número
vale para todo mundo na hora, e não há linha para migrar.

Semente proposta: 2 unidades de `prazo_extra` e 1 de `segunda_chance` por turma.

### 3.7 `atividade_prazo_aluno` — o prazo é por aluno, não da atividade

Este é o ponto mais fácil de errar do desenho inteiro.

`atividades.data_entrega` é **da turma**. Se a compra escrevesse ali, um aluno
comprando um dia a mais estenderia o prazo **de todo mundo** — e o professor
veria a própria data mudar sozinha. A extensão precisa de uma camada por aluno:

```sql
CREATE TABLE public.atividade_prazo_aluno (
  aluno_id      uuid   NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id  bigint NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  dias_extras   integer NOT NULL DEFAULT 0 CHECK (dias_extras >= 0),
  prazo_efetivo timestamptz NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, atividade_id)
);
```

`prazo_efetivo` é derivado e gravado pela RPC: `data_entrega + dias_extras`.
Guardar o resultado, e não só o número de dias, evita que uma edição posterior do
prazo pelo professor mova retroativamente uma extensão já comprada.

> **Interação com o #177.** Hoje `data_entrega` vence à meia-noite UTC, três
> horas antes de o dia começar em São Paulo, e **248 atividades estão
> cadastradas com zero prazos**. Construir extensão de prazo sobre um cálculo
> que erra um dia entrega um item que parece quebrado no primeiro uso. O #177
> deve fechar antes de o item `prazo_extra` ser ligado.

### 3.8 `atividade_tentativa` — o histórico que a política 90/10 exige

Hoje `atividade_aluno` guarda **uma** nota, e a revisão nem chega a gravar. Para
calcular 90% da melhor mais 10% da pior é preciso ter as duas:

```sql
CREATE TABLE public.atividade_tentativa (
  id           bigserial PRIMARY KEY,
  aluno_id     uuid    NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  atividade_id bigint  NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  ordem        integer NOT NULL CHECK (ordem >= 1),
  percentual   numeric NOT NULL CHECK (percentual BETWEEN 0 AND 100),
  compra_id    bigint  NULL REFERENCES public.loja_compras(id),
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aluno_id, atividade_id, ordem)
);
```

---

## 4. Como a moeda entra

Um gatilho `AFTER INSERT` em `eventos_aluno`:

```
evento chega
  ├─ resolve a classe do evento (mesma resolução por referência que o rank usa)
  ├─ moedas := COALESCE(override da turma, padrão global, 0)
  ├─ se moedas = 0 → não faz nada
  └─ INSERT no razão
       ON CONFLICT (aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'
       DO NOTHING
```

O `DO NOTHING` é a idempotência: o mesmo acerto na mesma questão paga **uma vez
na vida**. É o que impede a faucet infinita — se moeda viesse de acerto em
questão repetível, a estratégia dominante seria chutar até acertar, que é
exatamente o *gaming the system* que Baker documenta em tutores inteligentes.

> **Dependência do #186.** Enquanto o acerto em atividade personalizada não tiver
> dedup no servidor, o mesmo acerto pode chegar duas vezes com referências
> diferentes. O índice acima cobre o caso de referência idêntica; o #186 cobre o
> resto. Fechar antes de ligar a economia.

**O XP não passa por aqui.** O gatilho de pontos de `20260909_05` continua
intocado, e nenhuma escrita da loja chega perto de `eventos_aluno.valor`.

---

## 5. Como a moeda sai

### 5.1 `loja_comprar` — a única porta

```sql
loja_comprar(
  p_item            text,
  p_classe_id       bigint,
  p_alvo_tipo       text    DEFAULT NULL,
  p_alvo_id         bigint  DEFAULT NULL,
  p_idempotency_key text
) RETURNS jsonb
```

`SECURITY DEFINER`, `search_path` fixo, e **uma transação**:

1. idempotência — se já existe compra com essa chave, devolve ela e sai;
2. matrícula — o aluno está nessa turma?
3. item ligado — existe, `ativo`, e não está em `itens_desligados` da turma;
4. teto, gate e cooldown — as regras do efeito (§5.2), incluindo o gate de
   revisão para `segunda_chance` (§6.4);
5. dotação — se ainda há unidade gratuita (§6.3), a posse sai com
   `origem = 'dotacao'` e `preco_pago = 0`, e os passos 6, 7 e 9 são pulados —
   unidade gratuita não consulta preço, não consulta saldo e não gera débito;
6. preço — `preco_base * preco_fator^(compras anteriores do mesmo alvo)`;
7. saldo — `SUM(delta)` do razão **com `FOR UPDATE` na carteira**, e recusa se
   ficar negativo;
8. grava a compra;
9. grava o débito no razão, apontando para a compra;
10. aplica o efeito;
11. devolve `{ok, compra_id, saldo_novo, efeito}`.

Qualquer falha desfaz tudo. É o aceite do #144 — "debita e concede, ou não faz
nada" — e a razão de a compra ser RPC e não `INSERT` com gatilhos em cadeia.

**Saldo negativo é impossível por construção**, não por convenção: o passo 7
trava a linha e o passo 9 só existe se o 7 passou.

### 5.2 Os efeitos

| efeito | o que faz | teto |
|---|---|---|
| `prazo_extra` | soma dias em `atividade_prazo_aluno` | `prazo_max_por_ativ` na atividade, `prazo_max_dias_total` no semestre |
| `segunda_chance` | libera uma tentativa que **conta** | `retry_max_por_topico`, cooldown de 24h, e o gate de revisão (§6.4) |
| `dica` | marca a questão como "dica liberada" | 1 por questão |
| `troca_formato` | troca `formato_prioritario` do próximo material | nenhum |

`troca_formato` é o único sem consequência avaliativa: existe para o aluno ter o
que comprar sem apostar nada, e porque autonomia de escolha é o que preserva
motivação intrínseca segundo a leitura útil da SDT — o dano medido por Deci,
Koestner & Ryan vem da recompensa percebida como **controladora**, e um item que
o aluno escolhe não é.

### 5.3 O que o professor controla, e o que não

**Controla:** quanto cada evento paga na turma dele, o teto de prazo (por
atividade e total), quantos retries por tópico, e quais itens ficam desligados.

**Não controla:** o preço (global) e o catálogo (global). Um professor não pode
inventar item novo.

---

## 6. Os itens de consequência acadêmica, e as duas salvaguardas

### 6.1 Extensão de prazo

É o item com evidência mais forte de uso real: 74 compras contra 1 do refazer no
estudo de O'Donovan, e os autores atribuem o resultado a ele ter **valor fora do
jogo**. A prática universitária convergiu, sem estudo comparativo, para três
parâmetros que este desenho adota: estoque finito, preço crescente, teto duro.

O único estudo de desfecho localizado (Sarvary & Ruesch, Cornell, N = 347) não
encontrou piora de nota nem aumento de procrastinação com prazo estendido sem
penalidade — 41% usaram uma vez, 37% várias, 22% nunca. Limitação séria: uma
disciplina, sem controle randomizado.

### 6.2 Segunda chance: por que 90/10 e não "fica a melhor"

Esta foi a decisão que mudou depois da pesquisa. A proposta inicial era "fica a
melhor nota", e o grupo de Illinois (PrairieLearn) comparou exatamente essas
variantes:

| política | o que foi medido |
|---|---|
| substituição integral | alunos param de levar a primeira tentativa a sério. **Descartada** por unanimidade dos instrutores. |
| nota nunca piora ("seguro") | 49% refazem, **mas só 70% melhoram**. Os autores leem como *roll of the dice*: atrai quem já tem nota quase perfeita, porque não há o que perder. |
| **90% da melhor + 10% da pior** | refazer sobe entre alunos B (16%→32%) e C (50%→64%), **sem aumento de quem piora**, e desempenho melhor nas provas seguintes (d = 0,15–0,28). |

Fonte: Herman, Cai, Bretl, Zilles & West, ICER 2020 (N = 617 e 353); Herman,
Varghese & Zilles, FIE 2019.

Dois achados que o desenho incorpora:

**A existência da segunda chance não reduziu o esforço na primeira** quando a
política era adequada — média de 75,0 / 75,0 / 75,1 nos semestres sem, sem e com
segunda chance.

**Cooldown precisa ser imposto, não esperado.** 97% dos alunos deixaram ao menos
um dia entre tentativas porque as janelas fechavam semanalmente, não por escolha.
Alargar a janela não fez ninguém espaçar mais: a maioria faz no último dia
disponível, sempre. Daí o cooldown de 24h ser regra da RPC, e não sugestão.

A nota final passa a ser calculada por gatilho:

```
nota_final = 0.9 * max(tentativas) + 0.1 * min(tentativas)
```

Com uma tentativa só, `max = min` e a conta devolve a própria nota — a fórmula
não muda nada para quem nunca comprou o item.

### 6.3 Dotação inicial igual

Uma economia em que **moeda ∝ desempenho** e os itens de recuperação **custam
moeda** é uma máquina de agravar desigualdade: quem está atrás é quem tem menos
moeda e quem mais precisaria do item. Isso não é hipótese — é a aplicação
literal do desenho, e o #144 já antecipava ao pedir "itens de recuperação
acessíveis a quem está atrás".

A mitigação com prática mais convergente — Tufts, Cornell, UMD — é a mais
simples: **todo mundo começa com N unidades**, e moeda compra apenas unidades
adicionais. Some o problema por construção, sem preço progressivo nem subsídio
invisível.

Isso importa também porque o desconto invisível por desempenho é uma armadilha
específica deste piloto: são 20 adultos numa sala que conversam entre si. Preço
que muda por aluno **vai** ser descoberto e **vai** ser lido como julgamento. A
dotação é pública, igual e impessoal.

Alinha com a segunda regra do épico #133 — "nenhum elemento é a única via para
pontuar". Aqui: nenhum item de recuperação depende de o aluno ter ido bem antes.

**Como fica:** `loja_dotacao` diz quantas unidades a turma dá (§3.6), e
`loja_saldo_item(aluno, classe, item)` devolve
`dotação − usadas + compradas`. A compra só entra quando a dotação acabou, e é
aí que a moeda passa a valer. Consequência deliberada: um aluno que use pouco
os itens **nunca precisa da loja** — e está tudo bem.

### 6.4 O gate de revisão

Refazer só libera depois de o aluno **voltar ao material do tópico**.

O dado: em Illinois, exigir uma tarefa antes de liberar o retry derrubou a taxa
de retake de 49% para 34% **com política de nota idêntica**. Quem desistiu
diante do gate era quem ia rolar o dado, não quem ia estudar.

O motivo de fundo é mais forte que o número. A literatura de *answer-until-
correct* é morna — Attali (2015) não achou efeito do multiple-try, e
meta-análises indicam que feedback elaborado supera tentar de novo. Ou seja:
**o que carrega o efeito é a revisão entre tentativas, não a tentativa em si.**
Um retry sem gate compra a parte que não funciona.

**A regra, em duas condições:**

```
revisou(aluno, topico, desde) :=
     existe item de material do tópico em personalizacao_item_progresso
     com atualizado_em > desde
  E  SUM(active_sec) >= 120 em telemetria_time_metric_entries
     para (aluno, topico), scope = 'material', captured_at > desde
```

A primeira condição sozinha seria satisfeita por abrir e fechar. A segunda usa
`active_sec`, **nunca `dwell_sec`** — `dwell` inclui tempo parado com o material
aberto, e aceitaria o aluno deixando a tela ligada. É a mesma distinção que
`_summarize_reading_pace` já faz para estimar WPM.

> Filtre por `scope` sempre. Dentro de um lote, `topic`, `content` e `material`
> trazem o mesmo intervalo — o aninhamento é inclusivo, e somar escopos
> diferentes multiplica o tempo.

**O gate é verificado na compra, não no uso.** Comprar e só então descobrir que
está bloqueado gasta a moeda do aluno numa porta fechada. Como a faixa de venda
vive dentro do modo de revisão (§9.2), o caminho natural é: o aluno volta ao
material, o gate abre, e a oferta aparece onde ele já está.

Não é cooldown — os dois existem e são independentes. O cooldown de 24h impede
a segunda tentativa colada na primeira; o gate exige que algo tenha acontecido
no meio. Em Illinois 97% dos alunos espaçaram as tentativas porque **a janela
os obrigou**, não por escolha: alargar a janela não fez ninguém espaçar mais.

---

## 7. Métricas

### 7.1 O que o aluno vê

Uma RPC `loja_metricas_aluno()` devolve, e a tela mostra:

- saldo atual e o extrato das últimas entradas, com origem;
- **prazo extra usado contra o teto da turma** — "2 de 4 dias usados neste
  semestre". Era o que você pediu, e é a informação que evita o aluno descobrir
  o teto justamente quando precisa dele;
- **unidades gratuitas restantes**, separadas das compradas — a dotação só
  cumpre o papel de §6.3 se o aluno souber que ela existe antes de precisar;
- retries usados por tópico, e se o gate de revisão está aberto;
- quanto cada ação paga na turma dele.

### 7.2 O que o professor vê

Views com `security_invoker = on` (convenção obrigatória do repositório: view sem
isso roda como `postgres` e **ignora RLS**), filtradas por
`app_alunos_do_professor()`:

| métrica | o que revela |
|---|---|
| compras por item | o que você pediu: quantas vezes o item X foi comprado |
| **alunos distintos por item** | separa "40 alunos compraram 2" de "3 compraram 25" — o ponto cego do número de O'Donovan |
| itens com zero compras | informação mais decisiva que qualquer outra: remova, não re-precifique |
| razão gasto/emitido por semana | moeda acumulando sem destino |
| saldo parado | aluno rico que não compra nada — nenhum item vale a pena |
| tempo entre ganho e gasto | moeda virou placar em vez de economia |
| **uso por quartil de desempenho** | se os itens de recuperação são comprados pelo quartil de cima, o desenho falhou |
| desfecho pós-uso | quem usou retry acertou depois? É a única métrica que separa "item usado" de "item que ensinou" |

Com 20 alunos nada disso tem poder estatístico. Servem para conversa e
diagnóstico, não para inferência — e as faixas que circulam em blogs de economia
de jogo (cobertura de sink 95–105%, Gini 0,4–0,6) **não se aplicam a N = 20**.

---

## 8. Segurança

`anon` e `authenticated` têm GRANT nas tabelas; **RLS é a única barreira**.

- **`REVOKE INSERT, UPDATE, DELETE`** em `moedas_ledger`, `loja_compras`,
  `atividade_prazo_aluno` e `atividade_tentativa` para `anon` e `authenticated`.
  Escrita só por RPC `SECURITY DEFINER`. Se o cliente pudesse inserir no razão,
  a moeda seria digitável — o mesmo defeito que o #164 corrigiu no rank.
- **SELECT do aluno:** só as próprias linhas.
- **SELECT do professor:** via `app_alunos_do_professor()`, nunca repetindo o
  `EXISTS` à mão — policy que consulta a própria tabela entra em recursão de RLS.
- **`loja_itens` e `eventos_pontuacao`:** leitura para todo autenticado (o aluno
  precisa ver preço e quanto cada ação paga), escrita para ninguém pelo cliente.
- **Anônimo não lê nada.**

---

## 9. Navegação e telas

### 9.1 A aba Social

Entra como quinta aba, hub de guildas, amigos, chats, loja, carteira e resumo
social. Desta entrega nascem **carteira e loja**; o resto é lugar reservado.

Hoje a barra tem quatro abas — Trilha, Notificações, Ranking, Perfil.

### 9.2 Os pontos de venda importam mais que a vitrine

No estudo de referência, o item de prazo vendeu 74 vezes e o refazer 1. A leitura
fácil é "o item de prazo é bom". A leitura mais útil é **onde ele aparecia**: o
prazo apertava na tela e a saída estava ali.

Aqui o que aperta não é o prazo — são 248 atividades com zero `data_entrega`. É a
**nota congelada**: hoje, quando o aluno refaz, `trilha/[id].tsx` força o evento
para `atividade_revisada` com valor 0 e pula o `registrarAtividadeConcluida`. Ele
já volta; o app é que não tem o que oferecer quando ele volta.

Daí dois pontos de venda, e o catálogo sendo o menos importante dos três:

1. **Faixa na atividade em revisão.** O enxerto já existe: `ActivityRenderer`
   recebe `reviewMode` e `QuestionActivity` já ramifica nele. A faixa ocupa o
   lugar onde hoje a revisão só avisa que não vale nada. **Aparece mesmo para
   quem não tem saldo**, com "faltam N" — é o que ensina para que serve a moeda.
2. **Selo de prazo**, quando o #177 fizer o prazo existir na tela do aluno.
3. **A vitrine**, na aba Social.

### 9.3 Gramática visual

Nada de geometria nova: todos os números saem de
`perfil/biblioteca-conquistas.tsx`, que é a tela mais próxima em função.

| elemento | valor |
|---|---|
| cartão | `borderRadius 18`, `padding 14`, `borderWidth 1` |
| item de lista | `borderBottomWidth 1`, `paddingVertical 12` |
| ícone | gradiente 40×40, `borderRadius 20` |
| título | `inikaBold 14` |
| descrição | `interMedium 12`, `lineHeight 17` |
| chip | `borderRadius 999`, `paddingH 9`, `paddingV 5`, `interMedium 10` |
| barra | `height 6`, `borderRadius 999`, `marginTop 7` |

A peça reaproveitada com significado novo é o `track`/`fill` de 6px: na
biblioteca ele diz quanto falta para destravar a conquista; aqui diz **saldo
contra preço**. Quem pode pagar não vê barra.

### 9.4 Cores

As paletas saem de `getProfileShellPalette`, rodado de verdade e não estimado.
O accent sobre `surfaceElevated`, por perfil:

| perfil | tema | accent | moeda | contraste |
|---|---|---|---|---|
| Seeker | mágica | `#1ab5a9` | `#23dfd1` | 4,96 |
| Survivor | medieval | `#7e8d9c` | `#9ba6b2` | 4,52 |
| Daredevil | medieval | `#e56a7a` | `#ed95a1` | 4,96 |
| Mastermind | real | `#9583e6` | `#b9adef` | 4,58 |
| Conqueror | medieval | `#6f90eb` | `#9cb3f1` | 5,03 |
| Socializer | mágica | `#f68161` | `#f9a791` | 5,02 |
| Achiever | real | `#c9a227` | `#dbb848` | 5,34 |

Todos acima do 4,5 que a própria `ensureMinContrast` persegue. A moeda usa
`lighten(accent, 10)`, o mesmo idioma da biblioteca de conquistas — com a
consequência de **a moeda mudar de cor por perfil**, de `#b9adef` no Mastermind
a `#dbb848` no Achiever. Aceito porque a conquista já se comporta assim e o
ícone carrega o significado.

### 9.5 A compra é síncrona e online

O único outbox do app é o de telemetria. Compra não entra em fila durável, por
três razões: pode falhar por saldo, e enfileirar é dizer "comprado!" para depois
descobrir que não deu; o outbox serializa escrita em tabela, e `loja_comprar` é
RPC; e o aluno está olhando a tela.

A chave de idempotência continua obrigatória — pelo motivo oposto ao da fila: o
pedido pode ter chegado e a resposta ter se perdido.

**O saldo nunca é calculado no cliente.** Percentual do tópico, tempo de estudo e
ranking já foram calculados no app, e nas três vezes o número do cliente passou
por cima do certo. Saldo é dinheiro: um número que pisca é um número em que o
aluno não acredita.

---

## 10. Ordem de implementação

1. **#186 e #177 primeiro.** Um é a dedup que impede moeda fabricada; o outro é o
   prazo que o item de extensão manipula.
2. Razão, `moedas` em `eventos_pontuacao`, override por turma, gatilho de ganho.
   *A economia já funciona: o aluno acumula e vê o saldo.*
3. Catálogo, config por turma, `loja_comprar` com `troca_formato` — o efeito sem
   consequência acadêmica, que valida a máquina de compra sozinha.
4. `loja_dotacao` e `loja_saldo_item` — a dotação precede a venda: o primeiro
   item de recuperação que o aluno encontra tem que ser o gratuito.
5. `atividade_tentativa`, o gate de revisão e `segunda_chance` com a 90/10.
6. `atividade_prazo_aluno` e `prazo_extra`.
7. Métricas e painel do professor.
8. Aba Social, vitrine e faixa de revisão.

Cada passo é utilizável sozinho e reversível sem desfazer o anterior.

---

## 11. Decisões em aberto

Uma só, e ela depende de outra issue:

**Recompensa coletiva.** O #144 lista no aceite ("recompensa coletiva existe"),
e no estudo de referência ela vendeu exatamente uma vez, a 50 SP. Não está
desenhada porque depende de guildas (#153), que não existem. Quando existirem,
o razão já suporta: é um débito de vários alunos com o mesmo `compra_id`.

As outras duas que estavam aqui — dotação inicial igual e gate de revisão —
foram decididas e entraram em §6.3 e §6.4.

## 12. O que este desenho deliberadamente não faz

- **Nenhum item dá vantagem de um aluno sobre outro.** Nada de roubar ponto,
  pular a vez ou subir no rank. O custo de evitar é zero.
- **Nenhum cosmético como sink principal.** Numa turma de 20 adultos não
  sustentam a demanda, e o resultado é saldo parado e economia morta.
- **Nenhuma moeda por tempo de app.** Seria incentivo direto para deixar a tela
  aberta. A distinção `active_sec`/`dwell_sec` existe, mas nunca foi testada sob
  pressão de incentivo.
- **Nenhuma segunda moeda.** Duas moedas num piloto de 20 pessoas é complexidade
  sem retorno.
- **Nada na API.** Não há modelo de linguagem em saldo, preço ou prazo.
