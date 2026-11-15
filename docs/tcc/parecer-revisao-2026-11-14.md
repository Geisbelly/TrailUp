# Parecer de revisão da monografia — 14/11/2026

Base revisada: `Monografia TrailUp - atualizada 2026-11-14 - acréscimos de fontes (limpa, só para leitura).docx`
(idêntica, palavra por palavra, à cópia `versoes/monografia-v29-2026-11-14.txt` do cofre do artigo; 40.141 palavras).
Fase: rascunho avançado (P4, com polimento já aplicado). Os critérios de avaliação do curso não foram fornecidos,
então a lente 1 usa critérios gerais de monografia em Ciência da Computação com Design Science Research.
A lente 4 (citações) não foi refeita: vale a auditoria de 14/11 (`auditoria-uso-das-fontes-2026-11-14.md`).
Os números `§N` remetem à numeração de parágrafos da v29.

```
VEREDITO: fraco-aceitar
FIT: monografia de DSR em que a avaliação no contexto de uso é proposta, não feita; a honestidade
sobre isso é a principal força, e a ausência de qualquer avaliação com usuários do sistema de 2026
é a principal fraqueza.
```

## Forças

- Resumo, objetivos, capítulo 8 e conclusão prometem o mesmo que o método entrega. O texto não afirma eficácia em lugar nenhum (§81, §271, §730, §758).
- O Quadro 23 separa a decisão que veio da leitura da decisão que a leitura só confirmou depois. A banca raramente vê esse cuidado.
- O protocolo de avaliação está gravado no banco: trava da janela, intenção de tratar, supressão de células pequenas e marcos de produto. As leituras dos resultados ficaram definidas antes da coleta (§676–677), e as ameaças à validade estão declaradas (§680–685). É uma contribuição metodológica concreta.
- O Quadro 2 compara os trabalhos relacionados perguntando se eles mediram aprendizagem, e a lacuna vem delimitada ao corpus analisado (§336).
- Todo número do sistema tem data, e as limitações estão reunidas numa lista única (cap. 9, itens a a p).

## Revisão, por impacto na decisão

**[OBRIGATÓRIO] 1. Não está declarado que a análise crítica foi feita pela IA.** O texto diz apenas que "a análise inicial concordou com 14 decisões da curadora" (§699) e descreve as três lentes sem dizer quem as aplicou (§376). Pelo `docs/rag/avaliacao-documentos.md`, a IA leu os PDFs e registrou o parecer ao lado da decisão da curadora, e os 19 documentos sem decisão receberam dela um "veredito sugerido". O Quadro 35 (Apêndice J) não tem nenhuma linha de 30/10. Como a conclusão chama esse resultado de "principal contribuição" (§756), a omissão é a primeira coisa que uma banca atenta encontraria. Correção: dizer na 4.6 quem aplicou as lentes e o que cabe à curadora (R-IA-03) e acrescentar a linha de 30/10 ao Quadro 35. Volta a P4.

**[OBRIGATÓRIO] 2. O funil da Evidence Base não termina.** O texto vai de 47 documentos para 28 decididos (24 aprovados e 4 reprovados) e para "os 19 restantes foram revisados depois, e a decisão final está na planilha" (§699). O número final de aprovados, e de quantos deles saíram as 12 regras derivadas e as 6 do catálogo, não aparece em nenhum lugar (L-007). Correção: uma frase ou um quadro com o funil completo e com o n de cada etapa. Volta a P4.

**[OBRIGATÓRIO] 3. Há uma contradição sobre a integração contínua.** A §368 diz que "a cadeia completa de migrações não é aplicada nessa etapa", e a §585 diz que uma alteração na API dispara "a aplicação de todas as migrações num PostgreSQL limpo". A primeira está certa: o `ci.yml` roda só o `test_migrations_postgres.py`. Correção: reescrever a §585. Volta a P4.

**[OBRIGATÓRIO] 4. O desfecho primário diverge entre o Quadro 21 e a §637.** No Quadro 21, o indicador principal de aprendizagem é a "Variação pré-pós". A §637 define como desfecho primário o acerto e a conclusão por atividade, e o pré e pós-teste como secundário, aplicado só se o professor definir o instrumento. Um pré-registro com dois desfechos primários perde o valor. Correção: alinhar o Quadro 21 à §637. Volta a P3.

**[OBRIGATÓRIO] 5. Os números do banco aparecem com duas datas.** A §414, a §569 e a §579 dão 189 tabelas e 21 rotinas em 8/11. O Quadro 24 dá 192 tabelas, 734 funções, 311 políticas e 23 rotinas em 12/11. Como cada número tem data, nenhum está errado, mas o leitor vê dois valores para a mesma coisa. Correção: usar só a data de 12/11, ou remeter ao Quadro 24. Fica em P4.

**[REQUER AVAL DO ORIENTADOR] 6. A hierarquia das contribuições.** A conclusão põe a contribuição de evidência em primeiro lugar (§756). O próprio texto, porém, reconhece três coisas: a estratégia de busca não foi registrada (cap. 9, item o), a decisão de manter todos os formatos para todos já existia antes da leitura, e a análise foi feita com IA (item 1). O protocolo e a regra de fronteira são verificáveis no código. Vale decidir com o orientador qual contribuição vem primeiro. Volta a P2.

