# Gabarito fora do app do aluno: mapa e proposta

**Data:** 08/11/2026. **Estado:** fases 1 e 2 escritas (`20261108_01`, a edge function e o app), sem
aplicar em produção. Fase 3 por fazer.
**Origem:** a PR #1059 tirou a resposta do chat do guia. Este documento trata do outro caminho: o app
do aluno recebe o gabarito antes de responder, para corrigir no aparelho.

## Como foi medido

Produção (`xrebtkmdewolzmpsdwgh`), pela porta 5432, com `BEGIN READ ONLY` e `SET LOCAL ROLE
authenticated` mais as claims do aluno, e `ROLLBACK` no fim. Usei um aluno matriculado na turma 68
que não é professor dela. A conta de teste é professora da 68 e por isso não serve para medir o aluno.
As chamadas a `questao_responder`, que grava, rodaram numa transação de leitura e escrita com a conta
de teste, também com `ROLLBACK`. Conferi depois que nenhuma linha ficou. A base tem 13 questões e 2
respostas, então as contagens provam o caminho, mas não medem volume.

## 1. Por onde o gabarito chega ao cliente

| Caminho | O que o aluno vê (medido) | Observação |
| --- | --- | --- |
| `questoes.resposta_correta` | **Lê.** Gabarito de V/F, lacuna e dissertativa das questões da turma dele. | GRANT de SELECT na coluna para `authenticated` e policies `aluno_select_questoes` / `questoes_posse_sel` (`app_minhas_classes()`). `anon` não tem SELECT. |
| `questoes.alternativas` | Lê. | Não é segredo sozinha. Vira segredo quando junta com o gabarito. |
| `vw_aluno_classe_detalhado.questao_resposta_correta` | **Lê.** 12 de 12 linhas com gabarito. | É o que o app usa (`Classe.loadDetalhado`, `select('*')` → `Classe.ts:446`). A view é `security_invoker` e lê `q.resposta_correta`. |
| `questao_gabarito` | 0 linhas. | Espelho fechado (`trg_questoes_espelha_gabarito`). Só o professor da turma tem policy. Fora do Alembic. 13 de 13 batem com `questoes`. |
| `questao_gabarito_do_aluno(id)` | Só devolve o gabarito depois de acertar ou de 2 erros. | Correto, mas **ninguém chama**. Não grava a revelação. Fora do Alembic. |
| `fn_questao_confere(id, resposta)` | **Oráculo.** `authenticated` tem EXECUTE. Testar A/B/C/D revela a certa sem gravar nada. | Nenhum cliente a chama (grep em `mobile/` e `frontend/`). Quem precisa dela são as RPCs `SECURITY DEFINER`. |
| `fn_trilha_by_classe` | Sem EXECUTE. | Não é caminho. |
| `arena_desafio`, `guilda_*`, `arena_responder` | Gabarito só depois da resposta. | Já corrigem no banco. É o modelo a seguir. `notas_fila` confere professor. |
| Quiz personalizado (`materiais.quiz`) | 0 linhas hoje. | `questoes_personalizadas` não existe mais. Se o gerador gravar quiz, `personalization.ts:703/1588` lê `resposta_correta` do payload. **Caminho latente.** |
| Edge function `validate-essay-answer-ai` | O app manda o gabarito no corpo (`respostaProfessor`). | Quem tem o app já tinha o gabarito; a função só confirma o vazamento. |

Achados que vão além do vazamento:

- **O cliente decide se acertou.** Um INSERT direto em `questao_aluno` com `correta = true` e
  `acertos_percentual = 100` para uma resposta errada passa (medido). A guarda
  `trg_questao_aluno_a_guarda_cliente` só olha prazo e atividade. `atividade_responder_tentativa`
  também aceita o percentual que o app manda: é o "limite conhecido" do CLAUDE.md.
- **A revelação nunca é gravada.** `questao_gabarito_revelado` tem 0 linhas, e nenhum cliente
  escreve nela. Então `fn_questao_elegivel_retry` diz "elegível" para toda questão que não é V/F, e
  a segunda chance da loja vale até para quem já viu o gabarito.
