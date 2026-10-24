# Adaptação BrainHex v3: evidência, decisões e limites

**24/10/2026 · Base:** `3afe90e6` (main após #615). **Versão nova:** `2026-10-24-v3-exploratorio`.

Esta entrega adapta a interpretação, o contrato de medida e a consistência do software. **Não produz um instrumento psicométrico validado.** Nas fontes consultadas, não encontramos calibração para os itens, pesos, temperatura ou índice de confiança do TrailUp. A fórmula legada continua sendo uma recomendação exploratória de produto. Ela não pode sustentar diagnóstico, capacidade, estilo de aprendizagem ou probabilidade de pertencer a um perfil.

O [parecer anterior](./issue-1-cadastro-brainhex.md) reúne 12 estudos; a [reverificação](./issue-1-reverificacao-perfis.md) registra as falhas anteriores à adaptação. Aqui a pergunta é mais específica: **quais mudanças de código são justificáveis diante das evidências, sem inventar uma validação?**

## 1. Fontes primárias verificadas e limites de aplicação

Releitura dirigida, não revisão sistemática. Foram consultados o manuscrito aceito de Tondello, artigos completos de Oliveira, van Sonderen e Santos, diretrizes oficiais da ITC e documentação estatística do SciPy. Não houve acesso a dados individuais de estudantes do TrailUp nesta etapa. A tentativa de reabrir o PDF de Hallifax retornou timeout; suas conclusões permanecem no parecer anterior e não são tratadas como nova leitura integral aqui.

| Fonte e localização | Resultado ou orientação relevante | Decisão no TrailUp e limite |
| --- | --- | --- |
| **Tondello et al. (2018)**, *Towards a Trait Model of Video Game Preferences*, §3.2.1, tabela 2 e §3.2.2. [Manuscrito](https://dspacemainprd01.lib.uwaterloo.ca/server/api/core/bitstreams/52411884-0ab9-4eb6-9366-002959a152c8/content), [DOI](https://doi.org/10.1080/10447318.2018.1461765). | Reanálise de mais de 50 mil respostas da base original. Separação insuficiente dos sete tipos; estrutura alternativa de três dimensões. A análise sem o item ordinal por subescala teve melhor consistência em geral, ainda baixa. | Retirar a apresentação dos sete perfis como classificação comprovada. **Não** transplantar três dimensões para os sete nomes nem alegar que a mistura atual com ranking foi validada. A base é de jogos, não alunos do TrailUp. |
| **Oliveira et al. (2022)**, *The effects of personalized gamification on students’ flow experience, motivation, and enjoyment*, resumo, resultados e limitações. [Artigo](https://link.springer.com/article/10.1186/s40561-022-00194-x). | Experimento com 121 estudantes do ensino fundamental não encontrou efeitos principais da personalização nos desfechos examinados. | Remover alegações de “aprende melhor” das descrições de resultado. O estudo não prova ineficácia universal, tampouco autoriza prometer benefício pedagógico no projeto. |
| **van Sonderen, Sanderman e Coyne (2013)**, *Ineffectiveness of Reverse Wording of Questionnaire Items*, métodos e resultados. [Artigo](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0068967). | Em 700 respondentes do MFI-20, reversos não preveniram o viés e apareceram sinais de confusão/desatenção. É outro domínio e instrumento. | Não diagnosticar aquiescência individual a partir de divergências entre pares do TrailUp. Remover penalidade de confiança; manter descritores para auditoria. O estudo não exige eliminar qualquer item reverso. |
| **Santos et al. (2022)**, *Psychometric investigation of the gamification Hexad user types scale in Brazilian Portuguese*, métodos e resultados. [Artigo](https://www.nature.com/articles/s41598-022-08820-x). | Investigação do **Hexad** em português brasileiro, 421 participantes, com análise fatorial e limitações em itens/subescalas. | Serve como referência metodológica e eventual comparador. Não permite transformar seis dimensões Hexad em sete BrainHex, nem emprestar validade para nossos 32 itens. A amostra também não coincide automaticamente com o público escolar do projeto. |
| **International Test Commission (2017)**, *Guidelines for Translating and Adapting Tests*, TD-5, C-1–C-3 e DOC-1. [Documento oficial](https://www.intestcom.org/files/guideline_test_adaptation_2ed.pdf). | Recomenda piloto, evidência de equivalência/validade no público pretendido e documentação da adaptação. | Versionar o resultado e manter validação local como requisito de pesquisa. É orientação metodológica, não evidência de que nossa adaptação já funciona. |
| **SciPy**, `spearmanr` e `rankdata`. [Spearman](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.spearmanr.html), [postos](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.rankdata.html). | Correlação não definida para variável constante; postos médios para empates. | Corrigir a matemática, retornar `null` quando não estimável e manter correlação como descrição. Nenhuma inferência de confiança, p-valor ou validade é derivada dos sete escores de uma pessoa. |

**Separação necessária:** a literatura informa os limites das alegações. Reserva de piso, desempate por nome, validação de entrada e confirmação de ordenação são decisões de engenharia/produto. Não são técnicas de eficácia pedagógica comprovada pelos artigos.

## 2. Mudanças implementadas

1. **Confiança não estimada.** `calcularPrior`/`combinarPrior` retornam `confianca: null`. O índice de qualidade também fica `null`. Não substituímos os limiares antigos por números novos. Uniformidade, rapidez e divergência entre pares não geram punição, diagnóstico ou certeza. O campo legado `aquiescencia` passa a ser documentado somente como divergência descritiva entre pares; seu nome foi mantido para compatibilidade.
2. **Spearman correto.** Pearson dos postos médios, com ausência de estimativa para dados constantes, incompletos ou não finitos. Uma tolerância de 16 epsilons de máquina trata apenas resíduos de aritmética de ponto flutuante nos escores derivados; não é limiar de similaridade psicológica. Não se converte correlação em confiança.
3. **Percentuais sem inversão pelo piso.** Reservar uma unidade por perfil e repartir as 93 restantes por maior resto evita retirar unidades do líder depois e inverter perfis próximos. Mantêm-se sete inteiros, piso 1 e soma 100 por compatibilidade. Desempates numéricos usam o nome, sem depender da ordem de propriedades.
4. **Uma regra de escolha para cadastro e consumidores.** O resultado ordena por percentual persistido decrescente e nome crescente. A aparência do mobile passa a usar o mesmo desempate das missões e do SQL. O escore contínuo continua disponível, mas não define uma segunda lista de perfis elegíveis incompatível com o que foi salvo.
5. **Entrada e finalização.** Cada resposta deve ser inteira de 0 a 5. A ausência de resposta reversa não vira preferência máxima na prévia. A ordem inicial exige confirmação explícita, sem forçar movimentação artificial; mudar respostas/ordem invalida a confirmação. A confirmação é registrada na medida. O construtor valida vetor, descritores e metadados antes das escritas de cadastro.
6. **Comunicação.** Introdução usa a escala correta, explica a adaptação exploratória e retira “identidade de aprendizado”. Resultado fala em sugestões e afinidade relativa, sem “compatibilidade” ou aprendizagem comprovada. A escolha inicial segue sendo do aluno entre as opções elegíveis.
7. **Atualizador experimental.** Sem observações, preserva inclusive confiança 1. Confiança ausente não é convertida em precisão zero e não entra na combinação por precisão. Isso não altera o outro atualizador operacional em Python: sua integração/calibração segue fora desta entrega.

## 3. O que não ganhou fundamentação por causa desta mudança

Os sete nomes são preservados como vocabulário do produto e dos consumidores. Os itens não foram traduzidos novamente nem substituídos por perguntas inventadas nesta sessão. Não há equivalência demonstrada entre a adaptação e o BrainHex original. Em particular, o eixo de persistência usado como Survivor não reproduz automaticamente a experiência de medo/alívio ficcional descrita no modelo de origem.

| Parâmetro atual | Situação |
| --- | --- |
| 32 itens autorais, oito eixos, oito reversos | Conteúdo e compreensão precisam de investigação local. Manter os itens não certifica sua adequação. |
| Soma dos quatro itens por eixo | Mantida; os comentários falsos de “média por eixo” no pipeline foram corrigidos. |
| Contribuições cruzadas: 0,15, 0,20, 0,25 e 0,35 | Legadas, sem estimativa empírica de pesos identificada. |
| Mistura 0,5 escala / 0,5 ranking | **Não implica fontes igualmente informativas.** A evidência de Tondello é motivo adicional para investigar a separação dos métodos, não valida essa mistura. |
| Softmax com temperatura 1,2 | Transformação legada de apresentação; não calibração probabilística. |
| Soma 100, piso 1, dois primeiros ou ≥20 como elegíveis | Contrato do produto, não ponto de corte psicométrico. |

Não substituímos essa regra por outra fórmula arbitrária alegando que seria “a científica”. A adaptação v3 restringe a interpretação e corrige consistência; **a regra numérica ainda precisa ser comparada com alternativas e com preferência/experiência observada**. Também não recalcula alunos antigos em massa.

### Sensibilidade: por que não chamar o escore de verdade sobre a pessoa

Nos mesmos 5.000 questionários sintéticos da auditoria, variamos uma decisão por vez e contamos dominantes diferentes do resultado v3:

| Contrafactual | Dominantes diferentes |
| --- | --- |
| Média por eixo em vez de soma, demais parâmetros mantidos | 2.289 / 5.000 |
| Somente escala | 2.410 / 5.000 |
| Somente ordenação | 2.960 / 5.000 |
| Temperatura 0,6 | 15 / 5.000 |
| Temperatura 2,4 | 56 / 5.000 |

O dominante aqui é o que o produto resolve dos **inteiros persistidos**, incluindo desempates. Por isso temperatura pode mudar o dominante por quantização, embora softmax preserve a ordem antes do arredondamento. As alternativas são diagnósticos de sensibilidade, não candidatos “vencedores”. Dados sintéticos não estimam validade, prevalência entre alunos ou eficácia. Não escolhemos a configuração que “mais passa” nos testes como se fosse verdade empírica.

## 4. Dados, migration e implantação

A migration [`20261024_03`](../../api/alembic/versions/20261024_03_perfil_exploratorio_sem_confianca.py) permite confiança ausente e exige `NULL` para a versão v3. Números antigos permanecem identificados como índices heurísticos v2; não são apagados ou recalculados. Não há tabela nova nem ampliação de permissões. A medida inclui `qualidade.interpretacao = exploratoria_nao_probabilistica` e `ordenacao_confirmada = true`.

**Ordem de implantação:** aplicar a migration pelo fluxo normal do projeto antes do frontend v3. O cliente v2 continua compatível com a tabela migrada. Não foi aplicada migration em produção nesta sessão. Rollback com medidas v3 presentes falha de forma transacional: não fabricamos confiança zero nem excluímos resultados para forçar `NOT NULL`.

A conclusão do cadastro continua tendo escritas separadas e tolerância a erro ao inserir a medida em `EmailConfirm`. Isso continua sendo pendência de atomicidade da issue #1; a validação antecipada reduz entradas inválidas, mas não transforma as requisições em transação. Publicar o frontend antes da migration pode perder a medida por essa tolerância legada. O PR não deve ser interpretado como encerramento da story.

## 5. Verificação e reprodução

Resultados registrados no código `8a9b6622`: [auditoria e sensibilidade](./evidencias/issue-1-perfis-v3.json) e [migration isolada](./evidencias/issue-1-migracao-v3.json). O commit posterior acrescenta somente estas evidências e a ligação neste documento.

- **153 testes do frontend aprovados**, typecheck e build aprovados. Regressões: itens inválidos, Spearman com/sem empates, ruído numérico, líderes próximos, ausência de confiança, confirmação explícita e serialização.
- **37 testes do mobile aprovados**: representativos, capacidades e missões, incluindo empate no segundo lugar e ordem inversa das linhas da consulta.
- Auditoria ampliada: **21 critérios aprovados, 86.467 verificações, zero falhas**. Inclui os sete cenários extremos nas 5.040 ordenações, uma escala constante nas mesmas ordenações e 5.000 questionários sintéticos. Contagens não são participantes nem testes estatisticamente independentes.
- Migration: **oito verificações aprovadas** com SQL emitido pelas migrations reais, em PostgreSQL/WASM PGlite 0.5.11. Verificou confiança ausente, compatibilidade v2, rejeição de confiança v3 numérica, RLS de escrita própria e rollback sem perda silenciosa. Helpers de identidade/professor são mínimos; não é toda a cadeia Alembic ou o ambiente Supabase real.

```sh
npm --prefix frontend test -- src/features/signup src/components/auth/BrainHexOrdenacaoStep.test.tsx src/lib/cadastroEmUmaEtapa.test.ts src/features/auth/passwordPolicy.test.ts src/lib/dataNascimento.test.ts
npm --prefix frontend run typecheck
node scripts/testar-perfis-issue-1.mjs
cd mobile
node --import tsx --test src/utils/brainHexRepresentative.test.ts src/utils/brainHexCapabilities.test.ts src/services/missoes/missaoModel.test.ts
```

O cabeçalho de [`testar-migracao-perfil-v3.mjs`](../../scripts/testar-migracao-perfil-v3.mjs) contém a instalação isolada e o comando de reprodução. Docker não estava disponível; não se usaram credenciais nem dados de produção. A suíte Python integral não foi executada.

Os testes antigos que premiavam “respostas coerentes” com confiança alta foram **substituídos explicitamente** por testes de ausência de estimativa. A auditoria passou a exigir `null` estrito, inclusive após serialização; não aceita `0` como substituto. Os critérios matemáticos de ordenação, piso, soma e compatibilidade continuam ativos. Os JSON históricos foram preservados, para não apagar evidência dos defeitos.

## 6. Critério para uma adaptação empiricamente sustentada

O próximo estudo precisa de protocolo prévio, público-alvo definido e revisão de conteúdo por especialistas e estudantes. Aplicar entrevistas cognitivas, revisar itens ambíguos e testar a versão congelada em piloto; planejar amostra pela análise pretendida, não copiar o N de outro artigo. Investigar dimensionalidade, confiabilidade por dimensão, estabilidade e funcionamento dos itens. Essas exigências seguem o propósito das diretrizes ITC; sua execução ainda está pendente.

Comparar a recomendação com escolha direta e alternativas de pontuação em dados separados por aluno/tempo, sem usar os mesmos dados para escolher pesos e declarar sucesso. Antes da coleta, definir desfechos e análise de utilidade educacional, incluindo perdas, incerteza e possíveis efeitos por turma. O vetor do questionário não deve ser tomado como gabarito do comportamento, nem engajamento confundido com aprendizagem.

**Condição para novas alegações:** evidências próprias adequadas ao uso, com versão, método, resultados e limitações publicados. Até lá, a v3 é uma adaptação de produto com interpretação restrita e testes de consistência; não uma classificação científica dos alunos.
