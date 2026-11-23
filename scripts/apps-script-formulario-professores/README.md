# Formulário da pesquisa com professores

Gera, no Google Forms, os formulários da avaliação do TrailUp por professores: inscrição, avaliação e atualização da forma de divulgação. O professor usa o
sistema numa turma de demonstração, com alunos fictícios, seguindo um roteiro de 10 tarefas (8 no
console e 2 na tela do aluno), e responde por escrito. **Ninguém avalia material gerado para a
pesquisa.** O professor pode testar com conteúdo próprio; do lado do aluno, por enquanto, só o
aluno de teste dele. A cartilha fica no site, em `/pesquisa/professores`
(`frontend/src/pages/PesquisaProfessores.tsx`), e o botão dela abre a inscrição.

`Code.gs` é a fonte. Tarefas, perguntas e escalas espelham
`frontend/src/features/pesquisa/pesquisaProfessores.ts`, e `pesquisaProfessores.test.ts` falha se
os dois se separarem.

## O que o formulário mede

A proposta completa, com o porquê de cada escolha, está em
`docs/pesquisa/proposta-instrumento-avaliacao-professores.md`.

| Bloco | Instrumento | Situação em PT-BR |
|---|---|---|
| Por tarefa (×10) | Conclusão autodeclarada (sim / em parte / não / não tentei), SEQ de 1 a 7 (Sauro; Dumas, 2009, DOI 10.1145/1518701.1518946), tempo em faixas e onde travou | SEQ traduzida, **sem validação** |
| Usabilidade | SUS, versão brasileira: Lourenço, D. F.; Carmona, E. V.; Lopes, M. H. B. M. (2022), Aquichan 22(2), e2228, DOI 10.5294/aqui.2022.22.2.8. Itens da Tabela 1 (a versão aplicada no estudo); âncoras "discordo fortemente" e "concordo fortemente" | **Validada**. Os metadados da revista trazem "Carmona Valentim"; o PDF e a citação sugerida pelo próprio artigo dão o sobrenome Carmona |
| Carga de trabalho | Raw TLX (Hart, 2006, DOI 10.1177/154193120605000909), 6 dimensões, Desempenho invertido. Nomes das dimensões, a pergunta de Esforço e as âncoras pouquíssimo/muitíssimo são de Ciofi-Silva et al. (2023), Rev Bras Enferm 76(3), e20220556, DOI 10.1590/0034-7167-2022-0556 | Versão brasileira com validade de conteúdo (profissionais de saúde). **O texto final das outras 5 perguntas não foi publicado** (o suplemento citado não está online): elas são adaptação dos autores a partir das definições do artigo. A linha de 20 intervalos virou escala de 0 a 10 |
| Métricas do console | EFLA v4 do professor, 8 itens de 1 a 10 (Scheffel et al., 2017, DOI 10.1007/978-3-319-66610-5_15), no condicional; escore de 0 a 100 (`pontuarEfla`). Comparável com Roque da Silva et al. (2024), DOI 10.22456/1679-1916.141557 | Tradução livre, **sem validação** |
| Acionabilidade | "Eu tomaria alguma ação" (1–10), qual ação (aberta, codificada por Wise; Jung, 2019, DOI 10.18608/jla.2019.62.4) e quanto as métricas refletiriam a realidade (0–100%), de Kasepalu et al. (2022), DOI 10.1007/s10758-021-09522-5 | Itens adaptados |
| Métricas, uma a uma | Matriz entendi / confio / faria algo diferente | Item próprio |
| Sugestões da IA | Ver a tabela abaixo | Tradução livre e itens próprios |
| Material personalizado | Dimensões do LORI: Leacock; Nesbit (2007); versão brasileira de Marcos, Puricelli e Grosseman (2024), RBEP 105, DOI 10.24109/2176-6681.rbep.105.5651 (8 dimensões, 1 a 5 e "não se aplica"). "Pronto para uso" de Sarsa et al. (2022) e Doughty et al. (2024) | Itens próprios a partir das dimensões |
| Tela do aluno | UEQ-S (Schrepp; Hinderks; Thomaschewski, 2017, DOI 10.9781/ijimai.2017.09.001), a partir da versão oficial de Portugal (Pérez Cota et al., 2014, DOI 10.1016/j.procs.2014.02.053), mais 4 itens próprios | **Adaptação lexical para o Brasil, não validada**, ver abaixo |
| Utilidade e intenção de uso | Itens adaptados da utilidade percebida do TAM (Davis, 1989, DOI 10.2307/249008) | Itens próprios: não há TAM validado para docentes brasileiros |
| Esforço e rotina, gamificação | Itens próprios (Hanus; Fox, 2015, para o ranking) | Itens próprios |
| Dados e ética | Nazaretsky et al. (2022), Q10, Q14 e Q16; Drachsler e Greller (2016), DOI 10.1145/2883851.2883893; 2 itens próprios | Tradução livre |

