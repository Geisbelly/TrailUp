# Proposta: instrumento da avaliação do TrailUp por professores (versão 2)

**Status:** aplicada em 23/11/2026. A autora aprovou os blocos, o UEQ-S adaptado para o Brasil e o
Raw TLX. O instrumento vive em `Code.gs` e em `pesquisaProfessores.ts`, e a origem de cada item está
no README do script. Este documento guarda o porquê.

**Conferido na fonte depois da proposta:**
- **SUS:** a autora é Elenice Valentim **Carmona**: a citação é Lourenço, Carmona e Lopes (2022); o
  "Carmona Valentim" está só nos metadados da revista. A Tabela 1 é a versão aplicada no estudo, e
  não há outra final. As âncoras são "discordo fortemente" e "concordo fortemente".
- **Raw TLX:** o texto final das perguntas brasileiras não foi publicado. O suplemento citado não
  está nem no SciELO nem no PMC. Ficam da versão brasileira os nomes das dimensões, a pergunta de
  Esforço e as âncoras pouquíssimo/muitíssimo; as outras cinco perguntas são adaptação declarada.
- **LORI-BR:** a versão final brasileira tem **8** dimensões, de 1 a 5, com "não se aplica"; a
  reutilização entrou em "Qualidade de conteúdo".
- **UEQ-S:** adaptação lexical para o Brasil (decisão da autora), pares listados no README.

Base: três levantamentos bibliográficos feitos em 23/11, com fonte aberta e DOI conferido no
Crossref. O que não foi conferido na fonte está marcado **[a conferir]**.

## O problema da versão 1

- **Itens próprios demais:** só a SUS é validada; o resto são frases curtas, sem origem item a item.
- **Métricas:** uma matriz de três caixas por métrica diz se o professor entendeu, mas não mede
  consciência, reflexão nem impacto, que é o que a literatura de painéis avalia.
- **Sugestões da IA:** os 6 itens não separam explicação, confiança e decisão.
- **Tarefas:** só a SEQ. Não se sabe se o professor **concluiu** a tarefa nem quanto tempo levou.
- **Sem etapa de validade de conteúdo** dos itens próprios antes da coleta.

## Princípios

1. **Item validado primeiro:** onde existe instrumento com validação publicada, ele é usado sem
   reescrever.
2. **Tradução declarada:** onde só existe em inglês, o item é traduzido literalmente, com a origem
   anotada item a item e a marca "tradução livre, não validada".
3. **Item próprio só onde não há nada**, com a marca "elaborado pelos autores" e passando pelo IVC.
4. **Análise descritiva:** com 12 a 16 respondentes, mediana e amplitude por item e por dimensão,
   separadas pelos três grupos (TI, outras áreas, pedagogos). Sem alfa nem análise fatorial: com
   n < 20 o alfa é instável e não prova validade.
5. **Opção "não observei" nos blocos de concordância:** quem não viu um recurso não chuta.

## Blocos propostos

| # | Bloco | Instrumento | Itens | Situação em PT-BR | Tempo |
|---|---|---|---|---|---|
| 0 | Por tarefa (×10) | Conclusão + SEQ + tempo em faixas + "onde travou" | 4 por tarefa | SEQ: tradução sem validação | ~7 min |
| 1 | Usabilidade do console | SUS | 10 | **Validada** | 2 min |
| 2 | Métricas do console | EFLA v4, professor + acionabilidade | 8 + 3 | EFLA: tradução sem validação | 4 min |
| 3 | Sugestões da IA | Hoffman et al. (2023), S-TIAS, Nazaretsky et al. (2022) | 8 | Tradução sem validação | 2 min |
| 4 | Material personalizado | LORI-BR (dimensões) + "pronto para uso" | 6 | LORI: **adaptação com validade de conteúdo** | 2 min |
| 5 | Tela do aluno | UEQ-S | 8 | **Versão oficial em português de Portugal** | 1,5 min |
| 6 | Utilidade e intenção de uso | Adaptado de Davis (1989) | 5 | Itens próprios | 1,5 min |
| 7 | Esforço e rotina | Itens próprios (Raw TLX opcional) | 4 | Itens próprios | 1,5 min |
| 8 | Gamificação, visão docente (opcional) | Itens próprios | 4 | Itens próprios | 1 min |
| 9 | Dados e ética (opcional) | EFLA D1–D2, Nazaretsky, SELAQ | 5 | Tradução sem validação | 1,5 min |
| 10 | Perguntas abertas | — | 4 | — | 5 min |

