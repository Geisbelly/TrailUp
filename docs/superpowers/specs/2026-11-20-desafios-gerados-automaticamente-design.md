# Desafios de lógica e cruzadinha gerados automaticamente: design

Data: 2026-11-20 · Estado: para aprovação · Abordagem escolhida: **A (o worker da API gera, como
as falas do boss)**

Continua a spec de 17/11 (`2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`), que
continua valendo em tudo que esta não muda.

## Intenção

Hoje o desafio de lógica e a cruzadinha só nascem quando o professor abre um conteúdo salvo e
clica em "Sugerir Cards & Atividades". Ninguém clicou depois do deploy (19/11): produção tem 0
desafios. A autora quer que eles **sejam gerados sozinhos**: todo conteúdo passa a ter os seus
2 desafios de lógica e 2 cruzadinhas sem o professor precisar pedir.

## Objetivos

1. Conteúdo **salvo** sem desafio ganha 2 de lógica e 2 cruzadinhas, gerados no servidor, com o
   console fechado.
2. Vale para conteúdo novo e para os que **já existem** (que entram aos poucos, dentro da cota).
3. O desafio gerado sozinho **espera a aprovação do professor** na aba Missões antes de chegar ao
   aluno. O professor aprova, recusa ou troca os perfis do grupo.
4. O botão do console continua como está: gera na hora e grava aprovado ao aplicar.

## Fora do escopo

- Regerar quando o conteúdo muda. Conteúdo que já tem desafio (em qualquer estado) não gera de
  novo; mudar isso fica para depois.
- Editar o texto do desafio antes de aprovar (a guarda de `missoes` congela o texto que não é do
  professor).
- Desafio na geração da trilha inteira pelo console.
- O app: ele já mostra só missão `aprovada` (`missoes_aluno_sel`) e não muda.

## O que não pode acontecer

- **Desafio chegar ao aluno sem o professor aprovar.** Garantido pelo banco, não pelo console.
- **Gastar a cota do dia** do Gemini sem limite. A geração automática tem teto diário e para ao
  primeiro sinal de cota esgotada (ver item 4).
- **Gerar duas vezes o mesmo conteúdo**: dois workers, duas passadas, ou o professor clicando no
  botão enquanto o worker gera.
- **Professor com "geração automática" desligada receber desafio sozinho.**
- **Atrasar ou derrubar a fila de personalização.** Falha nos desafios só vira log.
- **O aluno ler a resposta.** A resposta continua só em `missao_desafio_gabarito`.

## Como funciona hoje (o que esta mudança toca)

- **Console:** `TopicEditDrawer.handleGenerateForContent` monta o pedido no navegador
  (`buildContentAiPayload`: texto, arquivos lidos no navegador, anexos, orientação da turma,
  `existentes`) e chama a edge `generate-content-ai` com `mode: "desafios"`. Aplicar chama a RPC
  `missao_desafio_criar`, que exige o professor dono e grava cada linha com `origem = 'ia'`,
  `aprovacao = 'aprovada'`.
- **Edge:** o prompt (`promptDeDesafios`), a validação e a grade da cruzadinha estão em
  `desafios.ts` e `montarCruzadinha.ts`. `requireAuthenticatedUser` só aceita um usuário logado.
  As chaves do Gemini são as da própria edge (`rotacaoGemini.ts`).
