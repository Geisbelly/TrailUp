# Base por perfil sem aluno — design

**Data:** 2026-08-27
**Status:** aprovado, aguardando plano de implementação

## O problema

Gerar conteúdo personalizado numa turma sem aluno matriculado não produz nada. O
console mostra `0/0` e o job termina `completed` sem erro — o pior tipo de
falha, porque parece sucesso.

A causa não é um bug pontual. Em `_build_targets`
(`api/app/services/personalizacao_jobs.py`), todo alvo de geração nasce de
`classe_aluno`:

```python
alunos_da_classe = await classe_repo.listar_alunos_classe_com_perfil_dominante(classe_id)
...
if not alunos:
    return [], resolved_topicos, {}
```

Sem aluno, lista vazia; job com zero target; worker não acha o que fazer e
fecha. Medido em produção: a turma 54 ("SPD - 3N 2026/2") tem 5 tópicos, 2
conteúdos e **0 matriculados**, e seus três jobs de geração manual saíram com
`total_targets = 0`. A turma 32, com 1 aluno, gera normalmente.

## O que já é verdade no código

O `CLAUDE.md` descreve duas camadas de personalização: uma **base por perfil**,
compartilhável por `(classe × tópico × perfil BrainHex)`, e uma **adequação por
aluno** por cima dela. A base já existe na prática — só não tem onde morar.

Hoje ela é simulada elegendo um aluno representante por perfil e marcando a
linha com `is_profile_template`. O próprio worker trata essa linha como *não
sendo* material de aluno:

```python
# "essa geracao e a base compartilhada por perfil (sem plano do
#  planejador_conteudo.txt, que so roda no fluxo por aluno)"
...
if not bool(target.get("is_profile_template")):
    await _seed_progress(session=session, record=record)
```

Ou seja: numa linha de template, o `aluno_id` **já é vestigial**. Ele não semeia
progresso, não representa consumo, não é daquele aluno. Serve de cabide, porque
a coluna é `NOT NULL`.

Este design tira o cabide.

## Decisão

`aluno_id` passa a aceitar `NULL` nas tabelas de **artefato**, e `NULL` significa
*"base da classe para este perfil"*.

A linha de corte é entre artefato e comportamento:

| tabela | `aluno_id` | por quê |
| --- | --- | --- |
| `conteudo_personalizado` | passa a **nullable** | artefato |
| `personalizacao_job_targets` | passa a **nullable** | artefato |
| `materiais_gerados` | passa a **nullable** | artefato |
| `cards_personalizados` | passa a **nullable** | artefato |
| `personalizacao_item_progresso` | continua `NOT NULL` | comportamento é de gente |
| `personalizacao_sugestao` | continua `NOT NULL` | comportamento é de gente |

`atividades_personalizadas` e `questoes_personalizadas` não têm a coluna e não
são afetadas.

As duas que ficam `NOT NULL` já são puladas pelo worker quando o target é
template, então a regra nova não contradiz o código atual — ela o descreve.

### O que acontece com `is_profile_template`

A coluna **permanece**, e passa a ser exatamente equivalente a `aluno_id IS NULL`:
toda linha base é template, nenhuma linha de aluno é. Ela é mantida porque
`personalizacao_jobs.py`, o repositório e o schema já a leem, e trocar isso por
`aluno_id IS NULL` em todos os pontos seria refactor sem ganho.