- **Existem três regras de correção diferentes.** O app aceita resposta parecida (contém, com 4 ou
  mais caracteres, ou Levenshtein ≥ 0,82, e várias respostas separadas por `|`, `;` ou quebra de
  linha). `fn_questao_confere` só aceita igual depois de `fn_texto_comparavel`. Arena e guilda usam
  `lower(btrim(...))`. Medido na lacuna com gabarito "15 minutos": o app aceita "15 min" e
  "15 minuto"; o banco recusa as duas. Nenhuma das extensões `fuzzystrmatch` e `pg_trgm` está
  instalada.

## 2. Quem precisa do gabarito no cliente, e quando

| Quem | Precisa de quê | Quando |
| --- | --- | --- |
| Correção imediata (`QuestionActivity.checkResposta`) | Só de `correta` e do percentual. | Depois de responder. |
| Mostrar o gabarito ao errar, no modo imediato | O texto do gabarito. | Depois do 1º erro, se `mostrar_gabarito_ao_errar` (flag só do app). |
| "Ver gabarito" no modo pensante | O texto. | Quando o aluno pede. Isso deve gravar a revelação e cortar a pontuação para 20%. |
| Segunda chance (`fn_questao_elegivel_retry`) | Nada. Precisa só de a revelação estar gravada. | — |
| Revisão de atividade concluída | O texto. | Depois de responder. |
| Dissertativa (edge function) | A resposta esperada **no servidor**. | Na correção. |
| Console do professor | O texto, sempre. | `topicsApi.ts:96`, `useJornadaDoAluno.ts:112`. |

Nenhum uso do aluno precisa do gabarito **antes** de responder.

## 3. Proposta

### Banco (uma porta só para responder)

1. **`questao_responder` v2, versionada no Alembic.** A versão de produção hoje está fora do Alembic.
   Ela recebe `p_questao_id`, `p_resposta`, `p_tempo_gasto_seg` e `p_contexto` (`refazendo`,
   `re_responder`), e decide:
   - `correta`, com **uma** regra de correção no banco, que porta a do app: várias respostas,
     "contém" com 4 ou mais caracteres e Levenshtein ≥ 0,82 em plpgsql, ou `fuzzystrmatch` se a
     instalação for aprovada. O teste de paridade roda os mesmos casos nos dois lados, como
     `personalizacaoFallback.test.ts`;
   - `acertos_percentual` com os multiplicadores que hoje estão no app: 20% se já viu o gabarito
     (lido de `questao_gabarito_revelado`), 50% ao responder de novo, e `penalty_retry_pct` na nova
     tentativa;
   - o gabarito **só** quando a regra libera: acertou, ou errou no modo imediato com a flag de mostrar
     ligada, ou 2 erros. Ao devolver o gabarito, ela **grava a revelação na mesma transação**.
   - A flag `mostrar_gabarito_ao_errar` não existe no banco. Ou ela vira coluna, ou o banco assume o
     padrão do app (revelar). Essa decisão é da usuária.
2. **`questao_revelar_gabarito(p_questao_id)`** para o "ver gabarito" do modo pensante. Exige pelo
   menos uma resposta, grava a revelação e devolve o texto.
3. **Fechar o oráculo:** `REVOKE EXECUTE ON fn_questao_confere FROM authenticated`. Nenhum cliente a
   usa, e as RPCs `DEFINER` continuam chamando. Pode sair já, sem esperar o app.
4. **No corte (fase 3):**
   - `REVOKE SELECT ON questoes FROM authenticated` e `GRANT SELECT (<todas menos resposta_correta>)`.
     Revogar só a coluna não funciona enquanto existir o GRANT na tabela inteira.
   - Recriar `vw_aluno_classe_detalhado` com `NULL::text AS questao_resposta_correta`. Ela é
     `security_invoker`: sem isso, toda leitura dela daria `42501` para o aluno.
   - A guarda de `questao_aluno` passa a recusar INSERT de `anon`/`authenticated` (só a RPC grava), no
     molde de `atividade_aluno` (`20261102_04`).
   - `atividade_responder_tentativa` passa a somar `questao_aluno` da tentativa em vez de aceitar
     `p_acertos_percentual`, e fecha o "limite conhecido".
   - O console passa a ler o gabarito de `questao_gabarito`, que já tem a policy do professor. A
     escrita continua em `questoes` e é espelhada. API e microservice usam `service_role` e não mudam.

### Dissertativa

`validate-essay-answer-ai` passa a aceitar `questaoId`. Com ele, a função:

1. confere com o JWT do aluno que ele vê a questão;
2. lê o gabarito com a chave de serviço;
3. corrige;
4. grava o resultado por uma RPC só de `service_role`
   (`questao_registrar_correcao_ia(aluno, questao, resposta, percentual, feedback)`).

