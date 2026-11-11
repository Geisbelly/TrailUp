# Mistura de material por conteúdo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada conteúdo do tópico vir inteiro do material de um perfil representativo, distribuído pelo vetor, atrás de uma chave com alternância por tópico.

**Architecture:**
- **Mobile.** Um alocador puro (`rotaDeMaterial.ts`) decide `conteudo → perfil`. Os dois carregadores do `TrilhaContext` buscam os registros de todos os perfis da rota e filtram um por conteúdo antes da ordenação que já existe. Uma leitura de `app_config` liga a mistura, e a exposição é registrada.
- **Banco.** Uma migration troca o filtro de perfil do manifesto em `trailup_progresso_percurso`, cria as duas chaves e cria `personalizacao_exposicao`.

**Tech Stack:** Expo/React Native (TS, `node --test` via `tsx`), Supabase JS, Postgres/Alembic (Python, pytest, e2e em Postgres local).

**Spec:** `docs/superpowers/specs/2026-11-11-mistura-de-material-por-conteudo-design.md`

## Global Constraints

- Texto em PT-BR, UTF-8 sem BOM.
- Nenhum cliente escreve `percentual_concluido` nem `status` em `topico_aluno`.
- Tabela nova e policy nascem no mesmo commit.
- PR parte da `main`, nunca de branch de PR.
- A parte do banco (Tarefa 6) só começa depois da #1107 estar na `main`.
- Chaves de `app_config`:
  - `mistura_material` ∈ {`desligada`, `alternancia`}, padrão `desligada`;
  - `mistura_material_bonus_ativo` = `0.5`;
  - as duas com `publico = true`.
- Política com `alternancia`: `fnv1a("politica:" + aluno + ":" + topico) < 0.5 ? "proporcional" : "perfil_unico"`; `prob_politica` = 0,5.
- Versão do alocador: `rota-v1`.
- CI do mobile: `npm run lint`, `npm run typecheck`, `npm test` e os 5 grupos isolados. Teste novo entra em `mobile/testes/principal.txt`.
- CI da API: `ruff check .` e `pytest`.

## Review Focus

1. **O progresso chega depois da hidratação.** Se o "conteúdo iniciado" vier do estado do React, a rota pode trocar o perfil de um conteúdo já começado e zerar o progresso dele. Os iniciados vêm de uma consulta própria, antes de alocar (Tarefa 4 e teste na Tarefa 5).
2. **`usuario.perfis` vazio no primeiro render.** A rota sai só com o perfil ativo e não pode ficar presa no cache: a chave de hidratação inclui a assinatura dos pesos (Tarefa 5).
3. **Chave ausente ou erro de leitura de `app_config`.** Resultado: `desligada`, exatamente o caminho de hoje (Tarefa 4).
4. **Registro sem `conteudo_id`** (registro legado do tópico). Fica só o do perfil ativo, como hoje (Tarefa 2).
5. **Insert de exposição falhando** (tabela ainda não aplicada). Não pode quebrar o carregamento: avisa uma vez e segue (Tarefa 4).

---

### Task 1: Alocador puro

**Files:**
- Create: `mobile/src/utils/rotaDeMaterial.ts`
- Test: `mobile/src/utils/rotaDeMaterial.test.ts` (acrescentar a `mobile/testes/principal.txt`)

**Interfaces:**
- Produces:
  - `type PoliticaDaRota = 'perfil_unico' | 'proporcional'`;
  - `type ChaveDaMistura = 'desligada' | 'alternancia'`;
  - `politicaDoTopico(chave: ChaveDaMistura, alunoId: string, topicoId: number): { politica: PoliticaDaRota; probabilidade: number }`. Com `desligada`: `perfil_unico` e probabilidade 1;
  - `pesosDaRota(perfis: PerfilLike[] | null | undefined, perfilAtivo: BrainHexProfile, bonus: number): PesoDePerfil[]`: os representativos, com o ativo × (1 + bônus), normalizados. Sem representativos, `[{ perfil: perfilAtivo, peso: 1 }]`. Reusa `PesoDePerfil` de `bossFalasPorVetor.ts` se a #1110 estiver na `main`; senão define o tipo aqui;
  - `rotaDoTopico(p: { conteudos: number[]; candidatos: Map<number, BrainHexProfile[]>; pesos: PesoDePerfil[]; perfilAtivo: BrainHexProfile; politica: PoliticaDaRota; iniciados: Map<number, BrainHexProfile> }): Map<number, BrainHexProfile>`;
  - `assinaturaDaRota(politica: PoliticaDaRota, pesos: PesoDePerfil[]): string`. Formato: `rota-v1:<politica>:<perfil>=<peso com 3 casas>|...`.

