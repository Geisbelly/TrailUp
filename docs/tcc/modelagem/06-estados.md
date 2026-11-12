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

Produção: 4 `pronto`, 13 `failed`. Em 12/11: 4 `pronto`, 14 `failed`.

**Aprovação, ortogonal ao status** (`conteudo_personalizado.aprovacao`, `20261110_09`, 10/11): todo registro nasce `pendente` e volta a `pendente` quando o material muda (`materiais`, `plano` ou `source_hash`, ou a entrada em `processando_midias`), subindo `conteudo_versao`. Só o professor dono decide, `pendente` → `aprovado` ou `recusado`, pela RPC `personalizacao_decidir`, que recusa a decisão se a versão mudou desde que ele viu. Material em `processando_midias` não pode ser aprovado. O aluno só lê o `aprovado`. Em 12/11, os 18 registros estavam `aprovado`, todos pela migração, que deu esse estado ao legado.

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

As transições abaixo foram auditadas nas funções em 05/11/2026, no lugar de seguir só os rótulos do `CHECK`.

```mermaid
stateDiagram-v2
  state "missao_aluno" as M {
    [*] --> pendente: guilda, soma zero
    [*] --> em_andamento: guilda, soma parcial
    [*] --> concluida: missão individual
    pendente --> em_andamento
    em_andamento --> concluida
  }
  state "guilda_desafios" as D {
    [*] --> aberto
    aberto --> encerrado: fn_desafio_encerrar
  }
  state "social_relacionamentos" as S {
    [*] --> pending: social_enviar_convite
    pending --> accepted: aceite, ou convite cruzado
    pending --> declined: social_recusar_convite
    accepted --> declined: social_desfazer_amizade
    declined --> pending: novo convite
    pending --> blocked: social_bloquear
    accepted --> blocked: social_bloquear
    declined --> blocked: social_bloquear
    blocked --> declined: social_desbloquear
  }
```

- **`missao_aluno`:** a linha da missão individual só nasce quando o critério é cumprido, já `concluida`. `pendente` e `em_andamento` são gravados apenas pela missão de guilda.
- **`expirada`:** o rótulo existe no `CHECK`, mas nenhuma função o grava. A diária vale pela janela da missão (`janela_fim`).
- **`guilda_desafios.resultado`:** `vitoria`, `empate` ou `sem_adversario`. A `consequencia` é `treino`, `ranqueada` ou `evento`.
- **Bloqueio:** é um estado da mesma linha, e `blocked_by_id` existe se e somente se o status é `blocked`. Desbloquear volta a `declined`, nunca à amizade.

Aprovação de missão, pedido à IA e os demais estados dos fluxos novos:

```mermaid
stateDiagram-v2
  state "missoes.aprovacao" as A {
    [*] --> nao_requer: professor criou
    [*] --> pendente: origem ia
    pendente --> aprovada
    pendente --> recusada: motivo_recusa
  }
  state "missoes_ia_pedidos" as P {
    [*] --> pedido_pendente: missao_ia_pedir
    pedido_pendente --> concluido
    pedido_pendente --> falhou: tentativas esgotadas
  }
```

`CHECK (origem <> 'ia' OR aprovacao <> 'nao_requer')` garante no banco que nada da IA chega ao aluno sem aprovação. A policy só entrega missão `ativa` com `nao_requer` ou `aprovada`.

## 6.9 Arquivo do RAG (`rag_openai_files`)

```mermaid
stateDiagram-v2
  [*] --> in_progress: upload_public_file
  in_progress --> completed
  in_progress --> failed
  in_progress --> cancelled
  completed --> [*]: DELETE da linha → retencao_fila_externa apaga na OpenAI
```

Produção em 04/11: nenhuma linha. Em 10/11 o corpus v1 foi indexado: 12 linhas, todas `completed` (#1077).

## 6.10 Diagnóstico do tópico (`diagnostico_topico`)

```mermaid
stateDiagram-v2
  [*] --> pendente: diagnostico_pedir
  pendente --> pronto: fn_diagnostico_registrar
  pendente --> pendente: fn_diagnostico_falhou, espera 2^n min
  pendente --> sem_ia: terceira falha
  pronto --> respondido: diagnostico_responder
  pendente --> dispensado: diagnostico_dispensar
  pronto --> dispensado: diagnostico_dispensar
  respondido --> [*]
```

Produção: nenhuma linha em 05/11/2026.

## 6.11 Economia

```mermaid
stateDiagram-v2
  state "loja_compras" as C {
    [*] --> ativa: loja_comprar
    ativa --> consumida: loja_usar
    ativa --> estornada: loja_estornar
  }
  state "fundos_turma" as F {
    [*] --> aberto: fundo_turma_criar
    aberto --> atingido: doação alcança a meta
    atingido --> entregue: professor entrega
    aberto --> cancelado: estorna as doações
    atingido --> cancelado: estorna as doações
  }
```

Compra consumida não estorna (`ja_usado`), e repetir um estorno devolve o resultado anterior. Só existe um fundo `aberto` ou `atingido` por turma, garantido por índice parcial.

## 6.12 Convites

```mermaid
stateDiagram-v2
  state "desafio_participantes" as D {
    [*] --> convidado
    convidado --> aceito: arena_convite_responder
    convidado --> recusado: arena_convite_responder
  }
  state "guilda_convites" as G {
    [*] --> pending: guilda_convidar
    pending --> accepted: guilda_aceitar_convite
    pending --> declined: guilda_recusar_convite
    pending --> cancelled: quem convidou cancela
    pending --> cancelled: bloqueio detectado no aceite
  }
```

O aceite do convite de guilda reconfere o bloqueio (`20261031_09`). Se os dois se bloquearam depois do convite, ele é cancelado em vez de aceito.

## 6.13 Consentimento (`consentimento_*`)

```mermaid
stateDiagram-v2
  [*] --> accepted: linha nova
  [*] --> rejected: linha nova
  accepted --> rejected: revogar é outra linha
  rejected --> accepted: aceitar de novo é outra linha
```

O registro é só de acréscimo: `registrado_em` vem do servidor, e o estado vigente é a linha mais recente. Nada apaga prova. Ao excluir a conta, a FK usa `SET NULL` e a linha sobrevive sem o titular. Vale o mesmo para `consentimento_professor` (`20261105_27`), criada na `main` e ainda não aplicada em produção na data da medição.

## 6.14 Monitor de disponibilidade

```mermaid
stateDiagram-v2
  state "monitor_alvo.estado" as A {
    [*] --> sem_dado
    sem_dado --> ok
    ok --> queda: falhas seguidas (3)
    queda --> ok: sucessos seguidos
    sem_dado --> queda
  }
  state "monitor_incidente" as I {
    [*] --> aberto: queda, instabilidade, lentidão, degradação
    aberto --> fechado: fim preenchido
    aberto --> aberto: motivo deploy, sem apagar a queda
  }
```

- O início do incidente é a primeira sonda ruim, não a terceira.
- Sonda sem resposta fica com `ok` nulo, porque quem falhou foi o medidor.
- Sonda da marca de deploy também fica com `ok` nulo, com `motivo = 'deploy'`, e aparece no painel como `minutos_deploy`. Valem as três condições: versão nova, sequência curta e versão anterior conhecida.
- Enquanto a instabilidade do alvo está aberta, as quedas dele não mandam e-mail.