**Total de questionário:** cerca de 30 min. Com o uso do sistema (30 a 40 min) e a inscrição,
dá de 65 a 75 min. Hoje a cartilha diz "cerca de uma hora": passa a dizer "de uma hora a uma hora
e quinze".

---

### Bloco 0. Depois de cada tarefa

| Pergunta | Resposta | Por quê |
|---|---|---|
| Você conseguiu fazer a tarefa? | Sim · Em parte · Não · Não tentei | Sem gravação, a conclusão é autodeclarada. É a métrica de tarefa mais básica (Sauro; Lewis, 2016) |
| No geral, essa tarefa foi... | 1 (muito difícil) a 7 (muito fácil) | SEQ (Sauro; Dumas, 2009). Já existe |
| Quanto tempo levou, mais ou menos? | < 2 min · 2–5 · 5–10 · > 10 | Faixa é mais confiável que minuto digitado |
| Onde travou ou o que confundiu? | Aberta, opcional | Já existe |

**Triangulação:** onde a tarefa deixa rastro no banco da turma de demonstração (ação em
Recomendações, nota na fila, geração pedida), a autodeclaração é conferida contra esse rastro.
Isso vai para o método como medida objetiva complementar.

Taxas de conclusão são relatadas com intervalo de confiança de Wald ajustado (Sauro; Lewis, 2016).

### Bloco 1. SUS (mantida)

Lourenço et al. (2022), Aquichan 22(2), e2228, DOI 10.5294/aqui.2022.22.2.8. Validada:
retrotradução, comitê de 8 juízes, 100 universitários, α = 0,76.

**Duas correções antes de usar:**
- **Autoria.** O registro do Crossref lista "Elenince Carmona Valentim". Um dos levantamentos diz
  que o sobrenome é Carmona. Hoje o repositório cita "Lourenço; Valentim; Lopes". **[a conferir na
  página do artigo]**
- **Redação.** A Tabela 1 do artigo e o texto dos Resultados divergem em três itens (1, 4 e 7).
  Conferir no PDF qual é a versão final, usá-la e citar a escolha. **[a conferir]**

Leitura do escore: média de referência 68 e a escala de adjetivos de Bangor, Kortum e Miller
(2009). É **referência, não prova**.

### Bloco 2. Métricas do console: EFLA v4 do professor

Scheffel et al. (2017), EC-TEL, DOI 10.1007/978-3-319-66610-5_15. É o único instrumento específico
de learning analytics com versão para professor e validação publicada. É fraca: 15 participantes no
papel de professor, mas com α de 0,81 a 0,95 nas dimensões A, R e I. Já foi usado no Brasil por
Roque da Silva et al. (2024), RENOTE, DOI 10.22456/1679-1916.141557, que obtiveram 89,6 com 4
professores.

**Escala:** de 1 (discordo totalmente) a 10 (concordo totalmente), como no original. O escore vai de
0 a 100 por dimensão, (x − 1)/9 × 100. Mantém a comparação com o estudo brasileiro.

| Id | Item (tradução livre) | Dimensão |
|---|---|---|
| D1 | Está claro quais dados dos alunos o console usa. | Dados |
| D2 | Está claro por que esses dados são usados. | Dados |
| A1 | O console me deixaria ciente da situação atual de aprendizagem dos alunos. | Consciência |
| A2 | O console me ajudaria a prever como os alunos vão estar, se continuarem como estão ou se mudarem. | Consciência |
| R1 | O console me estimularia a refletir sobre a minha prática de ensino. | Reflexão |
| R2 | O console me estimularia a adaptar a minha prática, se necessário. | Reflexão |
| I2 | O console me estimularia a ensinar de forma mais eficiente. | Impacto |
| I3 | O console me estimularia a ensinar de forma mais eficaz. | Impacto |

Os itens estão no condicional ("deixaria", "estimularia") porque a turma é de demonstração: é
percepção hipotética, e isso vai para as limitações.

**Acionabilidade** (Kasepalu et al., 2022, DOI 10.1007/s10758-021-09522-5, CC BY):
- **Faria algo:** "Com base nas métricas da Visão geral, eu tomaria alguma ação na turma." (1–10)
- **Que ação:** "Qual ação, e para quem?" (aberta). É codificada pelas categorias de Wise e Jung
  (2019, DOI 10.18608/jla.2019.62.4): turma inteira, alunos específicos, revisão do curso, esperar
  para ver.
- **Realidade:** "Quanto você acha que essas métricas refletiriam a realidade de uma turma?"
  (0–100%).

A matriz por métrica da versão 1 (entendi / confio / faria algo diferente) **continua**, porque é o
único lugar que diz *qual* das 7 métricas falha. Ela fica declarada como item próprio.