- [ ] **Step 1: Write the failing tests** em `rotaDeMaterial.test.ts`:
  - `perfil_unico` atribui todo conteúdo com o ativo entre os candidatos ao perfil ativo;
  - conteúdo sem o ativo entre os candidatos fica fora do mapa.
  - Proporcional, pesos `daredevil 0,6 / survivor 0,4` e 10 conteúdos com os dois candidatos: 6 e 4.
  - Iniciado mantém o perfil e conta cadeira. Com `iniciados = {1: survivor}` e pesos 0,5/0,5 em 2 conteúdos, o conteúdo 1 fica com survivor e o 2 com o outro.
  - Acrescentar um conteúdo no fim não muda as atribuições anteriores: compara o mapa de `[1..5]` com o de `[1..6]` nos 5 primeiros.
  - Conteúdo sem candidato fica fora do mapa.
  - Empate de quociente: ganha o perfil ativo.
  - `politicaDoTopico('desligada', …)` dá `{ perfil_unico, 1 }`.
  - `politicaDoTopico('alternancia', …)` é estável na mesma entrada e dá entre 0,45 e 0,55 de `proporcional` em 2000 tópicos.
  - `pesosDaRota`:
    - com `[{nome:'seeker',afinidade:60},{nome:'survivor',afinidade:40}]`, ativo survivor e bônus 0,5: survivor = 60/120 = 0,5;
    - sem perfis: `[{ativo,1}]`.
- [ ] **Step 2: Run** `cd mobile && node --require ./scripts/stub-de-imagens.cjs --import tsx --test src/utils/rotaDeMaterial.test.ts`. Expected: FAIL (o módulo não existe).
- [ ] **Step 3: Implement.** Sainte-Laguë sequencial: para cada conteúdo, na ordem, o candidato com maior `peso / (2 × cadeiras + 1)`. No empate, o ativo e depois a ordem de `pesos`. FNV-1a de 32 bits como em `bossFalasPorVetor.ts`, sem importar dele (extrair `fracaoEstavel` para `utils/fracaoEstavel.ts` se a #1110 já estiver na `main`).
- [ ] **Step 4: Run** de novo. Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): alocador de material por conteúdo (rota-v1)`.

### Task 2: Escolha dos registros da rota

**Files:**
- Modify: `mobile/src/utils/rotaDeMaterial.ts`, `mobile/src/utils/personalization.ts` (exportar `personalizedAvailabilityScore`)
- Test: `mobile/src/utils/rotaDeMaterial.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `candidatosPorConteudo<T extends RegistroDaRota>(registros: T[], perfisDaRota: BrainHexProfile[], perfilDoRegistro: (r: T) => BrainHexProfile | null): Map<number, BrainHexProfile[]>`. Só entram os registros com `personalizedAvailabilityScore > 0`, na ordem de `perfisDaRota`;
  - `filtrarRegistrosDaRota<T>(registros: T[], rota: Map<number, BrainHexProfile>, perfilAtivo: BrainHexProfile, perfilDoRegistro: (r: T) => BrainHexProfile | null): T[]`. Mantém o registro cujo `(conteudo_id, perfil)` bate com a rota. Registro sem `conteudo_id` só entra se for do perfil ativo;
  - `type RegistroDaRota = { id?: number | null; conteudo_id?: number | null; materiais?: unknown }`.

- [ ] **Step 1: Write the failing tests:**
  - dois registros do conteúdo 10 (daredevil e survivor) e rota `10 → survivor`: fica só o de survivor;
  - registro sem `conteudo_id` de outro perfil: sai;
  - o do ativo: fica;
  - registro sem material utilizável não vira candidato.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): registros da rota, um perfil por conteúdo`.

### Task 3: Provider lê vários perfis

**Files:**
- Modify: `mobile/src/services/personalizacao/IPersonalizacaoProvider.ts`, `TrailupApiProvider.ts` (e qualquer outra implementação da interface: `grep -rn "implements IPersonalizacaoProvider"`)
- Test: `mobile/src/services/personalizacao/TrailupApiProvider.loading.test.ts`

**Interfaces:**
- Produces:
  - `listarPersonalizacoesPersistidasPerfis(params: { classeId: number; topicoId?: number; brainhexProfileKeys: string[]; limit?: number }): Promise<{ itens: PersonalizacaoRecord[] }>`, no mesmo formato da versão de um perfil. O limite vale por perfil × conteúdo (`limit × perfis`);
  - `perfilDoRegistroPersonalizado(record): BrainHexProfile | null`, exportado do provider (é o `extractProfileKeyFromPersonalizacaoRecord` atual).
- Implementação:
  - a mesma paginação de hoje, com `.in('brainhex_profile_key', perfis)` só como pré-filtro de servidor;
  - o filtro no cliente continua, porque o perfil de registro legado pode estar no plano;
  - os cards são lidos por perfil, como hoje.

- [ ] **Step 1: Write the failing tests:**
  - com registros seeker, survivor e mastermind e `brainhexProfileKeys: ['seeker','survivor']`, vêm 2;
  - registro legado com o perfil só no plano entra;
  - perfil inválido rejeita com `/Perfil/`.
- [ ] **Step 2: Run** o arquivo de teste. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): provider lê o material de vários perfis`.

