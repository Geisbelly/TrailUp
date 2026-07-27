# EventoRepository

> 29 nodes

## Key Concepts

- **EventoRepository** (25 connections) — `api/app/repositories/evento.py`
- **analysis_runner.py** (22 connections) — `api/app/services/analysis_runner.py`
- **emocoes.py** (19 connections) — `api/app/api/v1/emocoes.py`
- **run_analysis()** (17 connections) — `api/app/services/analysis_runner.py`
- **AnalisarPayload** (15 connections) — `api/app/schemas/api.py`
- **analisar_stream()** (9 connections) — `api/app/api/v1/emocoes.py`
- **analisar()** (8 connections) — `api/app/api/v1/emocoes.py`
- **evento.py** (8 connections) — `api/app/repositories/evento.py`
- **build_initial_state()** (8 connections) — `api/app/services/state_builder.py`
- **IADecisionLogRepository** (7 connections) — `api/app/repositories/ia_decision_logs.py`
- **state_builder.py** (7 connections) — `api/app/services/state_builder.py`
- **._sanitize_reference()** (5 connections) — `api/app/repositories/evento.py`
- **build_analysis_graph_config()** (4 connections) — `api/app/services/analysis_runner.py`
- **ia_decision_logs.py** (3 connections) — `api/app/repositories/ia_decision_logs.py`
- **build_analysis_response()** (3 connections) — `api/app/services/analysis_runner.py`
- **post** (2 connections)
- **UserContext** (2 connections)
- **AsyncSession** (2 connections)
- **.__init__()** (2 connections) — `api/app/repositories/evento.py`
- **._infer_reference_prefix()** (2 connections) — `api/app/repositories/evento.py`
- **._extract_numeric_reference()** (2 connections) — `api/app/repositories/evento.py`
- **.log()** (2 connections) — `api/app/repositories/evento.py`
- **.__init__()** (2 connections) — `api/app/repositories/ia_decision_logs.py`
- **.log()** (2 connections) — `api/app/repositories/ia_decision_logs.py`
- **AsyncSession** (1 connections)
- *... and 4 more nodes in this community*

## Relationships

- [test_repositories.py](test_repositories.py.md) (12 shared connections)
- [api.py](api.py.md) (9 shared connections)
- [test_api.py](test_api.py.md) (8 shared connections)
- [v1/telemetria.py](v1-telemetria.py.md) (7 shared connections)
- [UserContext](UserContext.md) (6 shared connections)
- [Evento](Evento.md) (6 shared connections)
- [MentalStateHistoryRepository](MentalStateHistoryRepository.md) (6 shared connections)
- [v1/personalizacao.py](v1-personalizacao.py.md) (4 shared connections)
- [AccessRepository](AccessRepository.md) (3 shared connections)
- [ContextRepository](ContextRepository.md) (3 shared connections)
- [test_graph_nodes.py](test_graph_nodes.py.md) (2 shared connections)
- [conversar_com_mentor_personalizacao](conversar_com_mentor_personalizacao.md) (1 shared connections)

## Source Files

- `api/app/api/v1/emocoes.py`
- `api/app/repositories/evento.py`
- `api/app/repositories/ia_decision_logs.py`
- `api/app/schemas/api.py`
- `api/app/services/analysis_runner.py`
- `api/app/services/state_builder.py`

## Audit Trail

- EXTRACTED: 169 (92%)
- INFERRED: 14 (8%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*