### Bloco 3. Sugestões da IA

Escala de 5 pontos de concordância, mais "não observei".

| Item | Origem |
|---|---|
| Entendi por que o sistema fez essa sugestão para esse aluno ou essa turma. | Hoffman et al. (2023) ES-1; Pu, Chen e Hu (2011), transparência, adaptado |
| A explicação da sugestão tem detalhe suficiente. | Hoffman ES-3 |
| A explicação é útil para eu decidir o que fazer. | Hoffman ES-6 |
| A explicação deixa claro o quanto posso confiar na sugestão. | Hoffman ES-7, adaptado |
| Confio nas sugestões do sistema. | S-TIAS (McGrath et al., 2025) |
| As sugestões do sistema são confiáveis. | S-TIAS |
| Desconfio das sugestões do sistema. (invertido) | Hoffman Trust-6; Jian et al. (2000), item 4 |
| Eu levaria uma sugestão do sistema tão a sério quanto a de um colega professor. | Nazaretsky et al. (2022), Q24 |

Fontes:
- Hoffman et al. (2023), Frontiers in Computer Science, DOI 10.3389/fcomp.2023.1096257, CC BY.
- McGrath et al. (2025), Frontiers in AI, DOI 10.3389/frai.2025.1582880.
- Nazaretsky, Cukurova e Alexandron (2022), LAK, DOI 10.1145/3506860.3506866.
- Pu, Chen e Hu (2011), RecSys, DOI 10.1145/2043932.2043962.

"Adaptado" quer dizer que a frase deixou de falar de "como a ferramenta funciona" e passou a falar
de "por que esta sugestão": é o que o TrailUp explica.

Ficam também dois itens da versão 1 que nenhuma escala cobre, declarados como próprios:
- "Alguma sugestão me pareceu errada ou injusta com o aluno."
- "Eu conferiria os dados antes de agir a partir de uma sugestão."

### Bloco 4. Material personalizado (novo)

Hoje não há bloco para o que o professor vê em T3 e T9. Proposta a partir das dimensões do LORI:
- original: Leacock e Nesbit (2007), Educational Technology & Society 10(2);
- adaptação brasileira: Marcos, Puricelli e Grosseman (2024), RBEP 105, DOI
  10.24109/2176-6681.rbep.105.5651, com validade de conteúdo e acesso aberto.

Os nomes das dimensões em português saem do artigo de 2024. A redação final dos itens está numa
figura que não foi extraída. **[a conferir no PDF]**

| Item | Origem |
|---|---|
| O conteúdo está correto, sem erros. | LORI: qualidade de conteúdo |
| O material está alinhado ao objetivo do tópico. | LORI: alinhamento do objetivo de aprendizagem |
| O nível e a linguagem servem a um aluno de graduação. | LORI: qualidade de conteúdo (nível de detalhe) |
| A apresentação (texto, áudio ou slides) é clara. | LORI: design da apresentação |
| As versões para perfis diferentes são diferentes de um jeito que faz sentido. | Próprio |
| Eu liberaria esse material para os alunos sem precisar editar. | Critério "pronto para uso" (Sarsa et al., 2022; Doughty et al., 2024) |

Não é a fase 1 (IVC do material): aqui o professor dá uma impressão do material que viu, e não um
julgamento item a item. Isso fica dito no método, para os dois não se confundirem.

### Bloco 5. Tela do aluno: UEQ-S (novo)

Schrepp, Hinderks e Thomaschewski (2017), DOI 10.9781/ijimai.2017.09.001. A versão em português é a
oficial do ueq-online.org (Pérez Cota et al., 2014, DOI 10.1016/j.procs.2014.02.053). Tem 8 pares
de 7 pontos e duas dimensões: pragmática e hedônica. Há planilha oficial de benchmark.

**É português de Portugal.** São os 8 pares, com a nota de adaptação lexical para o Brasil:
1. obstrutivo–condutor;
2. complicado–fácil;
3. ineficiente–eficiente;
4. confuso–evidente;
5. aborrecido–excitante, sugerido "chato–empolgante" **(adaptação lexical)**;
6. desinteressante–interessante;
7. convencional–original;
8. comum–vanguardista, sugerido "comum–inovador" **(adaptação lexical)**.

Opção: usar os termos de Portugal sem mudança (comparável com o benchmark) ou adaptar (mais claro,
mas declarado como adaptação não validada). **Decisão da autora.**

Por que UEQ-S e não uma segunda SUS: a SUS fica no console, e o UEQ-S mede também o lado hedônico,
que importa num app gamificado. São 1,5 min.

