Tela 10 — **Relatório dos seus dados** (transparência/LGPD + PDF). Arquivo de saída: `v2/10-relatorio-dados.html`.

Shell completo, item ativo **Perfil** (chega-se aqui por Configurações → Privacidade e termos → "Gerar relatório dos dados"). Perfil de exemplo: Conqueror. Tom: **prestação de contas**, sóbrio. Sem cenário, sem brilho, sem partículas.

## 1. Fonte da verdade
- `mobile/src/app/(tabs)/perfil/relatorio.tsx`: tela (resumo na tela) + HTML do PDF (`expo-print`) + compartilhamento (`expo-sharing`).
- **Issue #28:** na web, "gerar" hoje **falha em silêncio**. `Print.printToFileAsync` e `Sharing` não se comportam na web como no celular, e o `Alert.alert("Erro", "Não foi possível gerar o PDF.")` não aparece no navegador. **O estado de erro é o mais importante desta tela.** Na web, a ação final é **baixar** o PDF (ou abrir a caixa de impressão do navegador), não "compartilhar".

## 2. Dados de exemplo
Identificação: Lívia Moraes · livia.moraes@escola.com · **248** eventos registrados. Ranks atuais: Pontos da turma (#3, 1.240) · Tempo de estudo (#5, 11h 20min) · Progresso na trilha (#4, 56%). Progresso em trilhas: Matemática 56% · Ciências 12% · História 0%. Conquistas (6): Primeira conquista, Colecionador, Primeiros passos, Relâmpago, Sem errar, Explorador.

## 3. Grade (main de 1096px)
```
[seletor]
┌ cabeçalho: ← Configurações / eyebrow / H1 / subtítulo ─────────────────────────────┐
┌ prévia do relatório (7/12 = 631) ───────────┐ ┌ ação (5/12 = 445, sticky) ──────────┐
│ "Relatório Completo" · Identificação        │ │ O que entra no relatório            │
│ Ranks Atuais · Progresso em Trilhas          │ │ Gerar PDF (estado)                  │
│ Conquistas (6)                               │ │ Seus direitos (LGPD)                │
└─────────────────────────────────────────────┘ └──────────────────────────────────────┘
```

## 4. Blocos

### 4.1 Cabeçalho
"← Configurações" (fantasma pequeno) → `11-configuracoes.html#privacidade`. Eyebrow **"RELATÓRIO DE DADOS"**, H1 **"Relatório dos seus dados"**, subtítulo **"Esta página prepara uma visão consolidada da sua jornada usando os dados vinculados à sua conta."**

### 4.2 Prévia (coluna esquerda): o que o app mostra na tela, antes do PDF
Card `padding: 28px 30px`. Topo: título Cinzel 700 22 **"Relatório Completo"** (no app, na cor `gold`: aqui `accent`) e subtítulo **"Visão geral da sua jornada"**. Divisor ornamental. Quatro sub-blocos (fundo `surfaceElevated`, raio 16, `padding: 18px 20px`, gap 14), cada um com título Inter 700 15 `text`:
1. **"Identificação"**: pares rótulo/valor em grid de 2 colunas. Rótulo em caixa alta, micro `textMuted` (**"NOME"**, **"E-MAIL"**, **"TOTAL DE EVENTOS REGISTRADOS"**); valor em Inter 600 15 `text`.
2. **"Ranks Atuais"**: linhas com o nome do rank, "Posição: #3" (o "#3" em `text`) e o valor à direita. Vazio: **"Sem participação em ranks."**
3. **"Progresso em Trilhas"**: linhas com o nome da trilha e o percentual em `accent` (Inter 700), mais uma barra 6px. Vazio: "Nenhuma trilha iniciada".
4. **"Conquistas (6)"**: chips neutros com o título de cada uma, até 6; se houver mais, "+ 2 outras..." em `textMuted`. Vazio: "Nenhuma conquista ainda."

### 4.3 Coluna de ação (sticky `top: 108px`, gap 20)
**a) "O que entra no relatório"** (card): texto 14/1.6 `textMuted` **"O documento inclui identificação, quantidade de eventos registrados, posições nos rankings, progresso nas trilhas e conquistas disponíveis."** Lista com ícones 16 `accent` (gap 10, 13.5 `text`): Identificação · Histórico de eventos · Ranks e posições · Progresso nas trilhas · Conquistas.