**Sugestões da IA, item a item:**

| Item | Origem |
|---|---|
| Entendi por que o sistema fez a sugestão para aquele aluno ou para a turma. | Hoffman et al. (2023), Explanation Satisfaction 1, e Pu, Chen e Hu (2011), transparência; adaptado de "como funciona" para "por que esta sugestão" |
| A explicação da sugestão tem detalhe suficiente. | Hoffman, ES 3 |
| A explicação é útil para eu decidir o que fazer. | Hoffman, ES 6 |
| A explicação deixa claro o quanto posso confiar na sugestão. | Hoffman, ES 7, adaptado |
| Confio nas sugestões do sistema. / As sugestões do sistema são confiáveis. | S-TIAS (McGrath et al., 2025, DOI 10.3389/frai.2025.1582880), 2 dos 3 itens |
| Desconfio das sugestões do sistema. (invertido) | Hoffman, Trust 6; Jian, Bisantz e Drury (2000), item 4 |
| Eu levaria uma sugestão do sistema tão a sério quanto a de um colega professor. | Nazaretsky, Cukurova e Alexandron (2022), Q24, DOI 10.1145/3506860.3506866 |
| Alguma sugestão me pareceu errada ou injusta com o aluno. / Eu conferiria os dados antes de agir. | Próprios |

Hoffman et al. (2023): Frontiers in Computer Science 5, 1096257, DOI 10.3389/fcomp.2023.1096257.
Pu, Chen e Hu (2011): RecSys, DOI 10.1145/2043932.2043962.

**UEQ-S, pares mudados em relação à versão de Portugal:** obstrutivo–condutor → atrapalha–ajuda;
confuso–evidente → confuso–claro; aborrecido–excitante → chato–empolgante; comum–vanguardista →
comum–inovador. Os outros quatro ficaram iguais. Por isso a comparação com o benchmark oficial é só
indicativa.

**Blocos de concordância:** 5 pontos, mais "Não observei", que fica fora da conta.

Fora, e por quê:
- **GAMEFULQUEST-BR** (Silva Junior; Oliveira; Hamari, 2024, DOI 10.1038/s41598-024-68101-7):
  validado, mas mede a experiência de quem joga. O professor passa poucos minutos como aluno de
  teste. Serve para a fase 2, com os alunos.
- **UMUX-Lite e ASQ:** sem validação em PT; a SUS e a SEQ já cobrem.
- **TiA de Körber e escalas longas de atitude perante IA:** feitas para outro contexto ou para a IA
  em geral, não para o TrailUp.
- **Avaliação heurística completa:** professor de fora da TI não é avaliador treinado.

## Análise

Com 12 a 16 respondentes a análise é descritiva, sempre separada pelos três grupos (docentes de TI,
de outras áreas, pedagogos):
- **SUS, EFLA e Raw TLX:** escore de 0 a 100 (`pontuarSus`, `pontuarEfla`, `pontuarTlx`), mediana e
  amplitude. A SUS é lida contra a média de referência 68 e a escala de adjetivos de Bangor, Kortum e
  Miller (2009), como referência e não como prova.
- **UEQ-S:** média por dimensão, de −3 a +3 (`pontuarUeqs`).
- **Blocos:** distribuição por item.
- **Tarefas:** taxa de conclusão com intervalo de Wald ajustado (Sauro; Lewis, 2016), SEQ mediana e
  faixa de tempo mais frequente.
