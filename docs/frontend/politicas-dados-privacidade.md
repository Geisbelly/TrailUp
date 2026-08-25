# Políticas de Dados e Privacidade

Atualizado em: 2026-04-13

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
- Logs técnicos possuem janela de retenção curta.
- O usuário pode solicitar remoção dos dados quando aplicável.

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


## Atualizacoes (2026-04-13)

- Console do professor passou a validar upload com lista fixa de formatos (pdf, doc, docx, ppt, pptx, txt, md, mp3, wav, ogg, mp4, webm, mov) e limite de 200 MB.
- Midia de questoes aceita apenas image/video/audio/pdf.
- Web envia `personalizacaoThemeGuide` (paleta + tom por perfil) para a Edge Function `generate-content-ai`.
- Edge Function inclui um guia de tema e tom no prompt de IA, alinhando a geracao com o tema do mobile.
