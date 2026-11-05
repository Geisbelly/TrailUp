# 5. Modelo de dados

Os diagramas saem das **chaves estrangeiras reais** de produção (`pg_constraint`, lidas em 04/11/2026). São 171 tabelas, agrupadas aqui por domínio. Cada diagrama mostra as tabelas centrais e as relações entre elas; colunas aparecem só quando definem o papel da tabela. `alunos.id` e `professor.id` são o próprio `auth.users.id`.

## 5.1 Núcleo acadêmico

```mermaid
erDiagram
  AUTH_USERS ||--o| ALUNOS : "id"
  AUTH_USERS ||--o| PROFESSOR : "id"
  MATERIA ||--o{ CLASSE : materia_id
  PROFESSOR ||--o{ CLASSE : professor_id
  CLASSE ||--o{ CLASSE_ALUNO : classe_id
  ALUNOS ||--o{ CLASSE_ALUNO : aluno_id
  CLASSE ||--o{ TOPICOS : classe_id
  TOPICOS ||--o{ TOPICO_EDGES : "from_id / to_id"
  TOPICOS ||--o{ CONTEUDOS : topico_id
  TOPICOS ||--o{ ATIVIDADES : topico_id
  CONTEUDOS ||--o{ MIDIAS : conteudo_id
  CONTEUDOS ||--o{ CARDS : conteudo_id
  ATIVIDADES ||--o{ ATIVIDADE_CONTEUDOS : atividade_id
  CONTEUDOS ||--o{ ATIVIDADE_CONTEUDOS : conteudo_id
  ATIVIDADES ||--o{ QUESTOES : atividade_id
  QUESTOES ||--o| QUESTAO_GABARITO : questao_id

  CLASSE {
    bigint id PK
    uuid professor_id FK
    bigint materia_id FK
  }
  TOPICOS {
    bigint id PK
    bigint classe_id FK
  }
  CLASSE_ALUNO {
    bigint classe_id FK
    uuid aluno_id FK
  }
```

`questao_gabarito` fica separada de `questoes` para que o aluno leia a questão sem conseguir ler a resposta.

## 5.2 Progresso e avaliação

```mermaid
erDiagram
  ALUNOS ||--o{ TOPICO_ALUNO : aluno_id
  TOPICOS ||--o{ TOPICO_ALUNO : topico_id
  ALUNOS ||--o{ CONTEUDO_ALUNO : aluno_id
  CONTEUDOS ||--o{ CONTEUDO_ALUNO : conteudo_id
  ALUNOS ||--o{ ATIVIDADE_ALUNO : aluno_id
  ATIVIDADES ||--o{ ATIVIDADE_ALUNO : atividade_id
  ATIVIDADES ||--o{ ATIVIDADE_TENTATIVAS : atividade_id
  ALUNOS ||--o{ ATIVIDADE_TENTATIVAS : aluno_id
  QUESTOES ||--o{ QUESTAO_ALUNO : questao_id
  ALUNOS ||--o{ QUESTAO_ALUNO : aluno_id
  ATIVIDADES ||--o{ ATIVIDADE_APROVACAO : atividade_id
  ATIVIDADES ||--o{ ATIVIDADE_PRAZO_ALUNO : atividade_id
  ALUNOS ||--o{ ESTUDO_SESSOES : aluno_id
  ALUNOS ||--o{ ALUNO_TOPICO_DOMINIO : aluno_id

  TOPICO_ALUNO {
    status_atividade status "não iniciado | em andamento | concluido"
    numeric percentual_concluido "só o gatilho grava"
    numeric tempo_gasto_min "tempo ativo da telemetria"
  }
```

## 5.3 Perfil e personalização

### 5.3.1 Perfil e material

```mermaid
erDiagram
  PERFIL ||--o{ ALUNO_PERFIL : perfil_id
  ALUNOS ||--o{ ALUNO_PERFIL : aluno_id
  ALUNOS ||--o{ ALUNO_MENTAL_STATE_HISTORY : aluno_id
  CLASSE ||--o{ CONTEUDO_PERSONALIZADO : classe_id
  TOPICOS ||--o{ CONTEUDO_PERSONALIZADO : topico_id
  CONTEUDOS ||--o{ CONTEUDO_PERSONALIZADO : conteudo_id
  ALUNOS |o--o{ CONTEUDO_PERSONALIZADO : "aluno_id (nulo = base por perfil)"
  CONTEUDO_PERSONALIZADO ||--o{ PERSONALIZACAO_ITEM_PROGRESSO : personalizacao_id
  CONTEUDO_PERSONALIZADO ||--o{ MATERIAIS_GERADOS : personalizacao_id
  CONTEUDOS ||--o{ BOSS_FALAS : conteudo_id

  CONTEUDO_PERSONALIZADO {
    jsonb plano
    jsonb materiais "audio, apresentacao, markdown, cards · revisao por material"
    jsonb ai_patch "adequação por aluno"
    text brainhex_profile_key
    text source_hash "dedup; inclui a versão do pipeline"
    text status "processando_midias | pronto | failed (falha: legado)"
  }
```

