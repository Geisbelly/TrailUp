Tela 07 — **Notificações**, ajuste. Arquivo: `v3/07-notificacoes.html` (edite o atual). Os 6 avisos, os filtros e a diferença lida × não lida continuam.

## 1. Feedback
Print do v2 com o canto superior direito ("5 dias seguidos · Marcar todas como lidas · recarregar") e o painel de detalhe da direita marcados em vermelho:

> "essa aba sempre aberta e essa hierarquia não ficaram legais. e a estrutura visual da notificação aberta também não"

Três problemas:
1. **Painel sempre aberto:** o detalhe ocupava a direita mesmo sem o aluno escolher nada.
2. **Hierarquia do topo:** chip de sequência, "Marcar todas" e recarregar soltos no canto, sem relação com a lista.
3. **Notificação aberta com cara de formulário:** seções com rótulo ("Título e estado", "Quando foi enviada", "Conteúdo do aviso", "Ações disponíveis").

## 2. O que muda

### 2.1 Sem painel: a notificação abre no próprio item
- A lista ocupa a largura toda. Não existe mais coluna de detalhe.
- **Nada aberto por padrão.** Clicar num item **expande no lugar** (como um e-mail); clicar de novo fecha. Abrir um item fecha o anterior. Âncora `#n-ID` continua abrindo direto.
- Abrir marca como lida (atualiza filtros e o número da sidebar), como no app.

### 2.2 Item aberto como mensagem, não formulário
Fundo `elev`, borda `borderStrong`, chevron virado para cima. Abaixo da linha do título (ícone · título · hora):
- o texto completo, 15/1.65 `text`;
- o botão primário de destino, quando existe ("Ver ranking →", "Abrir Equações do 1º grau →"…);
- pé discreto (`border-top line`, 12 `textSubtle`): "Enviada em 28/09/2026 às 21:14" à esquerda; à direita, links de texto **"Marcar como não lida"** e **"Excluir"** (lixeira, `danger`). Excluir mantém a confirmação.
Sem rótulos de seção, sem chip "Lida/Não lida" (o selo NOVA e o peso do título já dizem).

### 2.3 Hierarquia do topo
- **Sai** o bloco do canto direito: o chip "5 dias seguidos" (não é notificação; a sequência já aparece no Perfil) e o botão de recarregar (sem função no protótipo).
- **"Marcar todas como lidas"** desce para a **linha dos filtros**, alinhado à direita, com ícone de check: é uma ação sobre a lista, então fica junto dela.

### 2.4 Grupos por data
A lista ganha títulos de grupo (11.5, caixa alta, `textSubtle`): **Hoje · Esta semana · Anteriores**. É a hierarquia de uma caixa de entrada.

## 3. Estados
Os mesmos do v2. "Notificação removida" vira um aviso no topo da lista ("Notificação excluída."), já que não há mais painel.

## 4. Aceite
- [ ] Nenhuma notificação aberta ao entrar; abrir expande no lugar.
- [ ] Item aberto como mensagem (texto, botão, pé com data e ações), sem rótulos de seção.
- [ ] Sem ferramentas soltas no canto; "Marcar todas como lidas" na linha dos filtros.
- [ ] Grupos Hoje / Esta semana / Anteriores.
