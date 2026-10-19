---
tags: [testes, reflect, monografia, evidencias]
date: 2026-10-01
updated: 2026-10-01
fonte: Testes Trail-Up
---

# Evidências de avaliação — TrailUp (2026-10-01)

Nota para a monografia / segundo cérebro. **Sem secrets.** Citar como evidência de *estratégia e execução de regressão*, não como prova de ambiente de produção estável no mesmo dia do incidente de dados.

## 1. O que a monografia pode citar

| Aspecto | Evidência (citável) |
|--------|---------------------|
| Ambiente de regressão | Stack Docker local: frontend `:8080`, API `:8000`, MS `:3000`; mobile fora do compose |
| Restrição metodológica | Espelho `trailup.vercel.app` **proibido** como base de regressão do console |
| Ferramenta E2E web | Reflect.run — suites Web Público, Auth, Console Professor, P0 |
| Inventário de casos | CSV gerado no box: 68 casos (`57` P0 + `11` P1) cobrindo home, auth, console professor, turmas, trilha, ranks, etc. |
| Checklist de gravação P0 | 17 casos professor/público “prontos para gravar”; 2 aluno **bloqueados** até Account Variables `STUDENT_*` |
| Execução registrada (episódio) | Suite Reflect P0 reorganizada; remoção de caso legado; re-execução atingiu **18/18** após login Google (mesma data) |
| Gate pós-sync | Smoke API (`/health`, OpenAPI, 401) + Reflect subset (homes + login form) após sync main |
| Falhas | Payload padronizado `tipo=teste_falhou`, `fonte=testes`, severidade vermelho/amarelo → bot Alertas |
| CI no monorepo | Path-filter: ruff+pytest (api), tsc+test (MS), eslint+vitest+build (frontend), lint Expo (mobile) |

## 2. Suites Reflect (organização alvo)

1. **Web Público** — homes / CTAs (sem secrets)
2. **Auth** — formulário, validação, gates anônimos
3. **Console Professor** — pós-login (`TEACHER_*` só em Account Variables no Reflect)
4. **P0** — regressão completa do checklist gravável

Aluno fica fora do P0 até existirem credenciais de teste.

## 3. Limitações (honestidade metodológica)

- Console professor em produção/espelho ficou **vazio** no incidente [[10-Incidentes/perda-dados-console-2026-10-01]] (~16:40 BRT): turmas Ulbra/Admin 0; turma JP id 56 intacta; `topicos`/`conteudos` = 0. **UPDATE de `professor_id` não recupera histórico.**
- Plano Supabase **Free**: sem backup diário / PITR nativo → restore só com dump off-site ou upgrade Pro *se* houver snapshot pré-incidente.
- Smoke/Reflect pesado deve ser **leve** enquanto Storage Free estiver em alerta (~74% no status do dia).
- MS slides/brainhex em Traefik estiveram DOWN em checagens anteriores — não inventar UP.
- Resultado **18/18** documenta a suite Reflect P0 no dia; **não** equivale a “dados de produção restaurados”.

## 4. Artefatos scratch no box (fora do vault / sem secrets)

- `trailup-automacao-estrategia.md` — estratégia, gatilhos, payload
- `trailup-reflect-p0-checklist.md` — passos de gravação P0
- `trailup-reflect-casos.csv` / `trailup-reflect-suite.md` — inventário
- `trailup-payload-teste-falhou.md` — contrato Alertas
- `trailup-smoke-api-401.md` — smoke API

## 5. Critério “pronto pra fechar issue” (coord. Issues)

Só após: testes OK (este bot) + PR mergeado na branch alvo + escopo 100%. Este bot **não** mergeia `Geisbelly/*`.

← [[09-Testes-Reflect/reflect-local]] · [[10-Incidentes/perda-dados-console-2026-10-01]] · [[00-Home]]