**[POLIMENTO] 7. O sumário e as listas estão desatualizados.** Os campos não foram atualizados. As listas mostram 15 figuras e 29 quadros, e o corpo tem 20 figuras e 37 quadros. Os títulos das seções 1.3, 3.1 a 3.3, 4.6 a 4.14, 6.7 a 6.13 e de todo o capítulo 7 não batem com o corpo. Faltam as subseções 5.3.1 a 5.3.3 e o Apêndice M. Correção: selecionar tudo e apertar F9 antes de exportar o PDF. Fica em P5.

**[POLIMENTO] 8. A grafia do perfil oscila.** Aparece "Socialiser" 2 vezes e "Socializer" 10 vezes. Correção: padronizar uma das duas formas. Fica em P5.

**[POLIMENTO] 9. Ficam marcas pendentes no texto.** São elas: os nomes da banca (§61 a §69), a nota dos agradecimentos (§77 e §78), os dois [REQUER AVAL] (§252 e §694), o [PLACEHOLDER] da discussão (§733) e o [CONFERIR] do Apêndice J (§879). Correção: resolver cada uma antes da entrega. Fica em P5.

**[POLIMENTO] 10. Pequenos ajustes.** A linha de 8/11 do Quadro 35 está fora da ordem cronológica, como última linha. A §270 exclui o "experimento randomizado formal com grupo controle", e o capítulo 7 propõe uma turma de comparação: vale dizer que ela não é sorteada. Fica em P5.

**[OBRIGATÓRIO] 11. O papel do professor como validador do que a IA gera está escondido no capítulo 5 (acrescentado em 15/11).** O sistema tem portões em cada etapa: a proposta de trilha só entra quando o professor a aplica, e o tópico aplicado nasce em rascunho. O material por perfil nasce pendente, e o banco o esconde do aluno até a aprovação. Missão da IA não chega ao aluno sem aprovação. A nota da IA na dissertativa fica na fila de correção até o professor confirmar. Tudo isso foi conferido nas migrações da `main`. O texto, porém, não diz isso no Resumo, na metodologia, nos resultados, na discussão nem na conclusão. Dois pontos tornam o item obrigatório:
- a §462 diz que o sistema "não entrega ao aluno material gerado sem a aprovação do professor", mas as perguntas do diagnóstico, as respostas do Guardião, as falas do boss e o texto das notificações chegam ao aluno sem essa decisão;
- o Quadro 10 e a §510 apresentam a correção por modelo como final, quando ela é uma sugestão que o professor revisa.

Correção: um quadro com os pontos de decisão do professor no fim da 5.4, a lista honesta do que não passa por ele, e uma frase em cada lugar onde a banca forma o juízo. As propostas de redação estão em [`propostas-papel-do-professor-2026-11-15.md`](./propostas-papel-do-professor-2026-11-15.md). Volta a P4.

## O que foi aplicado em 15/11

Os itens 1 a 5 entraram como alterações controladas, com o autor "Claude (revisão, 15/11/2026)", em
`Monografia TrailUp - atualizada 2026-11-15 - revisão (com alterações).docx`. A versão `(limpa, só para leitura)` tem
todas as alterações aceitas. O script é [`scripts-docx/aplicar_revisao.py`](./scripts-docx/aplicar_revisao.py).

- **Item 1:** a 4.6 ganhou duas frases que dizem que a leitura pelas três lentes foi feita com o Claude em 30/10, e qual foi o papel da curadora. Na 8.1, "a análise inicial" passou a ser "o parecer da IA". O Quadro 35 ganhou a linha de 30/10, no lugar cronológico, e a linha desta rodada.
- **Item 2:** a 8.1 agora traz o que a IA sugeriu para os 19 documentos sem decisão (aprovar 11, sendo 10 com ressalvas, e reprovar 8) e diz que as 12 regras derivadas vêm de 12 documentos, uma por documento. **O total final de aprovados ficou como [CONFERIR] para a autora.** A cópia da planilha no Drive é de 30/10 e não traz as decisões finais dos 19, e o `avaliacao-documentos.md` diz que essas decisões ainda não foram passadas para o repositório.
- **Item 3:** a 5.12 agora diz o que o CI faz de verdade: roda um teste do executor de migrações, sem aplicar a cadeia completa.
- **Item 4:** no Quadro 21, o indicador principal de aprendizagem passou a ser o acerto por atividade, e a variação entre pré e pós-teste foi para os indicadores auxiliares.
- **Item 5:** as seções 5.2 e 5.11 passaram a usar os números de 12/11, os mesmos do Quadro 24. A contagem de gatilhos (149, de 8/11) saiu, porque não existe número de 12/11 para ela.

O polimento entrou no mesmo arquivo, com o autor "Claude (polimento da revisão, 15/11/2026)". O script é [`scripts-docx/aplicar_polimento_revisao.py`](./scripts-docx/aplicar_polimento_revisao.py).

