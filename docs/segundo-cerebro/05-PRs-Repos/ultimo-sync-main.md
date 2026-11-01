---
tags: [sync, github, delta]
repo: BitStudioLabs/trail-up
branch: main
---

# Último sync — main

| Campo | Valor |
|-------|-------|
| **Tipo** | Atualização do vault TCC (Obsidian) com o que entrou na `main` |
| **Repo** | [BitStudioLabs/trail-up](https://github.com/BitStudioLabs/trail-up) `main` |
| **SHA** | `11aa1c65` |
| **Tip commit** | `fix(api): cada perfil ganha um nome de boss próprio e as falas carregam a assinatura do perfil (#763)` |
| **Tip author date** | 2026-11-01 |
| **Sync vault em** | **2026-11-01** (America/Sao_Paulo) |
| **Método** | `git log b5491b02..origin/main` num worktree da `main` |
| **Range** | `b5491b02…11aa1c65`: **305** commits e **122** migrations novas |
| **Alembic (main)** | cabeça única `20261101_14` (e-mail pelo Apps Script) |
| **Espelho** | `main` do Geisbelly/TrailUp em `370b0ba3`: merge da [#205](https://github.com/Geisbelly/TrailUp/pull/205), que traz o Lab até `234d81f` (#761). **A #762 e a #763 ainda não chegaram ao espelho.** |

## O que entrou entre `b5491b02` e `11aa1c65` (13/10 → 01/11), por área

### Console do professor
- **#419:** redesign V9 de Turmas, Meus dados, Rankings, Personalizações, Aprovações e Trilhas.
  - Na mesma leva: remoção de código morto (#420–#442) e testes das funções puras (#452–#462).
- Telas novas:
  - **Conquistas** (#473–#482);
  - **Notas**, com fila de correção (#483–#489, #516);
  - **Missões** (#490–#494, #518);
  - **Eventos**, com os painéis Durante e Resultado (#495–#496, #506–#509, #523–#528);
  - **Rank de batalhas** (#512–#513).
- **#703:** o assistente do professor passa a se chamar **Lumi**.
- **Personalizações:** o card de gargalos mostra as falhas por formato (**#735**, #15).
- **Insights:** alertas por aluno (**#737**, #64).
- **Painel de risco de reprovação** (**#741**, #135).
- **#747:** importar a turma e exportar notas e XP em CSV (#146).

### Gamificação: eventos, missões, ranks, modos e economia
- Spec: `docs/superpowers/specs/2026-10-19-eventos-missoes-ranks-modos-design.md`.
- **#544:** economia completa, com configuração do professor, compra, uso de itens na trilha e auditoria.
- Fases 1 a 10 (#546–#564):
  - eixos de consequência e de dificuldade;
  - missões como entidade própria;
  - um avaliador só para conquista e missão;
  - missão diária determinística por coorte, com o texto reescrito pelo Gemini (#553);
  - aposta e piso nos eventos;
  - o desafio fecha e paga;
  - composição solo, dupla, guilda e turma;
  - tela de jogo.
- **#567:** escopo e aprovação da missão.
- **#568:** ranking com período manual.
- **#569:** janela de formação de guildas.
- **#570/#571:** a arena volta, com Elo.
- **#639:** o evento abre e encerra sozinho no horário, pelo pg_cron (#141).
- **#634/#637/#726/#731:** pontos e guildas em evento (#153).
- **#654/#723:** conquistas da turma (#158).
- **#742:** fundo coletivo da turma (#144).
- Boss:
  - **#465/#466:** a vida passa a ser proporcional ao percurso;
  - **#751:** segue a paleta do perfil;
  - **#753:** sai a imagem gerada pelo Gemini;
  - **#755/#761/#763:** nome e falas gerados por conteúdo × perfil, com nome único por perfil.

### Métricas (F0–F5, #12) e risco
Spec em `docs/superpowers/specs/2026-10-28-metricas-ponta-a-ponta-design.md`; planos em `docs/superpowers/plans/2026-10-2*-f*.md`.

- **F0 (#701):** medir antes de mexer: por onde o lote chegou (`via`), catálogo e invariantes diárias.
- **F1 (#704):** o ranking sai só do banco.
- **F2 (#707/#709):** o banco fecha a sessão de telemetria.
- **F3 (#712):** o banco enfileira a análise de todo lote (`telemetria_analise_fila`) e a API consome a fila.
- **F4a (#714):** tempo de estudo é o tempo ativo, e só um lugar o calcula.
- **F5 (#727–#729):** views versionadas; no console, KPIs nos quatro estados e abandono por etapa. A #12 foi fechada em 01/11.
- **Modelo de evasão:** #738/#739. Com a **#752**, só julga quem tem atividade avaliável ao alcance.
- **Risco de reprovação por aluno:** #740/#741 (#135).
- **Nota média da matrícula:** o banco passa a calcular (#750/#756/#757, `20261101_10`), e quem tem nota NULL sai da faixa "baixa".

### LGPD e segurança (#195)
- Falhas de SECURITY DEFINER e de RLS corrigidas (#532, #533, #538, #539), com portões no CI que as pegam (#534, #535).
- **#576:** cadastro em uma etapa, sem o oráculo de enumeração de e-mail (#329).
- **#591/#593:** as conversas do aluno saem do log e são cifradas em repouso.
- **#613:** consentimento do responsável e modo restrito.
- **#616:** janelas de retenção e expurgo agendado.
- **#618/#619:** dados mínimos nos prompts; menor de 18 anos só usa a OpenAI (`store=false`), nunca o Gemini.
- **#621:** registro de transferências e Política de Privacidade.
- **#622/#624:** exclusão da conta de professor e aviso de inatividade por e-mail.
- **#631:** buckets privados e ciclo do R2.
- **#762:** o e-mail sai do banco por um Google Apps Script, no lugar da Brevo (`20261101_14`). A #172 foi fechada.

### IA, RAG e personalização
- **#612:** o mentor faz RAG no OpenAI Vector Store (ADR 0002, #166/#165).
- **#638:** a busca do `file_search` fica registrada em `ia_decision_logs`, sem o texto.
- **#614/#615/#617:** BrainHex com limites científicos explícitos (#1).
- **#710:** "personalização por perfil não é estilo de aprendizagem".
- **#711:** avaliação dos 47 documentos da Evidence Base (#218).
- **#736:** nó de intervenção para estado negativo recorrente; `memoria_aluno` volta a chegar ao grafo (#64).
- **#744:** notificação por aluno e perfil BrainHex, com RAG e LLM (#66).
- **#758:** quando o professor altera um item que o aluno já viu, a mudança é destacada e avisada, e a IA decide quem revisa.
- Mídia (#652):
  - **#587:** o motivo da falha aparece;
  - **#700:** o worker pode ficar restrito a turmas;
  - **#718:** "Reprocessar falhas" só reprocessa os perfis que falharam;
  - **#732:** o escopo do "Reprocessar falhas" fica documentado;
  - **#733:** o retry volta a chamar o microservice.
  - **A falha de áudio e apresentação continua aberta.**

### Mobile
- **#579:** sai o `expo-av`; entram o `expo-audio` e o `expo-video` (#25).
- **#642, #687, #691–#698, #702:** protótipo mobile-v1 aplicado no app.
- **#720:** trocar de turma pelo Perfil.
- **#689:** app e console passam a chamar `https://api.trailup.promora.dev.br`, que tem certificado válido. O `*.traefik.me` usava certificado autoassinado, então todo lote caía no caminho direto.
- **#586:** o build EAS para quando falta um `EXPO_PUBLIC_*`.
- **#721:** o lote informa de onde veio (#96).
- **#759/#760** (#136, fases 1 e 2):
  - tentativas pelo relógio do servidor;
  - cronômetro por perfil, que o aluno pode desligar;
  - bônus de XP por terminar no tempo, e o tempo deixa de contar na nota.

### Web do aluno
- Continuação do protótipo v4 em tela larga: #415, #416, #497–#504 e #508 (#594–#599).

### Banco, ops e CI
- 122 migrations, de `20261011_*` a `20261101_14`.
- **#545:** a migração feita sob a trava passa a ser gravada.
- **#699/#730/#757:** a cadeia do Alembic é alinhada com a produção, e a `main` volta a ter uma cabeça só.
- **#749:** o professor volta a gravar conteúdo; faltava `GRANT EXECUTE` numa função usada em índice de expressão.
- **#583:** o recálculo de progresso roda uma vez por comando.
- **#640:** teste do executor do Alembic em Postgres.
- CI: #467 e #743.

### Docs, protótipos e sprint
- **#418:** guia do professor (#147).
- **#440:** mapa das telas do console.
- Protótipos do app no celular (mobile-v1): #600–#610 e #641.
- Relatórios semanais W42 (#521), W43, e W44 (#713/#716).
- **#746:** o site no ar sai do espelho, e o sync tem de acompanhar a `main` do Lab.
- Este vault entrou no repo pela **#542** (19/10).

## Histórico anterior

- **`b7e74cdd…b5491b02`** (13/10, 99 commits):
  - FER+ local (#305) e câmera desligada por padrão (#309);
  - 12 migrations de RLS, retenção e consentimento;
  - OAuth com PKCE (#270);
  - web do aluno em tela larga v4 (#346–#413);
  - relatórios W40 e W41.
- **`b3a8de39…b7e74cdd`** (02/10): cadeia do Alembic linearizada (`20260930_01` revisa `20260929_02`).

## Espelho Geisbelly (bots só leem)

| Repo | Tip | Nota |
|------|-----|------|
| [Geisbelly/TrailUp](https://github.com/Geisbelly/TrailUp) | `370b0ba3`: merge da #205 (`sync/lab-234d81f`), 01/11 ~04:39 BRT | Syncs de 01/11: da #201 à #205. O Vercel e a API (Dokploy) publicam a partir daqui. **O merge é da Geisbelly.** |

## Impacto na monografia

- **Cap. 5 (Desenvolvimento):**
  - console V9 e telas de gamificação;
  - motor de eventos, missões, ranks e modos no banco;
  - tentativas pelo relógio do servidor;
  - nota média e modelo de evasão no banco.
- **Cap. 6 (Evidence Base e RAG):**
  - RAG do mentor no OpenAI Vector Store (ADR 0002), no lugar do plano com pgvector;
  - avaliação documento a documento da Evidence Base (#711);
  - "perfil não é estilo de aprendizagem" (#710).
- **Cap. 7 (Avaliação):** métricas F0–F5, que fecharam a #12. Baseline e cohort ficam com a #13, em andamento.
- **Ética e LGPD:**
  - consentimento do responsável;
  - menores só pela OpenAI, com `store=false`;
  - retenção e expurgo;
  - conversas cifradas;
  - e-mail enviado pelo Google.

← [[00-Home]] · [[05-PRs-Repos/links-repos]] · [[10-Incidentes/api-fora-por-migration-2026-11-01]]
