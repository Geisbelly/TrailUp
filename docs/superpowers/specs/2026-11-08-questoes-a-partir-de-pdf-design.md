# Atividades e questões a partir de PDF (spec C de 3)

Data: 2026-11-08 · Status: design aprovado, sem implementação · Depende dos specs A
(`2026-11-08-texto-rico-formulas-e-codigo-design.md`) e B
(`2026-11-08-respostas-codigo-formula-e-pre-avaliacao-design.md`)

## Por quê

O professor já tem listas de exercício, provas e apostilas em PDF. Hoje, para usá-las, ele digita
cada questão no editor de trilha. A geração por IA do console (`generate-content-ai`) não lê PDF:
`extractSourceText` só aproveita arquivo de texto (`text/*`, `.md`, `.txt`, `.csv`, JSON), e o
resto termina em `source_extraction_failed`.

## Decisões (Geisbelly, 08/11)

1. **A extração é um job no banco processado pelo worker da API.** Extrair e adaptar é IA, então
   é API. Enfileirar, listar, revisar e salvar é banco.
2. **Cada questão vem em duas versões:** a original, fiel ao PDF, e uma adaptada ao tópico e à
   turma. O professor escolhe e edita.
3. **Sem gabarito no PDF, a IA sugere, marcado.** A questão só é salva depois de o professor
   confirmar.
4. **Figura recortada no navegador:** a IA devolve página e caixa, e o console recorta com pdf.js.

## 1. Banco

A policy entra no mesmo commit de cada tabela.

### `importacao_pdf_jobs`

| coluna | |
|---|---|
| `classe_id`, `topico_id` | turma e tópico padrão de destino |
| `professor_id` | `auth.uid()` de quem criou |
| `caminho_arquivo`, `nome_arquivo`, `paginas` | o PDF no R2 |
| `status` | `pending`, `processing`, `waiting_quota`, `done`, `failed` |
| `paginas_processadas`, `itens_extraidos`, `erro` | progresso |
| `opcoes jsonb` | `adaptar` (padrão sim) e tipos aceitos |

- RLS: o professor insere e lê pelas `app_classes_do_professor()`. Não atualiza `status` nem
  progresso: a coluna é do worker (GRANT por coluna ou gatilho de guarda, no molde de
  `alteracao_professor`).
- O console enfileira gravando aqui. Nenhuma chamada à API para criar o job.

### `importacao_pdf_itens`

| coluna | |
|---|---|
| `job_id`, `ordem`, `pagina` | de onde veio |
| `original jsonb` | enunciado, alternativas, tipo, `config_resposta`, gabarito, como no PDF |
| `adaptada jsonb` | a mesma forma, reescrita para o tópico e a turma |
| `gabarito_origem` | `pdf` ou `ia` |
| `gabarito_confirmado` | o professor confirmou o gabarito sugerido |
| `figura jsonb` | `{ pagina, caixa: [x0, y0, x1, y1] }` em 0 a 1000, ou nulo |
| `fidelidade` | cobertura medida contra o texto da página, ou nula (PDF escaneado) |
| `topico_sugerido_id`, `dificuldade` | sugestões da IA |
| `escolha` | `original`, `adaptada` ou `descartar` |
| `editado jsonb` | o que o professor mudou |
| `atividade_id`, `questao_id` | o que foi criado ao salvar |

- RLS: o professor lê e atualiza `escolha`, `editado`, `gabarito_confirmado` e a figura pelas
  turmas dele. **Nenhuma policy para o aluno**, porque há gabarito aqui. A decisão vai registrada
  no docstring da migration.
- As duas tabelas entram na publicação `supabase_realtime`, com a policy de SELECT. Faltando uma
  das duas, o canal assina e evento nenhum chega (`20261003_04`).

### RPC `importacao_pdf_salvar(p_job_id bigint, p_itens jsonb)`

No molde de `duplicar_classe`: uma transação, posse conferida **antes** de ler, com `NOT EXISTS`
sobre `app_classes_do_professor()`.

- Para cada grupo (atividade) e item: cria `atividades`, `questoes` e `questao_gabarito`, com
  `formato_texto`, `config_resposta`, `criterios`, `midia_url` e a origem no metadata
  (`{ importacao_pdf: { job_id, arquivo, pagina, versao: "original" | "adaptada" } }`).
- **Recusa** item com `gabarito_origem = 'ia'` e `gabarito_confirmado = false` (erro
  `gabarito_nao_confirmado`, com o item).
- Grava `atividade_id` e `questao_id` no item, e salvar de novo não duplica.
- Os gatilhos do editor fazem o resto: `fn_enqueue_class_delta_job` funde tudo no job `pending`
  da turma.

Substitui, para este fluxo, os INSERT soltos do `saveAiSuggestionsBatch`, que não têm transação.

### Limites

`app_config` com `publico = false`: `importacao_pdf_paginas_max` (padrão 40) e
`importacao_pdf_por_dia` por professor. São tetos de cota: saber o valor ajuda a burlá-los.

## 2. Worker na API

`api/app/services/importacao_pdf.py` e um laço no lifespan, como `alteracao_professor_loop`.

1. **Pega o job** com `FOR UPDATE SKIP LOCKED` e passa para `processing`.
2. **Baixa do R2** (`r2_storage`) e conta as páginas com `pypdf`. Acima do limite, `failed` com
   a mensagem.