Com isso, o percentual da IA também deixa de vir do cliente. `respostaProfessor` continua valendo
para o console, que é professor. Para o aluno, ele vale só até o corte e depois é ignorado.

Isso complementa a #1060, que protege a **saída**: o feedback da correção não pode copiar a resposta
esperada (`protecaoDaResposta.ts`). A proposta daqui protege a **entrada**, porque o aluno deixa de
ter a resposta esperada para mandar.

### Quiz personalizado

Hoje não há nenhuma linha. Antes de o quiz voltar a ser gerado, o gerador deve gravar o gabarito numa
tabela fechada, chaveada por `conteudo_personalizado.id` mais o `item_key`, e tirá-lo de `materiais`.
A correção iria por uma RPC irmã. Fica registrado aqui para que não volte aberto.

## 4. Transição para o app instalado (1.0.x)

O app instalado corrige com o gabarito. Se ele sumir, toda objetiva vira "errada", e a dissertativa
sem gabarito cai na comparação local, que aceita qualquer texto. Por isso, a ordem é esta:

A fase 1 assumiu duas das decisões abaixo: Levenshtein em plpgsql, sem instalar extensão, e
`mostrar_gabarito_ao_errar` no padrão do app (mostrar). Ver a docstring da `20261108_01`.

A fase 2 (`mobile/src/services/questaoNoBanco.ts`) ficou assim:

- `QuestionActivity` corrige a questão da turma por `questao_responder` e usa o percentual e a
  regra que o banco devolveu (`fatorDaRegra` repete os fatores só para os pontos da atividade).
  O gabarito exibido é o que a RPC liberou, ou o de `questao_revelar_gabarito` no "ver gabarito".
- A dissertativa vai à edge function com `questaoId` e sem `respostaProfessor`; o `registro` que
  volta é a resposta já gravada. Sem registro, cai em `questao_responder`.
- `registrarRespostaQuestao` recebe `jaGravada` e não insere de novo em `questao_aluno`; o resto
  (progresso, eventos, tentativa) segue igual.
- `Classe.ts` não lê mais `questao_resposta_correta` da view. A view continua mandando a coluna
  até a fase 3, para o app instalado.
- A questão personalizada local (id negativo, sem linha em `questoes`) continua corrigida no
  aparelho: o gabarito dela nasce no próprio material.
- O app aceita o retorno da `questao_responder` de antes da migration (sem `acertos_percentual`,
  vale 100/0), para o deploy da web não depender da ordem em relação à API.
- A nota da atividade ainda é a soma que o app manda a `atividade_responder_tentativa`, agora
  feita com os percentuais do banco. Somar no servidor é a fase 3.

| Fase | O que muda | Quebra quem? |
| --- | --- | --- |
| 1. Banco aditivo | `questao_responder` v2, `questao_revelar_gabarito`, a RPC da IA e a edge function aceitando `questaoId`. REVOKE do oráculo. | Ninguém. |
| 2. App | O build novo responde só pelas RPCs, não lê `questao_resposta_correta` e manda `questaoId` à edge function. A web do aluno ganha isso no deploy. | Ninguém. |
| 3. Corte | Ligar `app_versao_minima` (`20261024_11`) com a versão da fase 2 **e só depois** aplicar a migration do corte: GRANT por coluna, view, guarda de `questao_aluno` e `atividade_responder_tentativa`. | O app abaixo da versão mínima vê a tela de atualizar, e não uma correção errada. |

O que a usuária precisa decidir antes da fase 3:

- quando ligar a versão mínima. A versão do aluno ativo está em
  `telemetria_lotes.payload->'cliente'->>'app_version'`, a mesma medição usada para o 1.0.5;
- `fuzzystrmatch` ou Levenshtein em plpgsql;
- `mostrar_gabarito_ao_errar` no banco ou no padrão.

A migration da fase 3 sobe a API (`alembic upgrade head`), então valem as regras de sempre:
`alembic heads` na `main`, e sync do espelho antes de reiniciar a API.

## O que este documento não resolve

- A correção da arena e da guilda (`lower(btrim)`) continua diferente. Unificar mexe no Elo e fica
  para outro PR.
- O gabarito do diagnóstico de tópico (`diagnostico_topico_gabarito`) já é fechado e fica fora.