### 5.3.2 Fila de geração, sugestão e resumo da turma

```mermaid
erDiagram
  CLASSE ||--o{ PERSONALIZACAO_JOBS : classe_id
  PERSONALIZACAO_JOBS ||--o{ PERSONALIZACAO_JOB_TARGETS : job_id
  PERSONALIZACAO_JOBS ||--o{ PERSONALIZACAO_BLOCOS_GERADOS : job_id
  CONTEUDO_PERSONALIZADO ||--o{ PERSONALIZACAO_JOB_TARGETS : personalizacao_id
  ALUNOS ||--o{ PERSONALIZACAO_SUGESTAO : aluno_id
  PERSONALIZACAO_SUGESTAO ||--o{ PERSONALIZACAO_SUGESTAO_LOG : sugestao_id
  CLASSE ||--o{ CLASSE_PERFIL_SUMMARY : classe_id
  CLASSE ||--o{ CLASSE_MAPA_TEMA : classe_id
  CLASSE ||--o{ FONTES_PERSONALIZACAO : classe_id

  PERSONALIZACAO_JOBS {
    text kind
    text status "pending | processing | partial | completed | failed"
    int total_targets
    int processed_targets
  }
  PERSONALIZACAO_JOB_TARGETS {
    text status "pending | processing | completed | failed | skipped"
    text media_kind "enriquecimento | capitulo | audio | apresentacao"
  }
```

## 5.4 Telemetria e decisões da IA

```mermaid
erDiagram
  ALUNOS ||--o{ TELEMETRIA_SESSOES : aluno_id
  TELEMETRIA_SESSOES ||--o{ TELEMETRIA_LOTES : sessao_id
  TELEMETRIA_LOTES ||--o{ TELEMETRIA_TIME_METRIC_ENTRIES : lote_id
  TELEMETRIA_LOTES ||--o| TELEMETRIA_ANALISE_FILA : lote_id
  TELEMETRIA_SESSOES ||--o{ TELEMETRIA_EVENTOS_APP : sessao_id
  ALUNOS ||--o{ IA_DECISION_LOGS : aluno_id
  ALUNOS ||--o{ INTERVENCOES : aluno_id
  ALUNOS ||--o{ ALUNO_ESTADO_ATENCAO : aluno_id
  CLASSE ||--o{ ESTUDO_COORTE : classe_id

  TELEMETRIA_LOTES {
    jsonb payload "dwell, active, idle do lote (não acumulado)"
    text via "api | direta"
    text fallback_motivo
  }
  TELEMETRIA_TIME_METRIC_ENTRIES {
    text scope "topic | content | material | activity (não somar entre si)"
    numeric active_sec
  }
```

## 5.5 Gamificação

```mermaid
erDiagram
  ALUNOS ||--o{ EVENTOS_ALUNO : aluno_id
  CLASSE ||--o{ RANKS : classe_id
  RANK_TIPO ||--o{ RANKS : tipo_id
  RANKS ||--o{ RANK_PODIO_CONGELADO : rank_id
  CLASSE ||--o{ EVENTOS_CLASSE : classe_id
  EVENTOS_CLASSE ||--o{ EVENTO_INSCRICOES : evento_id
  EVENTOS_CLASSE ||--o{ EVENTOS_CLASSE_RESULTADO : evento_id
  CLASSE ||--o{ MISSOES : classe_id
  MISSOES ||--o{ MISSAO_ALUNO : missao_id
  MISSOES_IA_PEDIDOS ||--o{ MISSOES : pedido_ia_id
  CONQUISTAS ||--o{ CONQUISTAS_ALUNO : conquista_id
  CONQUISTAS ||--o{ MOLDURAS : conquista_id
  MOLDURAS ||--o{ MOLDURA_ALUNO : moldura_codigo
  ALUNOS ||--o{ MOEDAS_LEDGER : aluno_id
  LOJA_ITENS ||--o{ LOJA_COMPRAS : item_codigo
  LOJA_COMPRAS ||--o{ LOJA_USO_LOG : compra_id
  CLASSE ||--o{ GUILDAS : classe_id
  GUILDAS ||--o{ GUILDA_MEMBROS : guilda_id
  GUILDAS ||--o{ GUILDA_DESAFIOS : guilda_id
  GUILDA_DESAFIOS ||--o{ RANQUEADA_ELO_PARTIDA : desafio_id
  EVENTOS_CLASSE ||--o{ GUILDA_DESAFIOS : evento_id
  CLASSE ||--o{ FUNDOS_TURMA : classe_id
  FUNDOS_TURMA ||--o{ FUNDOS_TURMA_CONTRIBUICAO : fundo_id
```

