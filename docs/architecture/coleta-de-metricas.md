# Mapa da coleta de métricas

**Medido em 2026-09-30**, contra o código do `origin/main` do dia e o banco de
produção (`xrebtkmdewolzmpsdwgh`). Tudo abaixo foi verificado nos dois; onde a
verificação não foi possível, está dito.

A janela de dados é **20 a 27/09/2026**, de **um único aluno**: 62 sessões,
290 lotes, 4.269 eventos, 940 entradas de tempo. É base de teste, não uso em
escala — o que importa ao ler qualquer número agregado daqui.

## 1. O que é coletado, e com que limites

Um lote por minuto, montado em `MetricasContext.tsx` e tipado em
`interfaces/telemetria/TelemetryContracts.ts`.

| constante | valor | efeito |
| --- | --- | --- |
| `BATCH_INTERVAL_MS` | 60 s | um lote por minuto |
| `IDLE_THRESHOLD_MS` | 15 s | sem toque por 15 s → `idle` |
| `TOUCH_SAMPLE_THROTTLE_MS` | 750 ms | 1 coordenada por 750 ms |
| `MAX_TOUCH_SAMPLES` | 25 | teto de coordenadas por lote |
| `FRAME_CAPTURE_INTERVAL_MS` | 6 s | uma foto a cada 6 segundos |
| `MAX_CAMERA_FRAMES_PER_BATCH` | 30 | teto de fotos por lote |
| `VALIDADE_OUTBOX_MS` | 7 dias | retenção da fila local |

Cada lote leva: tempo por escopo, `touch_count`, `scroll_distance_px`,
`max_depth_px`, `touch_samples[]` (coordenadas em **percentual da tela**),
`signals[]` (10 tipos), `eventos_app[]` (15 tipos em 5 grupos) e `camera`.

Distribuição real dos eventos: **`scroll` é 72%** de tudo (3.081 de 4.269),
`tap` 604. O grupo `chat` existe no contrato e tem **zero** registros.

## 2. Os quatro escopos são aninhados — somá-los multiplica o tempo

`accumulateContextTime` soma **o mesmo intervalo** a `topic`, `content`,
`activity` e `material` simultaneamente. Não é bug: cada escopo conta o
intervalo inteiro em que o aluno esteve nele.

Medido:

| escopo | dwell |
| --- | ---: |
| `topic` | 85,5 min |
| `content` | 85,4 min |
| `activity` | 74,8 min |
| `material` | 10,5 min |

A soma dá 256 min para ~85 min reais. **Filtre por `scope` sempre.**

Tempo só corre com `studyState === "active"` — no menu da trilha não conta.
Visita é diferente e **não** exige `active`: abrir um tópico é uma visita
mesmo sem material escolhido.

## 3. `tempo_gasto_min` é `active_sec`, não `dwell_sec`

`trailup_tempo_telemetria_min` é um wrapper de `_v2`, que soma **`active_sec`**
filtrado por escopo. O tempo ocioso fica de fora.

Gravação é por trigger em `telemetria_time_metric_entries`
(`trg_tme_sync_tempo_ins/upd/del`), `FOR EACH STATEMENT` com transition table
`afetadas`. Nenhum cliente escreve a coluna.

A diferença é grande o bastante para mudar leitura de produto:

| tópico | `tempo_gasto_min` | dwell real | razão |
| --- | ---: | ---: | ---: |
| 135 | 6,40 | 35,38 | **5,5×** |
| 133 | 2,88 | 12,65 | 4,4× |
| 134 | 9,48 | 21,42 | 2,3× |

No agregado: `active` 26,0 min contra `idle` 59,6 min — **70% da presença não
conta como estudo**. Quem comparar "tempo no app" com `tempo_gasto_min` vai
achar que o dado sumiu; não sumiu, é outra métrica.

> Corolário: a detecção de ritmo de leitura (WPM) usa `active_sec` pelo mesmo
> motivo. Usar `dwell_sec` subestimaria quem fez uma pausa no meio.

## 4. Câmera

Captura da **câmera frontal**, `quality: 0.35`, `shutterSound: false`, num
elemento de **1×1 pixel com `opacity: 0`** — imperceptível para o aluno.

Cinco travas simultâneas: consentimento aceito, `telemetryPreferences.
cameraEnabled`, `cameraOptIn`, permissão do SO concedida e plataforma não-web.
Ao aceitar o termo, `cameraEnabled = cameraPermissionGranted` — negar no SO
desliga.

**Os bytes não são persistidos.** Verificado no banco: 0 ocorrências de
`frame_b64` em 290 lotes, e `ia_decision_logs` vazia. A sanitização existe nos
dois caminhos — `sanitizarCameraParaBanco` (mobile, para a gravação direta) e
`_sanitize_lote_payload` (API). Fica gravado apenas `frames_count` e o booleano
`frame_sent`.

