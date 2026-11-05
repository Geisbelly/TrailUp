# Rotas dos serviços

Gerado por `scripts/site_docs/rotas.py`, a partir do código. Não edite à mão.

A maior parte do sistema não passa por estas rotas. O app e o console falam direto com o Supabase, por tabela e RPC, sob RLS. A API existe para a IA, ver a regra de fronteira no `CLAUDE.md`.

## API (32)

FastAPI, em `https://api.trailup.promora.dev.br`. O console chega nela por `/trailup-api/*`, um rewrite do Vercel. Contrato interativo em `/docs` e `/redoc`, e em `/openapi.json`, sem as rotas de `/api/v1/admin`. **Login** é o JWT do Supabase, de aluno ou professor, e a rota confere a posse do dado.

| Rota | Acesso | Para quê |
| --- | --- | --- |
| `POST /api/v1/admin/personalizacao/media/backfill` | Admin (senha do `.env`) | Refaz a mídia que faltou nas personalizações. |
| `POST /api/v1/emocoes/analisar` | Aluno | Analisa a emoção do aluno. |
| `POST /api/v1/emocoes/analisar-stream` | Aluno | Analisa a emoção do aluno em fluxo contínuo. |
| `POST /api/v1/escriba/perguntar` | Professor | Chat da Lumi, a assistente do professor. |
| `POST /api/v1/insights/turma/{classe_id}/gerar` | Professor | Gera os insights da turma em segundo plano. |
| `GET /api/v1/insights/turma/{classe_id}/status` | Professor | Situação da geração de insights da turma. |
| `GET /api/v1/materiais/{aluno_id}` | Login | Materiais do aluno. |
| `POST /api/v1/personalizar` | Login | Roda o grafo de personalização para o aluno. |
| `POST /api/v1/personalizar/chat` | Login | Chat do aluno com o Guardião. |
| `GET /api/v1/personalizar/contexto/{aluno_id}` | Login | Contexto do aluno para o professor. |
| `POST /api/v1/personalizar/fontes` | Login | Envia fontes do professor (arquivo ou link). |
| `GET /api/v1/personalizar/grupo/{classe_id}` | Login | Distribuição de perfis e desempenho da turma. |
| `GET /api/v1/personalizar/jobs` | Professor | Lista os jobs da fila. |
| `POST /api/v1/personalizar/jobs/class-delta` | Professor | Enfileira o que mudou na turma. O banco já faz isso sozinho. |
| `POST /api/v1/personalizar/jobs/class-theme` | Professor | Enfileira a troca de tema da turma. O banco já faz isso sozinho. |
| `POST /api/v1/personalizar/jobs/enrollment` | Professor | Enfileira a matrícula de um aluno. O banco já faz isso sozinho. |
| `POST /api/v1/personalizar/jobs/full-sync` | Professor | Sincroniza a turma inteira. |
| `POST /api/v1/personalizar/jobs/manual-generate` | Professor | Botão "gerar" de um tópico e perfil. |
| `POST /api/v1/personalizar/jobs/manual-generate-all` | Professor | Botão "gerar tudo" da aba Personalizações. |
| `POST /api/v1/personalizar/jobs/manual-retry` | Professor | Botão "tentar novamente" do console. |
| `POST /api/v1/personalizar/jobs/student-cleanup` | Professor | Limpa as personalizações de um aluno que saiu. |
| `GET /api/v1/personalizar/jobs/{job_id}` | Professor | Detalhe de um job. |
| `GET /api/v1/personalizar/perfis/{classe_id}/{topico_id}` | Professor | Visão do professor: personalização por perfil. |
| `POST /api/v1/personalizar/perfis/{classe_id}/{topico_id}/regenerar/documento` | Professor | Regera o texto base do perfil. |
| `POST /api/v1/personalizar/perfis/{classe_id}/{topico_id}/regenerar/slide` | Professor | Regera um slide da base do perfil. |
| `POST /api/v1/personalizar/progresso` | Login | Grava o progresso em um item personalizado. |
| `GET /api/v1/personalizar/sugestao/{aluno_id}/historico` | Login | Sugestão atual, histórico e efetividade. |
| `GET /api/v1/personalizar/sugestao/{aluno_id}/{topico_id}` | Login | Ordem aconselhada do material do aluno. |
| `GET /api/v1/personalizar/{aluno_id}` | Login | Personalizações do aluno. |
| `GET /api/v1/personalizar/{personalizacao_id}/media-status` | Login | Situação da mídia de uma personalização. |
| `POST /api/v1/telemetria/lotes` | Aluno | Recebe um lote de telemetria e dispara a análise. |
| `GET /health` | Aberta | Saúde da API. |

