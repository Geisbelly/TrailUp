# Economia completa — compra, uso na trilha, metas e auditoria

**Data:** 2026-10-19
**Base:** o desenho de 12/09 (`2026-09-12-loja-de-moedas-design.md`) e o que já está no banco
(`moedas_ledger`, `loja_itens`, `loja_comprar`, `eventos_pontuacao_classe`, moedas na
aprovação em `avaliar_entrega`).
**Não aplica nada no banco ao vivo.** São migrations Alembic `20261020_01` … `20261020_06`,
encadeadas depois de `20261019_03` (fim da pilha B, #541; a pilha A, #530..#536, vem antes).

---

## O que já existia e fica

- Saldo é `SUM(moedas_ledger.delta)`. Nenhuma coluna de saldo.
- Ganho por evento é idempotente: índice único parcial
  `(aluno_id, evento_tipo, referencia) WHERE motivo = 'evento'`.
- O professor já sobrepõe pontos e moedas por turma em `eventos_pontuacao_classe`
  (`NULL` herda o global).
- `loja_comprar` já é atômica, com trava `pg_advisory_xact_lock` por aluno, e recusa
  saldo insuficiente. Dotação gratuita continua antes da compra.
- Moedas de atividade com correção (`atividades.metadata.moedas`) só entram depois
  da aprovação do professor, uma vez (`atividade_aprovada`).
- Gasto não mexe em XP nem no rank.

## O que este desenho acrescenta

A vitrine vendia o item e, fora de `troca_formato`, não aplicava efeito nenhum na
trilha. `segunda_chance` ainda exigia alvo na compra, então a vitrine (que compra
sem alvo) não conseguia sequer guardar o item. A dona do projeto pediu o ciclo
inteiro: o professor define os números, o aluno compra, usa na atividade, e
alguém consegue auditar.

### 1. Configuração, em três camadas

`NULL` numa camada de baixo herda a de cima.

| Camada | Onde | O que o professor define |
|---|---|---|
| Turma | `loja_config_classe` (colunas novas) + `loja_preco_classe` + `eventos_pontuacao_classe` + `loja_dotacao` | tetos que já existiam; mínimo e máximo de **uma** extensão de prazo e de tempo; preço, estoque e limite de compras por aluno; quanto cada evento paga; dotação |
| Tópico ou atividade | `economia_config_escopo` | moedas de conclusão, moedas de aprovação, pontos, e os mesmos tetos de prazo/tempo/retry quando aquela trilha ou atividade precisa de uma regra própria |
| Meta | `economia_meta` | critério, limiar, moedas e pontos |

Escrita dessas tabelas passa a ser só por RPC (`economia_salvar_*`). O cliente
continua lendo. A policy de professor permanece; o `REVOKE` de
`INSERT/UPDATE/DELETE` é o que impede o atalho.

**Prazo.** Três números, de propósito diferentes:

- `prazo_extensao_min_dias` / `prazo_extensao_max_dias` — o quanto **um uso**
  pode somar. O pedido do item (`parametros.dias`, hoje 1) é apertado para
  dentro desse intervalo.
- `prazo_max_por_ativ` — teto acumulado naquela atividade.
- `prazo_max_dias_total` — teto acumulado do aluno na turma.

O mesmo desenho vale para tempo, em minutos (`tempo_extra_*` e
`tempo_max_por_ativ`). Item novo: `tempo_extra`.

Se o concedido, somado ao que já foi usado, passar de um teto, a RPC recusa.
Não corta em silêncio: o aluno precisa saber que o teto acabou.

### 2. Compra e uso são passos diferentes

`loja_comprar` passa a só conceder a posse (`status = 'ativa'`), com três
checagens novas antes de debitar:

- preço da turma (`loja_preco_classe.preco_base`) quando não for `NULL`;
- estoque da turma, contando só `origem = 'compra'` não estornada, sob trava
  do par `(turma, item)` **antes** da trava da carteira;
- `uso_max_por_aluno` da turma, também só sobre compras.

`troca_formato` com alvo e formato válidos continua valendo na hora — já era
assim, e não tem efeito avaliativo.

`loja_usar(compra, alvo, chave)` consome a posse:

| efeito | alvo | o que grava |
|---|---|---|
| `prazo_extra` | atividade da mesma turma | `atividade_prazo_aluno.dias_extras` e `prazo_efetivo` |
| `tempo_extra` | atividade da mesma turma | `atividade_tempo_aluno.minutos_extras` |
| `segunda_chance` | atividade | as travas que já existiam na compra (teto do tópico, 24 h, revisão do material, questão elegível) e libera a nova tentativa |
| `dica` | questão | `loja_dica_liberada` |
| `troca_formato` | tópico | `loja_formato_escolhido` |

A chave de idempotência do uso fica em `loja_uso_log`. Repetir devolve o mesmo
resultado e não consome de novo.

`prazo_efetivo` é a data da atividade **no momento do uso** mais os dias. Uma
edição posterior do prazo da turma não empurra o que o aluno já comprou. Se a
atividade ainda não tinha data, os dias ficam guardados e um gatilho preenche
`prazo_efetivo` quando a data aparecer.

### 3. Estorno

`loja_estornar` é do professor da turma, só com a posse ainda `ativa`. Devolve
`preco_pago` no razão (`motivo = 'estorno'`) uma vez. Posse já usada não
estorna: o efeito acadêmico já aconteceu.

### 4. Ganho ligado a conclusão, aprovação e meta

- Aprovação: continua em `avaliar_entrega`. A moeda passa a ser
  `economia_config_escopo.moedas_aprovacao` da atividade, senão do tópico,
  senão `metadata.moedas`. O corte de 60% e a idempotência
  `atividade_aprovada` / `atividade:<id>` não mudam.
- Conclusão (desde `20261020_05`): marcar a atividade como concluída é do
  próprio aluno, então **não paga moeda**. A moeda de conclusão sai em
  `avaliar_entrega`, quando o professor aprova (nota >= 60% da máxima): o
  valor é `moedas_conclusao` da atividade, senão do tópico, senão o valor do
  evento `atividade_concluida` (da turma ou global). Uma vez por aluno e
  atividade (`atividade_conclusao_config` / `atividade:<id>`); quem já
  recebeu pelo evento antigo não recebe de novo; reprovar depois não estorna.
  O evento `atividade_concluida` continua dando pontos (rank), sem moeda.
- Aprovação registrada: `atividade_aprovacao` guarda a última avaliação do
  professor por aluno e atividade (nota, máxima, aprovada). Só
  `avaliar_entrega` escreve; o aluno lê a dele e o professor a da turma.
- Meta: `economia_avaliar_metas` (o aluno chama; o gatilho de moeda e
  `avaliar_entrega` também chamam, com trava de reentrada que é solta no fim).
  Critérios: `atividades_concluidas` (conta **só atividades aprovadas** pelo
  professor, em `atividade_aprovacao`), `nota_minima` (percentual da última
  nota do professor, no escopo atividade), `acertos`, `presencas`.
  Moedas vão ao razão com `evento_tipo = 'meta_atingida'` e
  `referencia = 'meta:<id>'`. Pontos vão a `eventos_aluno` como tipo
  **creditado** `meta_atingida` (o aluno não consegue inserir esse tipo; o
  gatilho de pontuação não reescreve o valor).
- Crédito dado antes de `20261020_05` não é recalculado; aprovação anterior a
  ela não paga conclusão retroativa.

### 5. Histórico e auditoria

- O aluno lê o próprio razão. O professor lê o dos alunos das turmas dele.
  `economia_extrato(aluno, motivo, desde, até, limite, offset)` faz o recorte
  e recusa aluno de outra turma.
- `loja_compras` continua sendo o log de compra. `loja_uso_log` é o log de uso.
- `economia_auditoria` é append-only: quem, quando, operação, antes, depois.
  Ninguém grava pelo cliente, e `authenticated` não tem `SELECT`. A leitura
  é o painel `/admin/economia` da API, com o mesmo login básico do admin.
- `economia_consistencia()` devolve saldo negativo, compra paga sem débito
  correspondente e estorno sem crédito. Também não é concedida ao cliente:
  o painel da API chama a função com o papel do banco. O saldo em si não tem
  coluna para divergir: a checagem é "o razão fecha com as posses".
- Uso de tempo grava os minutos concedidos e os minutos cortados
  (`minutos_cortados` = pedido do item menos o que coube no máximo de um uso).
  A soma concedida fica em `atividade_tempo_aluno` e entra no cronômetro da
  atividade.

### 6. Várias unidades do mesmo item e limite de uso por situação (`20261020_06`)

Pedido da dona do projeto: "o user deve poder comprar várias do mesmo item, mas
ter controle de quantos usar dependendo do tipo e da situação".

**Compra.** Cada unidade continua sendo uma linha de `loja_compras` (posse
individual, com estorno próprio). O que muda:

- `loja_comprar(..., p_quantidade DEFAULT 1)` compra de 1 a 20 unidades num
  pedido (`quantidade_invalida` fora disso). Comprar de novo, um por vez, também
  funciona: ter o item na Bag não bloqueia mais a vitrine.
- Tudo ou nada: limite de compras, estoque e saldo são conferidos para o pedido
  inteiro **antes** de gravar. A recusa diz quantas ainda cabem (`restantes`)
  e, no saldo, o total (`preco`) e o preço de cada unidade (`precos`).
- A dotação grátis entra primeiro; o resto paga.
- Uma linha, um lançamento no razão e uma linha de auditoria **por unidade**
  (`depois.unidade`, `depois.saldo`). A chave do pedido fica na unidade 1; as
  outras usam `chave#n` e todas guardam `lote_chave`. Repetir a chave devolve
  o lote inteiro sem debitar de novo.
- Mesmas travas de antes, na mesma ordem (par turma/item para estoque, depois a
  carteira do aluno). Dois pedidos simultâneos nunca deixam o saldo negativo.
- `uso_max_por_aluno` (rótulo "Compras por aluno") continua sendo o máximo de
  unidades **compradas**; estornada não conta; vazio = sem limite.
- `troca_formato` com alvo na compra (efeito imediato) só aceita 1 unidade.

**Aumento de preço por compra.** Vira opção da turma:
`loja_preco_classe.preco_fator` (1 a 5). Vazio herda o fator do catálogo
(`loja_itens.preco_fator`, o comportamento de hoje: prazo 10 → 20, tempo
8 → 16 → 32); **1 desliga o aumento**. Escolhemos manter o padrão atual para
não mudar o preço de nenhuma turma sem o professor pedir. Preço da unidade n:
`ceil(base × fator^(compradas antes))`.

**Uso.** Cada uso gasta exatamente uma unidade: `loja_usar_item(item, turma,
alvo_tipo, alvo_id, chave, parametro)` pega a unidade ativa **mais antiga**
(FIFO) e delega a `loja_usar`. Sem unidade: `sem_unidade`. A chave de
idempotência continua valendo (repetir não gasta outra).

O professor limita quantas unidades de cada **tipo** de item o aluno pode gastar
em cada **situação**, em `loja_limite_uso`:

| Situação | Conta usos do mesmo item… |
|---|---|
| `por_atividade` | na atividade |
| `por_questao` | na questão (responder novamente mirando a questão, dica) |
| `por_topico` | no tópico |
| `por_dia` / `por_semana` | no dia / semana corrente (America/Sao_Paulo) |
| `por_turma` | na turma, no total |

Camadas, da mais específica para a mais geral: atividade → tópico → turma →
padrão. Em cada camada: vazio herda, **0 bloqueia**, **-1 = sem limite**. Os
tetos antigos de `economia_config_escopo` (`uso_max_prazo`, `uso_max_tempo`,
`uso_max_retry`) e `retry_max_por_topico` continuam valendo como camada
intermediária, então nada configurado antes muda de sentido.

Padrões por tipo (quando ninguém configurou nada):

| Item | Padrão |
|---|---|
| `prazo_extra` | 1 por atividade |
| `tempo_extra` | 3 por atividade (os minutos ainda param no teto) |
| `segunda_chance` | 1 por questão e `retry_max_por_topico` (1) por tópico |
| `dica` | 1 por questão |
| `troca_formato` | sem limite |

Os limites somam-se aos tetos que já existiam (mínimo/máximo de um uso, tetos
de dias/minutos na atividade e na turma, 24 h e revisão do material na segunda
chance). A recusa nomeia o limite: `limite_por_questao`, `limite_por_atividade`,
`limite_por_topico`, `limite_por_dia`, `limite_por_semana`, `limite_por_turma`
(nessa ordem de checagem), com `limite` e `usados`. Os códigos antigos
`limite_de_uso` e `teto_do_topico` saem.

`loja_usos_permitidos(turma, item, alvo_tipo, alvo_id)` responde à tela, sem
gastar nada: `ativos` (na Bag), `restantes` (o menor entre Bag e limite),
`bloqueio`, `limite`, `usados` e os limites efetivos. `loja_inventario(turma)`
devolve, por item, `ativos`, `usados` e `estornados`. `loja_catalogo` ganha
`preco_fator`, `limite_compras`, `compradas`, `compras_restantes` e `em_posse`.

**Estorno** continua por unidade: só a não usada, devolve o que ela custou.

**Escrita.** `economia_salvar_limite_uso` (professor da turma; confere que o
tópico/atividade é da turma; todos os campos vazios apagam a regra) e
`economia_salvar_preco_classe(..., p_preco_fator)`. As duas auditam
(`config_limite_uso`, `config_preco`). `loja_limite_uso` é só leitura para o
cliente (aluno e professor da turma); escrita só pela RPC.

**Telas.** No console (`/console/economia` → Loja), cada item ganha "Aumento por
compra" e um bloco "Limites de uso" com turma inteira, um tópico ou uma
atividade. No app, a vitrine tem seletor de quantidade (até o que ainda cabe),
mostra quantos estão na Bag e o total do pedido; o botão "usar" na atividade é
um por tipo de item, mostra quantos usos ainda cabem ali e fica desligado com o
motivo quando um limite segura.

**Downgrade** (`06 → 05`) restaura as funções de `02`/`03` e mantém tabelas,
colunas e dados (inclusive `loja_limite_uso`).

## Segurança

RLS ligada em toda tabela nova. `anon` não lê. Escrita de razão, posse, uso,
prazo, tempo, dica e auditoria continua revogada para `anon` e
`authenticated`. Função nova: `SECURITY DEFINER` e
`search_path` fixo em `public, pg_temp`. `economia_extrato` também é
`SECURITY DEFINER`: um dev da plataforma não é professor da turma, então a
policy do razão sozinha esconderia os alunos. A função confere
`auth.uid()`, `app_alunos_do_professor()` ou `app_e_dev()` antes de ler.

O downgrade devolve `loja_comprar`, `loja_catalogo`, o crédito de evento e
`avaliar_entrega` ao corpo anterior. Não apaga razão, compra, prazo, tempo,
meta, preço, escopo, dotação nem auditoria. `tempo_extra` só sai do catálogo
se ninguém comprou, a turma não gravou preço e não há dotação. Se qualquer
uma dessas linhas existir — ou se outra chave estrangeira segurar o item — o
check de efeito continua aceitando `tempo_extra`, para o downgrade não abortar
e levar o resto junto. Ponto de meta já creditado também fica: o downgrade não
reescreve `eventos_aluno`.

## Fora deste corte

- Não há fila de aprovação de compra. O teto do professor e o saldo decidem
  na hora.
- Gerar o texto da dica (isso é IA). A RPC só registra que a dica foi liberada.
- O cronômetro de perfil não trava a atividade por conta própria. Os minutos
  comprados somam na contagem que já existia.
