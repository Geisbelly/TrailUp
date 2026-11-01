# Sugestão com evidência e notificação no horário do aluno (#66)

Data: 2026-11-01. Desenho aprovado na sessão de 01/11 ("Aprovo"). Continua a
[sugestão de material por aluno](2026-08-25-sugestao-de-material-por-aluno-design.md) e as
[notificações via banco](2026-08-26-notificacoes-via-banco-design.md).

## O que a medição em produção mostrou (01/11, só leitura)

- `personalizacao_sugestao`: 1 linha, em `versao = 2` com `origem = inicial`, e **dois** `criada` no
  log. Dois GET simultâneos criaram a mesma sugestão; o upsert subiu a versão.
- A evidência gravada era só `{"modo_operacao": ...}` e os motivos, texto livre ("afinidade
  Sobrevivente"). Nada dizia que o peso por perfil não tem evidência.
- `notificacoes_ia` não tinha coluna de horário; `notificacoes_ia_promover` gravava `horario = now()`.
  As sugestões de 31/10 saíram às 00:34, dentro do silêncio de 22h–7h.
- Revisão diária às 19h (padrão) para 4 dos 5 alunos, 22h para um (escolha). Sem como distinguir
  escolha de padrão. Texto fixo para todos.
- `aluno_sessoes_app`: 679 sessões de 5 alunos, uma conta com 602 e 205 sessões com
  `duracao_seg = 0`. Amostra pequena e ruidosa.
- Corpo do RAG: 0 documentos. A base de evidências avaliada (`docs/rag/avaliacao-documentos.md`) é
  o que existe: casar formato com perfil não tem evidência (DAT-14, 35, 40; DAT-03 contra DAT-41);
  quiz que reexpõe o conteúdo tem evidência forte (DAT-21); lembrete funciona ligado ao progresso e
  genérico pode gerar ansiedade (DAT-33, 45, 32); telemetria mede engajamento, não emoção (DAT-45,
  DAT-04).

## Frente 1: sugestão com evidência

O motor continua determinístico (reescopo da #66 em `docs/rag/triagem-corpus.md`). O que muda é o
que ele diz sobre si mesmo.

- **Catálogo de regras** em `api/app/services/evidencias_pedagogicas.py`, versionado
  (`CATALOGO_VERSAO`), no formato da #73: id, enunciado, construto, fontes `DAT-xx` e confiança
  (`forte`, `moderada`, `hipotese`, `dado_do_aluno`). Um teste confere que toda fonte citada existe
  na avaliação do corpus.
- **Cada item da ordem leva `evidencias`**: a regra que o moveu e os números do aluno que ela viu
  (afinidades, tempo ativo e média, só passou os olhos, acertos, % concluído, tempo com o material
  aberto). Só vira evidência o que mexeu no score; "leitura lenta com bom desempenho" é motivo, não
  evidência.
- **O peso por perfil sai como "hipótese sem evidência"**, e o modo de estudo declarado também.
- **Regra nova (DAT-21):** com acerto médio abaixo de 60 em pelo menos duas atividades concluídas do
  tópico, os cards vão para o topo, uma vez só (a evidência fica no item e impede somar de novo).
  Não passa pelo mínimo de evidência por formato: é desempenho do tópico, não atribuição a formato.
  Sem cards gerados, não inventa formato. O sinal sai de `atividade_aluno` (só concluída: o
  `acertos_percentual` nasce 0).
- **Emoção não reordena (DAT-45).** Nenhuma regra do catálogo liga emoção a formato; um teste fixa.
- **O log grava `catalogo_versao`** na criação e em cada revisão.
- **Criação com `ON CONFLICT DO NOTHING`**: quem perde a corrida não tem linha, não loga e devolve a
  sugestão de quem ganhou.
- Sem mudança de schema: tudo cabe nos JSONB (`ordem`, `evidencia`).
- O console mostra o "por quê" no `SugestaoMaterialCard`: por item, a confiança (hipótese em
  destaque), as fontes, o enunciado e os números em frases curtas. Sugestão anterior à #66 cai nos
  motivos em texto.

## Frente 2: horário e texto por aluno, no banco

Migração `20261102_01`. Tudo é banco pela regra de fronteira; a API só grava o horário que o modelo
sugeriu.

- `notificacoes_horario_preferido(aluno)`: 28 dias de `aluno_sessoes_app`, no fuso de cada sessão;
  descarta sessão com menos de 60 s (pela maior entre `duracao_seg` e o intervalo) e sessão que
  começa no silêncio; conta **dias distintos** por hora; exige 3 dias de uso e 2 na hora vencedora,
  senão 19h. O envio sai 30 min antes da hora habitual. Tudo ajustável em `notificacoes_config`.
- `notificacoes_agendamentos.hora_origem` (`padrao`, `aluno`, `inferida`). `salvar_rotina` marca
  `aluno` só quando hora ou minuto mudam: a tela "Lembrete diário" é a única chamadora e manda a
  hora também no liga/desliga. Backfill: hora fora do padrão vira `aluno`.
- Job diário no `pg_cron` (09:00 UTC): recalcula a hora das rotinas que não são `aluno` e troca o
  texto da revisão diária pelo modelo do perfil dominante, com o tópico em andamento e o % (DAT-33).
  Modelos em `notificacoes_modelos_texto`, **sem policy de propósito** (acesso só por função
  `SECURITY DEFINER`). O login deixa de reescrever o texto da revisão.
- `notificacoes_ia.horario_sugerido`, preenchido pela API. O gatilho de promoção: suporte sai logo;
  lembrete vai para o próximo horário habitual, senão o do modelo, senão agora; outros tipos usam o
  do modelo, senão agora; sempre fora do silêncio no fuso do aluno. A varredura passa a visitar quem
  tem pendente de horário vencida.
- A API passa ao modelo o tópico em andamento, o % e o próximo conteúdo (`foco_estudo`, declarado no
  `TrailUpState`); o texto pronto da regra ganha o nome do tópico.
- O mobile não muda: ele agenda a notificação local pelo que `notificacoes_minhas_rotinas` devolve.

## Fora desta entrega (follow-ups)

- Levar a criação da sugestão para o banco (hoje só existe pela API: sem API, sem sugestão).
- Tarefa 4 da issue: métricas de efetividade da sugestão e da notificação.
- A regra de reexposição só roda num ciclo com material aberto (`revisar_sugestoes_do_ciclo` sai
  cedo sem material); um lote só de atividade não revisa.
