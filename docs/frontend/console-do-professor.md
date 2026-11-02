# Console do professor — mapa das telas

Para quem vai mexer no console: onde cada tela mora, de onde vêm os dados dela e o que **não** passa pela API. A regra que organiza tudo está no `CLAUDE.md` (*"A API é para IA… todo o resto é via banco"*): leitura, escrita, fila e cópia vão direto ao Supabase, protegidas por RLS; a API entra só onde há modelo de linguagem.

## Rotas

As abas são rotas (`frontend/src/pages/consoleSections.ts`): a URL é a fonte da verdade, então refresh e botão voltar caem na mesma aba.

| Aba | Rota | Seção principal |
|---|---|---|
| Visão geral | `/console` | `components/console/DashboardSection.tsx` |
| Recomendações | `/console/recomendacoes` | `recomendacoes/RecomendacoesSection.tsx` |
| Trilhas | `/console/trilha` (editor: `/console/trilha/:id/editar`) | `trilha/TopicsManager.tsx` |
| Turmas | `/console/turmas` | `ClassManagementSection.tsx` |
| Personalizações | `/console/personalizacoes` | `personalizacoes/PersonalizacoesSection.tsx` |
| Rankings | `/console/ranks` | `RanksSection.tsx` |
| Meus dados | `/console/meus-dados` | `ProfileSection.tsx` |
| Aprovações | `/console/aprovacoes` | `ProfessorApprovalSection.tsx` (**só o dono**, `OWNER_EMAIL` em `pages/Console.tsx`) |

A moldura (barra superior, menu lateral, fundo) é `ConsoleShell.tsx`; as cores e tokens do console ficam em `styles/console-theme.css`, com escopo em `.console-shell` — por isso diálogos e selects do Radix, que renderizam em portal fora dele, recebem o tema por `data-console-theme` no `<html>`.

## De onde vêm os dados

| Tela | Lê | Escreve / dispara | Passa pela API? |
|---|---|---|---|
| **Visão geral** | views `vw_metricas_*` (`security_invoker`), `intervencoes`, presença; hooks `useTurmaKpis`, `useConteudoDaTurma`, `useEvolucaoDaTurma`, `useInsightsDaTurma`, `useSinaisDosAlunos` | aceitar/ignorar insight (`intervencoes`) | Só **gerar** insights (`POST /api/v1/insights/turma/{id}/gerar`, tem IA) |
| **Recomendações** | `intervencoes` (sugestões `pending` de **qualquer** lote, turma e escopo; as decididas nos últimos 30 dias), `alunos` (nomes); o selo do menu é um `count` das pendentes | aceitar/ignorar (com motivo) por UPDATE em `intervencoes`, só `status`, `motivo_descarte` e `resolved_at` (RLS `intervencoes_professor_upd`). Gerar sínteses novas continua sendo o "Atualizar agora" do Insights | **Não.** Com a API fora do ar a aba mostra o que a IA já gravou |
| **Falas do boss** (editor de conteúdo, em Trilhas) | `boss_falas` do conteúdo aberto (uma linha por perfil com batalha; `20261102_18`) | ligar/desligar (`ativa`) por UPDATE direto, só dessa coluna (GRANT por coluna, RLS `boss_falas_professor_upd`). Desligada, o **banco** esconde a fala do aluno (policy de leitura dele exige `ativa`) e o app cai nas falas fixas. A API religa quando escreve texto novo | **Não.** Sem a migration o painel some |
| **Sino de notificações** (cabeçalho) | `professor_notificacoes` (RLS: só as do próprio professor; `20261102_17`), Realtime + leitura a cada minuto | marcar como lida: UPDATE só de `lida_em` (GRANT por coluna). Quem grava são gatilhos do banco: sugestão pendente em `intervencoes` (um aviso por lote), resposta dissertativa em `questao_aluno` (por atividade, por dia), job de geração que termina `failed`/`partial` (por turma, por dia) e evento que passa a `encerrado`. O mesmo assunto de novo soma em `contagem` e reabre o aviso | **Não.** Sem a migration o sino some em vez de mostrar erro |
| **Trilhas** | `topicos`, `conteudos`, `atividades`, `questoes`, `cards`, `atividade_conteudos`; status das gerações em `personalizacao_jobs` | CRUD direto; **salvar já enfileira a personalização** (trigger `fn_enqueue_class_delta_job`); copiar = `duplicar_topico` / `duplicar_atividade` | Não. A geração de trilha com IA usa a **edge function** `generate-content-ai` (`mode: "trail"`), não a API |
| **Turmas** | `classe`, `classe_aluno`, `materia`, `professor_aluno` | criar/editar/excluir (`excluir_classe`), **duplicar** (`duplicar_classe`), matricular (o trigger em `classe_aluno` enfileira a personalização), presença (`registrar_presenca_da_turma`) | Não |
| **Personalizações** | `conteudo_personalizado` (status por aluno), `classe_perfil_summary`, `personalizacao_jobs`, `classe_arco_narrativo` (aba História, #145); o comparativo por perfil tenta a API e **cai no Supabase** se ela estiver fora | escrever a história da turma direto no Supabase (o gatilho do banco enfileira a regeração da turma); gerar/regerar um perfil e "reprocessar falhas", que regenera só os perfis com falha (`/jobs/manual-generate`, `/jobs/manual-retry`; escopo em [funcionamento-api-arquitetura-fluxos.md §6.6](funcionamento-api-arquitetura-fluxos.md#66-escopo-do-reprocessar-falhas-manual_retry)) | **Sim, só o que gera**: filas de geração, regenerar texto/slide. Leitura tem fallback direto |
| **Rankings** | `rank_tipo`, `ranks`, view `vw_rank_posicoes_por_classe`, `aluno_perfil` | CRUD de tipos e rankings | Não |
| **Meus dados** | `professor`, contagens de `classe`/`classe_aluno`/`topicos` | `professor` (nome, instituição, disciplina, descrição, geração automática); senha por `supabase.auth` | Não. **Excluir conta ainda não existe** (o botão avisa) |
| **Aprovações** | `professor` com `liberado = false` | aprovar (`liberado = true`) ou recusar (`DELETE`) | Não |

## Regras que costumam pegar quem chega agora

- **RLS é a autorização.** O professor vê e escreve o conteúdo das classes dele (`classe.professor_id = auth.uid()`); policies novas usam os helpers `app_classes_do_professor()` e `app_alunos_do_professor()`, nunca um `EXISTS` repetido.
- **Nada de `supabase.storage.from(...).download(...)` nem de checar `storage.objects`** para saber se um material gerado existe: a escrita nova vai só para o R2. O que o professor anexa ao conteúdo (bucket `conteudos`) é outro caminho e segue no Storage.
- **O estado vazio nunca pode parecer sucesso nem ausência.** Erro de carga mostra erro com "tentar de novo" (ver `ProfessorApprovalSection`, `TurmasErro`); não cai em "nenhum item".
- **Cópia é no banco, em transação.** Não reintroduza cópia por vários INSERT no cliente.
- **Excluir algo em cascata pede confirmação dentro da tela** (`AlertDialog`), não `window.confirm`. Restam `window.confirm` em `useTopicCrud.ts`, `useTopicGraph.ts` e `TopicsManager.tsx` (cards e questões) — dívida conhecida.

## Onde está o resto

- Análises e decisões do redesign: `docs/frontend/redesign-fase-2/` (Dashboard, jornada real, Turmas, Trilhas).
- Protótipos aprovados: `prototipos/professor/v9/`.
- Guia para o professor (não técnico): `docs/guia-do-professor.md`.
