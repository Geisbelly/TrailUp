# Reuso de personalização: conteúdo idêntico se vincula, não gera

Status: decidido em 04/11, implementado. As três decisões foram da Geisbelly:

- **Vínculo:** linha por turma (e não linha única + N:N).
- **Alcance:** qualquer turma do sistema, inclusive de outro professor.
- **Tópico:** só o conteúdo importa. Nome, descrição e objetivo do tópico ficam fora da comparação.
  O preço aceito: o aluno pode ouvir ou ler o nome do tópico da turma de origem.

## Pedido

Antes da expansão de conteúdo, verificar se o conteúdo já existe e já tem material personalizado
por perfil, comparando cada detalhe, inclusive as palavras. Igual: não vai para a geração, só se
vincula ao que existe. Diferente: segue o fluxo. Um material passa a servir várias turmas, tópicos
e conteúdos.

## O que foi medido

- **Produção, em 04/11 (transação somente leitura):** 4 turmas, 8 tópicos, 15 conteúdos, nenhum
  texto repetido, 14 linhas de base (4 `pronto`, 10 `failed`). O ganho é para o que vier, sobretudo
  `duplicar_classe`, não para o acervo atual.
- `source_hash` não serve para comparar turmas: ele inclui `classe_id`, `topico_id`, `conteudo_id`,
  `source_id`, URL e `storage_path`. Dois conteúdos iguais nunca têm o mesmo hash.
- 14 funções SQL, 1 view e 4 tabelas com FK (`personalizacao_job_targets`,
  `personalizacao_item_progresso`, `materiais_gerados`, `personalizacao_percurso`) dependem de
  `conteudo_personalizado` por turma. O mobile lê a tabela direto, filtrando por `classe_id`.
- `atividades_personalizadas` e `questoes_personalizadas` **não existem** em produção; o quiz fica
  dentro de `materiais`. `cards_personalizados` existe.

## Desenho

Cada turma × tópico × conteúdo × perfil continua com a sua linha em `conteudo_personalizado`. No
reuso essa linha **é o vínculo**: não tem arquivo próprio e cita os mesmos caminhos da linha que
gerou. Duas colunas novas:

| coluna | papel |
|---|---|
| `impressao_conteudo text` | impressão digital do conteúdo, sem ids. Linhas com a mesma impressão e o mesmo perfil têm o mesmo material: é a relação "um material, várias turmas". |
| `vinculado_de_id bigint` (FK para a própria tabela, `ON DELETE SET NULL`) | de onde esta linha veio. `NULL` = gerou o próprio material. |

Por que isso, e não uma linha única com tabela N:N:

