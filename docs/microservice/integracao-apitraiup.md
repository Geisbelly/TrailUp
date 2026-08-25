# Integracao com ApiTraiUp

## Objetivo
Receber dados de personalizacao prontos para gerar artefatos multimidia.

## Chamada esperada
ApiTraiUp chama `POST /api/personalizar` com:
- `profile`
- `personalizacao_id`
- `classe_id`
- `topico_id`
- `ciclo_id`
- `conteudo_estudado`

## Fluxo interno
1. Gerar markdown e roteiro.
2. Gerar audio por voz do perfil.
3. Gerar imagens de apoio para slides.
4. Montar PDF.
5. Upload no Storage.
6. Merge no campo `materiais`.

## Prefixo de storage
Padrao atual:
`brainhex/{perfil}/classe-{id}/topico-{id}/{tipo}/material-{ref}.<ext>`

## Resultado esperado
`conteudo_personalizado.materiais` com status por artefato e URLs validas.
