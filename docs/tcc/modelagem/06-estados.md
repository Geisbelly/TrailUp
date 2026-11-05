# 6. Diagramas de estado

Os estados vêm de duas fontes:

- das restrições `CHECK` e do enum `status_atividade`, lidos no banco de produção em 04/11/2026;
- do código, onde o status é texto livre: filas de geração e `conteudo_personalizado`.

As contagens entre parênteses são de produção, em 04/11/2026.

## 6.1 Job de geração (`personalizacao_jobs`)

```mermaid
stateDiagram-v2
  [*] --> pending: gatilho do banco ou pedido manual
  pending --> pending: nova edição da turma funde no mesmo job
  pending --> processing: worker reivindica
  processing --> processing: parado além do limite → reivindicado de novo
  processing --> completed: nenhum alvo falhou nem ficou pendente
  processing --> partial: alvo pendente, ou parte falhou
  processing --> failed: todo alvo processado falhou
  partial --> processing: após partial_retry_delay_sec
  completed --> [*]
  failed --> [*]
  note right of failed
    Um pedido manual (manual_retry) cria job novo
    e retoma só o que falhou.
  end note
```

Produção: 79 `completed`, 16 `failed`, 4 `partial`. Regra do fim em `personalizacao_jobs.py` (`final_status`).

Só job `pending` aceita fusão. Job em `processing` nunca é reaproveitado, porque o worker já leu o `total_targets` dele.

## 6.2 Alvo do job (`personalizacao_job_targets`)

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> processing: worker
  processing --> completed
  processing --> skipped: source_hash igual / nada a gerar
  processing --> pending: erro e attempts < max_retries
  processing --> failed: erro e attempts = max_retries
  processing --> failed: sem cota de TTS
  completed --> [*]
  skipped --> [*]
  failed --> [*]
```

Produção: 52 `completed`, 31 `failed`, 8 `skipped`.

## 6.3 Material personalizado (`conteudo_personalizado.status`)

```mermaid
stateDiagram-v2
  [*] --> processando_midias
  processando_midias --> pronto: mídias concluídas
  processando_midias --> failed: falha na geração
  processando_midias --> processando_midias: travado → nova tentativa (CAS)
  failed --> processando_midias: reprocessar (preserva o que já ficou pronto)
  pronto --> pronto: regeração in place (sobe materiais.*.revisao)
```

Produção: 4 `pronto`, 13 `failed`.

O gatilho `trg_conteudo_personalizado_novo_material` avisa o aluno quando o tópico termina para o perfil dele, inclusive se o último conteúdo falhou.

## 6.4 Progresso (`status_atividade`, enum)

```mermaid
stateDiagram-v2
  direction LR
  [*] --> nao_iniciado
  nao_iniciado --> em_andamento: primeiro progresso
  em_andamento --> concluido: percurso completo (gatilho)
  note right of nao_iniciado
    rótulo real no enum: não iniciado, com acento e espaço
  end note
```

O status vale para `topico_aluno`, `conteudo_aluno` e `atividade_aluno`. Em `topico_aluno` só o gatilho `trailup_recalcular_topico_aluno` escreve. A revisão pedida pelo professor não muda `atividade_aluno.status`.

## 6.5 Evento de turma (`eventos_classe`)

```mermaid
stateDiagram-v2
  [*] --> rascunho
  rascunho --> aberto: professor abre<br/>ou pg_cron no início (abrir_no_inicio, com peças)
  aberto --> encerrado: pg_cron quando fim vence<br/>ou professor encerra → apuração
  encerrado --> [*]
```

`fn_evento_classe_abrir_agora` e `_encerrar_agora` travam a linha. Um clique e o cron ao mesmo tempo não creditam o resultado duas vezes.

## 6.6 Notificações

```mermaid
stateDiagram-v2
  state "notificacoes_ia" as IA {
    [*] --> sugerida
    sugerida --> promovida: gatilho promove para a fila
    sugerida --> suprimida
  }
  state "notificacoes_pendentes" as FILA {
    [*] --> pendente
    pendente --> entregue: horario | login | tempo_uso | fim_foco
    pendente --> expirada: expira_em
    pendente --> cancelada
    pendente --> suprimida: silêncio / limite
    pendente --> colapsada: junta com outra igual
  }
  IA --> FILA
  FILA --> notificacoes: entregue → caixa de entrada + push
```

## 6.7 Intervenção e alteração do professor

```mermaid
stateDiagram-v2
  state "intervencoes" as I {
    [*] --> pending: IA grava
    pending --> applied: professor aceita
    pending --> dismissed: professor ignora (motivo_descarte)
  }
  state "alteracao_professor" as A {
    [*] --> pendente_analise: gatilho do editor
    pendente_analise --> analisada: IA classifica
    pendente_analise --> pendente_analise: falhou → sai da fila e espera decisão do professor
  }
```

## 6.8 Gamificação e social

```mermaid
stateDiagram-v2
  state "missao_aluno" as M {
    [*] --> pendente
    pendente --> em_andamento
    em_andamento --> concluida
    pendente --> expirada
    em_andamento --> expirada
  }
  state "guilda_desafios" as D {
    [*] --> aberto
    aberto --> encerrado: resultado = vitoria | empate | sem_adversario
  }
  state "social_relacionamentos" as S {
    [*] --> pending
    pending --> accepted
    pending --> declined
    pending --> blocked
    accepted --> blocked
  }
```

Em 6.8, os estados são os do `CHECK`. As transições desenhadas são as que os nomes indicam; elas não foram auditadas função por função.

## 6.9 Arquivo do RAG (`rag_openai_files`)

```mermaid
stateDiagram-v2
  [*] --> in_progress: upload_public_file
  in_progress --> completed
  in_progress --> failed
  in_progress --> cancelled
  completed --> [*]: DELETE da linha → retencao_externa apaga na OpenAI
```

Produção: nenhuma linha. O corpus ainda não foi indexado.
