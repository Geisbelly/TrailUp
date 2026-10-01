# Inventário de fontes candidatas ao RAG

**Issue:** [#70](https://github.com/BitStudioLabs/trail-up/issues/70)

**Status:** inventário inicial; nenhuma fonte desta página está aprovada para
indexação.

**Atualizado em:** 2026-09-18

## Regra de uso

Uma fonte só pode avançar para a triagem do corpus (#71) depois que tiver
origem, licença e finalidade confirmadas. Ausência de metadados não é permissão:
a fonte fica **bloqueada**. A aprovação de uma fonte para pesquisa ou calibração
de modelo não a torna automaticamente elegível para o RAG público.

O diretório `Dataset_TrailUp` não está presente neste checkout nem no repositório
`core-trailup`. Por isso, o inventário não afirma data de download, hash ou
licença de arquivos locais que não puderam ser inspecionados. Os campos
pendentes devem ser preenchidos a partir do diretório original e de sua página
primária antes de qualquer ingestão.

## Fontes com proveniência localizada

| Fonte | Origem e citação | Licença verificada | Uso derivado | Estado para RAG | Evidência |
| --- | --- | --- | --- | --- | --- |
| EdNet-KT3 | [Riiid/EdNet](https://github.com/riiid/ednet); cite Choi et al., *EdNet: A Large-Scale Hierarchical Dataset in Education* (2019). | CC BY-NC 4.0 | Permitido apenas para uso não comercial, com atribuição. | **Bloqueada** até decisão de licença/deploy; não usar em produto comercial nem como corpus público. | `core-trailup/seminario/dados/README.md` |
| OULAD | [Open University Learning Analytics Dataset](https://analyse.kmi.open.ac.uk/open_dataset); cite Kuzilek, Hlosta e Zdrahal (2017). | CC BY 4.0 | Permitido, com atribuição. | **Bloqueada para triagem**: é dado analítico tabular, não documento pedagógico; #71 deve decidir se há texto recuperável e finalidade compatível. | `core-trailup/seminario/dados/README.md` |
| ARES / OSF `8y3zp` | [OSF 8y3zp](https://doi.org/10.17605/OSF.IO/8Y3ZP); cite Lee et al. (2025), *Data in Brief*. | Não confirmada no registro de dados disponível durante este inventário. A licença CC BY 4.0 do artigo não prova licença dos arquivos. | Desconhecido. | **Bloqueada** até confirmar a licença selecionada no OSF ou um arquivo de licença do pacote. | `core-trailup/docs/m1_estado_de_estudo/RELATORIO_M1.md` declara CC BY; a página primária precisa confirmar. |
| classEx | Registro apontado em `core-trailup`: [Zenodo 19467052](https://zenodo.org/records/19467052). | Não confirmada neste inventário. | Desconhecido. | **Bloqueada** até conferir o registro Zenodo e o arquivo de licença. | `core-trailup/seminario/dados/README.md` |
| AI4EDU | Registro apontado em `core-trailup`: [Zenodo 19232684](https://zenodo.org/records/19232684). | Não confirmada neste inventário. | Desconhecido. | **Bloqueada** até conferir o registro Zenodo e o arquivo de licença. | `core-trailup/docs/LEIA-ME_scripts.md` |

## Conjuntos observados no inventário original, sem proveniência verificável

A lista abaixo vem da descrição da #70. Como os arquivos não estão disponíveis
neste checkout, os nomes são mantidos como identificadores de trabalho; não são
nomes canônicos de publicação. Todos permanecem **bloqueados** e fora de
extração, embedding, upload ao Vector Store e treinamento até a regularização.

| Identificador/local esperado | Tipo/volume informado | Origem, licença e data de download | Estado |
| --- | --- | --- | --- |
| `8/` | 28 PDFs, 53 MB | Desconhecidos | Bloqueada |
| `8y3zp-osfstorage-archive` | 15 XLSX, 2 IPYNB, 2 DOCX, 19 MB | Confirmar contra o projeto OSF `8y3zp` | Bloqueada |
| `open+university+learning+analytics+dataset` | 7 CSVs | Confirmar se corresponde ao OULAD e registrar o pacote/versão | Bloqueada |
| `Student Depression Dataset.csv` | CSV, 2,8 MB | Desconhecidas | Bloqueada — contém dados de saúde mental pelo nome; requer também a política #74. |
| `AI_SocialMedia_Student_Health_Dataset_clean.csv` | CSV, 1,2 MB | Desconhecidas | Bloqueada — contém dados de saúde mental pelo nome; requer também a política #74. |
| `ScienceDirect_articles_*` (duas pastas) | 8 PDFs | Desconhecidas; acesso a artigo não concede direito de redistribuir/indexar o texto integral. | Bloqueada |
| `bsxgbt8wnp-2` | 5 PDFs, 1 XLSX | Desconhecidas | Bloqueada |
| `psychological_state_dataset new.csv` | CSV | Desconhecidas | Bloqueada — possível dado de saúde mental; requer #74. |
| `neurodiversity_education_dataset.csv` | CSV | Desconhecidas | Bloqueada — possível dado sensível; requer #74. |
| `Facial_data` | Diretório | Desconhecidas | Bloqueada — possível dado biométrico; requer #74 e #195. |
| `dataverse_files` | Diretório | Desconhecidas | Bloqueada |
| `tyxy9hbrwd-2` | Diretório | Desconhecidas | Bloqueada |
| Demais CSV/XLSX/SAV/DOCX não listados | Variados | Desconhecidas | Bloqueada; incluir uma linha por pacote quando o diretório original estiver disponível. |

## Procedimento para completar cada linha

1. Localizar a página primária do conjunto (DOI, repositório institucional ou
   arquivo `LICENSE` distribuído pelo autor), não apenas uma cópia no Kaggle ou
   um artigo que o cita.
2. Registrar URL/DOI, autores, versão, licença, requisitos de atribuição e a
   data de download no inventário.
3. Conferir se a licença permite o uso pretendido: extração, criação de chunks,
   embedding, armazenamento e resposta a alunos. Em caso de dúvida, manter
   bloqueado.
4. Para fontes com dados de menor, saúde mental, neurodivergência ou biometria,
   exigir também decisão da #74 e o gate da #195 antes de qualquer envio a
   terceiro.
5. Quando houver cópia local, registrar tamanho, formato, checksum e caminho
   relativo; não versionar os arquivos de terceiros neste repositório.
6. Só então encaminhar uma fonte elegível à #71, que decide corpus de RAG versus
   conjunto de pesquisa/modelo.

## Pendências para encerrar a #70

- Disponibilizar o caminho de leitura do `Dataset_TrailUp` ou um manifesto de
  download com os itens completos.
- Confirmar os registros e licenças de ARES, classEx e AI4EDU nas fontes
  primárias.
- Completar uma linha por pacote efetivamente presente, incluindo data de
  download, tamanho, formato e citação.
- Registrar a decisão de uso de cada fonte como **aprovada**, **rejeitada** ou
  **condicionada**. Até isso, o estado padrão é bloqueado.
