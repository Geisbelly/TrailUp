Próxima tela da mesma área: **Relatório dos meus dados**.

Mantenha a paleta do perfil ativo. Tom: transparência e controle — é uma tela de prestação de contas (LGPD), não uma tela de venda de recurso.

## O que ela faz

Mostra ao aluno um relatório do que a plataforma sabe sobre ele, e permite gerar/compartilhar isso como PDF.

## Conteúdo real de hoje

1. Título "Relatório dos seus dados".
2. Seção explicativa "O que entra no relatório" — lista os tipos de dado incluídos: eventos de estudo/pontuação, posições em rankings, conquistas, entre outros.
3. Ação "Gerar e compartilhar o PDF" — monta um relatório (identificação do aluno, eventos, rankings, conquistas) e oferece compartilhar o arquivo gerado.

## Atenção — bug conhecido a considerar no design (issue #28)

**Hoje, na versão web, a geração do PDF falha em silêncio** — o aluno toca em gerar e nada visível acontece, sem nenhum aviso de erro. Ao desenhar esta tela, proponha um **estado de erro explícito** para quando a geração falhar (ex.: "Não foi possível gerar o relatório agora, tente novamente" + ação de retry) — isso é parte do que se espera resolver ao levar esta tela a sério na web, mesmo que a correção do bug em si seja trabalho de código separado, fora deste protótipo.

## Estados

- **Gerando** (enquanto monta o PDF).
- **Sucesso** (PDF pronto, opção de compartilhar/baixar).
- **Erro** (ver acima — este é o estado que hoje não existe e precisa ser desenhado).

## O que peço

Desenhe a tela com a explicação do que entra no relatório, e os três estados da ação de gerar PDF (gerando/sucesso/erro). O estado de erro é o mais importante desta tela — capriche nele.