Ela deixa de significar o que significa hoje ("material de um perfil pendurado
num aluno de outro perfil"). Depois desta mudança, essa situação não existe mais:
material de perfil que não é de ninguém é base, e base não tem dono.

### Alternativas descartadas

**Tabela nova `conteudo_base_perfil`.** Separação conceitual mais limpa e risco
zero às linhas atuais. Descartada pelo custo: `materiais_gerados`,
`cards_personalizados`, o merge do microservice (`mergePersonalizacaoMateriais`)
e o BrainHexPDF apontam todos para `conteudo_personalizado.id`. Seria um segundo
caminho paralelo para a mesma maquinaria de mídia, com dois lugares para toda
correção futura.

**Aluno sintético por turma.** Barato de implementar e caro para sempre: mete uma
entidade que não é gente em `alunos`, ranking, contagens, RLS e telemetria. Troca
uma dívida de schema localizada por uma que sangra em todo lugar.

## Modelo

### Unicidade — o ponto que mais pode morder

Índice único trata `NULL` como distinto. As unique keys atuais são todas
ancoradas em `aluno_id`:

```
uq_conteudo_personalizado_aluno_topico_conteudo_perfil
  (aluno_id, topico_id, conteudo_id, brainhex_profile_key)
  WHERE topico_id IS NOT NULL AND conteudo_id IS NOT NULL

uq_conteudo_personalizado_aluno_topico_perfil_sem_conteudo
  (aluno_id, topico_id, brainhex_profile_key)
  WHERE topico_id IS NOT NULL AND conteudo_id IS NULL
```

Com `aluno_id` nulo, duas bases idênticas passariam pelas duas — cada `NULL` é
único. A base duplicaria **em silêncio**, e a duplicata só apareceria depois,
como material repetido no console.

Portanto:

1. Restringir os índices atuais a `aluno_id IS NOT NULL`, tornando explícito que
   eles governam a camada por aluno.
2. Criar os pares para a base, chaveados em `classe_id` no lugar do aluno:
   - `(classe_id, topico_id, conteudo_id, brainhex_profile_key) WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NOT NULL`
   - `(classe_id, topico_id, brainhex_profile_key) WHERE aluno_id IS NULL AND topico_id IS NOT NULL AND conteudo_id IS NULL`
3. Mesmo tratamento em `uq_job_target_legado`
   (`job_id, aluno_id, topico_id, conteudo_id, brainhex_profile_key`
   `WHERE media_kind IS NULL`), senão o dedup de target deixa de funcionar
   justamente para a base.

Todo `ON CONFLICT` sobre esses índices precisa **repetir o predicado** — sem isso
o Postgres não casa o índice parcial e levanta "no unique or exclusion
constraint matching" (convenção já registrada no `CLAUDE.md`).

## Geração de targets

`_build_targets` perde o early-return por ausência de aluno. Para os kinds de
geração, ele passa a emitir sempre **7 targets base** por `(tópico × conteúdo)`,
um por perfil BrainHex, com `aluno_id = NULL` — independentemente de matrícula.

O trigger `fn_enqueue_class_delta_job` (migration `20260827_03`) recebe o mesmo
tratamento. Hoje ele monta a CTE `representante` a partir de `classe_aluno` e
filtra `WHERE r.aluno_id IS NOT NULL`; passa a emitir os 7 perfis direto, sem
depender da turma ter gente.

Consequência desejada: a geração manual numa turma vazia passa a ter
`7 × (tópicos × conteúdos)` targets, e o `0/0` deixa de existir.

### Turma COM alunos: o que muda

Os 7 targets base passam a existir **sempre**, inclusive em turma cheia — a base
não é um modo de contingência para turma vazia, é a camada de baixo. O que muda
para uma turma com alunos é que os targets de geração deixam de eleger um aluno
representante por perfil: a geração pesada acontece uma vez, na base, e o
material do aluno passa a ser derivado dela (seção seguinte), não gerado do zero.

Efeito colateral bem-vindo: hoje, 30 alunos do mesmo perfil podem disparar 30
gerações do mesmo material se caírem em jobs diferentes. Com a base, é uma
geração e 30 derivações.

## Derivação por aluno

Continua no job `enrollment`, na API.

Ao matricular, o job deixa de gerar do zero e passa a **copiar da base** do
perfil dominante do aluno, aplicando a adequação por cima (preferências, emoção,
`ai_patch`). Se a base ainda não existir para aquele `(tópico, conteúdo, perfil)`,
o `enrollment` enfileira a geração da base antes de derivar.

> **Risco aceito, registrado a pedido:** essa etapa depende da API estar de pé.
> Foi a opção escolhida por reaproveitar o job que já existe, mas é a mesma
> classe de acoplamento que derrubou o console quando a API caiu. Se isso
> incomodar depois, a alternativa é um trigger em `classe_aluno` — copiar linha
> não é IA e caberia no banco pela regra de fronteira.

## RLS

**Nenhuma policy nova é necessária**, e isso é a evidência mais forte de que a
decisão encaixa no desenho existente. As policies de professor já são por classe,
não por aluno:

- `professor_all_conteudo_personalizado` → `classe_id` → professor
- `professor_all_cards_personalizados` → `classe_id` → professor
- `professor_all_materiais_gerados` → `conteudo_id → topicos → classe`

E a do aluno é `auth.uid() = aluno_id`, que com `aluno_id` nulo avalia para NULL
e **não** casa: o aluno não enxerga a base, que é o comportamento desejado, de
graça.

`personalizacao_job_targets` não tem policy nenhuma e não é lida por cliente.

### Correção incluída no escopo

`professor_all_materiais_gerados` exige `conteudo_id`, mas material de nível
tópico grava `conteudo_id` nulo (o microservice escreve
`conteudo_id: data.conteudo_id ?? null`). Hoje o professor **já** não enxerga
essas linhas. É lacuna preexistente, mas a base por tópico vai torná-la comum,
então entra: a policy passa a aceitar também o caminho por `personalizacao_id →
conteudo_personalizado.classe_id`.

## Dados existentes

As linhas atuais com `is_profile_template = true` **não** são promovidas para
base. Promover (`aluno_id → NULL`) colidiria com a unique nova sempre que dois
alunos representantes diferentes tivessem gerado a mesma combinação
`(classe, tópico, conteúdo, perfil)` — e resolver essas colisões exigiria
escolher qual material sobrevive, decisão que não dá para tomar em migração.

Elas ficam como estão, servindo os alunos que já as consomem. A base nasce no
próximo ciclo, via bump de `_PERSONALIZACAO_PIPELINE_VERSION`.

## Testes

- **Migração:** cadeia do alembic íntegra; índices parciais criados com o
  predicado correto; `aluno_id` nullable nas 4 tabelas e ainda `NOT NULL` nas 2
  de comportamento.
- **Unicidade:** inserir a mesma base duas vezes viola a unique nova (é o teste
  que protege contra a duplicação silenciosa descrita acima).
- **`_build_targets`:** turma com 0 alunos produz 7 targets base por
  `(tópico × conteúdo)`; turma com alunos continua produzindo o que produzia.
- **Trigger:** salvar tópico em turma vazia (com `geracao_automatica` ligada)
  cria job com targets, não `0/0`.
- **Derivação:** `enrollment` copia da base e não regenera; sem base, enfileira.
- **RLS:** professor lê a base da própria classe; aluno não lê base nenhuma;
  professor passa a enxergar material de nível tópico em `materiais_gerados`.
- **Regressão:** o caminho por aluno existente continua idêntico.

## Fora de escopo

- Deduplicar as linhas por aluno que hoje repetem material do mesmo perfil.
  A decisão de leitura foi manter linha própria por aluno; a economia de
  armazenamento fica para depois, se virar problema.
- Mover a derivação para trigger no banco (ver risco registrado acima).
