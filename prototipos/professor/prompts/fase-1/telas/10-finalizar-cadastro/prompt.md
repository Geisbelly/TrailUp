Última tela do fluxo de autenticação: **Finalizar cadastro** — a tela que abre quando a pessoa clica no link de confirmação do e-mail. É onde o aluno faz o questionário BrainHex, e é provavelmente o momento de maior impacto de primeira impressão do produto inteiro — vale o maior investimento visual de todo este redesign de autenticação.

Mantenha a linguagem visual já estabelecida. **Não tenho print desta tela** (é de curta duração — a pessoa passa por ela só uma vez, então não ficou capturada) — descrição integral abaixo, com base no código.

## Antes de mostrar qualquer formulário

A tela tem 3 estados de entrada, antes mesmo de chegar no formulário:
- **Confirmando** — spinner, "Confirmando seu email...".
- **Erro** — o link não confirmou nada válido (expirado, já usado, ou não há cadastro pendente para esse e-mail): ícone de X, título "Não foi possível continuar", mensagem explicando o motivo, botões "Início" e "Login".
- **Pronto** — mostra o formulário certo (aluno ou professor) conforme o que a pessoa começou a cadastrar.

## Caminho do professor (mais simples)

Um formulário único: nome completo, instituição, disciplina principal, uma descrição/apresentação em texto livre, checkbox de termos, botão "Concluir cadastro de professor". Ao concluir, a conta fica marcada como pendente de aprovação (ver prompt 06 — Aprovações) — pense em como comunicar isso já nesta tela, para a pessoa não ficar em dúvida se deu certo.

## Caminho do aluno — o wizard de 6 passos com barra de progresso no topo

1. **Básico** — nome completo e apelido ("Como quer aparecer nos rankings?").
2. **Como você prefere aprender?** — 4 opções em cards de seleção única (rádio), cada uma com ícone, título e descrição curta: *Conteúdo Primeiro*, *Pergunta Primeiro*, *Misto*, *Perguntas ao Final*.
3. **Estilo de Feedback** — 2 opções em cards maiores lado a lado: *Imediato* (correção na hora) vs *Pensante* (dicas, incentivo a tentar de novo).
4. **Introdução ao BrainHex** — uma tela de transição/explicação antes do questionário (texto de contexto, sem input).
5. **Questionário BrainHex** — o coração do cadastro. ~39 perguntas de auto-percepção, paginadas (5 por página, então ~8 páginas), cada pergunta respondida numa escala de 0 a 5 em formato de "bolinhas" numeradas dispostas em linha, com feedback visual de intensidade na bolinha selecionada. Barra de progresso mostra % de perguntas já respondidas (não a página atual).
6. **Resultado** — tela de celebração: ícone de "análise completa", o(s) perfil(is) BrainHex representativo(s) da pessoa com card grande do perfil escolhido (ícone, nome, % de compatibilidade, barra de progresso), e — quando há mais de um perfil representativo — a pessoa escolhe com qual quer começar. Abaixo, "Composição detalhada": a distribuição completa entre os 7 perfis, cada um com sua barra de progresso e cor oficial.

Navegação: "Voltar"/"Continuar" no rodapé em todos os passos, exceto durante o questionário em si (que se navega internamente por página) e no resultado (que termina com "Concluir cadastro").

## O que peço

Desenhe o wizard completo do aluno — os 6 passos — com atenção especial a três momentos:
1. **Os cards de seleção** (passos 2 e 3): precisam comunicar claramente qual está selecionado, sem depender só de cor.
2. **A grade de bolinhas do questionário** (passo 5): é uma pergunta repetida ~39 vezes — pense em como evitar fadiga visual e manter a leitura rápida página após página.
3. **A tela de resultado** (passo 6): é o "uau" do produto — a pessoa descobre seu perfil de jogador. Pode ganhar mais brilho, cor e personalidade do que qualquer outra tela deste redesign (use as cores oficiais dos 7 perfis BrainHex livremente aqui).

Desenhe também o formulário mais simples do professor, e os 3 estados de entrada (confirmando/erro/pronto).
