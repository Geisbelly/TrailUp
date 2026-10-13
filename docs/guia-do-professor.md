# Guia do professor — TrailUp

Este guia é para quem **dá a aula**, não para quem desenvolve o sistema. Ele responde três perguntas: *o que eu faço por semana*, *quanto isso custa em tempo* e *o que eu posso reaproveitar no semestre seguinte*.

> **Sobre os tempos.** As horas abaixo são **estimativas de partida**, para planejar o piloto. O estudo que inspira o sistema (O'Donovan, Gain & Marais, 2013) mediu cerca de **6 horas por semana** de trabalho extra do professor num curso gamificado feito à mão. A diferença aqui é que a IA gera o material personalizado sozinha; o que sobra para você é o conteúdo, a presença e o acompanhamento. Depois das primeiras semanas, anote o seu tempo real e corrija esta tabela.

---

## 1. Em uma página

| | Custo **único** (você paga uma vez e reaproveita) | Custo **recorrente** (toda semana) |
|---|---|---|
| **O que é** | Criar a turma, cadastrar os alunos, montar a trilha (tópicos, conteúdos, atividades) | Registrar presença, olhar quem está com dificuldade, ajustar o que não funcionou |
| **Tempo (estimativa)** | 6 a 10 horas por disciplina, na primeira vez | 1,5 a 3 horas por semana |
| **Reaproveita no semestre seguinte?** | Sim, quase tudo (ver seção 5) | Não: é o acompanhamento daquela turma |

---

## 2. Antes de começar (custo único)

Faça uma vez por disciplina. Estimativa: **6 a 10 horas**, a maior parte na trilha.

1. **Turmas.** Em **Turmas**, crie a turma e matricule os alunos. Cada aluno que entra recebe o material personalizado automaticamente, sem você pedir.
2. **Trilha.** Em **Trilhas**, escolha a turma e monte o mapa: um **tópico** por assunto, e dentro dele os **conteúdos** (texto, vídeo, link ou arquivo) e as **atividades** (múltipla escolha, verdadeiro/falso, completar, dissertação). Ligue os tópicos para dizer o que vem antes do quê.
3. **Personalização.** Em **Personalizações**, escolha um tópico e confira como o material ficou para cada um dos 7 perfis. Se algum perfil falhou, use **Gerar** na linha dele.
4. **Meus dados.** Confira nome, instituição e se a *geração automática de personalização* está como você quer. Ligada, a IA gera o material dos 7 perfis assim que você cria ou edita um tópico. Desligada, você aciona manualmente em Personalizações.

> Dica: comece com **um tópico completo** e confira o resultado nos 7 perfis antes de montar o resto. É mais barato corrigir cedo.

---

## 3. Rotina semanal (custo recorrente)

Estimativa: **1,5 a 3 horas por semana**, divididas em momentos curtos.

| Quando | O que fazer | Onde | Tempo |
|---|---|---|---|
| **Depois de cada aula** | Registrar quem veio (presença) e, se quiser premiar, a participação | **Turmas** → Presença | 5 min |
| **Uma vez por semana** | Ver como a turma está: quem está parado, quem está indo bem, onde a turma trava | **Visão geral** | 20 a 30 min |
| **Uma vez por semana** | Conferir se a geração do material correu bem (nenhum perfil com falha) | **Personalizações** | 10 min |
| **Quando há conteúdo novo** | Cadastrar o tópico, os conteúdos e as atividades da semana seguinte | **Trilhas** | 45 a 90 min |
| **Quando algo não funcionou** | Ajustar um conteúdo, uma atividade ou pedir para a IA gerar de novo | **Trilhas** / **Personalizações** | 15 a 30 min |
| **De vez em quando** | Olhar o ranking da turma inteira | **Rankings** | 5 min |

**O que você não precisa fazer:** gerar material para cada aluno. A IA monta a base por perfil (compartilhada) e uma camada leve por aluno. Você só interfere se algo estiver errado.

---

## 4. Presença e participação

Presença e participação **valem pontos** no ranking e são concedidas por você, não pelo aplicativo do aluno.

- **Presença:** vale **10 pontos** por aula, por padrão. Você pode registrar para a turma inteira ou só para alguns alunos.
- **Participação:** é sempre **discricionária**: você digita quanto vale na hora.
- Registrar duas vezes no mesmo dia **não duplica**: o sistema conta uma vez por aluno por dia.

Onde: **Turmas** → botão **Registrar presença**.

---

## 5. O que reaproveitar no semestre seguinte

| Reaproveita | Como |
|---|---|
| A trilha (tópicos, conteúdos, atividades, questões, cards) | Duplique a turma e ajuste o que mudou. A cópia nasce sem alunos e sem histórico |
| Configurações da loja da turma | Ficam por turma; confira na turma nova |

> **Confira depois de duplicar.** Na versão atual do console a duplicação de turma pode não trazer tudo: arquivos anexados, pontuação e regras das atividades, mídia das questões e a cor dos cards já foram perdidos na cópia. Abra um tópico da turma nova e confirme antes de usar. (Há uma correção pronta em revisão que faz a cópia completa numa operação só.)

**O que não vai junto:** matrículas, progresso, pontos, ranking e o material personalizado (a IA gera de novo para a turma nova).

> **Recomendação do estudo:** **troque parte do material a cada semestre** (algumas questões, alguns exemplos). Turmas seguintes tendem a se passar as respostas.

---

## 6. Pontos, ranking e loja: o que você controla

Esta é a parte em que o sistema ainda tem limites: **alguns ajustes existem no banco, mas não têm tela no console**. Abaixo, o que vale hoje e quem ajusta.

### 6.1 Pontos (XP)

Quem decide quanto vale cada coisa é o **sistema**, não o aplicativo do aluno. Valores atuais:

| O aluno... | Pontos |
|---|---|
| Conclui um conteúdo | 10 |
| Conclui uma atividade | 15 |
| Acerta uma questão | 5 |
| Revisa uma atividade | 2 |
| Erra uma questão | 0 (errar faz parte de aprender; o placar nunca anda para trás) |
| Só abre/começa algo | 0 |
| Presença em aula | 10 (padrão) |

**Quem ajusta:** a equipe técnica. Não há tela. Se achar que um valor está desbalanceado (por exemplo, revisar vale demais), peça a mudança.

### 6.2 Limite do ranking

O aluno enxerga o **topo da lista (15 posições) mais a própria linha**, sempre. Isso evita expor quem está embaixo. **Você, professor, vê a turma inteira.**

**Quem ajusta:** a equipe técnica (é uma configuração do sistema, hoje igual para todas as turmas). Em turma pequena, 15 pode esconder poucos alunos; em turma grande, muitos. Se for o caso, peça um valor diferente.

### 6.3 Moedas e loja

Moeda é separada do XP: **XP mede esforço e nunca diminui; moeda é o que se gasta**. O aluno ganha moedas por estudar (conteúdo concluído 2, atividade concluída 3, acerto 1) e troca na loja por itens que ajudam a aprender, **nunca por vantagem sobre colegas**.

| Item | Preço | O que faz |
|---|---|---|
| Prazo extra | 10 moedas (dobra a cada unidade extra) | Adia a entrega de uma atividade em 24 horas, sem penalidade |
| Segunda chance | 12 moedas (dobra a cada unidade extra) | Refaz a atividade valendo nota: 90% da melhor tentativa + 10% da pior |
| Dica | 5 moedas | Explica por que a alternativa errada está errada, sem entregar a resposta |
| Trocar formato | 4 moedas | O aluno escolhe receber o próximo material em áudio, texto ou slides |

- **Todo aluno** recebe de graça, no início: 2 prazos extras e 1 segunda chance. Moeda só compra unidades **adicionais**.
- O preço é **o mesmo para todos**, de propósito: desconto por desempenho seria descoberto e lido como julgamento numa sala em que todos se conhecem.
- **Por turma, você tem permissão** para definir: o máximo de dias de prazo extra no semestre (padrão 2), o máximo por atividade (padrão 2), o máximo de segundas chances por tópico (padrão 1), quantas unidades gratuitas a turma recebe e quais itens ficam desligados.

**Quem ajusta:** o preço dos itens é global e só a equipe técnica muda. Os limites por turma são seus por permissão, mas **ainda não há tela** para isso: peça à equipe técnica enquanto o painel não existe.

---

## 7. Regras de justiça que o sistema segue

Pense nelas ao decidir o que premiar:

1. **Nenhum recurso é o único caminho para pontuar.** Quem não quer competir no ranking, ou não quer trabalhar em grupo, não termina com menos pontos por isso.
2. **Errar não custa ponto.**
3. **Ninguém compra vantagem sobre o colega.** A loja vende ajuda para aprender, não posição.
4. **O aluno não vê quem está nas últimas posições do ranking**, só o topo e a própria linha. Você vê a turma inteira.

---

## 8. Quando algo dá errado

| Sintoma | O que fazer |
|---|---|
| Um perfil aparece com **falha** em Personalizações | Use **Gerar** na linha daquele perfil. Se falhar de novo, avise a equipe técnica |
| O aluno entrou na turma e **não tem material** | Aguarde alguns minutos: a geração é automática. Se continuar, avise a equipe |
| Você **não consegue criar conteúdo** numa turma que já tem aluno | Problema conhecido do banco; avise a equipe técnica |
| Quer **apagar** um tópico | Apagar remove também conteúdos, cards, questões e o material gerado. Não dá para desfazer |

---

## Apêndice — para a equipe técnica

Onde estão os ajustes da seção 6 (nenhum tem tela hoje; alterar exige acesso de serviço ao banco):

| Ajuste | Onde | Observação |
|---|---|---|
| Pontos por evento | tabela `eventos_pontuacao` (`tipo`, `pontos`) | `pontos >= 0`. Tipo desconhecido vale 0 |
| Moedas por evento | coluna `moedas` da mesma tabela | `atividade_revisada` paga 0 de propósito |
| Limite do ranking | `app_config`, chave `rank_limite_visivel` (padrão 15) | Vale para todas as turmas. O professor vê a turma inteira |
| Pontos de presença | `app_config`, chave `presenca_aula_pontos` (padrão 10) | Participação não tem padrão: o professor informa |
| Preço, fator e efeito dos itens | tabela `loja_itens` (`preco_base`, `preco_fator`, `ativo`) | Global, de propósito |
| Limites por turma | `loja_config_classe` (`prazo_max_dias_total`, `prazo_max_por_ativ`, `retry_max_por_topico`, `itens_desligados`) | O professor tem permissão de escrita nas turmas dele |
| Unidades gratuitas por turma | `loja_dotacao` (`classe_id`, `item_codigo`, `quantidade`) | Derivada na hora: mudar o número vale para todos |

Exemplo (ajustar quanto vale concluir uma atividade):

```sql
UPDATE public.eventos_pontuacao SET pontos = 12, atualizado_em = now() WHERE tipo = 'atividade_concluida';
```

Uma tela para o professor mexer nesses valores é trabalho futuro e deve entrar junto da issue da loja (#144).
