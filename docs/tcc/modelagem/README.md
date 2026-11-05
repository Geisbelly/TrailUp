# Modelagem do sistema TrailUp

Modelagem completa do sistema para a monografia, em 72 diagramas, com 68 casos de uso especificados, 188 tabelas por domínio e 21 fluxos (P0 a P20). Substitui o capítulo [`04-modelagem-do-sistema.md`](../04-modelagem-do-sistema.md), que é de abril de 2026.

**Procedência** (05/11/2026):

- **Código:** lido na `main` do Lab, commit `af371249`.
- **Banco:** consultado em produção, só leitura, entre as migrações `20261105_26` e `20261105_28`, que entraram durante a revisão. Das duas novas, conferi em produção as tabelas, as colunas, o bucket e as policies:
  - chaves estrangeiras (`pg_constraint`);
  - restrições `CHECK` de status;
  - enums;
  - rotinas `pg_cron`;
  - contagens por status;
  - corpo das funções que definem as transições de estado.
- **Correções:** onde o código e o banco divergiam do que os documentos anteriores diziam, valeu o código e o banco. As correções feitas aparecem ao fim desta página.

| Capítulo | Diagramas | Para a monografia |
|---|---|---|
| [1. Arquitetura](./01-arquitetura.md) | contexto (C4-1), contêineres (C4-2), regra de fronteira, implantação, camadas da API, rotinas do banco | arquitetura e implantação |
| [2. Casos de uso](./02-casos-de-uso.md) | aluno, professor, dona, visitante e sistema; especificação de todos, exceções e rastreabilidade | requisitos e casos de uso |
| [3. Pipeline de ponta a ponta](./03-pipeline-ponta-a-ponta.md) | visão do ciclo + fluxos P0–P20 em diagramas de sequência | funcionamento do sistema |
| [4. IA: grafo e análise](./04-ia-grafo-e-analise.md) | grafo LangGraph (16 nós), regras de roteamento, pipeline de 6 estágios, escolha do provedor, todas as chamadas ao modelo | modelo adaptativo |
| [5. Dados](./05-dados.md) | ER por domínio, incluindo economia, arena, social e estudo; apêndice com todas as tabelas | modelo de dados |
| [6. Estados](./06-estados.md) | jobs, alvos, material, progresso, eventos, notificações, intervenções, gamificação, RAG, diagnóstico, economia, convites, consentimento, monitor | comportamento |
| [7. Classes](./07-classes.md) | Strategy do pipeline, serviços de LLM, camadas do backend, provedor do app, workers, microservice | projeto orientado a objetos |

## Imagens

`img/` traz cada diagrama em SVG, com fundo branco, pronto para inserir no Word ou no LaTeX. O nome do arquivo é `<capítulo>-<ordem no capítulo>.svg`: `03-02.svg` é o segundo diagrama do capítulo 3.

As imagens são numeradas pela ordem no capítulo, então inserir um diagrama desloca os seguintes. Ao citar uma figura na monografia, confira o número.

Para regerar depois de editar um `.md`, a partir da raiz do repositório:

```bash
python3 docs/tcc/modelagem/exportar_diagramas.py
```

O script extrai os blocos `mermaid` dos capítulos e chama `npx @mermaid-js/mermaid-cli`. Se algum diagrama não compilar, ele para e mostra o erro, então também serve de validação. Dois cuidados ao editar:

- em diagrama de sequência, `;` dentro de mensagem quebra a linha;
- nota de diagrama de estado não aceita aspas.

Para conferir se o apêndice de dados cobre todas as tabelas do banco (só lê, e a URL vem de `DATABASE_URL`):

```bash
python docs/tcc/modelagem/conferir_tabelas.py
```

## O que estes diagramas não afirmam

- O pipeline de análise tem **nomes** de algoritmos de ML, mas os estágios são regras. As exceções são a emoção por imagem e o M2. O diagrama 4.2 e o 7.1 marcam o que é regra.
- O RAG está **implementado e não indexado**. Ele aparece tracejado nos diagramas.
- `agente_emocao`, dentro do grafo, usa `MockEmocaoAdapter`. A emoção que vale é a do estágio 1 do pipeline.
- `missao_aluno.status = 'expirada'` existe no `CHECK`, e nenhuma função grava esse valor.
- Vários fluxos estão prontos e sem uso real: em 05/11/2026 a produção tinha zero diagnósticos, fundos, desafios, partidas de Elo e coortes. Os diagramas descrevem o comportamento implementado, não uso medido.

## Correções em relação aos documentos anteriores

| Antes | Medido agora |
|---|---|
| `conteudo_personalizado.status` = `falha` | produção grava `failed` (4 `pronto`, 13 `failed`); `falha` é legado |
| escopos da telemetria: `topic`, `content`, `material` | também `activity` (11 linhas) |
| job termina `failed` "se falhou" | `failed` só quando **todo** alvo processado falhou; com alvo pendente ou falha parcial, `partial` |
| sugestão de material lida no Supabase | a do tópico vem da API (`GET /personalizar/sugestao/{aluno}/{tópico}`), e só a da turma vem do Supabase |
| 171 tabelas, 16 rotinas `pg_cron`, 6 workers | 188 tabelas, 21 rotinas, 7 workers |
| fila `retencao_externa` | a tabela é `retencao_fila_externa`; `retencao_externa_loop` é o worker |
| `missao_aluno`: `pendente` → `em_andamento` → `concluida` para toda missão | só a missão de guilda passa por `pendente` e `em_andamento`; a individual nasce `concluida` |
| relação social termina em `declined` ou `blocked` | `declined` volta a `pending` com novo convite; desfazer amizade e desbloquear levam a `declined` |
| supervisor do grafo "decide por LLM" | decide por regra. O modelo só é consultado quando há mais de um candidato, e mesmo assim é filtrado contra a regra. No fluxo de personalização, o modelo nunca é consultado |
