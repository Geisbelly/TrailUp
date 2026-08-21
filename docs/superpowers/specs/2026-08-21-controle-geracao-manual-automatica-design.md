# Controle de geração automática/manual de personalização — Design

## Contexto

Hoje, toda edição de conteúdo/tópico no console do professor (`ContentsManager.tsx`,
`TopicsManager.tsx`) dispara automaticamente um job `class_delta_sync`, que gera
(ou atualiza) a personalização para os 7 perfis BrainHex de todos os alunos da
turma. Isso já causou dois bugs consecutivos nesta mesma sessão (escopo largo
demais e dedup que engolia pedidos de tópicos diferentes — PRs #89 e #90) e
consome tokens de LLM/TTS a cada pequena edição, mesmo quando o professor só
queria ajustar um detalhe.

O professor quer poder desligar esse disparo automático e, no lugar, acionar a
geração manualmente: um botão "gerar" por combinação tópico/conteúdo × perfil
na aba de personalização, e um botão "gerar tudo" que roda todos os tópicos de
uma turma para um perfil escolhido.

## Decisões (via brainstorming)

1. **Escopo do toggle: global por professor**, não por turma. Um único
   interruptor na conta do professor afeta todas as turmas dele.
2. **Em modo manual, os disparos automáticos são totalmente suprimidos** —
   nenhuma edição de tópico/conteúdo enfileira geração sozinha; o professor
   sempre aciona via botão.
3. **O toggle mora na aba "Meus Dados"** (`ProfileSection.tsx`), junto de
   outras preferências de conta já existentes ali.
4. **O toggle NÃO afeta matrícula (aluno novo) nem limpeza (aluno removido)**
   — esses jobs continuam sempre automáticos, independente do modo. Só os
   disparos ligados a edição de conteúdo/tópico (`class_delta_sync`) são
   controlados pelo toggle.
5. **A suspensão é garantida no backend**, não no frontend — `enqueue_
   personalizacao_job` recusa jobs `class_delta_sync` quando o professor dono
   da turma está em modo manual. Isso protege mesmo se o frontend tiver bug
   ou build desatualizado; o frontend não precisa saber do toggle para isso
   funcionar (ele pode continuar chamando os mesmos endpoints de sempre).
6. **Os dois botões manuais ("gerar" individual e "gerar tudo") sempre usam a
   lógica de "só preenche o que falta"** — a mesma checagem por `source_hash`
   que já existe hoje (`buscar_mais_recente_por_perfil` +
   `_has_completed_current_generation`). Nenhuma lógica de dedup nova é
   necessária; os dois botões só precisam existir como *kinds* de job
   separados de `class_delta_sync`, para não caírem no portão do item 5.
7. **Progresso visível na própria aba de personalização** — depois de clicar
   em "gerar" ou "gerar tudo", o professor vê X/Y alvos concluídos e erros
   perto do botão clicado, sem precisar trocar de aba.

## Modelo de dados

Nova coluna na tabela `professor` (mesmo padrão de booleans "flat" que já
existe ali — `liberado`, `termos_aceitos`):

```sql
ALTER TABLE professor
  ADD COLUMN geracao_automatica boolean NOT NULL DEFAULT true;
```

Migration Alembic nova. Default `true` preserva o comportamento atual para
todo professor existente — ninguém perde geração automática sem escolher
isso explicitamente.

## Backend

### Dois novos job kinds

Distintos de `class_delta_sync`, para que o portão do item 5 não precise de
nenhuma flag de bypass — ele simplesmente não olha para esses kinds:

- `manual_profile_generate` — um tópico/conteúdo × um perfil específico.
- `manual_profile_generate_all` — todos os tópicos de uma turma × um perfil
  específico.

### Filtro de perfil em `_build_targets`

`_build_targets` (`api/app/services/personalizacao_jobs.py:661`) hoje sempre
itera `_BRAINHEX_PROFILE_KEYS` (os 7 perfis) para os kinds
`ENROLLMENT`/`CLASS_DELTA`/`FULL_SYNC`/`MANUAL_RETRY`. Ganha um parâmetro
opcional `brainhex_profile_keys: list[str] | None`; quando informado,
substitui a lista completa pela lista filtrada. `enqueue_personalizacao_job`
passa esse parâmetro adiante; os dois kinds novos sempre o preenchem com
`[perfil_escolhido]`.

### Portão de modo manual

`enqueue_personalizacao_job`, quando `kind == JOB_KIND_CLASS_DELTA`: resolve
`professor_id` a partir de `classe_id` (`SELECT professor_id FROM classe
WHERE id = :classe_id` — já existe uma consulta equivalente em
`AccessRepository.professor_owns_classe`, `api/app/repositories/access.py:72`)
e lê `geracao_automatica` da tabela `professor`. Se `false`, a função retorna
sem criar job nem targets — algo como
`{"skipped": true, "reason": "geracao_manual_ativa"}` — em vez de lançar
erro (o professor pode continuar editando normalmente; a UI só não verá um
job novo aparecer).

Outros kinds (`ENROLLMENT`, `CLEANUP`, `MANUAL_RETRY`, `FULL_SYNC`,
`CLASS_THEME`, e os dois novos `manual_profile_generate*`) não passam por
esse portão — item 4 e 6 da lista de decisões.

### Endpoints novos

- `POST /api/v1/personalizar/jobs/manual-generate`
  Body: `{classe_id, topico_id, conteudo_id?, brainhex_profile_key}`.
  Cria um job `manual_profile_generate` escopado a exatamente esse alvo.

- `POST /api/v1/personalizar/jobs/manual-generate-all`
  Body: `{classe_id, brainhex_profile_key}`.
  Cria um job `manual_profile_generate_all`, escopado a todos os tópicos da
  turma, só para o perfil informado (usa o mesmo fallback "sem
  topico_ids explícitos → todos os tópicos da turma" que `_build_targets` já
  tem para outros kinds, linha 698-699).

### Preferência do professor

Endpoint (extensão do que já persiste "Meus Dados", ou um novo `PATCH
/api/v1/professor/preferencias`) para ler/gravar `geracao_automatica`. O
detalhe exato de onde plugar isso fica para o plano de implementação, que vai
ler `ProfileSection.tsx` e o backend correspondente antes de decidir.

## Frontend

### Toggle em "Meus Dados"

`frontend/src/components/console/ProfileSection.tsx` — novo `Switch` (já
existe em `src/components/ui/switch.tsx`, componente do design system, não
precisa ser criado) rotulado "Geração automática de personalização", com uma
descrição curta explicando a troca ("quando desligado, você precisa clicar em
'gerar' na aba Personalizações para cada conteúdo"). Persiste via o mesmo
fluxo de salvar que os outros campos dessa tela já usam.

### Botão "Gerar" por card de perfil

`frontend/src/components/console/personalizacoes/PersonalizacoesSection.tsx`,
aba `por-perfil` (linha ~527-596), componente `PerfilMaterialCard` (linha
~866+) — hoje só mostra status e link de preview, sem nenhum trigger de
geração. Ganha um botão "Gerar" que chama o novo endpoint
`manual-generate` com `classe_id`/`topico_id`/`conteudo_id` já selecionados
na barra de filtro da aba + o perfil daquele card específico.

Novo helper em `personalizacoesApi.ts` (mesmo padrão de
`regenerarDocumentoPersonalizacao`, linha ~403+) para chamar esse endpoint.

### Controle "Gerar tudo"

Novo bloco na aba `por-perfil`, perto da barra de seleção de turma já
existente: um `Select` com os 7 perfis BrainHex + botão "Gerar tudo para
[perfil]". Chama `manual-generate-all` com `classe_id` + o perfil escolhido.

### Indicador de progresso

Depois de qualquer um dos dois cliques, guarda o `job_id` retornado e faz
polling do status do job (mesmo padrão já usado em
`frontend/src/components/console/trilha/TopicsManager.tsx` para
`recentJobs`/`listPersonalizacaoJobs`) — mostra "X/Y concluído" + contagem de
erros perto do botão clicado, até o job atingir status terminal
(`completed`/`partial`/`failed`).

## Fora de escopo (YAGNI)

- Não existe um botão "gerar tudo para todos os perfis de uma vez" — o
  professor escolhe um perfil por vez, como pedido explicitamente.
- O toggle não é por turma nem por sessão — é uma preferência de conta,
  simples de entender e de reverter.
- Nenhuma UI nova para configurar exceções (ex.: "manual para esta turma,
  automático para aquela") — fora do que foi pedido.
