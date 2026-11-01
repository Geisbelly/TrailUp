# Cohort e baseline para medir efetividade (#13)

Desenho aprovado em 01/11/2026. Implementado em `20261102_02_estudo_coorte_e_marcos` e
`20261102_03_metricas_estudo_coortes`. Atende a PR1 e PR2 de
[TCC 09 §3](../../tcc/09-metodologia-de-pesquisa-e-avaliacao.md) e prepara a #19 (série por
ciclo) e a #20 (perfil × formato na mesma janela).

## 1. O que a produção tinha em 01/11

Medição só de leitura e só de agregados, sem nome, e-mail ou `aluno_id`, com o Alembic em `20261101_13`:

| Fato | Medida |
|---|---|
| Turmas | 4, sendo 3 marcadas `[TESTE]`; 3 alunos matriculados, 7 cadastrados |
| Telemetria | 1 aluno, o mesmo nas 4 turmas, de 14/10 a 01/11; 9,25 min ativos no escopo `topic` |
| Personalização `pronto` | 1 linha, na turma 66; outras 13 `failed` |
| Dados de PR2 com data | 2 respostas em `questao_aluno`; 0 em `atividade_tentativas`; conclusão de tópico com data só pelo evento `topic_complete` do app (11 eventos) |
| Plataforma | 159 lotes sem `cliente` e 12 de `web`; câmera ligada em 0 de 103 sessões |
| Cohort, baseline ou marco | nada; só a segmentação descritiva por perfil da `20261027_01` (`comparacao_causal = false`) |

**Conclusão:** não há cohort nem baseline para reconstruir. Todo o dado existente é de QA e
fica fora da análise (spec de métricas §7). Por isso o desenho é **prospectivo**: o registro
precisa existir antes de o estudo começar.

## 2. Decisões

| # | Decisão | Por quê |
|---|---|---|
| C-1 | **A cohort é a turma, com uma data de corte.** `estudo_coorte` tem uma linha por turma. | O material-base é compartilhado por `classe × tópico × perfil`, e ranking e guilda comparam colegas. Sortear alunos dentro da mesma turma contamina a comparação. |
| C-2 | **O baseline é `[baseline_inicio, corte)`, com pelo menos 7 dias. A intervenção é `[corte, fim]`.** | A comparação pré × pós fica dentro da própria turma, e as janelas são fixadas no protocolo (TCC 09 §7). |
| C-3 | **A turma de comparação também tem `corte`**, que serve só de data de referência. | Permite a diferença-em-diferenças. Um desenho escalonado é só outra turma de intervenção com corte mais tarde. |
| C-4 | **O registro é prospectivo e o protocolo trava.** `estudo_coorte_registrar` recusa baseline no passado. Um gatilho trava `baseline_inicio`, `braco`, `timezone` e `corte` quando a data deles chega. Toda mudança vira marco `protocolo`. | Escolher a janela depois de ver o dado é o viés que isso impede. |
| C-5 | **A população é a dos pareados**: alunos matriculados antes do corte (intenção de tratar). Pareado sem telemetria conta como zero. | Quem entra depois do corte não tem baseline. Alunos que não estudam não podem sumir do denominador. |
| C-6 | **A entrada do aluno tem duas datas.** A atribuída é o maior entre o corte e a matrícula. A observada é o primeiro tempo ativo no escopo `material`, que só o `PersonalizedTopicView` grava. | Critério 1 da issue. A diferença entre as duas mede a adesão. |
| C-7 | **O ciclo de análise é a semana relativa ao corte** (−1 é a última semana do baseline, 0 a primeira depois dele). O número de `ciclo_id` gerados na semana vem como atributo. | O `ciclo_id` da personalização é irregular e muda de aluno para aluno. A semana é igual para todos e serve à #19. |
| C-8 | **Os marcos de produto ficam no banco.** Os manuais por turma são gravados pelo professor dono. Os globais, pelo dev (`app_e_dev()`). Há dois automáticos: cada migration aplicada (gatilho em `alembic_version`) e cada mudança de protocolo. As versões do app são derivadas de `payload->'cliente'->>'app_version'`. | Critério 4 da issue (TCC 09 §7). O gatilho em `alembic_version` é a única forma de dar data a uma migration, e ele nunca derruba a migration: se falhar, vira WARNING. |
| C-9 | **A conclusão de tópico ganha data** em `topico_aluno_conclusao`: é a primeira conclusão, gravada por gatilho em `topico_aluno`. | `topico_aluno` guarda só o estado atual. O `topic_complete` depende do app e do consentimento de telemetria. Conclusões anteriores à migration ficam sem data. |
| C-10 | **O relatório é anônimo.** Só sai agregado, sem `aluno_id`. Célula com menos pareados que `n_minimo` volta `NULL` com `amostra_insuficiente`. O valor vem do `metricas_catalogo` e o padrão é 5. O acerto também exige `n_minimo` alunos com resposta. | Critério 5 da issue (TCC 09 §8). Com 1 a 4 alunos, o "agregado" é o dado de uma pessoa. |
| C-11 | **Nada passa pela API.** Tabelas, gatilhos, view e RPCs ficam no Postgres. | Regra de fronteira: registrar, marcar e agregar não envolvem modelo de linguagem. |

