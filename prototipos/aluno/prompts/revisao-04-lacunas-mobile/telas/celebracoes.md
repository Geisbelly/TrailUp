Item 2 — **Celebrações**: conquista desbloqueada e desbloqueio de funcionalidade. Arquivos: `v4/03-trilha.html`, `v4/04-topico.html`, `v4/08-perfil-hub.html` (o mesmo componente nos três).

## 1. O que o app faz (fonte)
### Conquista desbloqueada (`mobile/src/components/ConquistaModal.tsx`)
Modal sobre a tela, fundo escurecido, toque fora fecha. Recebe **título, descrição, data, categoria e a arte** da conquista; a cor dourada sai do accent do perfil clareado (`lighten(10)`), nunca misturado com branco. Botão **"Fechar"**. É usado no Perfil e na Biblioteca de conquistas.

### Desbloqueio de funcionalidade (`DesbloqueioModal.tsx` + `utils/portoes.ts`)
"A cerimônia de desbloqueio: o cadeado abre e a funcionalidade entra no lugar." Aparece **uma vez** por funcionalidade (chave por aluno + funcionalidade + versão), para o aluno entender que algo mudou **por causa do que ele fez**.

| Portão | Abre quando | Título | Promessa | Passos | Bloqueado: como abrir |
|---|---|---|---|---|---|
| Social | 1º conteúdo concluído | Amizades liberadas | Agora você pode se conectar com colegas da turma e acompanhar o avanço de quem você escolher. | Envie um convite para um colega da turma. · A amizade só existe quando os dois aceitam. · Você pode desfazer ou bloquear quando quiser. | Conclua seu primeiro conteúdo para liberar. |
| Ranking | 1º tópico concluído | Ranking liberado | Sua posição na turma já estava sendo contada desde o começo. Agora ela aparece — e você chega nela com os pontos que já fez. | A aba Ranking mostra as primeiras posições da turma. · Sua posição aparece sempre, mesmo fora do topo. · Estudar é o que move o ranking — presença e atividades contam. | Conclua o primeiro bloco de conteúdo para liberar. |

Animação: o cadeado entra (mola), abre, e o ícone da funcionalidade (`account-heart` / `podium`) toma o lugar, com um pulso. Bloqueado: cadeado fechado, título "{Título} indisponível", texto de como abrir e botão "Fechar". Portão aberto nunca volta a fechar. Quem já tinha tudo aberto vê as duas cerimônias, na ordem.

## 2. Na web
Um só componente, com duas variantes, sobre qualquer tela (fundo `rgba(0,0,0,.7)`, card 420px, raio 22, borda e brilho na cor do perfil; `Esc` e clique fora fecham; quem pede menos movimento vê sem animação).

- **Conquista:** faixa de raios atrás da arte (120px), chip da categoria, "CONQUISTA DESBLOQUEADA", título em Cinzel, descrição, "Conquistada em 14 de setembro", botão "Fechar".
- **Portão:** cadeado que abre e vira o ícone da funcionalidade; título, promessa, os 3 passos com marcador; botão "Entendi" (ou "Fechar" na variante bloqueada).

### Onde aparece no protótipo
- **Perfil:** clicar numa das 4 conquistas recentes abre o modal dela (no lugar de ir à Biblioteca).
- **Tópico:** novo estado "Conquista desbloqueada" (Fronteira Avançada, ao concluir a atividade).
- **Trilha:** três estados novos:
  - **"Aluno novo (Social e Ranking bloqueados)":** os dois itens da barra lateral ganham cadeado e ficam apagados; clicar abre a variante **bloqueada** do portão (não navega).
  - **"Cerimônia: Amizades liberadas"** e **"Cerimônia: Ranking liberado"**.

## 3. Aceite
- [ ] Modal de conquista com arte, categoria, título, descrição e data.
- [ ] Cerimônia dos portões com os textos de `portoes.ts`, animação do cadeado e variante bloqueada.
- [ ] Barra lateral com Social e Ranking travados no estado "aluno novo".
