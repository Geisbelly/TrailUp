---
tags: [monografia, plano]
source: Monografia TrailUp.docx (Drive 1AYGYu_2Gz5ZZGaXn6YGhk_fJSdSxj5eC)
aligned_with: [Proposta de TCC, Projeto de UX, TCC 1 Desenvolvimento, Fluxo TrailUp, Relatório Técnico]
---

# Plano de capítulos — Monografia TrailUp

**Título (capa atual):** *TrailUp: plataforma adaptativa de aprendizagem com personalização por perfil, gamificação, telemetria e inteligência artificial*  
**Orientador:** Prof. Esp. Fábio Araújo · CEULP/ULBRA · Palmas–TO · 2026

## Alinhamento com material existente

| Capítulo monografia | Fonte principal já existente | Gap |
|---------------------|------------------------------|-----|
| 1 Introdução | Proposta + UX (50 alunos, persona) + monografia draft | Fechar problema/hipótese com números finais |
| 2 Fundamentação | TCC 1 Desenvolvimento (BrainHex, trilhas) + Leituras | Consolidar citações da Evidence Base |
| 3 Trabalhos relacionados | Leituras Aprovadas / Iniciais | Tabela de síntese §3.4 |
| 4 Metodologia | UX (DT/Lean/DCU) + PRISMA na monografia | Protocolo sala + ética |
| 5 Desenvolvimento | Fluxo + Planilha componentes + repos | Diagramas + screenshots atuais |
| 6 Evidence Base e RAG | Pasta RAG + planilha | Exemplos de query / metadados |
| 7 Avaliação | UX testes + anexos monografia | Rodar experimento sala |
| 8 Resultados | _(parcial)_ | Preencher pós-avaliação |
| 9–10 Limitações / Conclusão | Delimitação §1.7 | Após resultados |

## Estrutura proposta (espelho do doc atual)

### Pré-textuais
- Capa / Folha de rosto  
- RESUMO / ABSTRACT  
- (Listas: figuras, tabelas — se exigidas pelo manual CEULP)

### 1 Introdução
1.1 Contextualização  
1.2 Problema de pesquisa — *integrar Evidence Base + RAG ao TrailUp com BrainHex, conteúdo do professor e telemetria*  
1.3 Hipótese  
1.4 Objetivo geral  
1.5 Objetivos específicos  
1.6 Justificativa  
1.7 Delimitação (MVP; sem diagnóstico clínico; BrainHex não determinístico)

### 2 Fundamentação teórica
2.1 Aprendizagem personalizada e adaptação  
2.2 Modelagem do estudante  
2.3 Autorregulação, prática de recuperação e espaçamento  
2.4 Feedback e avaliação formativa  
2.5 Apresentação multimídia  
2.6 Gamificação  
2.7 BrainHex (+ 2.7.1 como hipótese de personalização)  
2.8 Limitações do uso de perfis  
2.9 Estados acadêmicos e emoções  
2.10 Telemetria e learning analytics  
2.11 IA generativa e RAG  

### 3 Trabalhos relacionados
3.1 Gamificação personalizada · 3.2 BrainHex · 3.3 Modelagem/adaptação · 3.4 Síntese e lacuna

### 4 Metodologia
Natureza da pesquisa · Etapas · Descoberta UX · Desenvolvimento · Evidence Base · PRISMA · Extração · Qualidade · Avaliação em sala · Ética · (+ seções MVP 4.18–4.20 do draft)

### 5 Desenvolvimento do TrailUp
Visão · Arquitetura · App estudante · Interface professor · API · Multimídia · Conteúdo/cards · BrainHex · Gamificação · Telemetria · Persistência · Qualidade/idempotência  

*Mapear para:* [[01-Arquitetura/mapa-arquitetura]] + Fluxo TrailUp + Design assets

### 6 Evidence Base e RAG
Objetivo · Domínios · Separação currículo vs evidência · Metadados · Fluxo recuperação · Decisão · Controle extrapolação · MVP · (seções 6.17–6.21 do draft)

### 7 Avaliação
Pesquisa preliminar · Usabilidade · Protocolo sala · Métricas (aprendizagem, comportamento, personalização, experiência) · Análise

### 8 Resultados e discussão
Evidence Base · Sistema · Educacionais · Discussão

### 9 Limitações e trabalhos futuros
### 10 Conclusão

### Apêndices (já no draft)
A Matriz rastreabilidade · B Formulário/variáveis · C Matriz intervenções MVP · D Registro decisão adaptativa · E Plano análise estatística · F Checklist RAG · G Roteiro experimento · H Limites redação  

### Referências · Anexos (artefatos UX / Drive)

## Evolução vs Proposta original (*NeuroNauta*)

| Proposta 2025 | Monografia 2026 |
|---------------|-----------------|
| Nome NeuroNauta | TrailUp |
| Ênfase forte em FER/câmera | Telemetria + emoções acadêmicas; FER fora do núcleo experimental |
| Hexagonal ports/adapters | Mantida como visão; stack FastAPI + apps + RAG |
| Perfis Bartle/Marczewski + neurodiversidade | BrainHex como hipótese inicial + evidências UDL/SRL |

