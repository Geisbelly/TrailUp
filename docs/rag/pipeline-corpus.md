# Pipeline do corpus: extração, curadoria e golden set

**Issues:** [#72](https://github.com/BitStudioLabs/trail-up/issues/72) (extração) · [#73](https://github.com/BitStudioLabs/trail-up/issues/73) (curadoria) · [#75](https://github.com/BitStudioLabs/trail-up/issues/75) (golden set)

**Status:** contrato do pipeline. Nenhum PDF é extraído por este documento — ele fixa as decisões para quando o corpus licenciado existir.

**Atualizado em:** 2026-09-30

## Ordem e dependências

```
#70 inventário → #71 triagem → #72 extração → #73 curadoria → indexação → #75 golden set → #67 medição
```

O golden set vem *depois* do corpus indexado, mas *antes* de qualquer ajuste no retrieval — sem ele, ajuste vira opinião (#75). A #67 mede o caminho `file_search` contra o golden set.

## #72 — Extração e normalização

- **Extrator:** `pypdf` (já depende em `api/`) para primeira passada; duas colunas com ordem intercalada escala para extrator com layout (`pdfplumber`/`PyMuPDF`) — o critério de troca é erro de ordem de leitura, não preferência.
- **Normalização obrigatória:** remover cabeçalho/rodapé recorrente (linha repetida em ≥3 páginas sai), desfazer hifenização de fim de linha, separar corpo de referências (referência não entra no índice — citação não é evidência recuperável).
- **Chunking:** por seção, com sobreposição; cada chunk carrega `documento`, `seção`, `página`. Trecho sem procedência não é recuperável com confiança e não entra no índice.
- **Relatório de extração:** páginas lidas, chunks gerados, falhas com motivo. PDF que falha não some em silêncio — aparece no log com o porquê.

## #73 — Curadoria pedagógica

Vocabulário mínimo por chunk (começar pequeno, expandir só com uso):

| Campo | Valores | Preenchimento |
| --- | --- | --- |
| `construto` | estratégia de aprendizagem, emoção de realização, regulação emocional, neurodiversidade, outro | LLM + revisão humana |
| `populacao` | quem foi estudado (idade, contexto) | curadoria humana |
| `tipo_estudo` | empírico, revisão, diretriz, opinião | LLM + revisão humana |
| `confianca` | alta, média, baixa (força da evidência) | curadoria humana |
| `tipo` | original, derivado (texto de pesquisa #71) | automático |

- **Mapeamento para os 7 perfis BrainHex:** registrado por chunk quando o construto sustenta; onde o mapeamento é frouxo, declara-se frouxo — mapeamento forçado polui a recuperação por perfil.
- **Amostra de revisão:** medir taxa de erro do preenchimento automático em amostra manual antes de indexar em lote. Sem essa medida, o índice entra sem garantia de qualidade.
- **Rastreabilidade:** recomendação vinda do RAG chega ao documento e à seção. É o que separa fundamentar de alucinar com fonte.

## #75 — Golden set

- **30–50 perguntas reais** do domínio (as que professor ou aluno fariam), cada uma com os chunks aceitáveis como fonte.
- **Perguntas sem resposta no corpus de propósito** — o comportamento esperado é admitir ausência; alucinação é medida, não descoberta em produção.
- **Rodada automatizada:** precisão e recall por pergunta e no agregado; histórico guardado para comparar embedding/chunking entre versões por número, não sensação.
- **Pré-requisito:** corpus indexado + #67. O golden set é o critério de pronto das decisões de retrieval.

## Travas (não negociáveis neste pipeline)

- Só entra fonte `corpus` com licença confirmada (#70/#71). Sensível nunca (#74).
- Nenhum chunk sem `documento`+`seção`+`página`.
- Nenhum ajuste de retrieval antes do golden set rodar.
