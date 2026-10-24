# LGPD no TrailUp: índice

Documentos e decisões de proteção de dados do projeto. A issue de acompanhamento é a [#195](https://github.com/BitStudioLabs/trail-up/issues/195).

| Tema | Onde está |
|---|---|
| Transferência internacional e fornecedores (dados, finalidade, país, treino, retenção, mecanismo, pendências) | [`transferencias-internacionais.md`](./transferencias-internacionais.md) |
| Prazos de retenção e expurgo (#616) | Tabela `public.retencao_politica` (migration `api/alembic/versions/20261024_03_retencao_e_expurgo.py`); começa em modo `simular` |
| Decisão sobre inferência emocional (finalidade, revisão, o professor vê só a faixa) | [Comentário na #195](https://github.com/BitStudioLabs/trail-up/issues/195#issuecomment-6379616985) |
| Consentimento por finalidade, responsável legal e modo restrito (#613) | [PR/issue #613](https://github.com/BitStudioLabs/trail-up/issues/613) · migration `api/alembic/versions/20261024_02_consentimento_do_responsavel.py` |
| Situação geral da #195 | [Comentário de status](https://github.com/BitStudioLabs/trail-up/issues/195#issuecomment-6384811191) |
| Texto público | Site: `frontend/src/pages/Privacidade.tsx` e `Termos.tsx` |

## Regra de processo (resumo)

- **Serviço externo novo com dado pessoal**, ou mudança no que vai para um serviço existente → atualizar `transferencias-internacionais.md` no mesmo PR. O template de PR pergunta isso, e o teste `api/tests/test_registro_transferencias.py` pega hosts e SDKs conhecidos.
- **Imagens da câmera:** qualquer mudança no uso delas exige atualizar o registro e passar por revisão na #195 (ou na issue que a suceder) antes do merge. Isso vale para armazenar, enviar a terceiro, novo modelo ou nova finalidade.