### Task 4: Chave, iniciados e exposição (Supabase)

**Files:**
- Create: `mobile/src/services/personalizacao/misturaMaterial.ts`
- Test: `mobile/src/services/personalizacao/misturaMaterial.test.ts`

**Interfaces:**
- Produces:
  - `lerConfigDaMistura(client): Promise<{ chave: ChaveDaMistura; bonus: number }>`. Lê `app_config` das 2 chaves. Valor desconhecido, ausência ou erro: `{ desligada, 0.5 }`;
  - `lerConteudosIniciados(client, alunoId: string, classeId: number, registros: { id: number; conteudo_id: number | null; perfil: BrainHexProfile | null }[]): Promise<Map<number, BrainHexProfile>>`. Faz `personalizacao_item_progresso` com `.in('personalizacao_id', ids)`; iniciado = `percentual_concluido > 0` ou `status` diferente de `nao_iniciado`. Erro: mapa vazio e aviso;
  - `registrarExposicao(client, linhas: ExposicaoLinha[]): Promise<void>`. `upsert` com `onConflict: 'aluno_id,conteudo_id,perfil,politica'` e `ignoreDuplicates: true`. Erro: `console.warn` uma vez por sessão, sem lançar;
  - `type ExposicaoLinha = { aluno_id; classe_id; topico_id; conteudo_id; perfil; politica; prob_politica; pesos; versao_alocador }`.

- [ ] **Step 1: Write the failing tests** com um cliente falso:
  - chave `alternancia` e bônus `'0.8'` dão `{alternancia, 0.8}`;
  - erro, `null` ou valor `'xyz'` dão `{desligada, 0.5}`;
  - iniciados: linha com percentual 0 e status `nao_iniciado` não conta; percentual 10 conta;
  - exposição: erro não lança, e o aviso sai uma vez em duas chamadas.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(mobile): chave da mistura, conteúdos iniciados e registro de exposição`.

### Task 5: Ligar no TrilhaContext

**Files:**
- Modify: `mobile/src/context/TrilhaContext.tsx` (`hydratePersonalizedTopics`, cerca de 1185; `ensureTopicoPersonalizado`, cerca de 1276; leitura de progresso por item, cerca de 1673)
- Create: `mobile/src/utils/rotaDoTopicoResolver.ts`
- Test: `mobile/src/utils/rotaDoTopicoResolver.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `resolverRegistrosDoTopico<T>(p: { registros: T[]; topico: { id: number; conteudos?: { id: number; ordem?: unknown }[] }; alunoId: string; classeId: number; perfilAtivo: BrainHexProfile; perfis: PerfilLike[] | null | undefined; config: { chave: ChaveDaMistura; bonus: number }; iniciados: Map<number, BrainHexProfile>; perfilDoRegistro: (r: T) => BrainHexProfile | null }): { registros: T[]; exposicoes: ExposicaoLinha[]; assinatura: string }`.
  - Com `perfil_unico`, devolve os registros do ativo, como hoje, e `exposicoes` só se a chave for `alternancia`.

Mudanças no `TrilhaContext`:
- Um `useEffect` lê `lerConfigDaMistura` uma vez por turma e guarda num `ref` e num estado.
- Quando `chave === 'desligada'`, **nenhum caminho muda**: a chamada continua `listarPersonalizacoesPersistidasPerfil`.
- Com `alternancia`:
  - os dois carregadores chamam `listarPersonalizacoesPersistidasPerfis` com `brainhexProfileKeys` = os perfis de `pesosDaRota`;
  - depois buscam `lerConteudosIniciados` e passam os registros de cada tópico por `resolverRegistrosDoTopico` antes de `orderPersonalizationRecordsByTeacherContent`;
  - por fim chamam `registrarExposicao` sem `await` bloqueante.
