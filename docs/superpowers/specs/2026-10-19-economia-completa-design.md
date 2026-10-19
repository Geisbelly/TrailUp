# Economia completa — compra, uso na trilha, metas e auditoria

**Data:** 2026-10-19
**Base:** o desenho de 12/09 (`2026-09-12-loja-de-moedas-design.md`) e o que já está no banco
(`moedas_ledger`, `loja_itens`, `loja_comprar`, `eventos_pontuacao_classe`, moedas na
aprovação em `avaliar_entrega`).
**Não aplica nada no banco ao vivo.** São migrations Alembic `20261020_01` … `20261020_03`,
encadeadas depois de `20261019_13` (main já com o PR #153, uma cabeça só).

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
- Conclusão: se o professor definiu `moedas_conclusao` no escopo, o gatilho em
  `atividade_aluno` credita uma vez (`atividade_conclusao_config`). Não
  substitui o ganho global de `eventos_pontuacao`.
- Meta: `economia_avaliar_metas` (o aluno chama; o gatilho de moeda também
  chama, com trava de reentrada). Critérios: `atividades_concluidas`,
  `nota_minima` (percentual, no escopo atividade), `acertos`, `presencas`.
  Moedas vão ao razão com `evento_tipo = 'meta_atingida'` e
  `referencia = 'meta:<id>'`. Pontos vão a `eventos_aluno` como tipo
  **creditado** `meta_atingida` (o aluno não consegue inserir esse tipo; o
  gatilho de pontuação não reescreve o valor).

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