- **Abertas:** análise temática (Braun; Clarke, 2006).

Sem alfa nem análise fatorial: com n < 20 o alfa é instável e não prova validade. No texto, "escala
validada" só para a SUS; "tradução livre de…" e "elaborado pelos autores" para o resto, como na
tabela.

**Triangulação:** a conclusão autodeclarada é conferida contra o que a tarefa deixa registrado na
turma de demonstração. A T5 deixa a decisão sobre a sugestão, a T6 a entrega corrigida e a T3 a
geração pedida. Nenhum outro dado de uso entra (TCLE, seção 3).

## Antes de criar o de verdade

**A coleta só começa depois da aprovação do CEP.** Até lá, crie só o rascunho.

1. Preencher em `CONFIG` o que está como `[PREENCHER ...]`: endereço do sistema, tempo estimado,
   prazo de guarda, contatos, CEP e o link da cópia do TCLE.
2. **Validade de conteúdo:** passar as traduções e os itens próprios por um painel-piloto de 3 a 5
   juízes que não entram na amostra, com o formulário de `criarFormularioDoPilotoIvc` (ver
   "Piloto de validade de conteúdo", abaixo). Cada juiz avalia clareza e pertinência de cada item numa escala
   de 4 pontos. Limiares: I-CVI = 1,00 com até 5 juízes (Lynn, 1986, DOI
   10.1097/00006199-198611000-00017) e S-CVI/Ave ≥ 0,90 (Polit; Beck, 2006, DOI 10.1002/nur.20147),
   o mesmo método da fase 1 (Alexandre; Coluci, 2011). O que não passar é reescrito ou sai. Este
   piloto também mede o tempo real, que vai para o TCLE e a cartilha.
3. Montar a turma de demonstração (alunos fictícios com dados nas métricas, insights, entregas na
   fila de notas, missões, eventos e ranking) e criar os acessos de teste de professor e de aluno.
4. O TCLE do script precisa ser idêntico ao aprovado. O pacote da fase 1 no CEP ainda descreve a
   versão com juízes anônimos avaliando material gerado, e precisa ser refeito para este desenho:
   participantes identificados, com sigilo, avaliando o uso do sistema. Com identificação, o
   registro do consentimento e o risco de quebra de sigilo mudam no protocolo.

## Piloto de validade de conteúdo

`criarFormularioDoPilotoIvc` cria o formulário dos juízes. Os itens saem das mesmas constantes da
avaliação (`secoesDoPiloto_`), então o que o juiz vê é o que o professor vai responder. São 13
seções: roteiro, perguntas por tarefa, Raw TLX, EFLA e acionabilidade, pares do UEQ-S, os 7 blocos
e as abertas. **A SUS fica de fora**, porque já é validada.

- **Por item:** clareza e pertinência ao que a seção diz medir, de 1 a 4 (1 = não; 2 = precisa de
  grande revisão; 3 = precisa de pequena revisão; 4 = sim), mais um campo de sugestão por seção.
- **Juízes:** 3 a 5, de fora da amostra, com termo próprio (`CONFIG.linkTcleIvc`), também dentro
  do protocolo do CEP. O link vai só por e-mail.
- **Conta:** I-CVI = proporção de juízes com 3 ou 4 (`calcularIcvi`), separado para clareza e para
  pertinência. Limiar `limiarDoIcvi`: 1,00 com até 5 juízes, 0,78 de 6 a 10 (Lynn, 1986). S-CVI/Ave
  (`calcularScviMedio`) ≥ 0,90 (Polit; Beck, 2006).
- **Depois:** item abaixo do limiar é reescrito e volta aos juízes, ou sai. A mudança vai no módulo
  e no `Code.gs` juntos (o teste de paridade cobra), e os valores de I-CVI entram no método da
  monografia.

## Criar

1. Em script.google.com, criar um projeto e colar `Code.gs` e `appsscript.json` (Configurações
   do projeto → "Mostrar arquivo de manifesto"). O manifesto pede só a permissão de Forms.
2. **Executar → `criarFormularioDeAtualizacao`** e autorizar. Copiar o link de resposta para
   `CONFIG.linkAtualizacao` e para `VITE_PESQUISA_ATUALIZACAO_FORM_URL`.
