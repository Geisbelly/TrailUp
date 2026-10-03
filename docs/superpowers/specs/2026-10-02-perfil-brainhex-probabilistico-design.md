# Perfil BrainHex probabilístico: quiz como prior, métricas do aluno como evidência

> Issue #1. Substitui a classificação determinística por um perfil com
> **incerteza declarada**, que nasce do questionário e é corrigido pelo que o
> aluno de fato faz no app.

## 1. O problema

O quiz atual (`frontend/src/features/signup/brainhex.ts`) tem 31 itens Likert
0–5, soma por eixo, aplica pesos à mão, normaliza para percentual e elege o
maior como **perfil dominante**. Esse número vira cor, voz, tom editorial e
material gerado — tudo com confiança implícita de 100%.

Quatro defeitos, cada um mensurável:

### 1.1 Todos os itens são positivos

Os 31 itens são afirmações favoráveis ("Desafios difíceis me motivam", "Me
incomoda deixar tarefas pela metade"). Sem itens reversos não há como separar
*preferência* de **aquiescência** — a tendência a concordar. Quem marca 5 em
tudo recebe um perfil determinado pelos **pesos do mapeamento**, não pela
própria preferência.

### 1.2 Itens desiguais por eixo

Sete eixos têm 4 itens; `immersion` tem 3. A soma bruta de `immersion` é
estruturalmente menor, e ela entra com peso em três perfis.

### 1.3 Falta a parte ipsativa do instrumento original

O BrainHex validado (Nacke, Bateman & Mandryk, 2014) tem **duas** partes: a
escala de afinidade **e a ordenação forçada de sete afirmações**, que é o que
define classe primária e subclasse. O TrailUp implementou só a primeira. A
ordenação é justamente a parte que **neutraliza estilo de resposta**: ordenar
obriga a escolher, concordar com tudo não ajuda.

### 1.4 Desejabilidade social

"Eu continuo tentando mesmo depois de errar várias vezes" é uma virtude
escolar. O aluno responde o que acha que devia ser, não o que é — e o
instrumento é aplicado **no cadastro**, antes de qualquer vínculo.

## 2. O que a literatura diz sobre confiar na autoavaliação

Da base de leituras do projeto:

- **Sienel, Münster & Zimmermann (2021)** — os modelos preveem a nota
  *teórica* que a pessoa dá a um elemento de gamificação melhor que o acaso,
  mas "a previsão do valor **real** de motivação num app específico é mais
  difícil". Preferência declarada e comportamento observado divergem.
- **Santos et al. (2021)**, N=331 — "os achados indicam **nenhum padrão
  abrangente e consistente** de associações" entre orientação de usuário e
  design de gamificação. Mapear tipo → design de forma fixa não se sustenta.
- **Hallifax et al. (2019)** — comparando BrainHex, Hexad e Big Five, o Hexad
  previu preferências melhor.
- **Mogavi et al. (2023)** — dados de **comportamento** preveem tipo melhor que
  o acaso, e entre os arquétipos testados **o BrainHex foi o que melhor
  performou**.

A leitura conjunta não é "trocar de modelo". É: **o questionário sozinho é um
prior fraco; o comportamento é a evidência forte; e o resultado deve carregar
incerteza.** Isso também é o que a própria monografia já declara na delimitação
("BrainHex não determinístico") e na seção 2.8 ("Limitações do uso de perfis").

Mantemos o BrainHex como vocabulário de saída — é decisão fixa no `CLAUDE.md`,
os 7 perfis atravessam banco, prompts, vozes e arte, e Mogavi dá razão empírica
para mantê-lo.

## 3. O desenho

### 3.1 Três camadas

```
  quiz (prior)  ──►  afinidade inicial + confiança baixa
                          │
  métricas do aluno ──►  verossimilhança por perfil
                          │
                          ▼
                 afinidade posterior + confiança
```

O que é persistido continua sendo `aluno_perfil (aluno_id, perfil_id,
afinidade)` — **o contrato não muda**. O que muda é como `afinidade` é
calculada e que passa a existir `confianca` ao lado.

### 3.2 Camada 1 — instrumento corrigido

| mudança | por quê |
| --- | --- |
| **itens reversos** (≥1 por eixo) | mede aquiescência: quem concorda com o item e com o reverso tem estilo de resposta, não preferência |
| **itens iguais por eixo** | soma bruta comparável |
| **centragem intrapessoal** (ipsatização) | subtrai a média do próprio respondente antes de comparar eixos — remove "responde alto em tudo" |
| **bloco de ordenação forçada** (7 afirmações) | restaura a parte ipsativa do instrumento original |
| **checagem de resposta descuidada** | variância ~0 (tudo 5, tudo 3) ou tempo por item implausível ⇒ confiança baixa, não perfil inventado |

A nota do quiz deixa de ser percentual normalizado e passa a ser **escore
centrado** por eixo, com um **índice de qualidade da resposta** que vira
confiança inicial.

### 3.3 Camada 2 — métricas do aluno

Métrica aqui é o que o app já coleta: **tempo, frequência, acerto, retomada,
caminho percorrido**. Nenhum indicador abaixo exige coleta nova.

| perfil | indicador comportamental | fonte já existente |
| --- | --- | --- |
| Seeker | abre material além do obrigatório; percorre conteúdo opcional | `personalizacao_item_progresso`, `conteudo_aluno` |
| Survivor | retoma depois de errar; tentativas até acertar | `telemetria_eventos_app.attempt_number`, `is_correct` |
| Daredevil | inicia atividade antes de ler o conteúdo; primeira tentativa rápida | ordem de eventos + `time_since_prev_sec` |
| Mastermind | lê antes de responder; tempo em teoria alto | `vw_telemetria_tempo_conteudo_aluno` × atividade |
| Conqueror | consulta ranking; reage a mudança de posição | `eventos_aluno`, telas de rank |
| Socializer | usa chat/guilda; interage com colegas | `telemetria_eventos_app` grupo `chat`, tabelas sociais |
| Achiever | fecha 100%; conclui opcional | `topico_aluno.percentual_concluido`, trigger de progresso |

**Regra de ouro:** indicador é *evidência*, não definição. Nenhum deles sozinho
muda o perfil; todos entram como verossimilhança.

### 3.4 Camada 3 — combinação

Atualização bayesiana simples, por ciclo:

```
posterior(perfil) ∝ prior(perfil) × Π verossimilhança(indicador | perfil)
```

Com três salvaguardas:

1. **Piso de evidência.** Abaixo de N sessões, o posterior não se afasta do
   prior — aluno novo não é reclassificado por dois cliques.
2. **Teto de deslocamento por ciclo.** A afinidade muda no máximo X pontos por
   atualização: o material gerado é caro (`source_hash`), e perfil oscilante
   regeraria tudo sem parar.
3. **Confiança explícita.** `confianca` acompanha a afinidade. Com confiança
   baixa, a personalização usa o perfil como *tendência* (tom, ordem), não como
   *determinação* (trocar toda a mídia).

## 4. O que NÃO está neste desenho

- **Trocar BrainHex por Hexad.** Hallifax (2019) sugere que o Hexad prevê
  melhor, mas os 7 perfis são decisão fixa do `CLAUDE.md` e atravessam banco,
  prompts, vozes e arte. Trocar é outra discussão, com outro custo.
- **Classificar por comportamento sozinho.** Sem prior, aluno novo não tem
  perfil — e o cadastro precisa entregar um.
- **Mostrar o perfil como diagnóstico.** É tendência de preferência, não traço
  de personalidade nem laudo.

## 5. Fases

| fase | entrega | depende de |
| --- | --- | --- |
| 1 | instrumento corrigido + escore centrado + confiança | nada |
| 2 | bloco de ordenação forçada | fase 1 |
| 3 | indicadores comportamentais calculados do que já é coletado | telemetria com volume |
| 4 | atualização bayesiana + salvaguardas | fase 3 |

A fase 1 é o que destrava a issue #1: o cadastro passa a entregar um perfil com
incerteza honesta em vez de um rótulo com confiança fingida.

## 6. Referências

- Nacke, L., Bateman, C., Mandryk, R. (2014). *BrainHex: A neurobiological gamer typology survey*. Entertainment Computing.
- Sienel, N., Münster, P., Zimmermann, G. (2021). *Player-Type-based Personalization of Gamification in Fitness Apps*. HEALTHINF/BIOSTEC.
- Santos, A. C. G. et al. (2021). *The relationship between user types and gamification designs*. UMUAI 31:907–940.
- Hallifax, S. et al. (2019). *Adaptive Gamification in Education: A Validation of Player Type Models* (via Sienel et al., 2021).
- Mogavi, R. H. et al. (2023). *Your Favorite Gameplay Speaks Volumes about You: Predicting User Behavior and Hexad Type*. HCII.
- Monterrat, B. et al. *A Player Model for Adaptive Gamification in Learning Environments*.