**Duelo no evento:** `guilda_desafios.evento_id` é nulo fora de evento, e um `CHECK` exige `consequencia = 'evento'` quando ele existe. Essa consequência não mexe no Elo nem cobra aposta, e fica fora do XP. No evento, o adversário vem dos inscritos de desempenho mais próximo (`evento_sugerir_adversarios`, que devolve só nomes). No Social, a escolha continua livre.

## 5.6 Notificações

```mermaid
erDiagram
  ALUNOS ||--o{ NOTIFICACOES_IA : "o que a IA sugeriu"
  ALUNOS ||--o{ NOTIFICACOES_PENDENTES : "a fila"
  ALUNOS ||--o{ NOTIFICACOES_AGENDAMENTOS : "a rotina"
  ALUNOS ||--o{ NOTIFICACOES : "a caixa de entrada"
  ALUNOS ||--o{ EXPO_TOKENS : "um por aparelho"
  ALUNOS ||--o{ NOTIFICACOES_PUSH_ENVIOS : aluno_id
  ALUNOS ||--o{ ALUNO_MODO_FOCO : aluno_id
  PROFESSOR ||--o{ PROFESSOR_NOTIFICACOES : professor_id
```

As quatro primeiras têm papéis que não se trocam. Só `notificacoes_ia` recebe escrita da API.

## 5.7 Privacidade, pesquisa e RAG

```mermaid
erDiagram
  ALUNOS ||--o{ CONSENTIMENTO_TELEMETRIA : "aluno_id (SET NULL)"
  ALUNOS ||--o{ CONSENTIMENTO_PESQUISA : "aluno_id (SET NULL)"
  ALUNOS ||--o{ CONSENTIMENTO_RESPONSAVEL : "aluno_id (SET NULL)"
  ALUNOS ||--o| ALUNO_NASCIMENTO : aluno_id
  ALUNOS ||--o{ SOLICITACOES_EXCLUSAO : aluno_id
  ALUNOS ||--o{ PESQUISA_ARQUIVO : aluno_id
  ALUNOS ||--o{ RETENCAO_AVISOS_INATIVIDADE : aluno_id
  ALUNOS |o--o{ RAG_OPENAI_FILES : "aluno_id (escopo aluno)"
  RAG_CHUNKS ||--o{ RAG_RELACOES : "origem / destino"

  RAG_OPENAI_FILES {
    text scope "publico | turma | aluno"
    text source_hash
    jsonb attributes "corpus, rd, fontes …"
    text status "in_progress | completed | failed | cancelled"
  }
```

- **Consentimentos:** as FKs usam `SET NULL` de propósito, para que a prova de consentimento sobreviva à exclusão da conta. As demais tabelas do aluno usam `CASCADE`.
- **Exclusões que saem do banco:** apagar uma linha de `rag_openai_files` ou de uma fonte enfileira em `retencao_externa` a remoção do arquivo fora do banco, no R2 ou na OpenAI.

## 5.8 Observabilidade

```mermaid
erDiagram
  MONITOR_ALVO ||--o{ MONITOR_SONDA : alvo_id
  MONITOR_ALVO ||..o{ MONITOR_INCIDENTE : "alvo_id, sem FK"
  MONITOR_ALERTA
  MONITOR_CONSULTA
  AUTH_USERS ||--o{ CLIENTE_SESSAO : user_id
  CLIENTE_ERRO
  IA_USO_LLM

  CLIENTE_ERRO {
    date dia
    text superficie "console | web_aluno | app"
    text versao
    text assinatura
    integer vezes
  }
```

- **De fora (`monitor_*`):** o `pg_cron` sonda a API, o console e a web do aluno, aplica o resultado na máquina de estados de `monitor_alvo` e envia os alertas de `monitor_alerta` por e-mail. A sonda sem resposta fica com `ok` nulo, porque quem falhou foi o medidor. O monitor cai junto com o Supabase.
- **De dentro (`cliente_*`):** erro, Web Vitals, falha de chamada e acesso são gravados pelo próprio cliente, direto no Supabase, por RPC. `cliente_sessao` tem uma linha por sessão e `cliente_erro` agrega por assinatura, dia, superfície e versão, guardando até 50 ids de sessão para contar pessoas afetadas. Não há stack, URL completa nem texto digitado, e as tabelas não têm policy nem GRANT: a RPC é a única porta.
- **Modelo (`ia_uso_llm`):** registra cada chamada ao modelo de linguagem: prompt, provedor, tokens, cache e tempo. Não tem `aluno_id` nem texto, e só o `service_role` lê e escreve.
- **Acesso por aluno:** a lista do painel técnico abre com código curto, e mostrar nomes fica registrado em `monitor_consulta`. Nela não entram emoção, BrainHex nem nota.
