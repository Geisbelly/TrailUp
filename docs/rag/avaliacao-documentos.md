# Avaliação dos documentos da Evidence Base

**Issue:** [#218](https://github.com/BitStudioLabs/trail-up/issues/218) (parte 1) · ligada a [#70](https://github.com/BitStudioLabs/trail-up/issues/70), [#71](https://github.com/BitStudioLabs/trail-up/issues/71), [#74](https://github.com/BitStudioLabs/trail-up/issues/74), [#75](https://github.com/BitStudioLabs/trail-up/issues/75)

**Status:** avaliação documento a documento concluída. As decisões de aprovação são da curadora; o parecer da IA fica registrado ao lado, sem substituí-las. **Nenhum documento entra no índice do RAG por esta página.**

**Atualizado em:** 2026-10-30

## Escopo

Os 47 artigos e guias da planilha de leituras do TCC ("Literaturas Analise PRISMA 2020", no Drive), que fundamentam a Evidence Base descrita na monografia. Não são os conjuntos de dados do [inventário](./inventario-fontes.md): aqui é literatura, lá é dado.

- **28 documentos** já tinham decisão da curadora (Aprovado ou Reprovado). A decisão dela vale; a IA só registra se concorda.
- **19 documentos** estavam sem decisão (DAT-08 e DAT-30 a DAT-47). Para estes há veredito sugerido, a confirmar.

Cada PDF foi lido no Drive (método, resultados, limitações, financiamento) e os metadados foram conferidos no próprio PDF e por DOI. A análise completa — vieses, nível de evidência, amostra, três lentes e comparações — está na cópia de revisão da planilha (colunas N a AF); esta página guarda o critério e o resultado.

## Critério de inclusão e exclusão

Entra na Evidence Base (aprovado) o documento que atende às quatro condições da monografia: relação com um domínio do TrailUp, método descrito, população identificável e utilidade para uma decisão, hipótese ou limitação. Sai ou é rebaixado o que tem opinião sem método, população distante sem mecanismo transferível, alegação sem desfecho ou resultado que não dá para verificar.

Aprovar para a Evidence Base **não** é aprovar para o RAG. O destino de cada documento aprovado é um destes:

| Destino | Quando | O que vai para o sistema |
| --- | --- | --- |
| **corpus do RAG** | Texto pedagógico útil ao aluno ou ao mentor **e** licença que permita extração, embedding e resposta a alunos | O texto, em chunks com `documento`+`seção`+`página` ([pipeline](./pipeline-corpus.md)) |
| **texto derivado** | O achado serve a uma regra do motor ou do professor, mas o texto inteiro não serve ao aluno, ou a licença não permite indexar | Regra ou sumário escrito por nós, citando fonte e população (`tipo=derivado`) |
| **só citação** | Fundamenta a monografia (definição, limitação, método), sem regra para o sistema | Nada; só a referência |
| **não usar** | Reprovado, ou sensível sem base legal | Nada |

Regras por sensibilidade, que valem acima de qualquer licença ([política #74](./politica-conjuntos-sensiveis.md)):

- Intervenção de saúde mental (autocompaixão, mindfulness, ansiedade, depressão) não vira regra do motor nem resposta do mentor. O TrailUp não faz intervenção clínica.
- Necessidades especiais, neurodivergência e reconhecimento facial de emoção não entram no índice nem orientam decisão automática.
- Esses documentos ficam marcados como **sensível (#74)** na tabela abaixo.

## As três lentes

Cada documento foi lido por três lentes, separadas de propósito, porque um estudo pode ser bom numa e inútil noutra:

- **Neural** — o que há de base neurobiológica e o risco de neuromito. O corpus quase não tem neurociência utilizável: o "neuro" do BrainHex é especulativo, as "redes cerebrais" do UDL 2.2 são metáfora e a neurociência básica (DAT-11, DAT-22) não faz ponte com a sala. Nenhuma regra do motor se apoia nessa lente.
- **Psicológica** — motivação, emoção, autorregulação e validade dos instrumentos. Emoção acadêmica é medida quase só por autorrelato (DAT-04), e a telemetria mede engajamento comportamental, não emoção nem atenção (DAT-45). A psicometria do BrainHex é fraca, e o corpus aprovado está dividido sobre personalizar por tipo (DAT-03 a favor; DAT-37 e DAT-41 contra).
- **Pedagógica** — efeito no ensino e transferência para a graduação. É daqui que saem as regras: quiz e perguntas explicativas (DAT-21), prática espaçada do mesmo conteúdo (DAT-36), feedback sobre a tarefa (DAT-34), apoio à autorregulação (DAT-32, DAT-33), formatos para todos e não por perfil (DAT-14, DAT-35, DAT-40).

## Resultado

| | Quantidade |
| --- | --- |
| Decididos pela curadora | 28 (24 aprovados, 4 reprovados) |
| Parecer da IA sobre essas decisões | concorda 14 · concorda em parte 8 · discorda 6 |
| Pendentes com veredito sugerido | 19 (1 aprovado, 10 aprovados com ressalvas, 8 reprovados) |
| Destino **corpus do RAG** | 0 |
| Destino **texto derivado** | 12 |

As seis discordâncias (DAT-10, 12, 13, 18, 23 e 24) seguem um padrão: DAT-10, 12 e 13 têm as mesmas falhas que levaram a curadora a reprovar DAT-02, 26, 27 e 28 (correlacional autorrelatado com respostas repetidas tratadas como independentes, busca que confirma a teoria por construção, heterogeneidade de 98,84%). Em DAT-18, 23 e 24 o resumo antigo da planilha descrevia conteúdo que não está no PDF. A decisão continua dela; a coluna Destino marca esses seis como "a decidir".

Nenhum documento foi para o corpus: os que têm licença aberta servem ao motor ou ao professor, não ao aluno, e os guias que serviriam ao aluno (EEF) não têm licença que permita indexar. Os PDFs dos documentos aprovados não ficam neste repositório.

Duplicatas que não contam como fontes independentes no fluxograma PRISMA: DAT-06/DAT-07 (mesmo estudo), DAT-18/19/20/24/30/34/35 (todos da EEF, mesmo corpo de evidência) e DAT-09/DAT-44 (UDL 3.0 e a 2.2 que ela substituiu).

## Documentos

"Decisão" mostra a da curadora ou, para os pendentes, a sugerida. "Parecer IA" só existe para os decididos.

| ID | Documento (conferido no PDF) | Decisão | Parecer IA | Destino | Licença |
| --- | --- | --- | --- | --- | --- |
| DAT-01 | O'Donovan, Gain e Marais (2013), SAICSIT '13 (ACM) | Aprovado (curadora) | Concordo | só citação | © ACM |
| DAT-02 | Galino Buen et al. (2026), Eur. J. Investig. Health Psychol. Educ. 16(4) | Reprovado (curadora) | Concordo | não usar · sensível (#74) | CC BY |
| DAT-03 | Monterrat et al. (2015), AIED 2015 (Springer LNCS 9112) | Aprovado (curadora) | Concordo | texto derivado | © Springer (preprint HAL) |
| DAT-04 | Cho et al. (2026), Research Methods in Applied Linguistics | Aprovado (curadora) | Concordo | só citação | CC BY 4.0 |
| DAT-05 | Fortim et al. (2016), SBGames 2016 | Aprovado (curadora) | Concordo em parte | só citação (contexto brasileiro) | aberto, sem licença CC |
| DAT-06 | Nacke, Bateman e Mandryk (2014), Entertainment Computing 5 | Aprovado (curadora) | Concordo | só citação | © Elsevier |
| DAT-07 | Nacke, Bateman e Mandryk (2011), ICEC 2011 (Springer LNCS 6972) | Aprovado (curadora) | Concordo em parte | só citação | © Springer |
| DAT-08 | Grosu (2022), Management & Marketing. Challenges for the Knowledge Society | Reprovado (sugerido) | — | não usar | não confirmada |
| DAT-09 | CAST (2024), UDL Guidelines 3.0 — organizador gráfico em português | Aprovado (curadora) | Concordo | texto derivado | © CAST |
| DAT-10 | de la Fuente et al. (2020), IJERPH 17(12) | Aprovado (curadora) | Discordo | a decidir: curadora aprovou, IA sugere não usar | CC BY 4.0 |
| DAT-11 | Morris et al. (2003), Phil. Trans. R. Soc. B 358 | Aprovado (curadora) | Concordo em parte | só citação | © Royal Society |
| DAT-12 | Kritikou e Giovazolias (2022), Frontiers in Psychology, 13:1057697 | Aprovado (curadora) | Discordo | a decidir: curadora aprovou, IA sugere não usar | CC BY |
| DAT-13 | Gyedu et al. (2026), SAGE Open | Aprovado (curadora) | Discordo | a decidir: curadora aprovou, IA sugere não usar | CC BY-NC 4.0 |
| DAT-14 | Newton e Salvi (2020), Frontiers in Education | Aprovado (curadora) | Concordo | só citação | CC BY |
| DAT-15 | Mayrhofer et al. (2026), Education and Information Technologies, 31 | Aprovado (curadora) | Concordo | só citação | CC BY 4.0 |
| DAT-16 | Priestley et al. (2026), Studies in Higher Education | Aprovado (curadora) | Concordo | só citação | CC BY 4.0 |
| DAT-17 | Barata et al. (2014), International Journal of Game-Based Learning (IJGBL) | Aprovado (curadora) | Concordo em parte | só citação | © IGI Global |
| DAT-18 | EEF (2024), protocolo de atualização do guia de metacognição | Aprovado (curadora) | Discordo | a decidir: curadora aprovou, IA sugere não usar | © EEF |
| DAT-19 | EEF (2025), sumário de evidências de metacognição (Toolkit) | Aprovado (curadora) | Concordo em parte | texto derivado | © EEF |
| DAT-20 | EEF (2025), Evidence to Decision Framework — metacognição | Aprovado (curadora) | Concordo em parte | só citação | © EEF |
| DAT-21 | Pashler et al. (2007), IES Practice Guide NCER 2007-2004 | Aprovado (curadora) | Concordo | texto derivado | domínio público (EUA) |
| DAT-22 | Horner e Doeller (2017), Current Opinion in Neurobiology, 43 | Aprovado (curadora) | Concordo | só citação | CC BY 4.0 |
| DAT-23 | Sienel, Münster e Zimmermann (2021), HEALTHINF 2021 | Aprovado (curadora) | Discordo | a decidir: curadora aprovou, IA sugere não usar | © SCITEPRESS |
| DAT-24 | EEF (2021), excerto de Improving Literacy in KS2 | Aprovado (curadora) | Discordo | a decidir: curadora aprovou, IA sugere não usar | © EEF |
| DAT-25 | Barata et al. (2014), CHI PLAY '14 (ACM) | Aprovado (curadora) | Concordo em parte | só citação | © ACM |
| DAT-26 | van Kessel et al. (2025), The Australian Educational Researcher 52 | Reprovado (curadora) | Concordo | não usar | CC BY |
| DAT-27 | Shi e Li (2026), Frontiers in Psychology 17:1822649 | Reprovado (curadora) | Concordo | não usar | CC BY |
| DAT-28 | Verdugo e Martínez-Líbano (2026), International Medical Education (MDPI), 5(2), 34 | Reprovado (curadora) | Concordo | não usar · sensível (#74) | CC BY |
| DAT-29 | Rodrigues et al. (2025), REVASF | Aprovado (curadora) | Concordo em parte | só citação (contexto brasileiro) | não confirmada |
| DAT-30 | Davies e Henderson (2020), EEF — SEN in Mainstream Schools | Aprovado com ressalvas (sugerido) | — | só citação · sensível (#74) | © EEF |
| DAT-31 | Bates (2011), tese de doutorado, Nottingham Trent University | Reprovado (sugerido) | — | não usar | © autor/universidade |
| DAT-32 | Edisherashvili et al. (2022), Frontiers in Psychology, 12:792422 | Aprovado com ressalvas (sugerido) | — | texto derivado | CC BY |
| DAT-33 | Cheng et al. (2026), preprint arXiv:2604.03248 | Aprovado com ressalvas (sugerido) | — | texto derivado | CC BY-NC-SA 4.0 |
| DAT-34 | Collin e Quigley (2021), EEF — Teacher Feedback | Aprovado com ressalvas (sugerido) | — | texto derivado | © EEF |
| DAT-35 | EEF (2018), Teaching & Learning Toolkit (versão de 2018) | Aprovado com ressalvas (sugerido) | — | texto derivado | © EEF |
| DAT-36 | Mawson e Kang (2025), Behavioral Sciences (MDPI) | Aprovado com ressalvas (sugerido) | — | texto derivado | CC BY 4.0 |
| DAT-37 | Oliveira et al. (2022), Smart Learning Environments, 9:16 | Aprovado com ressalvas (sugerido) | — | só citação | CC BY 4.0 |
| DAT-38 | Qi et al. (2025), Frontiers in Psychology, 16:1599543 | Reprovado (sugerido) | — | não usar | CC BY 4.0 |
| DAT-39 | Tan et al. (2021), IJERPH 18(18) | Reprovado (sugerido) | — | não usar · sensível (#74) | CC BY 4.0 |
| DAT-40 | Brown (2023), Frontiers in Education | Aprovado com ressalvas (sugerido) | — | texto derivado | CC BY 4.0 |
| DAT-41 | Santos et al. (2021), User Modeling and User-Adapted Interaction | Aprovado com ressalvas (sugerido) | — | texto derivado | CC BY 4.0 |
| DAT-42 | Sobhaninia et al. (2026), BMC Psychology (no prelo) | Reprovado (sugerido) | — | não usar · sensível (#74) | CC BY-NC-ND 4.0 |
| DAT-43 | Ghaty et al. (2026), Frontiers in Psychology, 17:1762426 | Reprovado (sugerido) | — | não usar · sensível (#74) | CC BY 4.0 |
| DAT-44 | CAST (2018), UDL Guidelines 2.2 (arquivada) | Reprovado (sugerido) | — | não usar | © CAST |
| DAT-45 | Bergdahl et al. (2024), IJETHE 21 | Aprovado (sugerido) | — | texto derivado | CC BY 4.0 |
| DAT-46 | Hamilton et al. (2009), IES Practice Guide NCEE 2009-4067 | Aprovado com ressalvas (sugerido) | — | só citação | domínio público (EUA) |
| DAT-47 | Hadi Mogavi et al. (2023), HCI-Games 2023 (Springer LNCS 14047) | Reprovado (sugerido) | — | não usar | © Springer |

## Texto derivado e golden set (#75)

Os doze documentos com destino **texto derivado** viram regras escritas por nós, cada uma com fonte e população. São também a base dos casos do golden set: cada pergunta abaixo tem documentos que sustentam a resposta, e algumas têm de propósito uma resposta negativa, para medir se o mentor admite o limite em vez de inventar.

| Pergunta (como o professor ou o aluno faria) | Resposta esperada | Documentos |
| --- | --- | --- |
| Quando devo revisar um card que já estudei? | Reexpor o mesmo conteúdo em sessões separadas, com intervalos de dias; espalhar conteúdos diferentes não conta | DAT-36, DAT-21 |
| Um quiz no meio do tópico ajuda a lembrar? | Sim: quizzes que reexpõem o conteúdo central têm evidência forte | DAT-21 |
| Que tipo de feedback ajuda o aluno a melhorar? | Feedback sobre a tarefa e o próximo passo; elogio genérico à pessoa ajuda pouco | DAT-34, DAT-35 |
| Lembrete de estudo funciona? | Funciona ligado ao progresso e a prazos intermediários; lembrete genérico e frequente pode gerar ansiedade | DAT-33, DAT-45, DAT-32 |
| O perfil Mastermind aprende melhor lendo? | **Não há evidência.** Formatos ficam disponíveis a todos; casar formato com perfil é a hipótese dos estilos de aprendizagem | DAT-14, DAT-35, DAT-40 |
| Dá para saber se o aluno está ansioso pelo tempo parado no app? | **Não.** Telemetria mede engajamento comportamental; emoção exige outra medida | DAT-45, DAT-04 |
| Mostrar o ranking motiva a turma? | Motiva quem está no topo e pode desmotivar quem está embaixo; limitar a visibilidade e não premiar o topo | DAT-33, DAT-32 (mais DAT-01 e DAT-15, só citação) |
| Personalizar a gamificação pelo BrainHex melhora a aprendizagem? | **Não está demonstrado.** Há um resultado a favor de tempo de uso e outros sem efeito | DAT-03, DAT-41 (mais DAT-37, só citação) |

O golden set completo (30 a 50 perguntas) continua dependendo do corpus indexado e da [#67](https://github.com/BitStudioLabs/trail-up/issues/67), como diz o [pipeline](./pipeline-corpus.md#75--golden-set). Esta tabela é o começo dele, amarrado aos documentos aprovados.

## Pendências

- A curadora revisa os 19 vereditos sugeridos e decide se reabre os seis em que a IA discorda.
- Os metadados das linhas já decididas continuam como estavam na planilha. As correções sugeridas (autores, ano e revista conferidos no PDF) estão na cópia de revisão.
- Ao entrar no fluxograma PRISMA, contar cada duplicata uma vez só.
- Escrever as regras derivadas dos doze documentos no formato da [#73](./pipeline-corpus.md#73--curadoria-pedagógica) (`construto`, `populacao`, `tipo_estudo`, `confianca`, `tipo=derivado`).
