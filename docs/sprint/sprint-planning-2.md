# Sprint Planning 2 — TrailUp

Documento de planejamento da Sprint 2, gerado a partir da triagem de issues de
2026-09-18. As issues vivem no GitHub e no board **TrailUp** (Project 63); este
documento é o contrato da sprint e não substitui o tracker.

## 1. Propósito geral

A Sprint 2 fecha a passagem de **design/protótipo para produto** e quita as
dívidas que hoje bloqueiam o uso real:

1. **Destravar o aluno no mobile.** Corrigir os bugs abertos que aparecem no app
   (prazo, dedup de acerto, conquistas, apresentação inalcançável, login Google,
   relatório na web).
2. **Transformar o protótipo em console.** Levar o protótipo V5 do console do
   professor (e o acabamento da revisão 5) para `frontend/`, onde hoje só o shell
   recebeu o tema.
3. **Colocar os modelos treinados para decidir.** Integrar os artefatos M2 do
   `core-trailup` para decidir **quando vale a pena chamar a LLM**, e avaliar o
   Jev (TypeSafe) como alternativa.
4. **Fechar o corpus do RAG.** Avaliar quais documentos entram no RAG, com
   critério explícito, e conciliar as duas trilhas de integração (LangGraph ×
   OpenAI Vector Store).
5. **Consolidar a web do aluno.** Performance, ajustes visuais e prototipação da
   área web do aluno no mesmo método usado no console.

**Fora do propósito desta sprint:** novas features de gamificação do épico #133,
revisão de arquitetura de notificações e qualquer item marcado como
`planejamento` sem decisão fechada.

## 2. Período

A definir na abertura (sugestão: 2 semanas). A sprint só é encerrada quando a
Definição de Pronto (seção 4) for satisfeita para cada item puxado para **In
progress**.

## 3. Issues da sprint, por frente

### Frente A — Bugs do aluno (dona: Geisbelly)

| # | Título | Board |
|---|--------|-------|
| 27 | [Web] URL não reflete a tela em rotas protegidas | Backlog |
| 28 | [Web] Relatório do aluno falha em silêncio na web | Backlog |
| 157 | [Banco] 21 das 27 conquistas nunca destravam, e as 6 que destravam não pagam os pontos | Backlog |
| 177 | [Banco] O prazo da atividade vence um dia antes, e o aluno nunca o vê | Backlog |
| 186 | [Banco] O acerto em atividade personalizada não tem dedup no servidor | Backlog |
| 189 | [Mobile] Uma apresentação aponta para `http://localhost:3002`, que nenhum aluno alcança | Backlog |
| 217 | [Mobile] Login com Google não conclui no app do aluno | Backlog |

### Frente B — Console do professor: protótipo → implementação (owner: JP; verificação: Geisbelly)

| # | Título | Board |
|---|--------|-------|
| 6 | [Story] Professor acompanha indicadores da turma | Backlog |
| 15 | [Frontend] Painel do professor com os KPIs de engajamento e gargalos | fora do board |
| 56 | [Frontend] Preparar DashboardSection para KPIs: estados vazio/erro/loading + acessibilidade | Backlog |
| 147 | [Docs] Guia do professor | fora do board |
| 150 | [API] Missões criadas pelo professor | fora do board |
| 156 | [Frontend] Painel do professor para eventos, batalhas e métricas | fora do board |
| 214 | [Frontend] Finalizar o redesign do console do professor a partir do protótipo V5 | Backlog |

Todas carregam o critério **"Verificação final por @Geisbelly antes de fechar a
issue."**, exceto #214, cujo aceite já exige a aprovação dela.

### Frente C — Modelos de ML/LLM (owner: 0spura)

| # | Título | Board |
|---|--------|-------|
| 215 | [API/Mobile] Integrar os modelos M2 (.pkl) do core-trailup na API e no mobile | Backlog |
| 216 | [API] Avaliar o modelo Jev (TypeSafe) e decidir o que vale substituir | Backlog |

**Gate de licença:** os pesos do M2 derivam do EdNet KT3, **CC BY-NC 4.0 (não
comercial)**. A decisão de uso precisa ser registrada antes de qualquer deploy
(`RELATORIO_M2.md` §10.7).

### Frente D — RAG: corpus e retrieval (owner: 0spura)

