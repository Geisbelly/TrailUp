# Personalizacao e Multimidia no App

## Objetivo
Padronizar como o app renderiza materiais personalizados e como persiste progresso/tempo durante o estudo.

## Fontes de dados
- Fonte principal de personalizacao: `conteudo_personalizado.materiais`.
- Fonte de fallback: estrutura academica (`conteudos`, `atividades`, `cards`, `midias`).

## Formatos suportados
- Texto/Markdown
- Audio (arquivo)
- Video (arquivo e embed)
- PDF
- DOCX
- PPTX
- Cards

## Regra de renderizacao
1. Tentar renderizador nativo do formato.
2. Em falha, aplicar fallback seguro (webview/download/placeholder).
3. Manter tema visual do app (medieval/classico/magico/mistico conforme perfil BrainHex).

## Persistencia de tempo
Durante estudo ativo:
- Topico: `topico_aluno.tempo_gasto_min`
- Conteudo: `conteudo_aluno.tempo_gasto_min`
- Atividade: `atividade_aluno.tempo_gasto_min`

Regra de negocio:
- Contar tempo ativo dentro de topicos/blocos de estudo.
- Evitar contabilizar permanencia ociosa fora do fluxo de estudo.

## Ranking
- Consumo: view `vw_rank_posicoes_por_classe`.
- Pontuacao depende de eventos gravados em `eventos_aluno`.
- Sem eventos validos, rank de pontuacao nao atualiza.

## Checklist de troubleshooting
- `Network request failed`: validar URL da API por ambiente.
- Midia quebrada em pptx/docx: validar parser local e fallback de visualizacao.
- Rank parado: validar gravacao em `eventos_aluno` + view SQL atualizada.