- **Item 7, sumário e listas:** o docx já pede ao Word que atualize os campos ao abrir (`w:updateFields` no `settings.xml`). Ao abrir no Word, é preciso aceitar a atualização, ou apertar Ctrl+A e F9 antes de exportar o PDF. Visualizadores que não atualizam campos, como o Google Docs e a pré-visualização do macOS, vão continuar mostrando o sumário antigo.
- **Item 8:** "Socialiser" virou "Socializer" na 2.7 e no Quadro 1. Agora são 13 ocorrências, todas iguais.
- **Item 9:** não aplicado. As marcas pendentes são nomes da banca, agradecimentos, aval do orientador, discussão condicionada ao piloto e conferências da autora, e nenhuma delas pode ser preenchida por aqui.
- **Item 10:** a linha de 8/11 do Quadro 35 voltou para a ordem das datas. A 1.7 agora diz que a turma de comparação do capítulo 7 não é sorteada.

O item 6 continua com o orientador.

O item 11 entrou em outro arquivo, com o autor "Claude (papel do professor, 15/11/2026)":
`Monografia TrailUp - atualizada 2026-11-15 - papel do professor (com alterações).docx`, feito a partir da
versão da revisão. Junto vai a versão `(limpa, só para leitura)`. O script é `scripts-docx/aplicar_papel_professor.py`.
Todas as propostas de [`propostas-papel-do-professor-2026-11-15.md`](./propostas-papel-do-professor-2026-11-15.md) entraram, menos a medição sugerida da 4.8.

- **Seção 5.4:**
  - um Quadro 8 novo, com os pontos de decisão do professor;
  - o parágrafo de entrada diz que a regra de aprovação é decisão de projeto da autora;
  - um parágrafo depois do quadro lista o que chega ao aluno sem passar pelo professor;
  - a §460 diz que a trilha proposta passa por duas decisões dele;
  - a §462 fala em "material de estudo" e acrescenta que o sistema não fecha a nota de resposta aberta sem a confirmação do professor.
- **Os quadros 8 a 37 viraram 9 a 38:** foram 30 legendas e 42 remissões no texto.
- **Seção 5.7 (Quadro 11, antigo 10, e §510):** a nota do modelo fica na fila de correção. O [CONFERIR] foi resolvido no código:
  - o aluno recebe o retorno do modelo na hora (`20261108_01`);
  - a nota fica na fila até a decisão do professor (`20261016_04`, `_05`);
  - as moedas da atividade só entram depois dessa decisão (`20261017_07`).
- **Resumo e Abstract:** uma frase cada.
- **Seção 1.5 (objetivo específico):** mudou. Depende do aval do orientador; dá para rejeitar a alteração no Word.
- **Seção 1.6:** passa a dizer de quem é a validação.
- **Seção 7.3:** o roteiro da entrevista docente passa a cobrir o tempo de revisão e o que o professor recusou.
- **Quadro 22 (antigo 21):** uma linha nova, "Operação".
- **Seção 8.2:** um parágrafo com os números de validação que já estavam no texto.
- **Seção 8.5:** um parágrafo sobre os dois custos não medidos, o trabalho do professor e a aprovação por inércia.
- **Capítulo 9:** o item k foi ampliado.
- **Capítulo 10:** uma frase na segunda contribuição.
- **Apêndice J:** uma linha nova no Quadro 36.

A validação não encontrou termo da banlist, frase com mais de 45 palavras nem quadro fora de sequência. Os achados de citação e a remissão "4.10" vêm de antes desta rodada.

## A mudança que mais sobe a nota um nível

Fazer qualquer avaliação com pessoas usando o sistema de 2026. A melhor opção é o piloto. Se ele não couber no prazo, serve uma sessão curta com o professor da turma e alguns alunos, com a SUS, que o capítulo 7 já prevê, e tarefas guiadas. Hoje, a única evidência de uso real é o teste de 2025, com 5 pessoas e sobre o protótipo. O capítulo 8 só tem dados de teste. Com uma avaliação, a segunda avaliação da DSR (§340) deixa de ser apenas proposta.

## Perguntas de banca

1. **Contribuição.** "A principal contribuição é a análise da literatura, mas a busca não foi registrada e a análise foi feita por IA. O que garante que outro pesquisador chegaria às mesmas 12 regras?"
2. **Método.** "O estudo proposto compara uma turma com outra. Com duas turmas, o que a diferença-em-diferenças consegue separar do efeito do professor e da disciplina?" A §680 já reconhece o limite. A resposta precisa ser ensaiada.
3. **Validade.** "No dia 12/11, a geração falhou em 14 de 18 conteúdos. Se o piloto acontecer assim, o que vai ser medido: a personalização ou a falta dela?"
4. **Conteúdo gerado (acrescentada em 15/11).** "A IA gera texto, áudio, trilha e questões. Quem garante que o conteúdo está certo, e quanto custa ao professor garantir isso?" A resposta tem duas partes. A primeira é o quadro de portões do item 11. A segunda é o limite: a aprovação não prova leitura, e o tempo de revisão não foi medido.
