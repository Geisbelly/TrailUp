# LGPD no TrailUp: índice

Documentos e decisões de proteção de dados do projeto. A issue de acompanhamento é a [#195](https://github.com/BitStudioLabs/trail-up/issues/195).

| Tema | Onde está |
|---|---|
| Transferência internacional e fornecedores (dados, finalidade, país, treino, retenção, mecanismo, pendências) | [`transferencias-internacionais.md`](./transferencias-internacionais.md) |
| Prazos de retenção e expurgo (#616) | Tabela `public.retencao_politica` (migration `api/alembic/versions/20261024_03_retencao_e_expurgo.py`); começa em modo `simular` |
| Exclusão da conta de professor e aviso de conta inativa por e-mail | Seções abaixo · migration `api/alembic/versions/20261024_07_exclusao_professor_e_aviso_inatividade.py` |
| Decisão sobre inferência emocional (finalidade, revisão, o professor vê só a faixa) | [Comentário na #195](https://github.com/BitStudioLabs/trail-up/issues/195#issuecomment-6379616985) |
| Consentimento por finalidade, responsável legal e modo restrito (#613) | [PR/issue #613](https://github.com/BitStudioLabs/trail-up/issues/613) · migration `api/alembic/versions/20261024_02_consentimento_do_responsavel.py` |
| Situação geral da #195 | [Comentário de status](https://github.com/BitStudioLabs/trail-up/issues/195#issuecomment-6384811191) |
| Buckets privados do aluno (`conteudo_aluno`, `perfil_fotos`, `banners_fotos`) e ciclo de vida do R2 | [`storage-buckets-e-r2.md`](./storage-buckets-e-r2.md) · migration `api/alembic/versions/20261024_09_buckets_privados.py` · `infra/r2/` |
| Texto público | Site: `frontend/src/pages/Privacidade.tsx` e `Termos.tsx` |

## Regra de processo (resumo)

- **Serviço externo novo com dado pessoal**, ou mudança no que vai para um serviço existente → atualizar `transferencias-internacionais.md` no mesmo PR. O template de PR pergunta isso, e o teste `api/tests/test_registro_transferencias.py` pega hosts e SDKs conhecidos.
- **Imagens da câmera:** qualquer mudança no uso delas exige atualizar o registro e passar por revisão na #195 (ou na issue que a suceder) antes do merge. Isso vale para armazenar, enviar a terceiro, novo modelo ou nova finalidade.

## Contato (site e app)

- O formulário de `/contato` do site usa `fn_enviar_contato_publico` (migration `20261024_06`), que reaproveita a chave `brevo_api_key` do Vault e a API da Brevo, como o app já fazia. O formsubmit saiu.
- **Destino:** `app_config.contato_email_destino`, uma chave opcional e privada. Sem ela, vale `app_config.dono_email`. Nenhum e-mail fica no frontend.
- **Proteção:** campo armadilha (honeypot), limites de tamanho, teto por origem (`contato_publico_por_hora_origem`, padrão 3/h) e teto global (`contato_publico_por_hora_total`, padrão 30/h). O contador guarda só o hash do IP e é limpo a cada 24 h.

## Exclusão da conta de professor (migration `20261024_07`)

- **Quem pode:** só o próprio professor, com sessão (`fn_excluir_minha_conta_professor`, checa `auth.uid()` no servidor). A conta do dono do app (`app_e_dono()`) é recusada: passe a administração antes.
- **O que sai na hora:** a linha de `professor` (nome, descrição, instituição, disciplina) e o perfil de aluno da mesma pessoa, se houver. O usuário do Auth (e-mail e senha) vai para `retencao_fila_externa` e o worker da API o apaga (precisa de `RETENCAO_EXTERNA_ENABLED=true`).
- **As turmas do professor são apagadas, com tudo o que depende delas.** Vale para qualquer caminho (a RPC, o dono apagando pelo console, a cascata do Auth): o gatilho `trg_professor_removido_apaga_turmas` (BEFORE DELETE em `professor`) chama `trailup_apagar_turma_inteira(classe)` para cada turma. Sai: trilhas, tópicos, conteúdos, atividades e questões; matrículas, notas, respostas e entregas; material personalizado; guildas, convites, missões, eventos, conquistas da turma; loja, moedas e economia; ranking; telemetria, inferências e logs de IA da turma; registros de saída. O modal do console mostra quantas turmas e quantos alunos são afetados e exige digitar EXCLUIR.
- **Tabelas tratadas à mão** (as demais saem por `ON DELETE CASCADE`):
  - sem FK para a turma (ficariam órfãs): `personalizacao_percurso`, `personalizacao_item_progresso`, `personalizacao_sugestao`, `personalizacao_sugestao_log`, `professor_intervencoes_passo`, `intervencoes`, `economia_auditoria`, `rag_chunks`, `rag_openai_files`, `loja_uso_log`, `loja_formato_escolhido`, `loja_dica_liberada`, `questao_gabarito_revelado`, `telemetria_agregado_turma_dia`, `telemetria_lotes`, `telemetria_time_metric_entries`, `classe_aluno_saidas`;
  - FK `SET NULL` (ficariam soltas): `moedas_ledger`, `eventos_aluno`, `telemetria_eventos_app`, `ia_decision_logs`;
  - FK `NO ACTION`/`RESTRICT` (seguram o DELETE): `bag_itens` (as cópias da mochila saem também), `guilda_evento_snapshot`, `classe_perfil_summary`, `cards_personalizados`, `fontes_personalizacao`, `materiais_gerados`, `conteudo_personalizado`, `atividade_conteudos`, `questao_aluno`, `trilha_aluno`.
- **Arquivos:** os caminhos da turma no Storage e no R2 (`conteudos.conteudo` e `metadata.files`, `midias.url`, `questoes.midia_url`, `cards.imagem_url`, fontes do professor, `conteudo_personalizado.materiais`) e os uploads do professor em `conteudos/<id>/` (`storage.objects`) entram em `retencao_fila_externa`. Materiais gerados, fontes do aluno, arquivos da OpenAI e telemetria já tinham gatilho próprio. O worker só apaga depois do commit e não apaga arquivo que outra linha ainda usa (uma turma duplicada aponta para o mesmo arquivo).
- **O que fica:** a conta e o perfil de cada aluno e as outras turmas dele; BrainHex (`aluno_perfil`, `aluno_perfil_medida`); consentimentos e a prova mínima de consentimento (5 anos).
- **FKs:** `classe.professor_id` passou a `ON DELETE CASCADE` (rede de segurança; a limpeza de verdade é o gatilho) e `professor.id → auth.users` a `ON DELETE CASCADE`.
- **Registro do pedido:** `exclusao_conta_professor` (só o id, a data e as contagens de turmas e alunos, para o worker saber que pode apagar o Auth), mantido por 5 anos pela `retencao_politica`.
- **Teste:** `api/tests/test_e2e_exclusao_professor_aviso.py` semeia uma linha em cada uma das 86 tabelas que dependem da turma (com ou sem FK) e confere que nenhuma linha do banco cita mais a turma apagada.

## Aviso de conta inativa por e-mail (migration `20261024_07`)

- **Regra:** conta de aluno sem acesso há 24 meses (`retencao_inatividade_dias`) recebe aviso no app e por e-mail. Se continuar sem acesso, é apagada 30 dias (`retencao_aviso_dias`) **depois que a Brevo aceitou o e-mail**. Sem e-mail entregue, não há exclusão: a conta fica em `retidas_sem_email` no relatório.
- **Envio:** `retencao_avisos_email()` usa a chave `brevo_api_key` do Vault e o `net.http_post`, como o contato. Roda dentro de `trailup_retencao()` e a cada 30 min (`trailup_retencao_avisos` no pg_cron), além de no loop do worker da API.
- **Remetente:** `app_config.retencao_aviso_remetente`, ou `contato_email_destino`, ou `dono_email`. Precisa ser um remetente verificado na Brevo. Link de entrada: `app_config.retencao_aviso_link`.
- **Falhas:** sem e-mail, sem chave, sem pg_net ou resposta não 2xx ficam gravados em `retencao_avisos_inatividade.email_ultimo_erro` e são tentados de novo (espera crescente, até `retencao_aviso_email_max_tentativas`). Também vão para o log do Postgres (`RAISE LOG`).
- **Menor de idade:** o esquema não guarda e-mail do responsável (só nome e relação em `consentimento_responsavel`). O aviso vai para o e-mail da conta, com uma linha pedindo que o aluno mostre a mensagem ao responsável.
- **Cancelamento:** entrar de novo apaga o aviso e zera o prazo.
- **Modo `simular`:** só relata (`avisaria`, `removeria`, contagens); não envia nem apaga.

## Arquivos do aluno no Storage e no R2 (migration `20261024_09`)

- `conteudo_aluno`, `perfil_fotos` e `banners_fotos` passam a ser privados. A leitura é por URL assinada curta ou pelo gateway `storage-redirect`. O RLS em `storage.objects` limita quem lê ao aluno, aos colegas e professores da turma e ao dono. O banner fecha também, porque é dado pessoal do aluno.
- O fechamento é manual e vem **depois** do deploy de todo o código novo: `select public.trailup_fechar_buckets_privados();`.
- No R2, só a telemetria bruta (`telemetria/lotes/`, `telemetria/eventos/`) expira sozinha, em 200 dias. Aplicar só com `retencao_modo = 'aplicar'`.
- Detalhes, ordem de deploy e como aplicar: [`storage-buckets-e-r2.md`](./storage-buckets-e-r2.md).
