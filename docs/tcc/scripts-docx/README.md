# Scripts de alterações controladas na monografia

Estes scripts aplicam mudanças no `.docx` da monografia como alterações controladas do Word (`w:ins` e `w:del`), com
autor e data, para que a autora aceite ou rejeite cada uma. Eles mexem no XML do documento e não abrem o Word.

Este diretório traz só os scripts da revisão de 15/11/2026 ([parecer](../parecer-revisao-2026-11-14.md)) e o que eles
usam. Os das rodadas anteriores continuam no cofre do artigo, fora do repositório.

| Arquivo | O que faz |
| --- | --- |
| `lib.py` | Funções comuns: achar parágrafo, trocar trecho, inserir, apagar parágrafo e linha nova de tabela, tudo marcado |
| `aplicar_revisao.py` | Itens 1 a 5 do parecer (correções obrigatórias) |
| `aplicar_polimento_revisao.py` | Itens 8 e 10 do parecer (polimento) |
| `aceitar2.py` | Gera o XML com todas as alterações aceitas, para a versão limpa |
| `empacotar.py` | Monta o `.docx` a partir da pasta descompactada |
| `dump.py` | Despeja o texto com índice de parágrafo, para comparar versões |
| `validar.py` | Confere legendas, remissões a seção, citações e o texto novo da rodada |

## Como rodar

Os scripts usam `lxml`. O Python da API (`api/.venv`) já tem a biblioteca.

```bash
unzip -q "Monografia ... (com alterações).docx" -d out
python aplicar_revisao.py out
cp -R out ac && python aceitar2.py out/word/document.xml ac/word/document.xml
python empacotar.py out "Monografia ... (com alterações).docx"
python empacotar.py ac "Monografia ... (limpa, só para leitura).docx"
```

O `validar.py` lê `out/` e `ac/` a partir da pasta atual e tem o autor da rodada fixo na constante `AUT`. Antes de rodá-lo,
troque essa constante pelo autor da rodada que vai conferir.

Cada script para sem gravar nada se algum trecho esperado não for encontrado exatamente uma vez. Quando isso acontece, o
texto mudou desde que o script foi escrito, e o script precisa ser ajustado antes de rodar de novo.
