# 2. Casos de uso

## 2.1 Atores

| Ator | Tipo | Onde atua |
|---|---|---|
| Aluno | primário | app (`mobile/`) |
| Professor | primário | console web (`frontend/`) |
| Dona do projeto | primário | abas Aprovações e Painel técnico do console. A proteção é no banco (`app_e_dono()`) |
| Agendador | secundário, sistema | `pg_cron`: 16 rotinas |
| Agente de IA | secundário, sistema | workers e grafo da API |
| Provedor de modelo | secundário, externo | Gemini, e OpenAI no RAG |

## 2.2 Diagrama: aluno

```mermaid
flowchart LR
  A([Aluno])
  subgraph App do aluno
    UC01((UC01 Cadastrar-se e<br/>responder o quiz BrainHex))
    UC02((UC02 Dar ou revogar<br/>consentimentos))
    UC03((UC03 Entrar numa turma))
    UC04((UC04 Estudar o tópico:<br/>texto, áudio, apresentação, cards))
    UC05((UC05 Fazer atividade<br/>e questões))
    UC06((UC06 Batalhar com o boss))
    UC07((UC07 Conversar com o Guardião))
    UC08((UC08 Cumprir missões))
    UC09((UC09 Ver ranking,<br/>participar de evento))
    UC10((UC10 Social e guildas))
    UC11((UC11 Loja, moedas,<br/>molduras, conquistas))
    UC12((UC12 Receber notificações,<br/>definir lembrete e modo foco))
    UC13((UC13 Ver e exportar<br/>os próprios dados))
    UC14((UC14 Excluir a conta))
  end
  IA([Agente de IA])
  CRON([Agendador])

  A --- UC01 & UC02 & UC03 & UC04 & UC05 & UC06 & UC07
  A --- UC08 & UC09 & UC10 & UC11 & UC12 & UC13 & UC14
  UC03 -. include .-> UCG((Gerar material<br/>por perfil))
  UC04 -. include .-> UCT((Coletar telemetria))
  UC05 -. include .-> UCT
  UCT -. extend .-> UCA((Analisar e adaptar))
  UC07 --- IA
  UCG --- IA
  UCA --- IA
  UC08 --- CRON
  UC09 --- CRON
  UC12 --- CRON
```

## 2.3 Diagrama: professor e dona

```mermaid
flowchart LR
  P([Professor])
  D([Dona do projeto])
  subgraph Console
    UC20((UC20 Criar e configurar turma))
    UC21((UC21 Editar trilha:<br/>tópicos, conteúdos,<br/>atividades, questões, cards))
    UC22((UC22 Duplicar turma,<br/>tópico, atividade))
    UC23((UC23 Acompanhar e<br/>reprocessar personalizações))
    UC24((UC24 Ler insights da turma))
    UC25((UC25 Perguntar à Lumi))
    UC26((UC26 Corrigir notas,<br/>aprovar entregas))
    UC27((UC27 Criar missões,<br/>conquistas, eventos))
    UC28((UC28 Configurar economia<br/>e loja da turma))
    UC29((UC29 Decidir alteração<br/>sem análise da IA))
    UC30((UC30 Aprovar professores))
    UC31((UC31 Painel técnico))
  end
  IA([Agente de IA])
  P --- UC20 & UC21 & UC22 & UC23 & UC24 & UC25 & UC26 & UC27 & UC28 & UC29
  D --- UC30 & UC31
  UC21 -. include .-> E((Enfileirar regeração<br/>gatilho no banco))
  UC21 -. extend .-> ALT((Registrar alteração<br/>vista por aluno))
  E --- IA
  ALT --- IA
  UC24 --- IA
  UC25 --- IA
```

## 2.4 Especificação resumida

| UC | Pré-condição | Fluxo principal | Onde mora a regra |
|---|---|---|---|
| UC01 | — | Cria conta pelo Supabase Auth, responde 32 itens (8 eixos) e grava 7 afinidades em `aluno_perfil` | `frontend/src/features/signup/brainhex.ts`, banco |
| UC02 | conta | Consentimento de telemetria, pesquisa e, para menor, responsável. Revogar para a coleta | `consentimento_*`, RLS |
| UC03 | conta | Entra na turma (`classe_aluno`); o gatilho enfileira `student_enrollment` | `fn_enqueue_student_enrollment_job` |
| UC04 | matrícula | O app lê `conteudo_personalizado` do perfil dominante e baixa a mídia pelo gateway assinado; o progresso por item vai para `personalizacao_item_progresso` | RLS, `storage-redirect`, gatilho de progresso |
| UC05 | matrícula | Tentativa registrada no servidor; nota e status recalculados no banco | `atividade_tentativas`, `trailup_recalcular_*` |
| UC06 | perfil Survivor, Daredevil ou Conqueror | Boss com falas do perfil (`boss_falas`), ou falas fixas na ausência delas | `PERFIS_COM_BATALHA`, app |
| UC07 | maior de 18 confirmado | `POST /personalizar/chat`: Guardião do perfil, sem gabarito, com destinos do app | API; 403 para menor |
| UC08 | matrícula | Missão diária criada às 03:00, texto por IA às 03:05; missões da turma | `pg_cron`, `missoes_ia_loop` |
| UC09 | matrícula | Ranking por view com filtro de saída; eventos abrem e fecham sozinhos | `vw_rank_posicoes_por_classe`, `fn_eventos_classe_varrer` |
| UC12 | conta | Caixa de entrada, push pelo banco, rotina local no aparelho | motor de notificações no banco |
| UC13/14 | conta | Relatório de dados; pedido de exclusão; cópia anônima para pesquisa só com consentimento | `solicitacoes_exclusao`, retenção, `pesquisa-arquivar` |
| UC21 | dono da turma | Salvar já enfileira `class_delta_sync` (com coalescência); se algum aluno já viu, registra alteração | gatilhos do editor |
| UC23 | dono da turma | Lê `personalizacao_jobs` direto; reprocessar e gerar por perfil chamam a API | RLS + `/personalizar/jobs/manual-*` |
| UC24 | dono da turma | `POST /insights/turma/{id}/gerar` (intervalo mínimo de 5 min); listar, aceitar e ignorar direto no banco | API + GRANT por coluna |
| UC25 | professor | `POST /escriba/perguntar`; alunos aparecem como `A1…An` | API |
| UC29 | alteração `pendente_analise` | `alteracao_decidir` | RPC |