Na janela medida: **286 frames** capturados e transmitidos.

## 5. Os seis estágios de análise são heurísticas

`linear_analysis_pipeline.py` tem seis estágios nomeados como algoritmos de ML.
**Nenhum roda o algoritmo do nome.**

| classe | o que faz |
| --- | --- |
| `DeepFaceEmotionAnalyzer` | `if` sobre contagem de eventos e `idle_sec` |
| `IsolationForestReadingAnalyzer` | limiares fixos |
| `HiddenMarkovInteractionAnalyzer` | regras sobre o lote atual |
| `DeepKnowledgeTracingAnalyzer` | contagem de acerto/erro |
| `RandomForestAttentionAnalyzer` | placar aditivo com pesos à mão |
| `XGBoostDecisionEngine` | quatro `if` |

Verificação: **nenhuma biblioteca de ML ou visão nas dependências** da API
(sem scikit-learn, xgboost, hmmlearn, deepface, opencv, torch, tensorflow); o
módulo importa só `Counter`, `dataclass`, `typing` e `fastapi`; usa `numpy`
zero vezes.

**As imagens nunca são decodificadas.** `frames_b64` vira `len()`, e a
contagem só empurra `confianca` em `+ min(frame_count, 30) * 0.01`.

> Consequência prática: **desligar a câmera não muda a emoção estimada**, só a
> confiança declarada.

## 6. A realimentação, no estado medido

**Os 290 lotes têm `analysis_ciclo_id IS NULL`.** Nenhum ciclo na janela.

| | |
| --- | --- |
| `aluno_mental_state_history` | 0 linhas |
| `ia_decision_logs` | 0 linhas |
| último `ciclo_executado` | 25/07 — dois meses antes |
| último `ciclo_iniciado` | 10/09 — dez dias antes da janela |

Causa consistente com o que o próprio código documenta: com a API
inalcançável, o app cai na gravação direta ao Supabase — que grava sessão,
lote, eventos e tempo, e **pula a análise**. O comentário em
`telemetriaApi.ts` nomeia o efeito: *"cai direto no fallback (ciclo_id sempre
null), quebrando o gatilho de refresh de personalização sem nenhum erro
visível"*.

Ou seja: **a coleta sobrevive à API fora do ar; a adaptação não.**

## 7. Onde cada coisa fica

| tabela | guarda |
| --- | --- |
| `telemetria_sessoes` | sessão, `camera_opt_in`, início/fim |
| `telemetria_lotes` | agregado do lote + `payload` JSONB (touch_samples, signals, camera sem bytes) |
| `telemetria_eventos_app` | um registro por evento, com `is_correct`, `attempt_number`, `payload` |
| `telemetria_time_metric_entries` | tempo por `(lote, scope, entry_key)` — a chave única que dá idempotência a lote reenviado |
| `personalizacao_item_progresso` | progresso por item |

A imunidade a lote duplicado vem da chave única
`(lote_id, scope, entry_key)`, preenchida pelo trigger
`telemetria_resolver_entidade` — não da forma da conta.

## 8. Como reproduzir as medições

```sql
-- aninhamento dos escopos
SELECT scope, round(sum(dwell_sec)/60.0,1) AS dwell_min,
       round(sum(active_sec)/60.0,1) AS active_min
FROM telemetria_time_metric_entries GROUP BY scope;

-- tempo gravado vs. dwell real
SELECT ta.topico_id, ta.tempo_gasto_min,
       round((SELECT sum(e.dwell_sec)/60.0 FROM telemetria_time_metric_entries e
               WHERE e.aluno_id=ta.aluno_id AND e.scope='topic'
                 AND e.topico_id=ta.topico_id),2) AS dwell
FROM topico_aluno ta WHERE ta.tempo_gasto_min > 0;

-- a realimentação rodou?
SELECT count(*) FILTER (WHERE analysis_ciclo_id IS NOT NULL) AS com_ciclo,
       count(*) AS total FROM telemetria_lotes;

-- bytes de imagem vazaram para o banco?
SELECT count(*) FILTER (WHERE payload::text LIKE '%frame_b64%') FROM telemetria_lotes;
```

Do lado do código, a checagem que fecha a questão do ML:

```bash
grep -riE "scikit|sklearn|xgboost|hmmlearn|deepface|opencv|torch|tensorflow" \
  api/requirements.txt api/pyproject.toml
```

## O que este documento não resolve

Descreve; não corrige. Em aberto no momento da medição:

- a análise não roda, e a causa raiz é de infraestrutura (API hibernando), não
  de código;
- o erro de `run_analysis` não era persistido — tratado em #285;
- o termo de consentimento afirmava que a câmera era analisada — tratado em
  #286;
- os nomes dos seis estágios seguem sendo de algoritmos — documentados em #287,
  por decisão de manter os nomes.
