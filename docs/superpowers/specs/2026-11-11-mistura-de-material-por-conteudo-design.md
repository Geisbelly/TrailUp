# Mistura de material por conteúdo (fase 2 do roteiro de diversidade de perfis)

Data: 2026-11-11. Roteiro: `reports/Diversidade de perfis BrainHex.md` (fora do repo), fases 0 a 5.

## O problema

O aluno vê **todo** o material personalizado de um perfil só: o perfil da tela
(`perfilVisualDoAluno`). Isso vale mesmo para quem tem um vetor quase plano. Os 6 vetores de
produção de 11/11 têm o 1º e o 2º perfil a 1–4 pontos de distância, e mesmo assim o 2º nunca
aparece no material. A base dos perfis representativos já é gerada (#873, e a #1107 completa
com o 3º). Falta o aluno ver mais de uma.

## Decisões tomadas (11/11, pela autora)

1. **A mistura é por conteúdo.** Cada conteúdo do tópico vem inteiro de um perfil: texto, áudio,
   slides e cards com a mesma voz. A mistura por formato, proposta do relatório, fica de fora.
2. **Quem escolheu o perfil ativo também entra na mistura.** O perfil escolhido continua pintando
   a tela (cor, guardião, ícone) e ganha peso extra na distribuição do material.
3. **A mistura entra por chave, com alternância.** Desligada por padrão. Ligada, cada aluno
   alterna por tópico entre `perfil_unico` (o de hoje) e `proporcional`, por sorteio fixo, e a
   política fica registrada. Isso permite comparar dentro do mesmo aluno e não contamina o
   estudo de coorte #13.

## O que já existe (medido em 11/11)

- **RLS.** O aluno já lê todo registro compartilhado (`aluno_id IS NULL`) e aprovado das turmas
  dele, **de qualquer perfil** (`aluno_classe_conteudo_personalizado_sel` mais as restritivas de
  aprovação, tópico publicado e estudo). Não muda.
- **Manifesto.** `personalizacao_percurso` tem uma linha por aluno × registro. O app regrava o
  manifesto (`updated_at`) a cada montagem do tópico (`seedPersonalizedProgress`).
- **Progresso.** `trailup_progresso_percurso` pega o manifesto **mais recente** de cada conteúdo
  (`DISTINCT ON (topico_id, conteudo_id) … ORDER BY updated_at DESC`), filtrado por
  `brainhex_profile_key = perfil_ativo` e `aprovacao = 'aprovado'`.
- **Aprovação.** Desde a `20261110_09`, o professor aprova cada registro. Registro pendente não
  chega ao aluno nem conta no progresso.
- **Missão.** A diária é por turma desde 03/11 (`20261103_04`), sem perfil. Por isso a fase 4
  ficou obsoleta, e esta fase não mexe em missão.

## Desenho

### 1. Chave e política

`app_config`:

- `mistura_material` (`desligada` | `alternancia`), padrão `desligada`, `publico = true`. É um
  parâmetro de UI que o app precisa ler, não um teto anti-abuso. Marcar como público é decisão
  registrada aqui.
- `mistura_material_bonus_ativo` (número), padrão `0.5`, `publico = true`. O peso do perfil
  ativo é multiplicado por `1 + bônus`.

Com `alternancia`, a política do par aluno × tópico é
`fnv1a("politica:" + aluno + ":" + topico) < 0.5 ? "proporcional" : "perfil_unico"`. A
probabilidade fica registrada (0,5). Com `desligada`, ou em app antigo, que nem lê a chave, a
política é sempre `perfil_unico`: o comportamento de hoje.

### 2. Alocador (mobile, função pura)

`rotaDoTopico({ conteudos, candidatos, pesos, perfilAtivo, bonus, iniciados })` devolve
`conteudo_id → perfil` e é escrito em `mobile/src/utils/rotaDeMaterial.ts`.

- **`conteudos`:** a ordem do tópico (`ordem`, depois `id`).
- **`candidatos[conteudo]`:** os perfis representativos que têm, para aquele conteúdo, um registro
  aprovado e com material utilizável.
- **`pesos`:** a afinidade dos representativos (`resolveRepresentativeBrainHexProfiles`), com o
  perfil ativo multiplicado por `1 + bônus`.
- **`iniciados[conteudo]`:** o perfil do registro em que o aluno já tem progresso naquele conteúdo
  (`personalizacao_item_progresso` com percentual > 0 ou status diferente de `nao_iniciado`).
  **Conteúdo iniciado não troca de perfil**, porque trocar zeraria o progresso dele. O conteúdo
  iniciado conta como uma "cadeira" do perfil dele.
- **Distribuição:** Sainte-Laguë sequencial na ordem do tópico. Cada conteúdo não iniciado vai
  para o candidato com maior `peso / (2 × cadeiras + 1)`. No empate, ganha o perfil ativo e depois
  a ordem do vetor.
  - A distribuição é sequencial, então acrescentar um conteúdo no **fim** do tópico não muda as
    atribuições anteriores.
  - Inserir um conteúdo no meio, ou uma aprovação nova mudar os candidatos, pode mudar as
    atribuições seguintes, mas só das que ainda não foram iniciadas.
- **Conteúdo sem candidato:** fica com o material do professor, como hoje.
- **Política `perfil_unico`:** todo conteúdo vai para o perfil ativo, como hoje.