Os 4 itens próprios da versão 1 sobre a interface do aluno continuam (o que fazer a seguir, achar o
material, linguagem, adequação à graduação).

### Bloco 6. Utilidade e intenção de uso

Não há instrumento do TAM validado para docentes brasileiros. Os estudos nacionais (por exemplo,
Gomes et al., 2021, RENOTE, DOI 10.22456/1679-1916.121209) usam itens próprios. Os 5 itens da
versão 1 continuam, declarados como "adaptados de Davis (1989)".

### Bloco 7. Esforço e rotina

Os 4 itens da versão 1 continuam.

**Opcional:** o Raw TLX (6 itens), na versão brasileira de Ciofi-Silva et al. (2023), Rev Bras
Enferm 76(3), DOI 10.1590/0034-7167-2022-0556. Essa versão tem validade de conteúdo (IVC de 0,84 a
0,92) com profissionais de saúde, e os rótulos finais estão no material suplementar **[a
conferir]**. Só vale se o esforço do professor for pergunta de pesquisa. Acrescenta 2 min.

### Bloco 8. Gamificação (opcional)

Os 4 itens próprios da visão docente continuam.

**GAMEFULQUEST-BR não entra.** É a única escala de gamificação validada em PT-BR (Silva Junior,
Oliveira e Hamari, 2024, Scientific Reports, DOI 10.1038/s41598-024-68101-7, CC BY), mas mede a
experiência de **quem joga**. O professor passa poucos minutos como aluno de teste, e responder "me
desafia" nessas condições não mede o que a escala mede. Ela serve à fase 2, com os alunos.

### Bloco 9. Dados e ética (opcional)

Escala de 5 pontos.

| Item | Origem |
|---|---|
| Está claro para que os dados dos alunos são usados. | EFLA D2; DELICATE "Explain" (Drachsler; Greller, 2016) |
| O sistema não considera fatores sociais e emocionais que só o professor conhece. | Nazaretsky Q10 |
| O sistema preserva a minha autonomia de decidir. | Nazaretsky Q14, invertido |
| O uso de dados de emoção e de comportamento traz riscos à privacidade dos alunos. | Nazaretsky Q16 |
| O perfil e os indicadores podem rotular o aluno de forma injusta. | Próprio (versão 1) |

Fontes:
- Drachsler e Greller (2016), LAK, DOI 10.1145/2883851.2883893;
- Whitelock-Wainwright et al. (2019), SELAQ, DOI 10.1111/jcal.12366, só como inspiração: a escala é
  para estudantes.

---

## Validade de conteúdo antes da coleta

Os itens próprios e as traduções passam por um **painel-piloto de 3 a 5 juízes** que não entram na
amostra. Cada juiz diz se o item é claro e pertinente, numa escala de 4 pontos. Limiares:
- I-CVI = 1,00 com até 5 juízes (Lynn, 1986, DOI 10.1097/00006199-198611000-00017);
- S-CVI/Ave ≥ 0,90 (Polit; Beck, 2006, DOI 10.1002/nur.20147).

Item abaixo do limiar é reescrito ou sai. É o mesmo método da fase 1 (Alexandre; Coluci, 2011), o
que mantém a monografia coerente.

## Análise

- **Escalas:**
  - SUS e EFLA: escore 0–100, mediana e amplitude, por grupo;
  - UEQ-S: média por dimensão contra o benchmark, por grupo;
  - demais blocos: distribuição por item, por grupo.
- **Tarefas:** taxa de conclusão com intervalo, SEQ mediana e faixa de tempo modal, por tarefa.
- **Abertas:** análise temática (Braun; Clarke, 2006).
- **No texto:**
  - "escala validada" só para SUS e UEQ-S;
  - "tradução livre de..." para EFLA, Hoffman, S-TIAS e Nazaretsky;
  - "elaborado pelos autores" para o resto.

## O que muda fora do formulário

- **Cartilha (página e PDF):**
  - tempo estimado;
  - página "O que você vai avaliar", com os blocos novos e a escala de 1 a 10 do EFLA;
  - as perguntas por tarefa.
- **README do script:** tabela de instrumentos e citações.
- **TCLE:** tempo estimado.
- **Roteiro do vídeo:** cena 7.
- **Pacote do CEP:** o instrumento anexado muda.

## Ainda a conferir

1. Autoria e redação final da SUS brasileira (Aquichan).
2. Redação dos itens do LORI-BR (figura do artigo de 2024).
3. Rótulos do Raw TLX brasileiro (material suplementar), se for usado.
4. DOI de Jian et al. (2000).
5. Licença de uso do EFLA (a página do LACE está fora do ar).
