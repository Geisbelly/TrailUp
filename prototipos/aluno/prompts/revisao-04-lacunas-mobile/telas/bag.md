Item 4 — **Bag de qualquer tela + "Adicionar à Bag"**. Arquivos: todas as telas logadas da `v4/` (componente `assets/bag.js`) e `v4/04-topico.html` (botão "Adicionar à Bag").

## 1. O que o app faz (fonte)
`docs/superpowers/specs/2026-09-13-bag-itens-pessoais-design.md` e `mobile/src/components/bag/`:
- **Uma Bag só**, aberta de vários lugares (Trilha, Perfil). Eyebrow **"SEU INVENTÁRIO"**, título **"Bag"**, busca **"Buscar na Bag"**, botão **"Novo item"**.
- Abas: **Todos · Salvos · Gerados · Comprados**. Filtros por tipo: **Resumos · Anotações · Cards**.
- Card (`BagItemCard`): selo de origem **MEU ITEM** / **GERADO** / **LOJA**; selo de tipo **RESUMO** / **ANOTAÇÃO** / **CARD**; card tem **FRENTE** e **VERSO** e vira ("Toque para virar"); ações **Compartilhar · Editar · Excluir** só em item do próprio aluno (gerado é somente leitura).
- Itens da loja (`BagStoreItem`): **ITEM DA LOJA**, o nome do efeito (**PRAZO EXTRA**, **SEGUNDA CHANCE**, **DICA**, **TROCA DE FORMATO**) e o estado **DISPONÍVEL** / **CONSUMIDO**.
- Editor (`BagEditorModal`): **"Novo item"** / **"Editar item"**, **TIPO** (Resumo · Anotação · Card), **TÍTULO** ("Dê um nome para este item"), **CONTEÚDO** ("Escreva o resumo" / "Escreva sua anotação") ou **FRENTE** ("Pergunta ou conceito") e **VERSO** ("Resposta ou explicação"); **Cancelar · Salvar**. Criado de dentro de um conteúdo, o tópico e o conteúdo vêm preenchidos e ficam visíveis.
- Excluir: **"Excluir item"** · "Este item será removido da sua Bag." · **Cancelar · Excluir**.
- Vazios: "Sua Bag está vazia" / "Os itens salvos e comprados aparecerão aqui."; Gerados: "Nenhum material gerado" / "Os materiais personalizados aparecerão aqui."; Comprados: "Nenhuma compra encontrada" / "Os itens comprados na loja aparecerão aqui." Erro: "Não foi possível carregar a Bag." + "Tentar novamente".

## 2. Na web
- **Abre de qualquer tela logada** pelo botão da Bag na barra superior (hoje só funciona na Trilha), pelo "Abrir minha Bag" do Perfil e pelo "Abrir Bag" da Loja. Na Trilha, substitui a Bag própria dela (uma Bag só, como no app).
- Janela grande (960×640, raio 22): cabeçalho com o título, a busca e "Novo item"; abas em pílulas com contador; filtros de tipo; **grade de 3 colunas**.
- **Card** de virar: clique vira (frente → verso); selos de origem e tipo, tópico de origem, data; ações nos itens "MEU ITEM".
- **Tópico:** botão **"Adicionar à Bag"** ao lado de "Marcar conteúdo como concluído", que abre o editor com "Equações do 1º grau · Avançando sobre o desconhecido" preenchidos. Salvar coloca o item em "Salvos" com um aviso "Guardado na sua Bag".

### Dados de exemplo
| Origem | Tipo | Título | Conteúdo | Tópico |
|---|---|---|---|---|
| Meu item | Resumo | Isolar o x | O que faço de um lado, faço do outro. Primeiro tiro o número sozinho, depois divido. | Equações do 1º grau |
| Meu item | Anotação | Dúvida para a professora | Por que 1/2 + 1/3 não é 2/5? | Frações |
| Meu item | Card | Termo independente | Frente: O que é o termo independente? · Verso: O número que não acompanha a incógnita. | Expressões algébricas |
| Gerado | Card | 3x + 7 = 22 | Frente: Qual é o primeiro passo? · Verso: Tirar 7 dos dois lados. | Equações do 1º grau |
| Gerado | Resumo | Mapa mental de Equações | Equação, incógnita, operação inversa e verificação. | Equações do 1º grau |
| Loja | — | Trocar formato | DISPONÍVEL (comprado ontem) | — |
| Loja | — | Dica | CONSUMIDO (sexta passada) | — |

Os dois itens da loja batem com a Loja (`12-loja.html`): Trocar formato na Bag e a Dica já usada.

## 3. Estados
O componente aceita `Bag.abrir({estado})` com: normal, "vazia", "erro". No Tópico, o seletor ganha "Bag aberta" e "Editor: novo item".

## 4. Aceite
- [ ] O botão da Bag abre a mesma Bag em todas as telas logadas.
- [ ] Abas, filtros, busca, card que vira, itens da loja com estado.
- [ ] Editor com os três tipos; "Adicionar à Bag" no Tópico com contexto preenchido.
- [ ] Excluir com confirmação; vazios e erro com os textos do app.
