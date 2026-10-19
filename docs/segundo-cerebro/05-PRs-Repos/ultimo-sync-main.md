---
tags: [sync, github, delta]
repo: BitStudioLabs/trail-up
branch: main
---

# Último sync — main

| Campo | Valor |
|-------|-------|
| **Tipo** | DELTA sync → vault TCC Obsidian |
| **Repo** | [BitStudioLabs/trail-up](https://github.com/BitStudioLabs/trail-up) `main` |
| **SHA** | `b5491b02` |
| **Tip commit** | `feat(web): números e títulos das métricas do Perfil sem serifa, radar com valores (#346) (#413)` |
| **Tip author date** | 2026-10-13 12:55 America/Sao_Paulo |
| **Sync vault em** | **2026-10-13 ~13:25 America/Sao_Paulo** |
| **Método** | `gh api` compare (conta Geisbelly). Sem cursor-github no Lab, sem clone. |
| **Range** | `b7e74cdd…b5491b02` (ahead_by=**99**) |
| **Espelho** | Sync TrailUp: Geisbelly/TrailUp [#127](https://github.com/Geisbelly/TrailUp/pull/127) já em Lab tip `b5491b0` (não mergear Geisbelly/*) |

## Changelog delta `b7e74cdd…b5491b02` (agrupado por área)

### IA / emoção (material para a tese)
- **#305** estágio de emoção que olha a imagem (**FER+ local**, `api/app/services/emotion_vision.py`, integrado em `linear_analysis_pipeline.py`).
- **#306** termo v4 no mobile descreve a análise de expressão facial; **#309** câmera **desligada por padrão** — aceitar o termo não a liga.
- **#271** docs Jev: evidência de avaliação e limites de custo.
- **#310** signup: instrumento BrainHex com estilo de resposta controlado (`BrainHexOrdenacaoStep`; spec perfil BrainHex probabilístico 2026-10-02).

### Segurança / privacidade / RLS
- #299 `.env.example` sem chave anon real + teste guard; #318 aluno não envia push a outro aluno; #270 OAuth Google callback derivado + PKCE.
- #325 RLS tema do mapa; #328 trigger fns fora do REST; #337 banco recusa URL loopback em material; #338 retenção de texto livre em `ia_decision_logs` (#195); #339 consentimento de telemetria provável no servidor.
- Docs: #302 views sem `security_invoker`/GRANT; #327 tabela nova nasce com RLS; #342 anônimo lê 3 linhas de `app_config`.

### Banco / migrations (Alembic)
- 12 migrations novas `20261002_02` … `20261003_10` (social/provisionar sem grant, item personalizado, medida BrainHex, RLS mapa, realtime, trigger ACL, índices duplicados #330, contato versionado #336, URL local, retenção, consentimento).
- #308 advisory lock serializa migrações entre instâncias; #326 realtime publica tabelas assinadas.

### Console professor
- #301 fallback de URL de material; #304 contagem de alunos por perfil (não mais 0); #307 presença + tempo ativo; #334 duplicar turma sem cópia parcial.

### Regras de jogo / API
- #321 prazo não vence um dia antes e aluno o vê; #322 pontos não pagos N vezes; #323 telemetria: lote ruim não trava fila; #324 reaplica pilha da issue #1 (signup); #341 API sobe no Windows (`run_api.py`).

### Web do aluno (redesign “tela larga”, protótipo v4) — ~60 PRs #346–#413
- Moldura desktop (#347), protótipos v1–v4 (#348); Notificações, Ranking, Configurações, Trilha (mapa de países, Cinzel), Loja/Bag, Perfil, Tutorial, Social/chats, Login/recuperar senha, Tópico/confronto, modal de conquista, radar de métricas (#359–#413). Fix #405 restaura `SecaoConfigDesktop`.

### CI / testes / qualidade
- #303/#340 CI da main não é cancelado/perdido em merges sequenciais; #294 mobile roda testes (+24 órfãos); #332 13 erros de tipo + gate; #333 brainhexpdf no CI; #344 manifestos de teste mobile; #296 tipos Supabase regenerados; #293 microservice sem crypto.

### Docs de sprint
- Relatórios semanais W40 (#316) e W41 (#345) em `docs/sprint/` (HTML/PDF).

## Histórico anterior
### Delta b3a8de39…b7e74cdd (desde `b3a8de39`)

1. **`b7e74cdd`** — `fix(api): lineariza Alembic — 20260930_01 após 20260929_02`
   - Arquivo: `api/alembic/versions/20260930_01_telemetria_erro_de_analise.py` (+2/−2)
   - Mudança: `down_revision` / `Revises` de `20260922_06` → `20260929_02`
   - Motivo: CI `test_alembic_tem_uma_unica_cabeca_e_cadeia_continua` falhou com duas heads `[20260929_02, 20260930_01]` (ambas partiam de `20260922_06`)
   - Nota: espelho Geisbelly/TrailUp já tinha `down_revision=20260929_02`; Lab alinhou a cadeia

## Changelog curto (histórico recente — tip anterior)

1. `#292` — docs: reparo mojibake + remoção de BOM (`b3a8de39`, tip anterior)
2. `#291` — api: remove `build_personalizacao_state`
3. `#290` — api: UTF-8 sem BOM + mojibake
4. `#289` — docs: API no **Dokploy**, não Render
5. `#288`–`#283` + RAG/M2 — ver baseline anterior

## Espelho Geisbelly (READ only)

| Repo | Tip | Nota |
|------|-----|------|
| [Geisbelly/TrailUp](https://github.com/Geisbelly/TrailUp) | `8e08d7f1` — `Merge pull request #126 from Geisbelly/sync/lab-b7e74cd` (~2026-10-02 11:54 America/Sao_Paulo) | Lab tip `b7e74cdd` já syncado no espelho; **nunca merge Geisbelly/*** |

## Arquivos do vault atualizados neste delta

- `05-PRs-Repos/ultimo-sync-main.md` (este)
- `02-Timeline/timeline.md`
- `01-Arquitetura/mapa-arquitetura.md` (SHA + nota Alembic)
- `03-Glossario/glossario.md` (SHA sync only)
- `00-Home.md`
- `CHANGELOG-vault.md`

## Impacto monografia

**Não** exige reescrita de capítulo. É fix de cadeia de migrations (ops/CI). Cap. 5 (Desenvolvimento) / apêndice de schema: opcional 1 linha “cadeia Alembic linearizada (`20260930_01` após `20260929_02`) em 2026-10-02”. Sem mudança de produto, RAG, telemetria funcional ou arquitetura de agentes.

← [[00-Home]] · [[05-PRs-Repos/links-repos]]

## Status Sync TrailUp

| Campo | Valor |
|-------|-------|
| **Recheck em** | 2026-10-02 ~16:09 America/Sao_Paulo |
| **Lab tip** | `b7e74cdd` |
| **Espelho main** | `8e08d7f1` — merge #126 `sync/lab-b7e74cd` |
| **PR sync aberto** | nenhum (após #126) |
| **Regra** | Sync só abre PR no espelho; **nunca** mergeia Geisbelly/* |