## Microservice (9)

Gerador de mídia por perfil. Só a API chama, com o segredo no cabeçalho `x-api-secret`.

| Rota | Acesso | Para quê |
| --- | --- | --- |
| `GET /api/health` | Aberta | Saúde do serviço. |
| `POST /api/personalizar` | Segredo do serviço | Gera a mídia base de um perfil. |
| `POST /api/v1/archive` | Segredo do serviço | Guarda markdown, áudio e apresentação, gerando as imagens que faltam. |
| `POST /api/v1/generate/block` | Segredo do serviço | Enriquece um bloco de texto. |
| `POST /api/v1/generate/part-audio` | Segredo do serviço | Gera o áudio de uma parte. |
| `POST /api/v1/generate/part-presentation` | Segredo do serviço | Gera a apresentação de uma parte. |
| `POST /api/v1/regenerate/chapter` | Segredo do serviço | Regera um capítulo. |
| `POST /api/v1/regenerate/document` | Segredo do serviço | Regera o documento. |
| `POST /api/v1/regenerate/slide` | Segredo do serviço | Regera um slide. |

## BrainHexPDF

Render das apresentações, em `https://slides.trailup.promora.dev.br`. Aqui estão as rotas que o TrailUp usa.

| Rota | Acesso | Para quê |
| --- | --- | --- |
| `GET /health` | Aberta | Saúde do serviço (também em `/api/health` e `/api/v1/health`). |
| `GET /openapi.json` | Aberta | Contrato do serviço. |
| `GET /api/v1/docs` | Aberta | Documentação do serviço. |
| `POST /api/v1/render-and-store` | Segredo do serviço | Gera o deck, monta o HTML e sobe o arquivo. |

## Edge Functions (5)

No Supabase, em `/functions/v1/<nome>`. O app ainda chama `personalize_path`, que está publicada sem fonte neste repositório.

| Função | Acesso | Para quê |
| --- | --- | --- |
| `generate-content-ai` | Login | Console: gera a proposta de trilha e conteúdo. |
| `pesquisa-arquivar` | Segredo do banco | Copia para o R2 a telemetria de quem consentiu. Chamada pelo `pg_cron`. |
| `storage-redirect` | Link assinado ou sessão | Gateway de arquivos: redireciona para o R2. |
| `storage-upload-url` | Chave de serviço | URL assinada de upload no R2, para os serviços que geram arquivo. |
| `validate-essay-answer-ai` | Login | App: confere a resposta dissertativa. |

## Web (34)

Vite e React, em `https://trailup.vercel.app`. Qualquer outro caminho cai na página 404.

