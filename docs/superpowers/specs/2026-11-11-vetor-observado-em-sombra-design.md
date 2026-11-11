# Vetor observado em sombra (fase 5 do roteiro de diversidade de perfis)

**11/11/2026 · Migration:** `20261111_05_perfil_observado_em_sombra` · **Versão dos indicadores:** `v1-sombra`

## O que é

Uma tabela, `aluno_perfil_observado`, com o que o **uso** do app diz sobre cada perfil BrainHex do
aluno, indicador a indicador, recalculada uma vez por dia pelo banco. Ela fica em sombra:

- não escreve em `aluno_perfil` (o vetor do questionário continua sendo o único que o produto usa);
- nenhum fluxo do app, do console ou da API a lê;
- não combina o observado com o questionário, não estima confiança nem probabilidade.

Ela existe para o teste em sala: ter, lado a lado e com a quantidade de dado de cada um, o que o
aluno respondeu e o que ele fez. Comparar os dois é trabalho de pesquisa, com protocolo próprio
(`docs/analises/issue-1-adaptacao-evidencias.md`, §6), e não uma regra do produto.

## Por que não combinar com o questionário

O atualizador experimental (`frontend/src/features/signup/atualizacaoDoPerfil.ts`) combina fontes
por precisão, e precisão vem de confiança. A v3 do questionário decidiu que a confiança **não é
estimada** (`confianca = null`), e por isso perfis v3 não entram no atualizador. Combinar agora
exigiria inventar um peso para o questionário. A sombra guarda só a evidência; a combinação, se
vier, depende de calibração com dado da turma.

## Indicadores da v1

Só os que têm fonte no banco **e** significado já definido nas funções puras do frontend
(`indicadoresDeComportamento.ts`). A conta é a mesma, e um arquivo de casos compartilhado
(`api/tests/fixtures/perfil_observado_casos.json`) roda nos dois lados: no SQL pelo e2e, no
TypeScript pelo vitest.

| Perfil | Indicador | Fonte | Valor (−1 a 1) | `n` |
|---|---|---|---|---|
| Survivor | `persistencia_apos_erro` | `atividade_tentativas` (relógio do servidor, #136) | `(insistiu / com_erro − 0,5) × 2` | atividades com erro |
| Mastermind | `proporcao_de_teoria` | `conteudo_aluno.tempo_gasto_min` × `atividade_aluno.tempo_gasto_min` (tempo ativo) | `(teoria / total − 0,5) × 2` | minutos, no mínimo 1 |

- **Com erro**: a atividade tem ao menos uma tentativa respondida com acerto abaixo de 100%.
  **Insistiu**: a atividade tem tentativa de número maior que 1, respondida ou não (voltar já é o
  comportamento).
- **Sem ocasião, sem linha.** Aluno que nunca errou não tem `persistencia_apos_erro`; aluno sem
  tempo ativo não tem `proporcao_de_teoria`. Zero diria "não persiste", que é outra coisa.
- A linha de um indicador que perdeu a ocasião (dado apagado) sai no recálculo seguinte.

### Fora da v1, e por quê

| Perfil | Motivo |
|---|---|
| Achiever | `conclusao_de_opcional` precisa saber o que é opcional; nenhuma coluna do banco marca isso (medido em 11/11). |
| Conqueror | Não há evento de tela de ranking: a telemetria só vem da tela da trilha (`trilha_topico`). |
| Seeker, Daredevil, Socializer | Há dado bruto (revisitas, ordem de abertura, mensagens), mas não há definição de "típico" para centrar o valor. Criar agora seria inventar o número. |

## Onde roda e quem lê

- **Banco**, porque não há modelo de linguagem no meio (regra de fronteira). Uma função
  `SECURITY DEFINER`, `fn_perfil_observado_recalcular()`, recalcula tudo, e o `pg_cron` a roda às
  06:20 UTC (job `trailup_perfil_observado`).
- **Leitura só pelo `service_role`.** RLS ligada, sem policy para `anon` nem `authenticated`, e sem
  GRANT para eles. Mostrar ao aluno ou ao professor "o comportamento diz que você é Survivor"
  contrariaria os limites da v3.
- **Retenção:** `vida_da_conta`. FK para `alunos` com `ON DELETE CASCADE`.

## Dado em produção (11/11, só leitura)

7 alunos, 6 com questionário. Telemetria de 1 aluno; 4 tentativas em `atividade_tentativas`, de 1
aluno; tempo ativo de 2 a 3 alunos. A tabela vai nascer com linhas para 1 a 3 alunos. É
infraestrutura para o teste em sala, não resultado: nada aqui sustenta afirmação sobre os alunos no
TCC.
