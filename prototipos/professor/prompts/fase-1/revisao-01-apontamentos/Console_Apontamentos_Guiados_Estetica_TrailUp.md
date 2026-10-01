# ✦ TRAILUP / CONSOLE

## Apontamentos Refinados do Protótipo

Direto ao ponto: o que manter, o que corrigir, o que refazer e como a interface deve se comportar.

> **Direção visual**
>
> Base escura • roxo como cor de ação • lilás para destaque • tipografia clara • bordas discretas • estética tech/geek com atmosfera espacial sutil.
>
> **Princípio:** a interface deve parecer uma central de inteligência educacional, não um dashboard SaaS genérico.

Este documento usa as telas enviadas como referência visual e transforma os apontamentos em instruções objetivas de prototipação.

---

## 01 — Dashboard

**O problema:** mostrar números não é suficiente. O professor precisa entender o que os números significam e conseguir chegar ao detalhe.

**Deve mostrar**

- Visão geral da turma: alunos, trilhas, conteúdos, atividades e alunos que precisam de atenção.
- Evolução: progresso, desempenho, atividades e mudanças relevantes ao longo do tempo.
- Conteúdo: o que é mais consumido, onde há dificuldade e o que tem maior conclusão.
- Indicadores precisam ter contexto. Não usar cor sozinha para comunicar estado.
- Manter a barra de navegação e sua personalização como padrão do Console.

> *Referência enviada — Dashboard / visão de personalização e consumo.*

## 02 — Jornada do Aluno

A jornada precisa deixar de ser um desenho bonito e virar uma ferramenta de investigação.

- **Cada nó é clicável.**
- Ao selecionar: conteúdo acessado, atividade, resposta, acerto/erro, tempo, tentativa, ordem e progresso.
- A sequência mostrada deve ser a sequência real percorrida pelo aluno.
- Se houver retorno, desvio ou comportamento fora do caminho esperado, isso precisa aparecer.

> *Referência enviada — tabela de alunos e indicadores de acompanhamento.*

---

## 03 — Meus Dados + Ranks

**Status: APROVADO.** Não reinventar o que já funciona.

- Manter estrutura, organização e conceito.
- Apenas alinhar ao padrão visual geral do Console.
- Não criar mudanças estruturais sem uma necessidade funcional real.

## 04 — Personalizações

Aqui existe uma exigência central: o professor precisa conseguir ver o que a IA produziu, não apenas receber um status de geração.

- Fluxo mínimo: conteúdo gerado → visualizar → avaliar → regenerar.
- Regenerar precisa explicar o motivo da nova geração e o que será alterado.
- Em apresentações, permitir regenerar um slide específico sem destruir o restante.
- Manter estados visíveis: pronto, gerando, parcial, falha e sem material.

> *Referência enviada — Personalizações por perfil, com estados de geração.*
> *Referência enviada — detalhe do conteúdo gerado e formatos disponíveis.*

---

## 05 — Classes

**Status: estrutura aprovada.** Faltam duas ações obrigatórias.

- **Duplicar turma:** cria uma nova turma baseada na atual. A cópia precisa ser claramente uma nova entidade.
- **Excluir turma:** ação destrutiva exige confirmação explícita antes de executar.

> *Referência enviada — tela de turmas.*
> *Referência enviada — card de turma com editar, duplicar e excluir.*

## 06 — Trilha: Refazer

**Aqui está o principal problema.** A proposta anterior não representa a arquitetura real do projeto. Não é questão de "embelezar": é questão de modelagem.

- Preservar somente o estilo, as cores e o botão/fluxo de **Gerar trilha com IA**.
- A interface deve representar: **trilha → tópicos → conteúdos/cards → questões**.
- As questões estão ligadas ao conteúdo selecionado.
- Cards podem ser reaproveitados entre diferentes conteúdos.
- Não transformar isso numa árvore rígida de "um tópico possui questões exclusivas". Isso contradiz a arquitetura.
- Todo tópico precisa ter: nome, descrição, conteúdos/cards relacionados, questões relacionadas e ações de editar/excluir.

> *Referência enviada — editor/mapa atual da trilha. Usar como referência de estilo, não como modelo final de arquitetura.*

---

## 07 — Geração de Trilha com IA

O botão **Gerar trilha com IA** permanece. O que precisa mudar é a clareza do processo.

- Fluxo: **Configurar → Gerar → Processando → Resultado → Revisar → Ajustar.**
- Enquanto estiver processando, informar claramente que a geração está acontecendo.
- Nunca deixar a interface parecendo travada.
- O aviso deve explicar, de forma curta, o que a IA está fazendo.

## 08 — Malha / Canvas da Trilha

A malha deve funcionar como um canvas. Não como uma página dentro de uma página.

- **Não colocar barra de scrolling dentro da malha.**
- Permitir arrastar/pan.
- Permitir zoom in/out.
- Permitir ajustar à tela e centralizar.
- Usar controles inspirados na interação do Figma: simples, discretos e sempre acessíveis.
- Ao selecionar um nó, abrir painel com os detalhes.

> *Referência enviada — mapa da trilha e controles de zoom. A interação precisa evoluir para um canvas real.*

---

## 09 — Telas Aprovadas

Estas telas não precisam de redesign estrutural.

| | Tela |
|---|---|
| ✓ | Recuperar senha |
| ✓ | Login Professor |
| ✓ | Finalizar Cadastro |
| ✓ | Criar Conta |

## 10 — Regras de UX

**01. Informação não pode ser decoração**
Se um elemento representa dado do sistema, ele precisa ter significado funcional.

**02. O sistema precisa responder**
Ações demoradas devem mostrar estado: gerando, processando, salvando, erro etc.

**03. Destruição exige confirmação**
Excluir turma/tópico/conteúdo nunca deve acontecer por acidente.

**04. IA não pode ser caixa-preta**
Mostrar o que foi gerado, por que foi gerado e, quando aplicável, o que mudou.

**05. UI deve respeitar a arquitetura**
A visualização não pode inventar relações que o sistema não possui.

## 11 — Critério de Aceite

**O protótipo está certo quando o professor consegue investigar e agir.**

- Dashboard → Turma → Aluno → Jornada → Nó específico → resposta + tempo + tentativa + contexto.
- Trilha → Tópico → Conteúdo → IA → Regeneração → Resultado.
- A estética precisa reforçar a identidade TrailUp, mas nunca esconder a informação.
- **Prioridade: compreensão primeiro. Estética depois.**

---

## ✦ Direção Visual Final

- Base escura em azul-marinho/preto.
- Roxo como principal cor de ação e seleção.
- Lilás para destaque e hierarquia.
- Texto claro e cinzas frios para informação secundária.
- Verde/amarelo/vermelho/azul somente para estados.
- Bordas finas, cards escuros, brilho roxo controlado.
- Atmosfera espacial/tech sutil: pontos, linhas e constelações; nada de "tema espacial" caricatural.
- Evitar excesso de neon, gradientes, glassmorphism, cores aleatórias e aparência infantil.