3. **Extração, em lotes de 10 páginas.** Cada chamada manda o **PDF inteiro** e pede só as
   questões que **começam** nas páginas X a Y:
   - 258 tokens por página, então 40 páginas dão cerca de 10 mil tokens de entrada, folgado;
   - o gabarito no fim da apostila e a questão que atravessa a página saem certos sem regra
     extra;
   - o PDF vai **antes** da instrução, para o cache implícito valer no tier free (medido: depende
     da ordem do payload);
   - saída estruturada (schema do Gemini), com texto rico do spec A (`\( \)`, `\[ \]`, `\ce{}`,
     ```` ```lang ````), tipo entre os do console e do spec B, alternativas, gabarito e se ele
     veio do PDF, figura com página e caixa, e a página de início.
4. **Fidelidade.** Em PDF com texto, `pypdf` extrai a página e o worker mede a cobertura das
   palavras da `original` nela. Abaixo de 0,8, o item vem marcado "conferir: pode ter mudado". Em
   PDF escaneado não há texto: a fidelidade fica nula, e o console diz isso.
5. **Adaptação**, se pedida: uma chamada por lote de cerca de 10 questões.
   - Contexto: o tópico de destino (nome, descrição, títulos dos conteúdos) e a turma (matéria,
     descrição, `classe_perfil_summary`).
   - Devolve a adaptada (o mesmo conceito e a mesma resposta, com outro contexto e outro
     vocabulário), a dificuldade (`facil`, `media`, `dificil`), o tópico sugerido **entre os da
     turma** e, se faltar, o gabarito sugerido, com `gabarito_origem = 'ia'`.
   - A adaptada de questão com gabarito do PDF precisa manter a resposta. Se a IA mudar números,
     ela devolve o gabarito novo, e ele vale como `ia` (precisa de confirmação).
6. **Cota.** Um PDF de 40 páginas com 60 questões dá cerca de 4 + 6 = 10 chamadas.
   - Rodízio de chaves e modelos (`gemini_chaves`), uso registrado (`uso_llm`).
   - Com tudo esgotado, o job vai para `waiting_quota` e o laço retoma depois. Os itens já
     gravados ficam.
   - Retry cabe na cota diária: sem repetir lote já gravado.
7. **Fim:** `done`, ou `failed` com o erro. Se a API cair no meio, o job volta a `pending` por
   tempo de `processing` sem progresso, e o lote em andamento é refeito.

Os prompts ficam em `api/app/agent/prompts/` (`importacao_pdf_extracao.txt`,
`importacao_pdf_adaptacao.txt`). Regras: não inventar questão, não completar enunciado cortado
(marcar), não traduzir, manter números e unidades na original.

## 3. Console

`frontend/src/components/console/trilha/ImportarPdfDialog.tsx`, aberto pela aba Atividades do
tópico.

1. **Envio.**
   - O PDF sobe para o R2 pelo caminho de upload que o console já usa e cria a linha em
     `importacao_pdf_jobs`.
   - Aviso fixo: "Use apenas material que você tem direito de usar com a turma."
2. **Progresso** por Realtime (`postgres_changes` no job e nos itens). Os itens aparecem conforme
   os lotes terminam, e o professor já pode revisar o primeiro lote.
3. **Revisão, por item:**
   - original e adaptada lado a lado, com a escolha, editadas pelo `CampoTextoRico` do spec A;
   - o tipo, com os campos do spec B (linguagem, tolerância, variáveis);
   - o gabarito com selo "do PDF" ou "sugerido pela IA, confirmar", que é um clique;
   - o tópico de destino (padrão o sugerido), a dificuldade, "não importar" e o aviso "conferir"
     quando a fidelidade ficou abaixo de 0,8.
   - Cada mudança é gravada no item (`editado`), então fechar a aba não perde trabalho e reabrir o
     job retoma.
4. **Figura.** `pdfjs-dist`, carregado só neste diálogo, desenha a página no `canvas` e recorta
   pela caixa da IA. O professor ajusta os cantos. Ao salvar, o recorte sobe para o R2 e vira a
   `midia_url` da questão.
5. **Agrupamento.** Por padrão, uma atividade por tópico de destino, com o nome do PDF. O
   professor renomeia, divide ou move questões entre atividades.
6. **Salvar** chama `importacao_pdf_salvar`. A recusa por gabarito não confirmado aponta o item.

## Fora deste spec

- Importar de Word ou de imagem solta. O caminho é o mesmo, mas o `pypdf` e o pdf.js são de PDF.
- Gerar questões novas a partir de uma apostila sem questões. Isso já é a geração de sugestões
  do console.
- Correção das respostas: specs A e B.

## Testes

- Banco (papel de verdade, `BEGIN/ROLLBACK`): o professor cria job só na própria turma; o aluno
  não lê jobs nem itens; o professor não muda `status`; o salvamento é atômico (um item inválido
  desfaz tudo); recusa gabarito da IA não confirmado; salvar duas vezes não duplica; os gatilhos
  do editor enfileiram um `class_delta` só.
- Worker: com o Gemini simulado, lotes de 10 páginas, retomada depois de `waiting_quota` sem
  refazer lote gravado, fidelidade abaixo de 0,8 marcada, PDF acima do limite recusado.
- Uma rodada real, no tier free, com um PDF de lista de física (fórmula, unidade e figura) e um de
  programação (código), contando as chamadas.
- Console: o recorte bate com a caixa nos dois PDFs; `npm run typecheck`.