- **Banco:** `missoes` já tem `aprovacao` (`pendente`/`aprovada`/`recusada`), o CHECK
  `missoes_ia_exige_aprovacao` e a policy do aluno que só entrega `aprovada`. Os desafios ficam fora
  do painel de aprovação das missões da IA (#151), por `desafio IS NULL`.
- **Molde no worker:** `_gerar_falas_boss_do_job` e `_analisar_demanda_do_job` em
  `personalizacao_jobs.py`. Ficam fora do `try` de cada target, limitam por rodada, pausam depois
  de falha e nunca marcam target como `failed`. `fetch_personalizacao_context` já lê o conteúdo e
  os arquivos do professor no servidor.

## Abordagens

| Abordagem | Como | A favor | Contra |
|---|---|---|---|
| **A — worker da API (escolhida)** | O worker acha conteúdo sem desafio, lê o material como a personalização lê e chama a edge com a credencial do servidor; o banco grava como pendente. | Funciona com o console fechado; cobre conteúdo novo e antigo; a regra da cruzadinha fica num lugar só; tem molde testado. | A edge precisa aceitar a chave do servidor; professor em modo manual não recebe. |
| B — o console dispara ao salvar | O console pede os desafios por baixo dos panos ao salvar. | Menor mudança. | Só com o console aberto; conteúdo antigo só quando o professor abre o tópico. |
| C — fila do banco direto para a edge | `pg_cron` + `pg_net` chama a edge, que lê tudo sozinha. | Não passa pela API. | A edge teria de ler PDF, PPTX e DOCX sozinha (hoje é o navegador): o mais código novo. |

A autora escolheu A em 20/11.

## O desenho

### 1. Quem entra (banco)

Uma função `fn_desafios_auto_candidatos(p_limite int)`, só para `service_role`, devolve os
conteúdos que podem gerar agora, na ordem em que devem ser atendidos. Um conteúdo entra quando:

- ele e o tópico existem e o tópico é da turma;
- o professor dono da turma está com `professor.geracao_automatica = true`;
- a turma tem pelo menos um aluno matriculado (sem aluno, ninguém resolveria);
- **não existe nenhuma missão com `desafio IS NOT NULL` desse conteúdo**, em qualquer estado
  (pendente, aprovada, recusada, inativa). Recusar não regera;
- **não existe linha dele em `desafios_auto_tentativas`** com estado `gerado`, `sem_desafio` ou
  `falhou` definitivo. Assim, o professor excluir os desafios pelo console também não regera;
- ele não está numa pausa por falha recente (abaixo);
- **o tópico está publicado** (`topicos.publicacao = 'publicado'`, ou `agendado` com
  `publicar_em` vencido, pela mesma regra de `app_topico_liberado`). Rascunho e agendado futuro
  não entram: toda trilha gerada pela IA nasce rascunho, e o professor ainda está montando;
- **o conteúdo está parado há pelo menos 1 hora**: nenhuma edição nele nos últimos 60 minutos
  (`desafios_auto_carencia_min`, padrão 60). O laço não regera, então gerar no meio da edição
  congelaria um desafio feito do título. `conteudos` só tem `created_at` (medido em produção em
  20/11), então a migration cria `conteudos.atualizado_em`, preenchida por um gatilho BEFORE
  INSERT/UPDATE (o cliente não escolhe o valor), e as linhas antigas começam com `created_at`.
  Se `metadata` com os arquivos mudar, conta como edição;
- **o conteúdo tem algum material**: texto próprio não vazio, arquivo ou link. Só o título não
  basta.

Decidido pela autora em 20/11 ("publicado e parado 1 h").

Ordem: tópico de menor `ordem` primeiro, e conteúdo mais antigo primeiro. O conteúdo que o aluno
vê primeiro ganha desafio primeiro.

### 2. Registro das tentativas (banco)

Uma tabela `desafios_auto_tentativas` (uma linha por conteúdo), só do servidor (sem policy, e
isso fica dito no docstring da migration): `conteudo_id` (PK), `estado`
(`gerando`/`gerado`/`sem_desafio`/`falhou`), `tentativas`, `proxima_em`, `erro` (primeira linha,
sem material), `atualizado_em`.

- Serve à dedup e à pausa: o worker reivindica a linha com `UPDATE ... WHERE estado <> 'gerando'
  OR atualizado_em < now() - <trava>` (`FOR UPDATE SKIP LOCKED`). Dois workers não pegam o mesmo
  conteúdo.
- `falhou` espera 2^n horas (`proxima_em`); na 3ª falha fica `falhou` e para.
- `sem_desafio`: o modelo respondeu, mas nada passou na validação. Não tenta de novo nesta versão.

### 3. Gravação como pendente (banco)

Uma função `fn_missao_desafio_registrar_auto(p_conteudo_id, p_desafios jsonb)`, só para
`service_role`, recebe **a lista inteira** do conteúdo (cada item com desafio, resposta e perfis) e
grava cada um igual a `missao_desafio_criar` (um `desafio_grupo` por desafio, uma linha por perfil,
gabarito na tabela própria, as mesmas validações e recompensa), numa transação só, com duas
diferenças:

- `aprovacao = 'pendente'` e `ativa = true`. Quem segura a missão longe do aluno é a policy, que
  exige `aprovada`;
- não confere o professor (não há sessão). Confere, **uma vez, antes de gravar o primeiro**, que o
  conteúdo existe e que ainda não há desafio dele, travando o conteúdo
  (`pg_advisory_xact_lock` sobre o `conteudo_id`). `missao_desafio_criar` passa a pegar a mesma
  trava. Assim, se o professor aplicou pelo botão enquanto o worker gerava, o worker não grava por
  cima. O botão, ao contrário, continua podendo somar desafios a um conteúdo que já tem (é pedido
  do professor). Item que falha na validação é pulado; nenhum válido = `sem_desafio`.

**Os desafios pendentes não podem travar as missões da IA (#151).** Hoje `missao_ia_pedir` conta
toda missão `origem = 'ia' AND aprovacao = 'pendente'` para o teto de "sugestões para decidir", e a
lista de títulos que vai ao modelo também lê `missoes` sem filtro
(`20261102_20_missoes_sugeridas_pela_ia.py:301-307` e `:451-452`). Um conteúdo gera até 8 linhas
pendentes. A migration troca as duas consultas por âncora no texto vivo, acrescentando
`desafio IS NULL` (decisão de quem escreveu a spec, achada na revisão).

A parte comum com `missao_desafio_criar` vai para uma função interna, e as duas a chamam. A
migration parte do texto vivo da `20261117_03`.

Perfis-alvo: os padrões da spec de 17/11, sem filtrar pela turma (lógica: Mastermind e Achiever;
cruzadinha: Seeker e Mastermind). O app já filtra pelo perfil do aluno.

### 4. O worker (API)

Um laço próprio, `desafios_auto_loop`, no mesmo molde do `missoes_ia_loop`. Não fica pendurado
nos jobs da fila: assim o mesmo caminho cobre conteúdo novo e antigo. A cada passada:

1. pede `fn_desafios_auto_candidatos(lote)`;
2. para cada um, um por vez: reivindica a tentativa, lê o material e chama a edge com
   `mode: "desafios"`;
3. com desafios na resposta, chama `fn_missao_desafio_registrar_auto` com a lista e marca `gerado`;
   com lista vazia ou nada válido, `sem_desafio`; com erro, `falhou`.

**O material vai como texto, não como arquivo** (decisão de quem escreveu a spec). O corpo leva
`topicName`, `contents` (título, tipo e texto dos conteúdos do tópico), `fileContents`/`fileNames`
com o **texto já extraído** dos arquivos do professor (em `fontes_personalizacao.metadata`, nas
chaves `texto_extraido`, `transcricao`, `transcript` e `text`, ou na `descricao`: não há coluna
`texto_extraido`), `videoUrl`/`linkUrl` quando houver, `orientacao` de
`classe_orientacao_ia` e `existentes` com as perguntas do tópico. **Não** manda o PDF em base64
nem as imagens (`anexos`): baixar cada arquivo pelo gateway custaria egress e tempo contra os
120 s da edge, em lote. Efeito aceito: o desafio sai do texto do material, não das figuras.

A leitura é **só leitura** e mora no banco: `fn_desafios_auto_contexto(conteudo_id)` monta o corpo
inteiro da edge. `fetch_personalizacao_context` grava em `fontes_personalizacao`
(`seed_from_class_content`, `_persist_hydrated_sources_into_fontes`) e pode chamar o Gemini para
resumir fonte multimodal (`_summarize_multimodal_source_with_gemini`), então o worker não a chama.
Só fonte de `visibilidade = 'classe'` com texto aproveitável conta como material (a fonte só do
aluno nunca vai ao modelo). Conteúdo cuja fonte ainda não tem texto extraído vai só com o texto e os
links. Medido em 20/11: os 65 conteúdos de produção têm texto próprio e nenhuma das 7 fontes tem
texto extraído.

Limites, em `app_config` (privadas):

- `desafios_auto_ligado` (padrão `true`): a chave para desligar sem deploy;
- `desafios_auto_por_passada` (padrão 2) e `desafios_auto_intervalo_seg` (padrão 600);
- `desafios_auto_por_dia` (padrão 20 conteúdos, contados pelas tentativas do dia).

**Roda a qualquer hora** (decidido pela autora em 20/11). Divide a cota do dia com o console e,
se as chaves forem dos mesmos projetos do Google, com o chat: a edge gira a própria lista
`GEMINI_API_KEY`, e a reserva do chat (`GEMINI_CHAVES_RESERVADAS_CHAT`) existe só na API, então
ela não protege nada aqui. O que limita a disputa é o teto diário e a pausa ao primeiro sinal de
cota esgotada.

Cota. A edge devolve 429 `gemini_rate_limit` tanto para 402 quanto para qualquer 429
(`index.ts:116-125`), então o worker lê `details.upstream_status` e `details.response`:

- cota do dia esgotada ou 402: encerra a passada e pausa o laço até a virada (meia-noite do
  Pacífico);
- limite por minuto: a tentativa fica `falhou` com `proxima_em` curta (15 min), sem contar como
  falha definitiva, e a passada segue para o próximo só depois da pausa;
- sem como distinguir: trata como limite por minuto.

### 5. A edge aceita o servidor

`generate-content-ai` passa a aceitar, **só em `mode: "desafios"`**, o `Authorization` com a
chave de serviço (comparada a `SUPABASE_SERVICE_ROLE_KEY` do ambiente da função). Nos outros modos
continua exigindo usuário logado. O corpo é o mesmo do console, e a resposta também.

Pedido do servidor faz **uma tentativa só**: hoje, com material só de texto, o modo `desafios`
tenta até 3 vezes (`CONTENT_GEN_ATTEMPTS`, `index.ts:1305` e `:1862`). O rodízio de chaves e de
modelo em 429/503 continua. Cada pedido é uma geração, mas o teto diário conta **conteúdos tentados
no dia** (a reivindicação), não pedidos: é o que `docs/custos.md` registra.

### 6. O console aprova

Na aba Missões, o grupo de desafio pendente aparece **uma vez**, com o selo "Desafio", um selo
"Esperando aprovação", o enunciado, a resposta (o professor precisa ver para conferir) e os
perfis. Ações: **Aprovar**, **Recusar** (com motivo opcional) e trocar os perfis.

- Aprovar e recusar valem para o grupo inteiro, por uma RPC `missao_desafio_decidir(p_grupo,
  p_decisao, p_motivo)` que confere o professor dono e muda todas as linhas do grupo numa
  transação. O registro em `missoes_ia_log` continua fora: os desafios não entram na taxa de
  aprovação da #151.
- O professor recebe um aviso no sino (`professor_notificacoes`), um por turma e por dia
  (`dedupe_key`), quando o worker grava desafio novo: "N desafios esperando aprovação em
  <turma>".
- O botão "Sugerir Cards & Atividades" não muda. O `existentes` dele já lê os desafios do conteúdo
  em `missoes`, inclusive os pendentes, então não repete o que o worker gerou.

## Custos

Um pedido por conteúdo, uma vez só, com uma tentativa de geração. Com o teto padrão, no máximo 20
pedidos por dia. Cada um pode passar por mais de uma chave ou modelo em 429/503, então o número
exato de chamadas fica PENDENTE até medir. São pagas pelas chaves da edge. `docs/custos.md` muda
no mesmo PR.

## Verificação

- Banco (Postgres local com os gatilhos de verdade): candidatos respeitam cada regra do item 1;
  registro concorrente com `missao_desafio_criar` grava um grupo só; pendente não aparece para o
  aluno (papel `authenticated` simulado); `missao_desafio_decidir` recusa outro professor.
- Worker: testes com a edge falsa, para sucesso, lista vazia, 429, 402, timeout e banco fora.
  Nenhum teste chama o modelo de verdade.
- Edge: a chave de serviço passa em `desafios` e é recusada em `content` e `trail`; um usuário
  logado continua passando.
- Console: aprovar, recusar e trocar perfis no grupo pendente.
- Uma geração real, contra um conteúdo de teste, só com o OK da autora (cota).

## Deixado para quem constrói

Nomes de funções e arquivos, o número exato da trava da reivindicação, o texto dos selos, e como
o laço se registra no `lifespan` (seguindo o `missoes_ia_loop`).
