# Batalhas em evento: duelo no evento, pareamento e paridade (#154)

Data: 2026-11-05 · Issue [#154](https://github.com/BitStudioLabs/trail-up/issues/154) · Continua
[`2026-11-03-inscricao-em-evento-e-rank-do-evento-design.md`](2026-11-03-inscricao-em-evento-e-rank-do-evento-design.md) §7

**Estado: aprovada em 2026-11-05** ("pode seguir com as recomendações"). Fase 1 na `20261105_13` (#991); fase 2 na `20261105_15` (#995); fase 3 na `20261105_16`.

## 1. Resumo

Depois da spec de 03/11 e dos PRs #916, #920 e #923, metade da #154 já está atendida. Faltam três
coisas, todas listadas na §7 daquela spec:

1. **duelo dentro do evento**, só entre inscritos;
2. **pareamento por proximidade de desempenho**, documentado e configurável;
3. **paridade entre a via individual e a via em guilda**.

Na leitura do código apareceu um defeito de paridade que a spec anterior não listava: **a missão de
guilda paga a recompensa inteira a cada membro com uma fração do esforço** (§2.3).

## 2. O que existe hoje

### 2.1 Aceites da #154 já atendidos

| Aceite | Como | Onde |
|---|---|---|
| Participação é opt-in, e recusar não reduz XP nem posição | duelo marcado `fora_do_xp`; as cinco contas de XP o ignoram; o piso da aposta olha o saldo de duelos | #916 (`20261103_15`) |
| Rank de arena separado do rank principal | o duelo vale só no critério `ranqueada`, no Elo e no rank do evento, que é por inscrição | #916, #920 (`20261104_01`) |
| Nenhuma medalha ou recompensa exclusiva de quem batalha | o rank do evento não dá prêmio (D5 da spec de 03/11); as medalhas do evento saem do resultado individual | #920, `fn_evento_classe_apurar` |
| Vencer é acertar mais; o tempo só desempata | `fn_desafio_encerrar` compara acertos por jogador; o tempo entra só no modo `velocidade` e só no empate | `20261021_06` |

### 2.2 A arena hoje

- **Formatos:** `solo`, `dupla` e `guilda` contra guilda (`arena_desafio_criar`, `20261021_19`).
- **Quem escolhe o adversário é o aluno.** Não há pareamento: ele passa `p_adversarios` ou `p_guilda_rival`.
- **Proteção existente:** limite diário contra o mesmo adversário (`arena_limite_diario_mesmo_adversario`, padrão 3).
- **Elo:** um rating por aluno e turma, inicial 1000; o da equipe é a média dos jogadores (`20261021_18`).
- **Pontos do duelo** (`eventos_pontuacao`): `desafio_vencido`, `desafio_empate`, `desafio_participou` e `desafio_derrota`, que vale −6 com fator de aposta. O piso (`ranqueada_piso_pontos`) impede saldo negativo de duelo.
- **O duelo não conhece evento.** `guilda_desafios` não tem `evento_id`; o valor `consequencia = 'evento'` existe, mas não diz de qual evento.

### 2.3 Paridade: onde o código já atende e onde não

**No evento, atende.** A pontuação da guilda é a **soma** dos pontos individuais dos membros
(`eventos_classe_resultado_guilda`). Moedas e medalhas saem do resultado **individual**
(`eventos_classe_resultado`). O aluno sem guilda recebe exatamente o que receberia dentro de uma.

**Na missão de guilda, não atende.** `fn_missao_guilda_avaliar` (`20261021_15`) soma a contribuição
dos membros e, quando a soma atinge o alvo, **paga cada membro uma vez com o prêmio inteiro**:

| | Alvo | Esforço de cada um | Prêmio de cada um |
|---|---|---|---|
| Missão individual | 10 atividades | 10 | P |
| Missão de guilda, 5 membros | 10 atividades | 2, em média | P |

A guilda rende cinco vezes mais por esforço. Isso viola dois aceites: "todo evento com pontuação por
guilda tem caminho individual equivalente" e "as duas vias rendem o mesmo para esforço equivalente".
Também torna a guilda obrigatória na prática, contra a #153.

## 3. Decisões para o time

**D1. O duelo do evento é a arena com `evento_id`.** Recomendo:
- `guilda_desafios.evento_id` (nulo fora de evento);
- só aluno **inscrito** desafia e é desafiado, e só com o evento `aberto`;
- **não move o Elo**: a decisão 8 do #571 já diz isso, e o rating é da turma, não do evento;
- conta no rank do evento pelo critério `ranqueada`, que já conta duelo (#920);
- continua `fora_do_xp`.

**D2. Quem perde no duelo do evento não perde ponto.** A #154 diz "ganha menos que o vencedor, nunca
negativo". Recomendo que, dentro do evento, a derrota pague `desafio_participou` em vez de
`desafio_derrota`: positivo e menor que `desafio_vencido`, como a issue pede. A aposta (−6) continua
valendo só fora do evento, na ranqueada do Social. Alternativa mais simples: a derrota paga 0.

**D3. Pareamento por proximidade, não escolha livre, dentro do evento.** Recomendo:
- uma RPC `evento_sugerir_adversarios(evento)` que devolve os `k` inscritos mais próximos em
  desempenho (padrão `k = 3`), e o aluno escolhe entre eles;
- `arena_desafio_criar` com `evento_id` **recusa** adversário fora da sugestão;
- fora do evento, o Social continua com escolha livre.

Escolher entre os `k` mais próximos mantém a autonomia (o opt-in) sem permitir o massacre que a
#154 descreve. O sorteio puro seria aleatório, e a escolha livre deixa o forte escolher o fraco.

**D4. A medida de desempenho é o Elo, com recaída no acerto para quem nunca duelou.**
- Quem tem partidas na turma usa o rating de `ranqueada_elo`.
- Quem não tem usa o acerto na primeira tentativa da matrícula, convertido para a escala do Elo por
  uma faixa linear configurável. Sem isso, todo estreante teria 1000 e seria pareado às cegas.
- A configuração fica em `app_config` (privada): `evento_pareamento_k`,
  `evento_pareamento_criterio` (`elo` ou `acerto`) e os limites da conversão.

**D5. Guilda contra guilda: força agregada = média dos membros, com limite de diferença de tamanho.**
- A força da guilda é a **média** do desempenho (D4) dos membros inscritos, não a soma: a soma
  premiaria guilda grande, que já tem vantagem na formação livre.
- A sugestão só junta guildas com até `evento_pareamento_dif_membros` membros de diferença (padrão 1).

**D6. Paridade na missão de guilda: o alvo é por membro.** Recomendo que o alvo de uma missão de
guilda seja **multiplicado pelo número de membros ativos** no momento da avaliação. Assim, cada
membro faz, em média, o mesmo esforço da missão individual para o mesmo prêmio. Alternativas
consideradas:
- **prêmio proporcional à contribuição:** pune o membro que fez menos e cria cobrança dentro da guilda;
- **missão individual gêmea obrigatória:** dobra o trabalho do professor e não resolve o fora do evento.

Isso muda missões de guilda já abertas. Recomendo valer só para missões criadas depois da migration.

**D7. Paridade passa a ser medida.** Para o aceite "rendem o mesmo", proponho uma checagem no
painel técnico: XP médio por atividade concluída de quem está em guilda contra quem não está, na
janela do evento. Uma divergência acima de um limiar vira alerta. Sem medida, a paridade é só
uma promessa no texto.

## 4. Fases

Cada fase é um PR pequeno, partindo da `main`, com e2e em Postgres local.

1. **Paridade da missão de guilda (D6).** Só banco. Antes, medir em produção quantas missões de
   guilda estão abertas, somente leitura.
2. **Duelo do evento no banco (D1, D2).** `evento_id`, inscritos, sem Elo, derrota sem aposta no evento.
   Seguro para builds antigas: sem `evento_id`, nada muda. Na implementação, `consequencia = 'evento'`
   já entregava D1 e D2 no fechamento; o que faltava era a ligação, a cobrança da inscrição e a view do
   rank, que só contava `consequencia = 'ranqueada'` e deixaria o duelo do evento fora do próprio rank.
3. **Pareamento (D3, D4, D5).** A RPC de sugestão e a recusa fora da sugestão.
4. **App e console.** O aluno vê "Duelar neste evento" com os sugeridos; o professor vê os duelos do evento. Depende de build nova.
5. **Medida de paridade (D7).** Indicador no painel técnico.

## 5. Como os aceites ficam

| Aceite da #154 | Atendido por |
|---|---|
| Participação é opt-in, e recusar não reduz XP nem posição | já feito (#916); D2 mantém no evento |
| Rank de arena separado do rank principal | já feito (#916, #920) |
| Nenhuma medalha ou recompensa exclusiva de quem batalha | já feito (D5 de 03/11) |
| Todo evento com pontuação por guilda tem caminho individual equivalente | evento: já atende (§2.3); missão de guilda: fase 1 |
| Via individual e via em guilda rendem o mesmo para esforço equivalente | fase 1 (D6) e fase 5 (D7) |
| Pareamento documentado e configurável | fase 3 (D3–D5) |
