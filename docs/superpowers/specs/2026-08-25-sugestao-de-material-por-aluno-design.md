# Design: sugestão de material por aluno (formato + ordem), com revisão e métricas de efetividade

Data: 2026-08-25
Status: **aprovado** (decisões validadas com o usuário em 2026-08-25)

## O que existe hoje

Levantado no código, não suposto:

- **Decisão de formato na geração.** `generate_plano_personalizacao`
  (`api/app/services/personalizacao.py:5034`) chama o LLM
  (`planejador_conteudo.txt`) com perfil BrainHex, `modo_operacao`, desempenho
  recente e a lista de conteúdos/atividades/cards disponíveis, e devolve um
  `plano` com `formato_prioritario`. Isso é persistido em
  `conteudo_personalizado.plano` (JSONB) + coluna `formato_prioritario`.
- **Telemetria por material.** `linear_analysis_pipeline.py` já resume ritmo de
  leitura por material (`material_key`, WPM sobre `active_sec`, com flags
  `leitura_lenta`/`skimming`), tempo, interação, desempenho e atenção.
- **Progresso por item.** `personalizacao_item_progresso` guarda percentual,
  acertos e tempo por item, com merge (máx/soma).
- **Camada leve por aluno.** `ai_patch` ajusta a base compartilhada por perfil
  sem regerar mídia.

Ou seja: já existe *uma* decisão de formato, tomada **uma vez, na geração**, por
LLM, e **compartilhada por perfil** — não por aluno.

## O que falta (o pedido)

1. Sugestão **por aluno**: quais materiais usar e **em que ordem**.
2. Persistir a primeira sugestão e, nas vezes seguintes, **ajustá-la** com base
   nas métricas + telemetria + na própria sugestão anterior.
3. **Log** das sugestões e das alterações, para medir a **efetividade** do
   sistema e o impacto no aluno.

O que não existe hoje: ordem como dado de primeira classe, revisão explícita
com histórico, e qualquer medida de "a sugestão ajudou?".

## Arquitetura proposta

### Tabelas novas

```
personalizacao_sugestao            -- estado ATUAL, 1 linha por (aluno, tópico)
  id, aluno_id, classe_id, topico_id, conteudo_id
  ordem            JSONB   -- [{material_key, formato, posicao, score, motivos[]}]
  formato_inicial  TEXT    -- por onde começar (o "formato_prioritario" do aluno)
  versao           INT     -- 1 na primeira, +1 a cada revisão aplicada
  origem           TEXT    -- 'inicial' | 'revisao'
  evidencia        JSONB   -- métricas que sustentaram a versão atual
  criado_em, atualizado_em
  UNIQUE (aluno_id, topico_id, conteudo_id)

personalizacao_sugestao_log        -- append-only, nunca sofre UPDATE
  id, sugestao_id, aluno_id, topico_id, versao
  acao             TEXT    -- 'criada' | 'revisada' | 'mantida'
  ordem_antes      JSONB
  ordem_depois     JSONB
  motivos          JSONB   -- por que mudou, termo a termo
  evidencia        JSONB   -- snapshot das métricas no momento da decisão
  criado_em
```

Duas tabelas em vez de uma porque as perguntas são diferentes: o app precisa
ler **o estado atual** rápido (1 linha), e a métrica de efetividade precisa do
**histórico completo** sem UPDATE por cima. Guardar histórico na mesma linha
(array que cresce) inviabiliza as duas coisas ao mesmo tempo.

`evidencia` é snapshot, não referência: a telemetria continua mudando depois,
e uma decisão precisa ser auditável com os números que ela realmente viu.

### Primeira sugestão: determinística, não LLM

Entra: perfil BrainHex (vetor de afinidades, não só o dominante), preferências
declaradas do aluno, `modo_operacao`, e os formatos que existem para aquele
conteúdo (`materiais` de `conteudo_personalizado`).

Sai: ordem + `formato_inicial`, com `motivos` legíveis ("Explorador: texto
antes de áudio", "sem apresentação gerada para este tópico").

Por que determinística e não LLM: é explicável (o log fica útil), reprodutível
(mesma entrada, mesma sugestão — condição para medir efetividade), instantânea,
e **não consome cota** — que hoje é o gargalo real do sistema. O plano por LLM
continua existindo para o conteúdo; a *ordem por aluno* não precisa dele.

### Revisão: só com evidência, só com mudança relevante

A cada ciclo de análise já existente (`analysis_runner`), a revisão roda com o
que a telemetria mostrou por material:

| Sinal já disponível | Leitura |
| --- | --- |
| `flag: skimming` no material de texto | texto não está sendo lido → desce |
| `flag: leitura_lenta` + acertos altos | funciona, só é lento → mantém |
| `active_sec` alto em áudio, baixo em texto | áudio sobe |
| item abandonado (percentual baixo, tempo alto) | desce |
| acertos altos após um formato | esse formato sobe |

Dois freios, que são o que evita o sistema ficar reordenando à toa:

1. **Mínimo de evidência**: sem N materiais com telemetria suficiente, não
   revisa (registra `acao: 'mantida'`, com o motivo).
2. **Limiar de mudança**: só persiste nova versão se o score mudar acima de um
   delta. Reordenar por ruído confunde o aluno e polui a métrica.

### Métrica de efetividade

Do log dá para responder, sem instrumentação nova:

- a sugestão foi **seguida**? (ordem sugerida × ordem realmente consumida na
  telemetria);
- quando seguida, o desempenho foi **melhor** que quando ignorada?
- as revisões **melhoraram** o resultado (comparar versão N com N+1 no mesmo
  aluno/tópico)?
- quanto o sistema **muda de opinião** (número de revisões por aluno) — churn
  alto é sinal de limiar mal calibrado, não de personalização fina.

## Não faz parte

- Não muda a geração de mídia nem o `plano` por perfil: a base compartilhada
  continua como está. A sugestão é camada de **consumo**, por aluno.
- Não cria telemetria nova: usa o que já é coletado.
- Não decide conteúdo, só **qual formato e em que ordem** entre os que existem.

## Decisões validadas (2026-08-25)

1. **A ordem é aconselhada, não imposta.** O app destaca por onde começar e
   sugere a sequência; o aluno consome na ordem que quiser. Essa é a condição
   para a métrica existir: "seguiu a sugestão" só é mensurável se ele puder
   não seguir.
2. **A sugestão é determinística**, por regras sobre perfil BrainHex +
   preferências + formatos disponíveis. Explicável no log, reprodutível (mesma
   entrada, mesma sugestão — sem isso a métrica de efetividade não fecha),
   instantânea e sem consumir cota.
3. **O console mostra por aluno**: ordem sugerida atual, as revisões e o motivo
   de cada mudança, além da métrica agregada.

## Ordem de implementação

1. Motor determinístico + tabelas + persistência da primeira sugestão.
2. Revisão por ciclo, com mínimo de evidência e limiar de mudança, gravando no
   log a cada decisão (inclusive `mantida`).
3. Métrica de efetividade derivada do log.
4. Console: sugestão por aluno + histórico.