## 3. O que fica no banco

| Objeto | Para quê | Acesso |
|---|---|---|
| `estudo_coorte` | turma, braço e janelas | o professor dono lê; a escrita é só por `estudo_coorte_registrar` e `estudo_coorte_remover` |
| `marco_produto` | mudanças durante a coleta | o professor dono lê os da turma; quem dá aula e o dev leem os globais; a escrita é só por `marco_produto_registrar` e pelos gatilhos |
| `topico_aluno_conclusao` | data da primeira conclusão | o aluno lê a própria; o professor lê as da turma; a escrita é só pelo gatilho |
| `vw_estudo_participantes` (`security_invoker`) | a cohort de cada aluno, a data de entrada (atribuída e observada), se é pareado, se foi exposto no baseline e a fase atual | o professor dono, pela RLS das tabelas base |
| `metricas_estudo_coortes(classe_ids[])` | PR1 e PR2 por turma, `pre` e `pos`, série semanal, marcos, contaminação e comparação entre braços | o professor dono de **todas** as turmas pedidas |
| `estudo_indicadores_janela` e `estudo_indicadores_publicos` | contagens cruas e supressão | sem EXECUTE para cliente nenhum |
| `metricas_catalogo` | `estudo.pr1_tempo_ativo`, `estudo.pr2_conclusao`, `estudo.pr2_atividades` e `estudo.pr2_acerto` | já existente |

### Indicadores

- **PR1:** soma de `active_sec` do escopo `topic`, em minutos por aluno pareado e por semana.
  Não usa `dwell_sec`. Não soma escopos: eles são aninhados, e somá-los multiplica o tempo.
  Também traz o percentual de pareados ativos.
- **PR2:**
  - tópicos concluídos por aluno e semana, pela `topico_aluno_conclusao`;
  - atividades entregues por aluno e semana, pela primeira `respondida_em` de `atividade_tentativas` (o relógio do servidor da #136);
  - acerto na 1ª tentativa, pela `questao_aluno` (D-5).
- **Comparação:** para cada braço e fase, soma os alunos das turmas do braço antes de checar o
  mínimo. Calcula a diferença-em-diferenças `(I_pos − I_pre) − (C_pos − C_pre)` e informa se os
  cortes estão alinhados.
- **Contaminação:**
  - `material_pronto_antes_do_corte`;
  - `alunos_expostos_pct` em cada janela;
  - `baseline_contaminado`;
  - `comparacao_recebeu_personalizacao`, só na turma de comparação.
- **Viés de plataforma** (#30): `lotes_por_plataforma` em cada janela.

## 4. O que ficou de fora

- **A trava da personalização.** Hoje nenhuma chave segura a geração. O gatilho de matrícula e o
  do editor de trilha enfileiram na hora, e a API tem 6 caminhos de `INSERT` em
  `conteudo_personalizado`. Sem a trava, o baseline e a turma de comparação recebem material. Ela
  é uma PR separada e **pré-requisito para iniciar o estudo**. Até lá, a RPC acusa a contaminação
  em vez de supor um baseline limpo.
- **Tela no console.** As RPCs ficam prontas para ela, e o professor registra a turma pelo
  `supabase.rpc`.
- **Análise entre professores.** A RPC só cruza turmas do mesmo professor. A análise do estudo
  inteiro roda como `service_role`, com a mesma função interna e a mesma supressão.
- **#19 e #20** consomem a série semanal e as janelas daqui, mas não fazem parte desta entrega.

## 5. Ameaças à validade (vêm em `limitacoes`, na própria resposta)

1. Sem a trava, a personalização pode vazar para o baseline e para a turma de comparação.
2. O tempo ativo depende de telemetria consentida.
3. Na web não há câmera, e a telemetria muda (#30).
4. O conteúdo estudado antes e depois do corte é outro. A turma de comparação desconta esse efeito.
5. As conclusões anteriores à `20261102_02` não têm data.
6. Uma célula pequena volta nula.