3. **Executar → `criarFormularioDeInscricao`**. O link de resposta vai para
   `VITE_PESQUISA_INSCRICAO_FORM_URL`: é o botão da cartilha.
4. **Executar → `criarFormulario`** (a avaliação). Este link **não** vai para o site: segue só no
   e-mail com os acessos.
5. O registro de execução mostra os links. Com `rascunho: true`, lista também os campos que faltam.
6. Conferir os três no modo de visualização, inclusive o "Não quero participar".
7. Para os definitivos: `rascunho: false` e rodar de novo. As funções recusam se faltar algum campo.
   Apagar os rascunhos no Drive.

Sem `VITE_PESQUISA_INSCRICAO_FORM_URL`, a cartilha mostra que a inscrição ainda não está aberta.

## Fluxo de cada participante

1. **Inscrição:** TCLE e identificação. O e-mail informado é o login.
2. **Acesso, pela equipe:** criar a conta de professor com esse e-mail e uma senha aleatória
   (por exemplo, `openssl rand -base64 18`), aprovar o professor e ligá-lo à turma de
   demonstração. O acesso ao console é restrito por segurança: ele mostra dados de turmas e de
   alunos, e todo professor passa pela aprovação da equipe. Enviar **só para o e-mail cadastrado**, numa
   mensagem individual: o login e a senha de professor, o acesso de aluno de teste, o link da
   avaliação e o da cartilha. A senha não fica registrada em nenhum outro lugar.
3. **Avaliação:** começa pelo e-mail cadastrado, que liga a avaliação à inscrição.
4. **Ao fim da pesquisa:** apagar as contas, a turma de demonstração e o conteúdo que os
   professores puseram nela.

## O que o script garante

| Decisão | Motivo |
|---|---|
| Inscrição separada da avaliação, e o e-mail da inscrição vira o login | O acesso ao console é restrito: a equipe precisa criar a conta antes do roteiro. A senha é aleatória e vai só para o e-mail cadastrado |
| Identifica o participante (nome, e-mail, instituição, titulação, formação, papel) | A pesquisa se apoia na qualificação de quem avalia, e a monografia traz a avaliação de cada especialista |
| E-mail é um campo do formulário, sem coleta automática nem login do Google | Não exige conta Google, e o e-mail serve só para contato e devolutiva |
| Pergunta como a avaliação aparece na monografia: com nome, com código e perfil (E1…) ou só no conjunto | Res. CNS 510/2016: o participante decide se a identidade é divulgada (art. 9º, V), e o sigilo só cede por manifestação explícita (art. 17, IV). A escolha é separada do aceite, e recusar o nome não exclui da pesquisa |
| Nenhuma pergunta obrigatória | Garantia do TCLE e orientação da CONEP |
| TCLE na primeira página, e "Não quero participar" envia na hora | O aceite vem antes de qualquer pergunta |
| A forma de divulgação é a **última** pergunta, depois de toda a avaliação, e pode ser trocada a qualquer momento até a versão final pelo formulário de atualização (vale a resposta mais recente). Com o nome, só depois de ver o próprio quadro | Viés de cortesia: quem responde sabendo que o nome vai junto tende a avaliar melhor. Decidir depois, e poder voltar atrás, separa a avaliação da exposição |
| A descrição do formulário, a página antes do roteiro e o TCLE dizem que resultado negativo vale tanto quanto positivo | Também contra a cortesia: crítica franca é o que orienta a correção |
| Título das perguntas com o id da tarefa (`T4 · ...`) | A planilha de respostas fica legível |
| Não cria planilha vinculada | As respostas são baixadas e apagadas da nuvem ao fim; uma planilha seria mais uma cópia |

## Depois da coleta

Baixar as respostas (Respostas → Fazer download em CSV), numerar os
participantes (E1, E2…) e montar o quadro de cada um conforme a forma de divulgação escolhida, mandar
o trecho para conferência de quem escolheu o nome, guardar com o pesquisador responsável e apagar as respostas do formulário, como diz o TCLE. A análise compara
os grupos pelo campo "Papel em que você avalia o sistema" (docentes de TI, de outras áreas e
pedagogos), de forma descritiva.
