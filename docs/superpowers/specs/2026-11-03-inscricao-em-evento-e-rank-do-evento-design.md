# Inscrição em evento e rank do evento — desenho

Issues: #155 (arenas com rank por tipo) e #154 (batalhas em evento). Escrito em 2026-11-03 sobre a
`main` em `3e7ca684`.

**Estado: aprovada em 2026-11-03,** com as recomendações da seção 3 como decisões. A fase 1 está em
implementação. Tudo foi levantado lendo migrations e código: **produção não foi consultada**, então
nenhum número de uso aparece aqui, e o impacto nos dados reais ainda precisa ser medido.

## 1. Resumo

A #154 e a #155 dependem da mesma peça, que não existe: um jeito de o aluno **entrar** numa disputa de
evento. Esta spec propõe essa peça e o rank do evento em cima dela.

O levantamento achou um problema anterior a tudo isso: **a batalha é opcional só no texto.** Os pontos
de duelo entram no XP, e o XP chega ao rank principal, às faixas e à nota. Enquanto isso não for
decidido (D1), a inscrição não entrega o que a #154 promete.

## 2. O que existe hoje

### 2.1 O que já está pronto

| Aceite | Situação |
| --- | --- |
| `periodo` com formato definido (#155) | Feito na `20261025_02`, com `trg_ranks_periodo_formato`. |
| `progresso` em rank pequeno (#155) | Feito: `percentual_do_lider` volta `NULL` abaixo de 8 participantes. |
| Corte do #134 (#155) | Herdado, se a arena for um `rank`: o filtro mora em `vw_rank_posicoes_por_classe`. |
| Dependências #152 e #153 (#154) | Fechadas. O rótulo `bloqueado: dependência` da #154 está velho. |

### 2.2 O que não existe

- **A peça "arena" é só um rótulo.** Nada lê `eventos_classe.pecas` além da checagem de "pelo menos
  uma peça".
- **`ranks` não conhece evento.** Não há `evento_id`.
- **Não há inscrição.** Participar de evento é automático: `participou` é ter ao menos uma linha em
  `eventos_aluno` na janela.
- **Duelo não conhece evento.** `guilda_desafios` não tem `evento_id`. O valor
  `consequencia = 'evento'` existe, mas não diz de qual evento.

### 2.3 Onde o texto das issues e o código divergem

**A. "Arena" são duas coisas.** A #155 diz "sem arena permanente". Mas a decisão de 2026-10-20 (#571)
trouxe a arena de volta como duelo permanente no Social, com Elo e sem reset por período, e o app já
tem o lobby. O duelo do Social e o rank de um evento são coisas diferentes com o mesmo nome.

**B. Os pontos de duelo chegam a cinco lugares.** Nenhum deles filtra por tipo:

| Onde | Efeito para quem recusa batalha |
| --- | --- |
| Critério `pontuacao` de `vw_rank_posicoes_por_classe_todas` | Fica atrás no rank principal. |
| `fn_evento_classe_apurar` | Fica atrás na pontuação e no destaque do evento. |
| `aluno_faixa_xp` (`20261102_10`) | Sobe de faixa mais devagar. |
| `classe_aluno.nota_final` (`20261102_13`) | Com `xp_peso_nota_pct > 0`, **pode ter nota menor**. |
| `professor_notas_da_turma` (`20261102_13`) | Aparece com menos XP no CSV do professor. |

Isso contraria a #154: "recusar não reduz XP nem posição" e "o rank da arena não alimenta o rank
principal". A nota não existia quando a #154 foi escrita, e é o caso mais grave. O padrão do peso é 0,
então só afeta turma em que o professor ligou o peso.

**C. Derrota tira ponto.** A #154 diz "quem perde não perde ponto". A fase 4 (21/10) fez o contrário:
`desafio_derrota` vale −6, com fator de aposta, e a decisão de descontar no rank e no evento está
registrada na spec de 19/10. Existe piso (`ranqueada_piso_pontos`, padrão 0), então a soma não fica
negativa por causa disso, mas o ponto cai. As duas decisões estão escritas e só uma pode valer.

**D. Quase nenhum critério respeita a janela.** A #155 fala em três critérios, e a view tem sete. Só
três usam `inicio`/`fim` do rank:

| Critério | Fonte | Respeita a janela? |
| --- | --- | --- |
| `pontuacao` | soma de `eventos_aluno` | Sim |
| `ranqueada` | soma de `eventos_aluno` de desafio ranqueado | Sim |
| `missoes` | `missao_aluno` concluídas | Sim |
| `tempo` | `classe_aluno."tempoGastoMin"` | **Não**: acumulado da matrícula |
| `percentual` | `classe_aluno."porcentagemConcluida"` | **Não**: acumulado da matrícula |
| `acertos` | `classe_aluno."acertosPercentual"` | **Não**: acumulado da matrícula |
| `elo` | `ranqueada_elo.rating` | **Não**: rating da turma, sem período |

Um rank de evento por `tempo` mostraria o tempo da vida inteira na turma. O argumento da #155 (tempo
premia persistência, percentual premia completude) continua válido, mas esses critérios não funcionam
num evento sem trabalho novo.

## 3. Decisões para o time

**D1. Os pontos de duelo continuam no XP?** É a decisão que trava o resto.
- **Recomendo:** o duelo contra adversário sai do XP. Deixa de contar nos cinco lugares da seção 2.3 B
  e continua valendo no rank `ranqueada`, no Elo e nas moedas. Isso cumpre a #154, resolve o conflito C
  (a derrota só pesa dentro do que o aluno escolheu) e tira a batalha da nota.
- **Alternativa:** manter o ganho e tirar só a derrota. É mais simples, mas quem batalha continua
  acumulando mais XP e nota do que quem recusa.
- **Custo:** muda a pontuação já calculada de quem duelou. Precisa medir em produção antes.

**D2. O que fazer com a contradição da derrota?** Com a recomendação de D1, a aposta fica só no rank
`ranqueada`, que é opt-in, e a frase da #154 passa a valer para o XP. Recomendo registrar assim nas
duas specs.

**D3. Como chamar as duas coisas?** Recomendo **Arena** para o duelo do Social e **rank do evento**
para o que esta spec cria, atualizando a #155. O texto da peça no console muda junto.

**D4. Quais critérios o rank do evento aceita?**
- **Recomendo:** começar com `pontuacao`, `missoes` e `ranqueada`, que já respeitam a janela.
- **Depois:** `tempo` na janela, somando `active_sec` por período. Pesa numa view lida a cada abertura
  do ranking, então entra em fase própria, com medição.
- **Fora:** `percentual` e `acertos`, que precisariam de foto no início do evento, e `elo`, que não
  tem janela.

**D5. O rank do evento dá prêmio?** Recomendo que **não**: nem ponto, nem moeda, nem medalha. A #154
pede que nada seja exclusivo de quem batalha, e sem prêmio não há o vetor de conluio do §6.9 do
estudo. O prêmio do evento continua vindo da apuração, para todos.

**D6. O aluno pode sair depois de entrar?** Recomendo que **sim**, a qualquer momento com o evento
aberto, e ele some do rank. Opt-in que não tem volta vira pressão. O custo é quem está perdendo poder
sair, o que é aceitável num rank sem prêmio.

**D7. Quem não se inscreveu vê o rank?** Recomendo que **sim**, com o mesmo corte de 15 dos outros
ranks: ver convida a entrar. A alternativa é mostrar só a inscritos, que protege mais e exige um filtro
a mais no wrapper.

## 4. Desenho proposto

Vale para as recomendações acima. Muda se D4 a D7 mudarem.

### 4.1 Modelo

```sql
-- Inscrição: não é tabela de ranking, então não fere o aceite "nenhuma tabela nova de ranking".
CREATE TABLE public.evento_inscricoes (
  evento_id uuid NOT NULL REFERENCES public.eventos_classe(id) ON DELETE CASCADE,
  aluno_id uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  inscrito_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (evento_id, aluno_id)
);

ALTER TABLE public.ranks
  ADD COLUMN evento_id uuid REFERENCES public.eventos_classe(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX ranks_um_por_evento_e_tipo
  ON public.ranks (evento_id, tipo_id) WHERE evento_id IS NOT NULL;

ALTER TABLE public.eventos_classe
  ADD COLUMN arena_criterios text[] NOT NULL DEFAULT '{}'
  CHECK (arena_criterios <@ ARRAY['pontuacao', 'missoes', 'ranqueada']);
```

### 4.2 Autorização

- **Inscrição só por RPC:** `evento_classe_inscrever(uuid)` e `evento_classe_sair(uuid)`, `SECURITY
  DEFINER`. Conferem antes de ler: sessão, matrícula por `app_minhas_classes()`, evento `aberto`,
  `now() < fim` e peça `arena`. São idempotentes.
- **Sem escrita direta:** `REVOKE` de `INSERT`/`UPDATE`/`DELETE` para os papéis de cliente.
- **Policies de leitura no mesmo commit da tabela:** o aluno lê a própria linha, e o professor lê as das
  classes dele por `app_classes_do_professor()`.
- **Conferir com o papel de verdade**, pelo bloco `SET LOCAL ROLE` do CLAUDE.md.

### 4.3 Ciclo de vida do rank

- **Ao abrir** (`fn_evento_classe_abrir_agora`, a mesma transação): para cada critério, cria um rank
  com `evento_id`, `inicio` e `fim` do evento. Vale para o clique e para o cron.
- **Peça `arena` sem critério:** usa `ranqueada`. Não pode levantar erro aqui, porque
  `fn_eventos_classe_varrer` engole a exceção como `falhas` e o evento agendado simplesmente não abriria.
- **Ao encerrar antes da hora** (`fn_evento_classe_encerrar_agora`): ajusta `ranks.fim`, antes de creditar
  os pontos do evento. O crédito nasce com `criado_em` igual a `fim`, e a janela é `< fim`, então ele
  fica fora do rank.
- **Critérios congelam ao abrir:** `arena_criterios` entra em `fn_eventos_classe_guarda`.

### 4.4 Armadilhas no caminho

| Onde | O que acontece | O que fazer |
| --- | --- | --- |
| `fn_ranks_guarda` | Sem `app.rank_periodo = 'on'`, o INSERT sobrescreve `inicio` e `fim`. | A abertura liga a flag, como `fn_rank_novo_periodo`. |
| `fn_ranks_guarda` | O professor edita `ranks` direto do console. | Recusar UPDATE e DELETE de rank com `evento_id` fora das transições. |
| `fn_rank_novo_periodo` | Abriria período novo num rank de evento. | Recusar com `evento_id`. |
| `RanksSection.tsx` | Lê `ranks` direto: o rank do evento apareceria como período. | Filtrar `evento_id IS NULL`. |
| `trg_ranks_periodo_formato` | O rótulo aceita até 40 caracteres, o título do evento até 120. | Cortar o título em 40 e tirar os espaços. |
| `notificacoes_rank_varrer()` | Lê todo rank em andamento e avisaria amigos de quem não entrou. | Ignorar rank com `evento_id` nesta fase. |
| `tests/test_retencao_politica.py` | Tabela nova com `aluno_id` reprova sem política de retenção. | Incluir `INSERT INTO retencao_politica` na mesma migration. |

Dois pontos ajudam. `ranks_um_periodo_aberto` só vale para `fim IS NULL`, então o rank do evento não
colide com ele. E `vw_ranks_info_por_classe` também filtra `fim IS NULL`, então **builds antigas do app
não listam o rank do evento** pela view. O caminho de reserva em `mobile/src/services/rankMetadata.ts`
lê `ranks` direto e precisa ser conferido.

### 4.5 A view do ranking

Uma condição em `base`, em `vw_rank_posicoes_por_classe_todas`:

```sql
WHERE r.evento_id IS NULL
   OR EXISTS (SELECT 1 FROM evento_inscricoes i
               WHERE i.evento_id = r.evento_id AND i.aluno_id = ca.aluno_id)
```

- A `_todas` continua sem GRANT para os papéis de cliente. O que a protege é isso, não o invoker.
- `percentual_do_lider` já conta depois desse filtro, então a regra de 8 participantes vale sozinha.
- `vw_rank_posicoes_por_classe` não muda, e o corte do #134 segue valendo.
- Toda função de que a view dependa precisa de EXECUTE para o cliente: foi assim que o ranking deu
  `42501` em 29/10. O `EXISTS` acima não chama função nenhuma.

### 4.6 D1 no banco

`eventos_aluno.fora_do_xp`, carimbada por gatilho na escrita, usada nos cinco lugares da seção 2.3 B.
É coluna, e não função nas somas, porque função dentro da view do ranking pediria EXECUTE para o cliente.

Duelo é existir equipe 2, a mesma pergunta de `fn_desafio_encerrar`. O default de
`guilda_desafios.consequencia` é `ranqueada`, então esse campo sozinho pegaria o desafio cooperativo, que
fica no XP.

O piso da aposta passa a olhar o saldo de duelos: com a derrota fora do XP, comparar com o acumulado
inteiro deixaria o critério `ranqueada` negativo.

A fase 2 precisa abrir uma exceção na view: o rank do evento conta duelo, porque ali o aluno escolheu
entrar, e a fase 1 tira duelo de todo critério `pontuacao`.

### 4.7 Clientes

- **Console:** ao marcar a peça, escolher os critérios no `FormularioDoEvento`; mostrar quem entrou no
  painel "Durante".
- **App:** botão entrar e sair em `EventoDaTurma.tsx`, sem destaque que empurre quem não é de batalha.
  O rank sai de `ranks` por `evento_id` (`ranks_posse_sel` já cobre) e as posições, da view atual.
- **Texto para o aluno:** dizer que entrar é opcional e não muda nota nem XP. Só pode ir ao ar depois de
  D1.

## 5. Fases

Cada fase é um PR, partindo da `main`.

1. **D1 no XP.** Coluna, os cinco lugares e o piso. Sem isso, a promessa da inscrição é falsa. Começa medindo
   em produção quantos pontos de duelo existem e em quais turmas o peso da nota está ligado.
2. **Banco do rank do evento.** Seção 4, sem cliente. Seguro para builds antigas.
3. **Console.** Critérios e inscritos.
4. **App.** Entrar, sair e ver o rank. Depende de build nova.
5. **Tempo na janela (D4).** Só com medição do custo na view.

As migrations seguem a regra do repo: aplicadas por quem decide, sem aplicação por iniciativa da sessão.
Vale lembrar que a API sobe rodando `alembic upgrade head`, então o espelho e o banco precisam andar
juntos.

## 6. Testes

- **e2e em Postgres local, com os gatilhos reais:** abrir pelo clique e pelo cron cria o rank; encerrar
  antes da hora ajusta `fim`; não inscrito fica fora; sair remove; corte de 15 vale; 7 inscritos não
  mostram percentual e 8 mostram.
- **Por papel:** aluno de outra turma recebe erro; o cliente não escreve em `evento_inscricoes`.
- **D1:** um duelo não muda `pontuacao`, apuração, faixa nem `nota_final`, e muda `ranqueada`; desafio
  cooperativo continua contando.
- **Regressão:** ranks sem `evento_id` devolvem o mesmo resultado, linha a linha, antes e depois.

## 7. Fora desta spec

Fica para uma spec própria da #154, que depende desta:

- **Duelo dentro do evento:** `guilda_desafios.evento_id`, só entre inscritos. A decisão 8 do #571 já diz
  que desafio de evento não conta para o Elo.
- **Pareamento por proximidade de desempenho,** individual e por força agregada de guilda.
- **Paridade entre a via individual e a via em guilda.** Nada aqui mede isso, e o aceite da #154 exige.

## 8. Como os aceites ficam

| Aceite | Atendido por |
| --- | --- |
| #155: arena reusa `ranks` + `rank_tipo` | Fases 2 a 4 |
| #155: `periodo` e `progresso` | Já feito |
| #155: corte do #134 vale para arena | Fase 2, por herança |
| #154: opt-in, recusar não reduz XP nem posição | Fases 1 e 2 |
| #154: rank de arena separado do principal | Fases 1 e 2 |
| #154: nenhuma medalha exclusiva de quem batalha | D5 |
| #154: caminho individual equivalente, paridade, pareamento | **Não atendido**: seção 7 |
