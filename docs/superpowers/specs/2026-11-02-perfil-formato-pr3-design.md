# Perfil BrainHex × formato (PR3, #20)

Implementado em `20261102_26_metricas_perfil_formato`. Responde a PR3 de
[TCC 09 §3](../../tcc/09-metodologia-de-pesquisa-e-avaliacao.md): qual perfil BrainHex responde
melhor a cada formato. Usa as janelas da [cohort](2026-11-01-cohort-e-baseline-design.md) (#13).

## 1. O que a produção tinha em 02/11

Medição só de leitura e só de agregados, com o Alembic em `20261102_24`:

| Fato | Medida |
|---|---|
| Uso de material no escopo `material` | 189 linhas, todas de **1 aluno** (o de QA) |
| Material personalizado (`item_key` com `:personalization:`) | 38 linhas: markdown 20, apresentação 9, áudio 6, cards 3 |
| Material do professor (`item_key` `content:N`) | 151 linhas, markdown e texto |
| `conteudo_personalizado` | 17 linhas de 1 aluno; `formato_prioritario` = `cards` em 16 |
| `aluno_perfil` | 31 linhas, 6 alunos; `afinidade` é `numeric` (o esqueleto dos testes diz `text`) |

**Conclusão:** dá para construir e testar a análise, não para responder PR3. Hoje a resposta
seria um aluno de QA. A RPC devolve a amostra insuficiente como tal, e é isso que ela vai mostrar
até haver turma de verdade.

## 2. Decisões

| # | Decisão | Por quê |
|---|---|---|
| F-1 | **Só material personalizado conta como formato.** Filtro por `item_key` com `:personalization:` no escopo `material`. | O material do professor não é escolha do grafo. Misturá-lo mediria o que o professor cadastrou, não a decisão de priorização. |
| F-2 | **Engajamento é tempo ativo (`active_sec`), nunca `dwell_sec`.** | Material aberto e parado não é engajamento (CLAUDE.md, telemetria). |
| F-3 | **`fatia_do_tempo_pct` é a média das fatias por aluno**, não a fatia do tempo somado. | Um aluno que estuda muito puxaria sozinho a fatia do perfil inteiro. |
| F-4 | **O desempenho é atribuído pelo formato dominante do tópico**: em cada aluno × tópico, o formato de mais tempo ativo leva o acerto na 1ª tentativa daquele tópico. | `questao_aluno` não sabe qual material o aluno estudou antes. O tópico é a menor unidade que liga as duas coisas. A 1ª tentativa segue a D-5 do estudo (uma fonte por fato). |
| F-5 | **Incerteza explícita:** intervalo de Wilson a 95% no acerto, `amostra_insuficiente` e supressão abaixo de `n_minimo` (chaves `pr3.%` do catálogo, padrão 5). | Critério 2 da issue. Wilson não colapsa em 0% ou 100% com amostra pequena, como o intervalo normal colapsa. |
| F-6 | **Duas leituras do perfil:** `por_perfil_dominante` e `por_afinidade` (cada aluno em todos os perfis com peso `afinidade / 100`; tamanho pelo n efetivo de Kish). | Critério 3: aluno raramente é perfil puro. Se as duas leituras discordam, o efeito do dominante pode ser de outro perfil forte no mesmo aluno. |
| F-7 | **Aluno sem `aluno_perfil` fica fora e é contado** (`populacao.sem_perfil`). | O console o trata como `mastermind` para desenhar a tela. Numa análise, isso inventaria dado justamente no perfil que se quer medir. |
| F-8 | **`prioritario_pct` mostra a decisão atual do grafo** (fatia das personalizações do perfil com aquele `formato_prioritario`), sem janela. | Para comparar o que o grafo escolhe com o que funciona, é preciso as duas coisas lado a lado. |
| F-9 | **Leitura no banco, por RPC com posse.** `SECURITY DEFINER`, confere `auth.uid()` e `app_classes_do_professor()` antes de ler, no molde de `metricas_estudo_coortes`. | Regra de fronteira: agregação não tem modelo de linguagem, então não é API. |
| F-10 | **Janela de datas locais, padrão de 90 dias, no máximo 366.** | Para PR3 de verdade, passe o `corte` e o `fim` da cohort de intervenção: antes do corte a trava segura o material (spec da cohort, §6). |

## 3. Uso

```sql
SELECT public.metricas_perfil_formato(ARRAY[<turma>]::bigint[], '<corte>', '<fim>');
```

A resposta traz `janela`, `n_minimo`, `populacao`, `formatos`, `por_perfil_dominante` (com
`desempenho` por formato), `por_afinidade`, `definicoes` e `limitacoes`. Nenhum `aluno_id` sai.

## 4. Ameaças à validade (vêm em `limitacoes`)

- **Observacional.** O formato não é sorteado: o grafo escolhe a ordem pelo perfil
  (`_PROFILE_FORMAT_PREFERENCES`). Um perfil que nunca recebeu um formato em primeiro lugar quase
  não o usa, e o resultado mostra associação, não causa.
- **Respostas do mesmo aluno não são independentes.** O IC trata cada resposta como independente
  e sai estreito demais. Para decidir, olhe `desempenho.alunos`, não só `respostas`.
- **Tópicos diferem em dificuldade.** Se um formato domina nos tópicos fáceis, ganha acerto sem
  mérito. Com poucas turmas não há como controlar isso aqui.
- **Consentimento.** A população ainda não é filtrada pelo consentimento de pesquisa (#17).

## 5. Como a conclusão volta para o grafo

**É manual, de propósito.** Uma realimentação automática fecharia um laço: o grafo põe o formato
X em primeiro, o aluno usa X porque é o que aparece, X vira o formato dominante do perfil e o grafo
reforça X. A RPC não tem como separar preferência de exposição (§4), então quem decide é uma
pessoa, com o resultado na mão.

Um resultado é **consolidado** quando, para o mesmo perfil:

1. as células comparadas não têm `amostra_insuficiente`, tanto em `por_perfil_dominante` quanto
   em `por_afinidade`;
2. as duas leituras apontam na mesma direção;
3. os `ic95_pct` dos dois formatos não se sobrepõem (critério conservador, por causa da
   dependência entre respostas);
4. o resultado se repete em mais de uma turma, ou numa janela de pelo menos 8 semanas.

Quando um resultado consolidado **contradiz** a priorização (`prioritario_pct` alto num formato
com acerto ou engajamento pior que outro):

1. Mude a ordem do perfil em `_PROFILE_FORMAT_PREFERENCES`
   (`api/app/services/personalizacao.py`). É ela que define o `formato_prioritario` no plano de
   reserva, reordena o plano gerado pelo modelo e a sequência de `steps` entregue ao aluno. Para
   registros legados sem perfil, `formato_prioritario` vem primeiro. Confira também `_PESOS_POR_PERFIL`
   (`api/app/services/sugestao_material.py`), a outra tabela por perfil que ainda não foi calibrada.
2. No PR, anexe a resposta da RPC (sem nada que identifique aluno), as turmas e a janela.
3. **Não** suba `_PERSONALIZACAO_PIPELINE_VERSION`. A ordem só muda o plano dos próximos ciclos, e
   subir a versão regeraria a mídia de todas as turmas, no tier gratuito do Gemini.
4. Registre o marco nas turmas do estudo, para a análise da cohort enxergar a mudança:
   `marco_produto_registrar(<turma>, 'personalizacao', 'ordem de formatos do perfil X', '<PR>')`.