| consumidor | linha por turma como vínculo | linha única + N:N |
|---|---|---|
| RLS do aluno e do professor, trava do estudo (#13) | igual, por `classe_id` | reescrever as policies |
| app já instalado | funciona | deixa de ver material; exige nova versão e versão mínima |
| progresso e telemetria | por aluno e turma, sem mudança: a FK aponta para a linha da turma | um `personalizacao_id` passaria a misturar turmas |
| 14 funções e KPIs | sem mudança | reescrever |
| gateway | a view é `security_invoker` e lê o caminho na linha que o aluno enxerga | reescrever a view |
| retenção | `_ainda_usado` só apaga arquivo que ninguém cita; apagar a turma de origem preserva o arquivo | igual |
| aviso de material novo | dispara com o `INSERT` em `pronto` | reescrever |

Custo aceito: o JSON de `materiais` fica repetido por turma, o que não pesa (os arquivos não se
repetem). Em troca, a edição manual de uma turma nunca alcança a outra.

## O que define "idêntico"

`impressao_conteudo` é o SHA-256 de tudo que **entra na geração**, sem nenhum id, URL ou caminho:

- versões do pipeline, do enriquecimento e do deck (as mesmas do `source_hash`);
- conteúdo: título, tipo, texto e o nome e tamanho dos anexos de `metadata.files`;
- atividades do escopo: título, descrição, enunciado;
- fontes, na ordem: tipo, título, MIME, texto base e texto extraído ou transcrição;
- arquivo: **SHA-256 dos bytes**, guardado em `fontes_personalizacao.metadata`. Duas imagens no
  mesmo PDF com o mesmo texto não enganam a comparação, e o arquivo só é baixado uma vez;
- arco narrativo da turma: turmas com histórias diferentes não dividem material.

Normalização: Unicode NFC e espaços colapsados. Só isso: maiúscula e acento contam, são outras
palavras. Questões e cards do professor ficam de fora pelo mesmo motivo de `_build_source_hash`:
não chegam ao prompt, e mudá-los não muda o material.

**Na dúvida, gera.** Arquivo que não pôde ser baixado deixa a impressão nula e o alvo segue o fluxo
normal.

## Fluxo no worker

Em `_process_media_render_target`, depois do contexto e antes do enriquecimento, só para alvo de
base (`aluno_id` nulo) com `conteudo_id`:

1. Com a trava `pg_advisory_xact_lock` de (impressão, perfil), procura outra linha de base com a
   mesma impressão e o mesmo perfil.
2. Achou uma completa pelas versões atuais (`_motivos_de_midia_incompleta` vazio): **vincula**.
3. Achou uma em `processando_midias` que não está parada: o alvo fica adiado e vincula no próximo
   poll. Sem isso duas turmas iguais gerariam juntas. Parada ou com falha, ele segue e gera.
4. Não achou: grava a impressão na reserva e segue o fluxo normal.

A verificação vem antes do reaproveitamento por falha: alvo com falha na própria linha também
vincula, se houver material pronto. O prewarm (`_prewarm_shared_content_enrichments`) usa o mesmo
reaproveitamento da expansão, senão o modelo rodaria antes de o alvo decidir.

**Reuso da expansão.** O enriquecimento é neutro de perfil. Se a turma nova tem um perfil que a
outra não gerou, a expansão vem de `plano.content_enrichment` da irmã, e só a mídia desse perfil é
gerada.

Vincular, numa transação: copia `plano`, `materiais` e `formatos_gerados` com ciclo e `source_hash`
próprios da turma (`metadata.generation_key` reescrito, senão a linha pareceria incompleta), copia
`materiais_gerados` e os cards ativos para os ids da turma, grava `vinculado_de_id`. Nenhuma chamada
a modelo, a microservice ou a TTS. A linha do aluno continua sendo derivada da base da própria turma
(`derivar_personalizacao_do_base`).

## Edição desvincula

Um gatilho `BEFORE UPDATE` zera `impressao_conteudo` e `vinculado_de_id` quando o `source_hash` da
linha muda sem que a impressão mude junto. Assim nenhum caminho de código esquece.

O mesmo gatilho impede a forja. O professor tem `ALL` na própria linha e o reuso vale entre
professores, então gravar a impressão de um conteúdo alheio numa linha com material inventado
entregaria esse material a outra turma. Quem escreve como `anon` ou `authenticated` não muda as duas
colunas, e mudar `materiais` ou `plano` por essa via marca `editado`.

- **Professor edita o conteúdo da turma B (vinculada):** o `class_delta_sync` gera hash novo, não
  acha irmã e `claim_new_generation` reivindica só a linha de B. Os arquivos ficam, porque A ainda
  os cita (`ainda_referenciado`). O novo material sai em caminho de B.
- **Professor edita o conteúdo da turma A (origem):** o mesmo, ao contrário. A gera em
  `generation-<hash novo>`, e B continua citando o caminho antigo, que a retenção preserva.
- **Refinamento manual** (`regenerar/documento`, `regenerar/slide`): só altera o JSON da própria
  linha, então não alcança as outras. Ele marca `impressao_conteudo = 'editado'`: material ajustado
  à mão não serve de origem para ninguém.
- **Turma de origem apagada:** `vinculado_de_id` vira `NULL`, os arquivos ficam enquanto alguém os
  citar, e a última linha a sair leva o arquivo.

## Fora deste PR

- `boss_falas` e `conteudo_demanda_formato` têm hash com `conteudo_id`, então continuam com uma
  chamada por turma. Dá para reaproveitar depois.
- Linha antiga não tem impressão: ela ganha quando passa pelo worker, ou por
  `python -m scripts.preencher_impressao_conteudo --aplicar`, que não foi executado.
- `trailup_pode_ler_arquivo` (acesso direto ao Storage) continua lendo a turma pelo caminho. Os
  clientes passam pelo gateway; o acesso direto só alcança arquivo anterior ao R2.

## Testes

- impressão: mesma para conteúdos iguais em turmas diferentes; muda com uma palavra, com um byte do
  arquivo, com o arco; nula sem o hash do arquivo;
- desvio: não chama enriquecimento nem microservice, grava `vinculado_de_id`, conclui o alvo;
- adiamento com irmã processando; falha e irmã parada caem na geração;
- edição: gatilho desvincula só a linha editada; o `materiais` da outra não muda;
- retenção: arquivo citado pelo vínculo não é apagado (e2e no Postgres);
- gateway: aluno da turma B lê o caminho da turma A com o papel `authenticated`.
