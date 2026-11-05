# Modelagem do sistema TrailUp

Modelagem completa do sistema para a monografia, em 44 diagramas. Substitui o capítulo [`04-modelagem-do-sistema.md`](../04-modelagem-do-sistema.md), que é de abril de 2026.

**Procedência** (04/11/2026):

- **Código:** lido na `main` do Lab, commit `3edd2561`.
- **Banco:** consultado em produção, só leitura:
  - chaves estrangeiras (`pg_constraint`);
  - restrições `CHECK` de status;
  - enums;
  - rotinas `pg_cron`;
  - contagens por status.
- **Correções:** onde o código e o banco divergiam do que os documentos anteriores diziam, valeu o código e o banco. As correções feitas aparecem ao fim desta página.

| Capítulo | Diagramas | Para a monografia |
|---|---|---|
| [1. Arquitetura](./01-arquitetura.md) | contexto (C4-1), contêineres (C4-2), regra de fronteira, implantação, camadas da API | arquitetura e implantação |
| [2. Casos de uso](./02-casos-de-uso.md) | aluno; professor e dona; especificação resumida | requisitos e casos de uso |
| [3. Pipeline de ponta a ponta](./03-pipeline-ponta-a-ponta.md) | visão do ciclo + 13 fluxos (P0–P13) em diagramas de sequência | funcionamento do sistema |
| [4. IA: grafo e análise](./04-ia-grafo-e-analise.md) | grafo LangGraph (16 nós), regras de roteamento, pipeline de 6 estágios, escolha do provedor | modelo adaptativo |
| [5. Dados](./05-dados.md) | ER por domínio: acadêmico, progresso, personalização, telemetria, gamificação, notificações, privacidade/RAG | modelo de dados |
| [6. Estados](./06-estados.md) | jobs, alvos, material, progresso, eventos, notificações, intervenções, gamificação, RAG | comportamento |
| [7. Classes](./07-classes.md) | Strategy do pipeline, serviços de LLM, camadas do backend, provedor do app | projeto orientado a objetos |

## Imagens

`img/` traz cada diagrama em SVG, com fundo branco, pronto para inserir no Word ou no LaTeX. O nome do arquivo é `<capítulo>-<ordem no capítulo>.svg`: `03-02.svg` é o segundo diagrama do capítulo 3.

Para regerar depois de editar um `.md`, a partir da raiz do repositório:

```bash
python3 docs/tcc/modelagem/exportar_diagramas.py
```

O script extrai os blocos `mermaid` dos capítulos e chama `npx @mermaid-js/mermaid-cli`. Se algum diagrama não compilar, ele para e mostra o erro, então também serve de validação. Dois cuidados ao editar:

- em diagrama de sequência, `;` dentro de mensagem quebra a linha;
- nota de diagrama de estado não aceita aspas.

## O que estes diagramas não afirmam

- O pipeline de análise tem **nomes** de algoritmos de ML, mas os estágios são regras. As exceções são a emoção por imagem e o M2. O diagrama 4.2 e o 7.1 marcam o que é regra.
- O RAG está **implementado e não indexado**. Ele aparece tracejado nos diagramas.
- `agente_emocao`, dentro do grafo, usa `MockEmocaoAdapter`. A emoção que vale é a do estágio 1 do pipeline.
- As transições de missão, desafio de guilda e relação social (6.8) seguem os rótulos dos `CHECK`. Elas não foram auditadas função por função.

## Correções em relação aos documentos anteriores

| Antes | Medido agora |
|---|---|
| `conteudo_personalizado.status` = `falha` | produção grava `failed` (4 `pronto`, 13 `failed`); `falha` é legado |
| escopos da telemetria: `topic`, `content`, `material` | também `activity` (11 linhas) |
| job termina `failed` "se falhou" | `failed` só quando **todo** alvo processado falhou; com alvo pendente ou falha parcial, `partial` |
| sugestão de material lida no Supabase | a do tópico vem da API (`GET /personalizar/sugestao/{aluno}/{tópico}`), e só a da turma vem do Supabase |
| supervisor do grafo "decide por LLM" | decide por regra. O modelo só é consultado quando há mais de um candidato, e mesmo assim é filtrado contra a regra. No fluxo de personalização, o modelo nunca é consultado |
