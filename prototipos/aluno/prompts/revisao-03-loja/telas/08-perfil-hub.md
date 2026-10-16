Tela 08 — **Perfil**, ajuste. Arquivo: `v3/08-perfil-hub.html` (edite o atual). Banner, troca de perfil, métricas e leitura adaptativa da revisão 02 continuam.

## 1. Feedback
Print do Perfil com o nome "Amina T." e o bloco de Conquistas (embaixo da Leitura adaptativa) marcados, e setas levando as conquistas para cima:

> "falta as outras informações do user e essas conquistas precisam de destaque, esse card aqui embaixo perde totalmente a importância, ele precisa de destaque"

## 2. Informações da aluna, embaixo do nome
Campos que o app já tem em `perfil/info.tsx` (apelido, nome, descrição, e-mail) e no perfil público (turma, guilda):
- **@AMINA** (apelido, 13/700, `accent`, como o `@USUARIO` do app);
- **Sobre** (a "Descrição" do app, placeholder "Como você gosta de aprender, interesses, objetivos..."): "Gosto de aprender praticando primeiro e lendo depois. Quero chegar ao 7º ano dominando equações.";
- lista de 4 linhas, rótulo `textSubtle` + valor: **Turma** 6º ano B · Prof. Helena Duarte · **Guilda** (emblema) Legião Azul · **E-mail** amina.t@escola.edu.br · **Na jornada desde** março de 2026;
- link **"Editar informações"** → `11-configuracoes.html#informacoes`.
Depois vem o que já existia (chip do perfil, alternar perfil, afinidade, mini-quadro). A coluna da esquerda deixa de ser sticky, porque ficou mais alta que a tela.

## 3. Conquistas no topo, em destaque
O bloco sobe para o **primeiro lugar da coluna principal**, acima das métricas, num card de destaque (borda `accent`, fundo em degradê):
- cabeçalho: eyebrow "CONQUISTAS", **"14 conquistadas"** (Georgia 22) + "· 42% da biblioteca" e o link "Ver biblioteca completa →";
- barra de 8px com os 42%;
- **4 conquistas recentes** em cards grandes (arte 64px com brilho, nome, data): Fronteira Avançada (14 set), Primeiro Tópico (02 set), Leitor Dedicado (08 set), Coletor de Moedas (20 set);
- **"Quase lá"**: as 3 em progresso com barra: Sequência de 7 dias 5/7, Explorador de Perfis 2/5 turmas, Um Mês de Estudo 17/30 dias.
Números e nomes iguais aos da Biblioteca de conquistas (`09`). A grade de 12 ícones soltos sai (está completa na Biblioteca).

"Última atividade" fica no fim da coluna.

## 4. Aceite
- [ ] @apelido, Sobre, turma, guilda, e-mail e "na jornada desde" embaixo do nome.
- [ ] Conquistas como primeiro bloco da coluna principal, com recentes e "Quase lá".