- O `hydrationKey`, a chave de `personalizationAttemptedRef` e o 3º argumento de `persistPersonalizedTopicsCache` passam a usar `perfilDaRotaChave = chave === 'desligada' ? activeProfileKey : \`${activeProfileKey}|${assinaturaDaRota(…)}\``.
- A leitura de ids para progresso por item usa `.in('brainhex_profile_key', perfisDaRota)` com a mistura ligada.

- [ ] **Step 1: Write the failing tests** de `resolverRegistrosDoTopico`:
  - com a chave `desligada` e registros de 2 perfis, devolve só os do ativo e `exposicoes = []`;
  - com `alternancia`, num tópico cuja política sorteada é `proporcional` (achar por busca no teste um `topicoId` que dê `proporcional`), devolve registros dos dois perfis e uma exposição por conteúdo com `prob_politica 0.5`;
  - um conteúdo iniciado em survivor fica em survivor mesmo com peso 0,9 do outro;
  - com `perfis = []`, o resultado é igual ao de `perfil_unico`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** o resolver e as mudanças no `TrilhaContext` descritas acima.
- [ ] **Step 4: Run** `npm run lint && npm run typecheck && npm test` e `npm run test:social-chat`, `test:class-selection`, `test:engagement`, `test:presence` e `test:trail-resume`. Expected: 0 erros de lint (só os 8 avisos que já existem na `main`), typecheck limpo, 0 falhas.
- [ ] **Step 5: Commit** `feat(mobile): trilha monta a rota por conteúdo quando a mistura está ligada`. Abrir o PR do mobile.

### Task 6: Banco (só depois da #1107 na `main`)

**Files:**
- Create: `api/alembic/versions/20261111_0N_mistura_material_por_conteudo.py`, com `down_revision` = a cabeça da `main` (conferir `alembic heads`)
- Test: `api/tests/test_mistura_material_por_conteudo.py`

**Interfaces:**
- Consumes: `app_perfis_representativos(uuid)` (#1107) e `percurso_novo()` de `20261110_09`.
- Produces:
  - `trailup_progresso_percurso` com o filtro de manifesto trocado;
  - as chaves de `app_config`;
  - a tabela `personalizacao_exposicao` com RLS e policies.

Conteúdo da migration:
- **Progresso.** Pega `percurso_novo()` da `20261110_09` e troca `ANTES = "AND cp.brainhex_profile_key=al.perfil_ativo AND cp.aprovacao='aprovado'\n    ORDER BY"` (só no CTE `manifestos`) por `(cp.brainhex_profile_key=al.perfil_ativo OR cp.brainhex_profile_key = ANY (public.app_perfis_representativos(p_aluno))) AND cp.aprovacao='aprovado'`. Se casar zero ou mais de uma vez, levanta `RuntimeError`. O ramo legado fica igual.
- **Chaves.** `INSERT ... ON CONFLICT (chave) DO NOTHING` das duas chaves com `publico = true`.
- **Tabela.** Colunas da spec, com PK `(aluno_id, conteudo_id, perfil, politica)` e CHECK de `politica` e `perfil` (os 7).
- **RLS e policies.** Policy `INSERT` e `SELECT` do aluno (`aluno_id = auth.uid()`), `SELECT` do professor (`classe_id IN (SELECT public.app_classes_do_professor())`), e `GRANT SELECT, INSERT` a `authenticated`.
- **Downgrade.** Devolve `percurso_novo()` original e remove a tabela e as chaves.

- [ ] **Step 1: Write the failing tests:**
  - estrutura: a troca casou uma vez, o ramo legado ainda tem `cp.brainhex_profile_key=al.perfil_ativo`, existem as policies e o downgrade devolve o corpo da `_09`;
  - e2e (`f5.e2e`, Postgres local, com `20261110_09` e `20261111_01` aplicadas antes):
    - rota com conteúdo 1 em seeker e conteúdo 2 em survivor, ativo seeker: `total` conta os dois;
    - manifesto antigo de seeker no conteúdo 2, mais velho que o de survivor: não conta;
    - perfil ativo fora dos representativos (conta de demonstração): conta;
    - exposição: o aluno insere a própria linha, não lê a de outro, e não insere linha com `aluno_id` de outro.
- [ ] **Step 2: Run** `pytest tests/test_mistura_material_por_conteudo.py` com `TRAILUP_E2E_RETENCAO_DATABASE_URL`. Expected: FAIL.
- [ ] **Step 3: Implement** a migration.
- [ ] **Step 4: Run** `ruff check .`, `pytest` e o arquivo novo com o DSN de e2e. Expected: PASS (as 21 falhas antigas de bucket, retenção e fuso continuam iguais).
- [ ] **Step 5: Commit** e abrir o PR do banco, dizendo que a migration não foi aplicada e que a chave só deve ser ligada depois da migration e do build novo.
