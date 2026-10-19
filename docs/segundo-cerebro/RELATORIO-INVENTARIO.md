---
tags: [relatorio, inventario]
updated: 2026-10-01T18:40-03
---

# Relatório de inventário — TCC TrailUp

**Objetivo:** o que existe no Drive vs o que falta para fechar monografia + segundo cérebro.  
**Vault:** `/workspace/tcc-trailup-vault/`  
**Drive root:** https://drive.google.com/drive/folders/1-hMe8qKLGvPTtDZ-b0HlvbSRwQhtZtug

---

## 1. Resumo executivo

O material de **TCC 1** cobre proposta, UX completo, fluxo de produto, fundamentação BrainHex/trilhas, pesquisa/CSV e builds de protótipo. O **TCC 2** já tem draft avançado da **Monografia** (caps. 1–10 + apêndices), pasta rica de **Leituras** (iniciais / aprovadas / traduzidos / resumos / áudio) e **Datasets**, além de biblioteca grande de **Design** (cenários, emblemas, personagens, totens).  

Gaps principais: pasta **Jornada** vazia; resultados finais da avaliação em sala (caps. 7–8); inventário fino de datasets internos; política/uso claro dos dois repos; conectar diagramas reais do código BitStudioLabs ao capítulo 5.

---

## 2. O que existe (por bloco)

### TCC 1 — forte
| Artefato | Estado |
|----------|--------|
| Proposta de TCC (*NeuroNauta*) | ✅ lida |
| Fluxo TrailUp (persona Maria + modos) | ✅ lido |
| Projeto de UX (DT/Lean/DCU, 50 alunos, persona Ana, Figma/Play) | ✅ estrutura lida |
| TCC 1 - Desenvolvimento (BrainHex + trilhas) | ✅ início/estrutura |
| Relatório Técnico TrailUp.docx | ✅ presente (binário; não expandido neste passe) |
| Pesquisa Form + CSV | ✅ |
| Protótipos APK/AAB + screens | ✅ |
| BrainHex PDF + survey docx | ✅ |
| Pasta Jornada | ⚠️ **vazia** |

### TCC 2 — forte em fundação / design
| Artefato | Estado |
|----------|--------|
| Monografia TrailUp.docx | ✅ TOC completo extraído (10 caps + apêndices A–H) |
| Planilha componentes LLM (11 módulos) | ✅ lida |
| Leituras Iniciais (~47 PDFs) + Traduzidos (~49) + Resumos (~15 Docs) + Em Audio (~46 pastas) | ✅ inventariadas |
| Leituras Aprovadas (~18 PDFs) | ✅ |
| Datasets/Inicio (19 packs + CSVs + EdNet zips grandes) | ✅ nível pasta |
| Design: Cenarios 164 · Emblemas 202 · Molduras 50 · Totens 44 · Personagens (Bosses/Lumi/Mascotes/…) | ✅ contagens |

### Código
| Repo | Nota |
|------|------|
| BitStudioLabs/trail-up | Canónico para PRs |
| Geisbelly/TrailUp | Referência; **nunca merge automático** |

---

## 3. Gaps / riscos

1. **Jornada/** vazia — consolidar jornada do usuário (Fluxo + UX storyboard) nesta pasta ou no vault.  
2. **Relatório Técnico** e anexos UX (Figma, relatório de testes) — links no UX Doc; confirmar anexos ainda vivos.  
3. **Caps. 7–8 monografia** dependem de experimento em sala ainda a executar/documentar.  
4. **Proposta vs monografia:** FER/câmera vs telemetria — alinhar narrativa (já delimitado em §1.7, mas Proposta antiga pode confundir banca).  
5. **Personas:** Ana (UX) vs Maria Antônia (Fluxo) — unificar ou explicar evolução.  
6. **Datasets:** EdNet zips ~1.5 GB; inventário interno dos 19 packs não feito arquivo a arquivo.  
7. **Em Audio:** 46 subpastas; conteúdo (mp3?) não listado.  
8. **Variações emocionais** (Falando/Felizes/…): estrutura ok; contagens por subpasta pendentes.  
9. **Planilha sem título** — renomear no Drive (ex. `Componentes-IA-TrailUp`).  
10. **Vault Reuniões** separado — não misturar; Geisbelly precisa indicar path/link do outro vault.  
11. **ABNT/manual CEULP** — listas pré-textuais e formatação não conferidas neste passe.  
12. **Código ↔ cap. 5** — parcialmente fechado (mapa monorepo + deploys); C4 ainda pendente.
13. **Incidente Supabase 01/10** — documentado em `10-Incidentes/`; dump pré-wipe ainda **a localizar**.
14. **Rotina de backup Free** — ainda não padronizada (`supabase db dump`).

---

## 4. Próximos pedidos à Geisbelly

1. Confirmar title page / orientador / ano da monografia (já no docx).  
2. Path ou link do vault **Segundo Cérebro Reuniões**.  
3. Pode o agente ler/clonar **BitStudioLabs/trail-up** para mapear arquitetura real no vault?  
4. Prioridade: preencher **Jornada** no Drive ou só no Obsidian?  
5. Status do **experimento em sala** (datas, turma, ética/CEP).  
6. Renomear planilha de componentes?  
7. Quais PDFs de **Aprovadas** entram de fato na Evidence Base do MVP?  
8. Manter persona Ana, Maria, ou fundir?  
9. FER continua fora do MVP? (recomendado alinhar com monografia)  
10. Autorização para exportar Relatório Técnico.docx → markdown no vault.

---

## 5. Entregáveis deste passe

| Item | Path |
|------|------|
| Vault Obsidian | `/workspace/tcc-trailup-vault/` |
| MOC | `00-Home.md` |
| Arquitetura | `01-Arquitetura/mapa-arquitetura.md` |
| Timeline | `02-Timeline/timeline.md` |
| Glossário | `03-Glossario/glossario.md` |
| Inventário Drive | `04-Drive/inventario.md` |
| Repos | `05-PRs-Repos/links-repos.md` |
| Plano capítulos | `06-Monografia/plano-capitulos.md` |
| Parceiros | `07-Parceiros/bots.md` |
| Este relatório | `RELATORIO-INVENTARIO.md` |
| Infra Supabase | `08-Infra-Supabase/` |
| Testes Reflect | `09-Testes-Reflect/` |
| Incidentes | `10-Incidentes/` |
| CHANGELOG | `CHANGELOG-vault.md` |
| PR #124 | `05-PRs-Repos/pr-124-sync-espelho.md` |
| Cópia local monografia (scratch) | `/workspace/Monografia-TrailUp.docx` |

---

## 6. Capítulos monografia (proposta operacional)

1. Introdução  
2. Fundamentação teórica  
3. Trabalhos relacionados  
4. Metodologia  
5. Desenvolvimento do TrailUp  
6. Evidence Base e RAG  
7. Avaliação  
8. Resultados e discussão  
9. Limitações e trabalhos futuros  
10. Conclusão  
(+ Apêndices A–H, Referências, Anexos)

Detalhe: [[06-Monografia/plano-capitulos]]

← [[00-Home]]