**b) Card da ação** (`padding: 24px`, borda `1px solid border`): H2 **"Gerar e compartilhar o PDF"** (na web: subtítulo "Baixe o arquivo para guardar ou enviar."). Texto 13 `textSubtle`: **"Este botão monta o PDF completo no aparelho e abre as opções de compartilhamento. Gerar o arquivo não altera seus dados."** Botão primário largura 100%, altura 50: **"Gerar PDF completo"** (o app escreve em caixa alta; na web, caixa normal) com ícone de documento. Abaixo, o **estado da ação** (seção 5).

**c) Seus direitos** (card discreto, fundo transparente, borda `var(--line)`): texto 12.5 `textSubtle`: "Você pode revisar o que coletamos em Coleta e acessos e pedir a exclusão da conta a qualquer momento." e dois links fantasma: "Coleta e acessos" → `11-configuracoes.html#coleta` · "Solicitar exclusão da conta" → `11-configuracoes.html#excluir`.

## 5. Estados da ação (seletor: "Pronto" · "Gerando" · "Sucesso" · "Erro" · "Erro repetido" · "Carregando dados")
Os estados aparecem **dentro do card da ação**, abaixo do botão, num bloco de `padding: 16px`, raio 14, `margin-top: 16px`, com `aria-live="polite"` (erro: `role="alert"`).
- **Pronto:** nada abaixo do botão.
- **Gerando:** botão desabilitado com spinner e "Gerando PDF...". Bloco `surfaceElevated` com lista de 4 passos (bolinha 8 + texto 13): "Coletando identificação" ✓ · "Somando eventos" ✓ · "Montando rankings e trilhas" (spinner) · "Criando arquivo" (pendente, `textSubtle`). Não prometa tempo.
- **Sucesso:** bloco `success-bg` com borda `rgba(95,217,154,.35)`: ícone check-documento 22 `success`, título Inter 700 14 **"Relatório pronto"**, legenda 12.5 "relatorio-livia-moraes-2026-09-24.pdf · 84 KB" (tabular). Botões: primário **"Baixar PDF"** (ícone download) e secundário "Abrir para imprimir". Nota 12 `textSubtle`: "O arquivo fica só no seu computador."
- **Erro (estado que hoje não existe, issue #28):** o botão principal volta ao normal. Bloco no padrão de erro do mestre (fundo `danger-bg`, `1px solid danger-border`, ícone em círculo 40): título Inter 700 15 `text` **"Não foi possível gerar o relatório agora"**, corpo 13.5/1.6 `danger-body` "Nada foi alterado nos seus dados. Tente de novo; se o erro continuar, use a impressão do navegador." Ações: secundário **"Tentar novamente"** (ícone recarregar) e fantasma "Imprimir pelo navegador" (abre a janela de impressão com a prévia da §4.2). A mensagem do app é "Não foi possível gerar o PDF."; aqui ela fica como detalhe técnico recolhível ("Detalhes") em 12 `textSubtle`, sem stack.
- **Erro repetido** (segunda falha seguida): mesmo bloco, com mais uma linha "Já tentamos 2 vezes." e um link "Falar com o suporte" (`mailto:`).
- **Carregando dados** (prévia ainda sem dados): os 4 sub-blocos em esqueleto e o botão desabilitado com a legenda "Aguarde enquanto buscamos as informações." (texto do `LoadingState`).

## 6. O PDF em si (fora do escopo visual, só para referência)
O HTML do PDF já existe no app ("TRAILUP App • Relatório Acadêmico", "Relatório de Desempenho", Identificação, Histórico de Eventos, Ranks e Posições, Progresso nas Trilhas). **Não redesenhe o PDF** nesta rodada.

## 7. Não fazer
- Não usar linguagem de venda ("descubra", "incrível"). É prestação de contas.
- Não esconder o erro num toast que some: o erro fica visível até o aluno agir.
- Não chamar a ação de "compartilhar" na web se ela baixa.

## 8. Aceite
- [ ] Prévia com os 4 blocos e os textos do app.
- [ ] Os 6 estados da ação; o de erro com causa, garantia de que nada mudou, tentar novamente e alternativa.
- [ ] Links para coleta de dados e exclusão.
