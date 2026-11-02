# Políticas de Dados e Privacidade

Atualizado em: 2026-11-02

## 1. Objetivo

Este documento descreve a política técnica de dados e privacidade do TrailUp, alinhada a boas práticas e à LGPD. Não substitui documentos jurídicos oficiais.

## 2. Tipos de dados tratados

| Categoria | Exemplos | Finalidade |
| --- | --- | --- |
| Identificação | nome, e-mail, ids | autenticação e uso do sistema |
| Acadêmico | turmas, tópicos, notas | operação pedagógica |
| Comportamental | telemetria e eventos | personalização e melhoria |
| Conteúdo | materiais e respostas | geração de conteúdo personalizado |

## 3. Bases legais e consentimento

- O uso é baseado em consentimento explícito e/ou execução de contrato.
- Professores e alunos devem aceitar os termos antes do uso.

## 4. Retenção e descarte

- Dados acadêmicos seguem política institucional.
- O usuário pode solicitar remoção dos dados quando aplicável.
- **Prazos da telemetria e dos dados de aluno** (decisão de 2026-10-24, tabela `retencao_politica`, migration `20261024_03`):

  | Dado | Todos | Quem consentiu pesquisa |
  | --- | --- | --- |
  | Telemetria bruta (payload dos lotes, eventos do app) | 90 dias | 180 dias |
  | Telemetria derivada (lotes, sessões, métricas de tempo, estudo) | 13 meses | 24 meses |
  | Inferência emocional (`aluno_mental_state_history`) | 30 dias | 30 dias |
  | Prova mínima de consentimento depois da conta apagada | 5 anos (só o hash do id) | 5 anos |
  | Conta inativa | 24 meses, com aviso e +30 dias | igual |
  | Saída da turma: conteúdo gerado | +90 dias | igual |
  | Saída da turma: notas, moedas, ranking | +365 dias | igual |

- O tempo de estudo é **agregado por turma, tópico e dia** (`telemetria_agregado_turma_dia`, sem aluno) antes de a linha bruta sair. É o caminho de agregação irreversível previsto para a telemetria.
- **Estado em produção: desligado.** O job `trailup_retencao` nasceu com `app_config.retencao_modo = 'simular'`: conta o que apagaria, registra em `retencao_execucoes` e não apaga nada. Os prazos acima valem como regra decidida, não como expurgo em andamento. Ligar (`'aplicar'`) apaga dado de produção e depende de decisão do time.

## 5. Compartilhamento

- Não há compartilhamento com terceiros sem base legal.
- Fornecedores de IA recebem somente o mínimo necessário ao processamento.

## 6. Direitos do titular

- Acesso, correção e exclusão conforme LGPD.
- Canal de suporte para solicitações.

## 7. Segurança e confidencialidade

- Criptografia em trânsito (HTTPS).
- Controle de acesso por roles e RLS.
- Auditoria e rastreabilidade de alterações críticas.

## 8. Observações

Este documento deve ser revisado periodicamente e validado pelo jurídico.

## 9. Relatórios analíticos e agregados (#17)

Vale para o que sai do banco como número de turma ou de grupo (estudo de efetividade, engajamento, painel técnico). A regra, e o que a cumpre hoje:

| Regra | Situação |
| --- | --- |
| **Sem identificador direto.** Agregado não devolve `aluno_id`, nome nem e-mail. | Cumprida em `metricas_estudo_coortes`, `metricas_engajamento_turma`, `metricas_engajamento_coortes_turma`, `personalizacao_kpis_operacionais` e `painel_tecnico`. |
| **Supressão de grupo pequeno.** Célula com menos que `n_minimo` alunos (padrão **5**, `metricas_catalogo`) volta nula **inteira**, não só as taxas. | Cumprida no estudo (`metricas_estudo_coortes`; os campos `lotes_por_plataforma` e `ciclos_personalizacao` escapavam e foram corrigidos na `20261102_24`). As RPCs de engajamento da turma só marcam `amostra_pequena`, porque o único leitor é o professor dono, que já vê cada aluno. |
| **Acesso.** Toda RPC de turma confere `app_classes_do_professor()` e responde 42501 a quem não é dono; o painel técnico confere `app_e_dono()`. | Cumprida. Não existe papel "analítico" separado: qualquer professor dono lê o agregado da própria turma. |
| **Retenção da telemetria bruta.** | Definida na seção 4; job em modo `simular`. |
| **Quem não consentiu fica fora do agregado.** | **Não cumprida.** `aluno_finalidade_permitida` só barra a ingestão do modo restrito e do menor (responsável); para maior de idade não lê `consentimento_telemetria`, e o estudo usa todo o `classe_aluno` pareado, não `vw_alunos_pesquisa_elegiveis`. |

Fora do escopo desta regra, de propósito: telas e exports **do professor sobre os próprios alunos** (as views `vw_metricas_*_aluno_*`, `vw_estudo_participantes`, o CSV de notas com nome e e-mail). Ali o professor dono já é o destinatário legítimo do dado individual; a regra de agregado não se aplica. Se um desses sair do console para circular, ele passa a ser relatório analítico e precisa da supressão e da anonimização acima.

### Pendente de decisão

1. Ligar a retenção (`retencao_modo = 'aplicar'`).
2. Fazer o consentimento do maior de idade barrar a ingestão e os agregados, e o estudo passar a usar só `vw_alunos_pesquisa_elegiveis`. Isso muda a população do TCC.
3. Papel analítico separado do professor dono.
4. **Finalidade e base legal** de cada categoria: dependem de validação jurídica (#632). Este documento descreve o que o sistema faz, não declara base legal.
5. Um único lugar para o `n_minimo`: hoje ele está em `metricas_catalogo` e como `5` fixo em código do console (`graficos.ts`).

## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.
