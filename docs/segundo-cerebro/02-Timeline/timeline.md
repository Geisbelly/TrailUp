---
tags: [timeline, trailup]
---

# Timeline TrailUp / TCC

Datas aproximadas a partir de `modifiedTime` do Drive (convertidas para BRT) + syncs do repo.

| Quando (BRT) | Marco | Evidência |
|--------------|-------|-----------|
| ~jul/2025 | Proposta de TCC (*NeuroNauta* / IA emocional) | Proposta de TCC (mod. 29/07/2025) |
| ~set/2025 | BrainHex papers + survey no TCC 1 | PDFs BrainHex; pasta TCC 1 |
| ~out/2025 | Pesquisa de validação (professores + CSV alunos) | Pasta Pesquisa |
| ~out–nov/2025 | Protótipos visuais + screens Expo | Pasta Protótipos (PNG/JPG) |
| ~nov/2025 | Fluxo TrailUp documentado | Fluxo TrailUp Doc |
| ~dez/2025 | Projeto UX final + Relatório Técnico + builds APK/AAB | UX Doc; Relatório; versao_0*.apk |
| ~abr/2026 | Build APK mais recente em Protótipos; docs/tcc no monorepo | application-44050a88…apk; `docs/tcc/` |
| ~jun/2026 | TCC 1 - Desenvolvimento atualizado; pasta Jornada criada (vazia); Geisbelly/TrailUp criado | TCC 1 Doc; Jornada; GitHub |
| ~ago/2026 | TCC 2: Datasets + Leituras (Iniciais); ADR pgvector; progresso professor opcional | BASE DE DADOS RAG…; ADR-0001 |
| ~set/2026 | Leituras Aprovadas + Resumos; Design assets; Monografia.docx; dashboard/insights; telemetria | TCC 2; PRs BitStudioLabs |
| **2026-10-01 ~16:40** | **Incidente:** perda de dados console professor no Supabase TraiUp (Free); só turma **JP id 56** restante; PITR indisponível | [[10-Incidentes/perda-dados-console-2026-10-01]] |
| **2026-10-01 ~16:43** | Espelho: merge [[05-PRs-Repos/pr-124-sync-espelho\|PR #124]] Lab `b3a8de39` → Geisbelly/TrailUp (`70a442c0`) | Sem force-push; conflitos priorizaram Lab |
| 2026-10-01 ~18:40 | Vault Obsidian + inventário Drive | este vault |
| **2026-10-01 ~20:01** | **BASELINE sync vault ↔ BitStudioLabs/trail-up `main`** | SHA **`b3a8de39b61edc4fc5b0e85145f27452406f5c37`** · [[05-PRs-Repos/ultimo-sync-main]] |
| **2026-10-02 ~16:09** | **DELTA sync vault ↔ BitStudioLabs/trail-up `main`** | SHA **`b7e74cdd331a4b215d8b07cda5e3b338220f060d`** · Alembic lineariza `20260930_01` após `20260929_02` · [[05-PRs-Repos/ultimo-sync-main]] |
| 2026-10-01 ~20:59–21:01 | Issues Lab fechadas (exemplos telemetria/docs): #18 #38 #89 #90 #92 #93 #99 | BitStudioLabs/trail-up |
| 2026-10-01 ~20:15 | Enrich vault: pastas 08/09/10 + CHANGELOG | [[CHANGELOG-vault]] |
| 2026-10-13 | Console do professor no redesign V9 | #419 |
| 2026-10-16 | Telas novas do console: Conquistas, Notas, Missões, Eventos, Rank de batalhas | #473–#528 |
| 2026-10-19 | Correções de SECURITY DEFINER e RLS; Economia completa; eventos, missões, ranks e modos (fases 1–10); vault entra no repo | #532–#564, #544, #542 |
| 2026-10-20 | Arena volta com Elo; ranking com período manual | #568–#571 |
| 2026-10-22–25 | LGPD (#195): cadastro em uma etapa, conversas cifradas, consentimento do responsável, retenção, menores só na OpenAI, buckets privados; RAG do mentor no OpenAI Vector Store | #576–#631, #612 |
| 2026-10-26 | Evento abre e encerra sozinho (pg_cron) | #639 |
| **2026-10-28** | App mobile-v1 na main; API passa a `api.trailup.promora.dev.br` (certificado válido); **espelho cai em 502 por duas cabeças no Alembic** | #687, #689, #699 |
| 2026-10-29–31 | Métricas F0–F5 (fila de análise da telemetria no banco, tempo ativo, views versionadas); Insights e intervenção; risco de reprovação | #701–#741 |
| **2026-11-01 ~01:30–03:47** | **Incidente:** API em 502 por migration aplicada antes de o código chegar ao espelho | [[10-Incidentes/api-fora-por-migration-2026-11-01]] |
| 2026-11-01 | Nota média e modelo de evasão no banco; alteração do professor avisada; tentativas pelo relógio do servidor (#136, fases 1–2); falas do boss; e-mail pelo Apps Script; issues #12, #15 e #172 fechadas; syncs do espelho #201–#205 | #749–#763 · [[05-PRs-Repos/ultimo-sync-main]] |
| 2026-11-06 | Áudio só na voz do Guardião e um de cada vez; tempo de estudo soma os lotes e tela desligada não conta; `generate-content-ai` troca de chave e de modelo quando a cota do Gemini acaba; conta de demonstração escolhe o perfil | #1027–#1044 |
| 2026-11-07 | Guia apoia com as questões e os cards sem entregar a resposta, e o Guardian barra o vazamento (#1059); correção de dissertativa sem revelar a resposta esperada (#1060); PR1 e PR2 por plataforma (#1046); diagnóstico do tópico em tela própria | #1046–#1060 |
| 2026-11-08 | Questão da turma corrigida no banco, sem o app ler o gabarito (#1064, #1065); push lê os recibos da Expo e desliga o token do Expo Go (#1066); configuração do build Android liga o Firebase (#1067); syncs do espelho #313 e #314 | #1061–#1069 |
| 2026-11-09 | Specs de texto rico, respostas com código e fórmula e questões de PDF (#1071); `formato_texto` e alternativa rica conferida pela posição (#1072) | #1071–#1072 |
| 2026-11-10 | Texto rico no app e no console (#1074, #1075); respostas em código, numérica e expressão, com o gabarito fora de `questoes` (spec B, #1083–#1085, #1094, #1096); corpus v1 do RAG indexado e golden set medido (#1077); trilha da IA em etapas, com rascunho salvo (#1093, #1098); cronômetro pelas questões e pausa ao sair (#1089); arena corrigida pelo banco (#1091); o professor aprova o material personalizado antes de o aluno ver (#1100, #1101); app 1.0.8 (#1079) | #1073–#1101 |
| 2026-11-11 | Visibilidade do tópico, com os portões nas RPCs (#1102, #1104); a IA lê o PDF, o PPTX e o DOCX do professor (#1113); roteiro de diversidade de perfis: regra única do vetor (#1105–#1107), camada leve ponderada (#1109, #1110), mistura de material por conteúdo, desligada (#1111, #1112), diversidade da turma no console (#1114), peso das notificações (#1115) e vetor observado em sombra (#1116) | #1102–#1116 |
| 2026-11-12 | Cabeça única do Alembic depois de duas migrations sobre a mesma pai (#1117); cache da trilha apaga as rotas antigas (#1118); syncs do espelho #316 a #344 desde 10/11 | #1117–#1118 |

## Fases lógicas

1. **Ideação / proposta** — NeuroNauta, hexagonal, FER
2. **UX Discovery** — questionário 50 alunos, BrainHex, persona Ana → Fluxo persona Maria
3. **Protótipo** — Figma + Expo/Play + Relatório Técnico
4. **TCC 1 desenvolvimento** — fundamentação BrainHex + trilhas
5. **TCC 2** — Evidence Base / RAG + monografia + design de jogo (totens, bosses, Lumi…)
6. **Produto monorepo** — api + microservice + frontend + mobile em BitStudioLabs/trail-up
7. **Avaliação em sala** — protocolo na monografia (caps. 4/7) — *em andamento / a executar*
8. **Ops / incidente 01/10** — wipe console Free; documentar restore + dumps futuros

9. **03/10** — lote segurança/RLS/CI (#293–#318), relatório W40
10. **07–09/10** — FER+ local (#305), câmera opt-in (#309), 12 migrations RLS/retenção/consentimento, OAuth PKCE (#270), Jev docs (#271), relatório W41
11. **12–13/10** — web do aluno tela larga v4 (#346–#413); tip `b5491b02` sincronizado no vault 13/10
12. **13–20/10** — console V9 e telas de gamificação; motor de eventos, missões, ranks e modos no banco; economia completa
13. **22–26/10** — LGPD (#195) e RAG do mentor no Vector Store; protótipo mobile-v1
14. **28–31/10** — app mobile-v1 na main; métricas F0–F5 (#12); a API ganha domínio com certificado válido
15. **01/11** — nota, evasão e tentativas decididas pelo banco (#136); incidente de 502 por migration; tip `11aa1c65` sincronizado no vault
16. **04–05/11** — gateway passa a exigir link assinado e a #632 fecha; leitura de servidor corrigida (#974); gateway reaberto por minutos por deploy de branch antiga; 1.0.7 com build pronto, fora da loja
17. **05/11** — monitor de disponibilidade no banco, com e-mail real conferido e meta de 24 horas (#981, #1004); saúde dos clientes (#992); rotas do BrainHexPDF com segredo (#983); administração do dono no banco (#997); duelo no evento (#995, #996, #1003). Quatro colisões de revisão do Alembic no mesmo dia, todas pegas antes de chegar à produção (#963, #988, #993, #999), com o CI parado
18. **05/11** — molduras por desafios difíceis (#1011), XP de conteúdo pelo banco (#1008) e diagnóstico antes do tópico (#1010); página pública de gamificação e personalização, com paleta, biblioteca de elementos e evidências dos PRs
19. **06/11** — áudio só na voz do Guardião e um de cada vez (#1031, #1039); tempo de estudo soma os lotes, e tela desligada não conta (#1032, #1054); a geração alterna chaves e modelos do Gemini (#1043)
20. **07/11** — o guia ajuda sem dar a resposta: o chat recebe as questões (sem o gabarito) e a frente dos cards, e o Guardian confere a resposta contra o gabarito antes de ela sair (#1059); a correção de dissertativa não revela a resposta esperada (#1060)
21. **08/11** — gabarito fora do app: a questão da turma é corrigida por RPC no banco, e o app novo não lê mais o gabarito (#1064, #1065; a fase 3, fechar a coluna, espera a versão mínima do app); recibos de push da Expo e Firebase no build Android (#1066, #1067)
22. **09–10/11** — o professor escreve fórmula, química e código, e o aluno responde com código, número e expressão; numérica e expressão são conferidas sem IA, e o código pela IA sem devolver o código de referência (spec A e spec B, #1072–#1096). O RAG passa a ter corpus: 12 regras indexadas, recall@3 0,87 no golden set (#1077)
23. **10–11/11** — nada que a IA gera chega ao aluno sem decisão do professor: o material personalizado espera aprovação (#1100) e o tópico novo nasce em rascunho (#1102, #1104). A trilha da IA passa a ler os arquivos do professor (#1113)
24. **11–12/11** — roteiro de diversidade de perfis: o vetor BrainHex com uma regra só no app, na API e no banco; cronômetro, boss e notificações ponderados pelo vetor; mistura de material por conteúdo pronta e desligada; diversidade da turma no console; vetor observado pelo uso, em sombra (#1105–#1118)

← [[00-Home]] · [[05-PRs-Repos/ultimo-sync-main]] · [[10-Incidentes/perda-dados-console-2026-10-01]] · [[10-Incidentes/api-fora-por-migration-2026-11-01]] · [[10-Incidentes/gateway-reaberto-por-deploy-2026-11-05]]