| Caminho | Acesso | Tela |
| --- | --- | --- |
| `/` | Aberta | Página inicial. |
| `/aluno` | Login | Introdução do aluno depois do cadastro. |
| `/auth/confirmacao` | Aberta | Confirmação do e-mail. |
| `/blog` | Aberta | Blog. |
| `/blog/:id` | Aberta | Artigo do blog. |
| `/cadastro-aluno` | Aberta | Cadastro do aluno. |
| `/cadastro-professor` | Aberta | Cadastro do professor. |
| `/console/personalizacoes/material` | Professor liberado | Console: material de uma personalização. |
| `/console/trilha/:topicoId/editar` | Professor liberado | Console: editor do tópico. |
| `/contato` | Aberta | Contato. |
| `/download` | Aberta | Download do app. |
| `/esqueci-senha` | Aberta | Pede a troca de senha. |
| `/login` | Aberta | Entrada. |
| `/privacidade` | Aberta | Política de privacidade. |
| `/redefinir-senha` | Link do e-mail | Define a senha nova. |
| `/sobre` | Aberta | Sobre o projeto. |
| `/termos` | Aberta | Termos de uso. |

### Abas do console

Uma rota por aba, geradas de `frontend/src/pages/consoleSections.ts`. Exigem professor liberado. **Aprovações** e **Painel técnico** são do dono do projeto, e quem protege é o banco.

| Caminho | Aba |
| --- | --- |
| `/console` | Visão geral |
| `/console/recomendacoes` | Recomendações |
| `/console/trilha` | Trilhas |
| `/console/missoes` | Missões |
| `/console/conquistas` | Conquistas |
| `/console/notas` | Notas |
| `/console/eventos` | Eventos |
| `/console/economia` | Economia |
| `/console/turmas` | Turmas |
| `/console/personalizacoes` | Personalizações |
| `/console/ranks` | Rankings |
| `/console/rank-de-batalhas` | Rank de batalhas |
| `/console/guildas` | Guildas |
| `/console/meus-dados` | Meus dados |
| `/console/aprovacoes` | Aprovações |
| `/console/tecnico` | Painel técnico |
| `/console/administracao` | Administração |

## App do aluno (32)

Expo Router, a partir de `mobile/src/app`. Os grupos `(auth)` e `(tabs)` não entram no caminho. O mesmo app é exportado para a web e abre em `https://trailup.vercel.app/aluno/login`.

| Caminho | Acesso | Tela |
| --- | --- | --- |
| `/` | Aberta | Boas-vindas sem login, início com login. |
| `/login` | Aberta | Entrada. |
| `/modal` | Login | Modal genérico. |
| `/notificacoes` | Login | Caixa de entrada. |
| `/notificacoes/[id]` | Login | Uma notificação. |
| `/perfil` | Login | Perfil do aluno. |
| `/perfil/appearance` | Login | Aparência. |
| `/perfil/biblioteca-conquistas` | Login | Biblioteca de conquistas. |
| `/perfil/coleta-dados` | Login | Consentimentos de coleta. |
| `/perfil/excluir` | Login | Exclusão da conta. |
| `/perfil/feedback` | Login | Feedback. |
| `/perfil/info` | Login | Informações. |
| `/perfil/info-app` | Login | Sobre o app. |
| `/perfil/info-versao` | Login | Versão instalada. |
| `/perfil/lembrete-diario` | Login | Lembrete diário. |
| `/perfil/loja` | Login | Loja. |
| `/perfil/metricas-estilo` | Login | Métricas e estilo de jogo. |
| `/perfil/modo-foco` | Login | Modo foco. |
| `/perfil/molduras` | Login | Molduras. |
| `/perfil/notifications` | Login | Preferências de notificação. |
| `/perfil/relatorio` | Login | Relatório do aluno. |
| `/perfil/resetar-senha` | Login | Troca de senha. |
| `/perfil/settings` | Login | Configurações. |
| `/perfil/study` | Login | Preferências de estudo. |
| `/ranking` | Login | Ranking. |
| `/ranking/[id]` | Login | Ranking de uma turma. |
| `/recuperarSenha` | Aberta | Recuperação de senha. |
| `/services/tela_de_entrada/login` | Aberta | Entrada antiga, ainda no roteador. |
| `/social` | Login | Social. |
| `/tela` | Aberta | Tela de abertura. |
| `/trilha` | Login | Trilha. |
| `/trilha/[id]` | Login | Tópico da trilha. |