### 3. Leitura no app

- **Provider.** `listarPersonalizacoesDaRota` busca os registros dos perfis da rota com
  `.in('brainhex_profile_key', perfis)`, numa consulta só. A filtragem que hoje é feita no cliente
  fica igual. Depois entrega um registro por conteúdo, o do perfil atribuído.
- **`TrilhaContext`.**
  - `activeProfileKey` continua sendo o tema.
  - As chaves de cache da personalização ganham a assinatura da rota
    (`rota-v1:<política>:<perfis>`).
  - A leitura do progresso por item passa a usar os perfis da rota, e não só o ativo.
  - O pedido de mídia faltante usa o perfil **do registro**.
- **Manifesto.** Nada novo. Ele já é por registro, então uma rota com registros de perfis
  diferentes grava um manifesto por registro, e o mais recente de cada conteúdo é a rota atual.

### 4. Progresso (banco, depois da #1107)

`trailup_progresso_percurso`, ramo do manifesto: o filtro
`cp.brainhex_profile_key = al.perfil_ativo` passa a ser
`(cp.brainhex_profile_key = al.perfil_ativo OR cp.brainhex_profile_key = ANY (app_perfis_representativos(p_aluno)))`.

- O `perfil_ativo` continua no filtro por causa da conta de demonstração, que escolhe entre os 7.
- O ramo legado, de cliente sem manifesto, fica com o `perfil_ativo`.
- **Decisão 5 preservada:**
  - o denominador continua sendo só o material personalizado aprovado que a rota mostra;
  - quando não há personalização, volta a ser o material do professor;
  - nenhum cliente escreve `percentual_concluido`.
- Por que o "mais recente por conteúdo" basta: a troca de política, de perfil ou de chave faz o
  app regravar o manifesto da rota nova, e o `DISTINCT ON` já descarta o anterior.

A troca é feita com o padrão das migrations anteriores: a função é lida da `20261110_09`, e a
troca precisa casar exatamente 1 vez, ou a migration para.

### 5. Registro de exposição

Tabela `personalizacao_exposicao`, append-only, criada com RLS e policy no mesmo commit:

| coluna | |
| --- | --- |
| `aluno_id` uuid, FK `alunos` `ON DELETE CASCADE` | |
| `classe_id`, `topico_id`, `conteudo_id` bigint | |
| `perfil` text | o perfil atribuído |
| `politica` text (`perfil_unico` \| `proporcional`) | |
| `prob_politica` numeric | 0,5 com `alternancia` |
| `pesos` jsonb | os pesos usados, já com o bônus |
| `versao_alocador` text | `rota-v1` |
| `primeira_vez` timestamptz, default `now()` | |

- **PK:** `(aluno_id, conteudo_id, perfil, politica)`. O app grava com `ON CONFLICT DO NOTHING`.
- **Policies:**
  - o aluno insere e lê só as próprias linhas (`aluno_id = auth.uid()`);
  - o professor lê as das turmas dele (`classe_id IN (SELECT app_classes_do_professor())`);
  - ninguém altera nem apaga pelo cliente.
- **Retenção:** segue a do aluno (cascade).

### 6. Ordem de entrada

1. A #1107 é mesclada e aplicada.
2. O PR do banco (progresso, chaves e exposição) é aplicado.
3. O PR do app sai num build novo. App antigo continua em `perfil_unico`.
4. O professor aprova as bases dos perfis representativos. Sem aprovação, o perfil não entra
   como candidato.
5. A autora liga `mistura_material = 'alternancia'`.

## Riscos

- **Carga de aprovação.** O professor passa a aprovar a base de 2 ou 3 perfis por tópico. Sem
  aprovar, a mistura não acontece, mas nada quebra.
- **Mudança de rota antes de iniciar.** Uma aprovação nova pode trocar o perfil de um conteúdo
  ainda não aberto. É aceitável, porque o aluno não perde nada.
- **`block.id` de perfis diferentes.** Não importa aqui: há um registro por conteúdo.
- **Monografia.** Esta fase não afirma efeito. A medição é do mecanismo.

## Medição

Por aluno × tópico, comparando as duas políticas dentro do mesmo aluno:

- cobertura (perfis expostos / representativos);
- entropia da exposição;
- `share_top`, com alerta acima de 0,8 na política proporcional;
- JS(p_alvo, exposição).

Os dados saem de `personalizacao_exposicao` mais o progresso por item.

## Testes

- **Alocador (unidade):**
  - perfil único = comportamento de hoje;
  - proporção em tópico longo;
  - conteúdo iniciado não troca;
  - acrescentar no fim não muda as anteriores;
  - sem candidato = professor;
  - o bônus do ativo.
- **Política:** estável, e 0,5 ± tolerância em muitos pares.
- **Banco (e2e no Postgres local):**
  - o progresso de uma rota mista conta os conteúdos de todos os perfis da rota;
  - manifesto antigo de outro perfil não conta;
  - conta de demonstração com perfil fora dos representativos continua contando;
  - RLS da exposição com o papel `authenticated` de verdade.
- **App:** lint, typecheck e os 6 grupos de teste.

## Fora daqui

- A mistura por formato.
- Mexer na geração.
- Subir `_PERSONALIZACAO_PIPELINE_VERSION`.
- Mudar a missão.
- Ligar a chave em produção, que é decisão da autora.