| # | Título | Board |
|---|--------|-------|
| 63 | [Task] Integrar RAG no LangGraph (nó `agente_rag`) | Backlog |
| 64 | [Task] Tabela e nó de intervenções psicopedagógicas | Backlog |
| 66 | [Task] Sugestão de material e notificações com RAG | Backlog |
| 67 | [Task] Observabilidade e testes do RAG | Backlog |
| 70 | [Dados] Inventário e proveniência do Dataset_TrailUp | fora do board |
| 71 | [Dados] Triagem: o que é corpus de RAG e o que é conjunto de pesquisa | fora do board |
| 72 | [Dados] Extração e normalização dos PDFs de literatura | fora do board |
| 73 | [Dados] Curadoria pedagógica: metadados que tornam o chunk acionável | fora do board |
| 74 | [Dados] Política de uso dos conjuntos sensíveis (saúde mental, neurodivergência, facial) | fora do board |
| 75 | [Dados] Golden set para avaliar o retrieval | fora do board |
| 165 | [Task] RAG com OpenAI Vector Store integrado ao mentor | **In review** |

**Reconciliação pendente:** #63 (pgvector + nó `agente_rag`) e #165 (OpenAI
Vector Store) são duas trilhas para o mesmo problema. Decidir qual é o caminho
canônico antes de marcar as duas como prontas.

### Frente E — Web do aluno (owner: Rafinha; aprovação: Geisbelly)

| # | Título | Board |
|---|--------|-------|
| 29 | [Perf] Code splitting: 4,75 MB na web do aluno e 1,67 MB no console | Backlog |
| 219 | [Web] Prototipar a área web do aluno a partir do método do console | Backlog |

### Transversal

| # | Título | Donos | Board |
|---|--------|-------|-------|
| 218 | [Dados/Mobile] Avaliação dos documentos do RAG e ajustes visuais no mobile | Geisbelly, Rafinha | Backlog |
| 195 | [LGPD] Consentimento provável, câmera desligada por padrão, retenção e inferência de estado de menor | — (gate) | fora do board |

#195 não é entregável da sprint, mas é **gate**: nenhuma mudança que persista
inferência de estado momentâneo ou envie dado sensível a terceiro avança sem
decisão explícita.

## 4. Definição de Pronto (DoD) da sprint

Um item só entra em **Done** quando **todos** os critérios abaixo valem:

- [ ] **Aceite conferido item a item:** cada checkbox dos critérios de aceite da
      issue está marcado e com evidência linkada (PR, teste, print, consulta).
- [ ] **Teste independente:** a mudança tem teste focado que falha antes e passa
      depois (ou justificativa registrada quando não há seam testável), e a suíte
      relevante está verde.
- [ ] **Verificação da sprint:** as issues marcadas com "Verificação final por
      @Geisbelly" passaram pela validação dela.
- [ ] **PR revisada e integrada:** review aprovado, merge por squash na `main` e
      branch removida.
- [ ] **Sem regressão de autorização:** RLS/permissões preservadas; nenhum segredo,
      token ou dado pessoal exposto em código, log ou resposta.
- [ ] **Acessibilidade:** telas tocadas mantêm contraste AAA, sem depender só de
      cor; estados vazio/carregando/erro intencionais.
- [ ] **Documentação e grafo:** contrato/fluxo/regra alterado atualiza o capítulo
      correspondente em `docs/`; código alterado roda `graphify update .`.
- [ ] **Board em Done:** a issue está no board TrailUp na coluna **Done**.

## 5. Riscos e decisões em aberto

| Risco | Onde | Ação |
|---|---|---|
| Licença não comercial do EdNet KT3 | #215 | Decidir antes do deploy; documentar |
| Reconciliação RAG (#63 × #165) | #63, #165 | Definir o caminho canônico |
| Dado sensível de menor no RAG / em terceiro | #74, #195, #216 | Aplicar política antes de indexar/enviar |
| `diff`/`global` do M2 calibrados no EdNet | #215 | Recalibrar com dado próprio ou bloquear produção |
| Issues da Frente B fora do board | #15, #147, #150, #156 | Mover para o board ao puxar para In progress |
| Issues `[Dados]` fora do board | #70–#75 | Mover para o board ao puxar para In progress |

## 6. Fora da sprint

- Épico de gamificação #133 e filhas (`planejamento`): #134, #135, #136, #137,
  #138, #141–#159, #164.
- Telemetria (dívidas antigas): #89, #90, #92, #93, #94, #95, #99.
- Infra: #76, #26, #172, #173.
- Métricas/TCC: #12, #13, #14, #17, #19, #20, #21, #22.

---

> Documento vivo: atualizar as colunas do board e a seção 3 conforme itens forem
> puxados, e registrar aqui as decisões da seção 5 quando fechadas.
