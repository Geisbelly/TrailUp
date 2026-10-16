# Revisão 03 — regras gerais (cole inteiro antes de qualquer tela)

Você está continuando o protótipo web da área do aluno do **TrailUp**. A pasta `v3/` começa como cópia exata de `v2/`. Tudo o que a revisão 02 decidiu continua valendo: shell (topbar 68px + sidebar 212px), cabeçalho de página (eyebrow · H1 Georgia 28 · subtítulo), seletor flutuante de pré-visualização de estado, conteúdo na largura toda (1164px úteis num quadro de 1440), coluna lateral como card sticky, nada de área vazia, nada de etiqueta de estado no topo.

Esta revisão acrescenta **uma coisa**: a **Loja**, como página própria.

## 1. Feedback

Print do Social com a coluna da direita e o card "Loja" marcados em vermelho:

> "tem que destacar a loja"

Decisão do time: a Loja vira um item da barra lateral, com página própria (`v3/12-loja.html`), e o card dela sai do Social.

## 2. Regras que valem em todas as telas desta revisão

### 2.1 Item "Loja" na barra lateral (todas as telas logadas)
A `.console-navigation` passa a ter **6 itens**, nesta ordem:

```
Trilha · Notificações (2) · Social · Loja · Ranking · Perfil
```

- **Posição:** logo depois de Social. A loja nasceu dentro do Social no app (`StoreLauncher` na aba Social) e continua perto dele.
- **Markup igual aos outros itens:** `<a href="12-loja.html">` + SVG de traço 18px, `stroke-width 2.2`, `currentColor` + texto "Loja". Na página da Loja, `aria-current="page"`.
- **Ícone:** fachada de loja em traço, no mesmo estilo dos outros (não use a arte colorida aqui; a sidebar inteira é de traço):
  ```html
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v8h14v-8"/><path d="M10 20v-5h4v5"/></svg>
  ```
- **À direita do texto, o saldo:** `38` em Inter 700 11.5 `textMuted` + a moeda (`assets/coin-<perfil>.png`, 16px). **Não** é uma pílula preenchida como o "2" de Notificações: aquele é contador de pendência e pede ação; saldo não pede. `aria-label="Loja, saldo de 38 moedas"`.
- Arquivos: `03-trilha`, `05-ranking`, `06-social`, `07-notificacoes`, `08-perfil-hub`, `09-biblioteca-conquistas`, `10-relatorio-dados`, `11-configuracoes` e a nova `12-loja`. As telas de antes do login (`00`, `01`, `02`) e o Tópico (`04`, tela de estudo em foco) não têm sidebar.

### 2.2 Saldo e dados compartilhados
Os números abaixo aparecem em mais de uma tela e precisam bater entre elas:

| Dado | Valor | Onde aparece |
|---|---|---|
| Saldo | **38 moedas** (era 240 no v2) | Sidebar e Loja |
| Turma | 6º ano B | Loja (limites), Perfil |
| Aluna logada | Amina T., Conqueror | todas |

### 2.3 Arte por perfil
Os ícones de recurso são `UtilityIcon` no app: uma arte **por perfil** em `mobile/src/assets/utility-profiles/<tipo>-<perfil>.png`. Copie para `v3/assets/` os tipos `store`, `coin`, `retry`, `hint` e `book` dos 7 perfis (`deadline` já está lá desde o Ranking). A arte segue o perfil **de quem está olhando**: com o seletor de perfil em Seeker, as moedas e os itens viram a versão Seeker.

### 2.4 O que a Loja não é
Herdado dos documentos de desenho; não contrarie:
- **Gasto nunca toca XP nem posição no rank.** Diga isso na página.
- **Nada de cosmético, segunda moeda, item que dá vantagem sobre colega, moeda por tempo de app.**
- **Uma seção só: Itens.** Sem Combos, Bônus, Presentes (o app tirou).
- **O saldo nunca é calculado no cliente**; no protótipo, só mostre o número que "veio do banco".

### 2.5 Barras de rolagem no tema (todas as telas)
Pedido da Geis (print do Ranking): a barra cinza do sistema destoa. Em todos os arquivos:
```css
*{scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent}
::-webkit-scrollbar{width:10px;height:10px}
::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:999px;border:3px solid transparent;background-clip:padding-box}
::-webkit-scrollbar-thumb:hover{background:var(--accent)}
```
A cor segue o perfil, porque `--border-strong` e `--accent` já mudam com o tema.

### 2.6 Topbar: avatar leva ao Perfil, "Sair" leva à Entrada (todas as telas logadas)
Só a Trilha fazia isso. Em todas: avatar + nome + perfil dentro de `<a href="08-perfil-hub.html" title="Meu perfil">`, e o botão "Sair" como `<a href="00-entrada.html">`.

## 3. Como entregar cada tela
- HTML completo, mesmo nome do arquivo, CSS e JS inline, como o v2.
- Manter todos os `href` existentes; acrescentar `12-loja.html` onde fizer sentido.
- Ao fim, uma lista curta: o que mudou, o que ficou igual de propósito e o que é proposta sua (não veio do app, do banco nem do feedback).