## Próximos passos de escrita

1. Congelar sumário com orientador  
2. Preencher §3.4 lacuna com Leituras Aprovadas  
3. Cap. 5: diagramas do repo BitStudioLabs/trail-up  
4. Cap. 6: 1 exemplo end-to-end RAG  
5. Executar / documentar avaliação sala (caps. 7–8)



## Nota pós-baseline (repo vs plano)

> Sync 2026-10-01 ~20:01 America/Sao_Paulo · BitStudioLabs/trail-up `main` @ `b3a8de39`. Detalhe: [[05-PRs-Repos/ultimo-sync-main]].

| Plano / monografia (draft) | Realidade em main | Ação sugerida |
|----------------------------|-------------------|---------------|
| Visão hexagonal Ports & Adapters na Proposta | Monorepo 4 serviços + LangGraph; fronteira “API = só IA, resto no banco” | Cap. 5: descrever monorepo + regra de fronteira; hexagonal como visão histórica |
| FER / câmera como sinal forte | Telemetria + emoção acadêmica; termo mobile **não** afirma análise de câmera (#286) | Manter delimitação §1.7; não prometer FER no MVP |
| Stack FastAPI + apps + RAG | Confirmado: `api/`, `mobile/`, `frontend/`, `microservice/`; RAG docs + ADR pgvector; retrieval semântico ainda incompleto | Cap. 6: estado “arquitetura + corpus docs”; não afirmar vector store em produção sem checar migrations |
| Hospedagem genérica / Render (textos antigos) | API no **Dokploy** (#289); ADR ainda menciona hibernação Render em trechos históricos | Preferir Dokploy na redação atual |
| Evidence Base Drive | Corpus/pipeline documentados em `docs/rag/*`; `docs/tcc/` no monorepo (atualizado abr/2026) | Cruzar Drive Leituras Aprovadas × `docs/rag/inventario-fontes.md` |
| Models / KT | `models/m2_knowledge_tracing/` (M2 gate + domínio) | Mencionar em cap. 5/7 se entrar no experimento |

Pacote técnico no repo: `docs/tcc/01`…`11` (+ `12-psicologia-das-cores-perfis.md`) — complementar ao sumário da Monografia.docx, não substituto automático.

## Lacunas de pesquisa / escrita (atualizado 2026-10-01)

| Gap | Impacto | Ação |
|-----|---------|------|
| Pasta Drive **Jornada/** vazia | Cap. 4/5 UX | Consolidar Fluxo + storyboard no vault ou Drive |
| Caps. **7–8** sem resultado de sala | Avaliação | Protocolo + datas turma + ética |
| Relatório Técnico.docx não expandido no vault | Cap. 5 | Export autorizado → markdown |
| Inventário fino dos 19 packs Datasets | Cap. 6 / datasets | Listar arquivo a arquivo (EdNet grande) |
| Leituras Aprovadas × `docs/rag/inventario-fontes.md` | Evidence Base | Cruzar quais PDFs entram no MVP |
| Personas Ana vs Maria | Cap. 1/4 | Unificar ou narrar evolução |
| Diagrama C4 / ecossistema do repo | Cap. 5 | Extrair `docs/ecossistema/` |
| pgvector em produção? | Cap. 6 | Confirmar migrations vs “ainda em construção” |
| Incidente Free/PITR | Limitações / trabalhos futuros | Mencionar necessidade de backup em §9 (ops) |
| ABNT / manual CEULP | Pré-textuais | Conferir listas e formatação |

← [[00-Home]] · [[RELATORIO-INVENTARIO]] · [[01-Arquitetura/mapa-arquitetura]] · [[10-Incidentes/perda-dados-console-2026-10-01]]

## Evidências e limitações (notas parceiros, 2026-10-13)

- **Cap. 7 Avaliação:** protocolo técnico de regressão → [[09-Testes-Reflect/evidencias-avaliacao-2026-10-01]] (Docker local, Reflect P0 18/18, inventário 68 casos/57 P0, gate pós-sync); gate do sync #124 17/17 → [[05-PRs-Repos/validacao-espelho-2026-10-01]].
- **Cap. 8 Resultados:** rastreabilidade issue↔PR → [[05-PRs-Repos/issues-loop-2026-10-01]]; evolução arquitetural → [[05-PRs-Repos/arquitetura-prs-2026-10-01]]; delta main → [[05-PRs-Repos/ultimo-sync-main]] (FER+ #305, privacidade/RLS, web v4).
- **Cap. 9 Limitações:** incidente de perda de dados no console (Supabase Free, 01/10) → [[10-Incidentes/perda-dados-console-2026-10-01]]. Sync sem DROP; **causa do wipe ainda aberta** (não afirmar causa). Suite verde ≠ dados restaurados.
- **Atenção cap. 5/2:** a afirmação "MVP sem FER" está **desatualizada** — FER+ local entrou na main (#305), câmera opt-in (#309, termo v4 #306); revisar texto e discutir ética/LGPD (retenção #338, consentimento #339).
