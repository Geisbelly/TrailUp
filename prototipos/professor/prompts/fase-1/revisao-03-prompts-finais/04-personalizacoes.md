Prompt final de ajuste — tela **Personalizações**.

## MANTER

- Cabeçalho + barra de filtros (Classe, Tópico, Conteúdo, Atualizar, "Gerar tudo para o perfil" + Gerar tudo) — mantenha essa barra e sua posição.
- As 4 abas: **Por perfil, Estrutura e paleta, Por aluno, Turma** — mantenha os 4 nomes e a ordem.
- Aba "Por perfil": os cards por perfil BrainHex (barra colorida no topo, nome do perfil, "N aluno(s) com este perfil", botão Gerar, lista de formatos com status) — mantenha essa base de card.
- O vocabulário de status: **pronto, gerando, parcial, falha, sem material** — não mude esses 5 termos.
- Aba "Turma": os cards de resumo (Alunos na turma, Perfil predominante, Média de acertos, Conclusão média, Nota média) e a seção "Distribuição de Perfis BrainHex" — mantenha.
- Aba "Por aluno": o seletor de aluno — mantenha.

## A CORREÇÃO ESTRUTURAL MAIS IMPORTANTE — um conteúdo gera várias gerações, uma por perfil

Hoje, ao clicar em "Gerar" num card de perfil (ex.: Explorador/Seeker), o resultado parece uma geração isolada e única. **Isso está errado.** Um conteúdo gera **um conjunto de materiais por perfil** — texto (markdown), áudio e apresentação (HTML), **um conjunto inteiro para cada um dos 7 perfis BrainHex**, não um material genérico único.

A aba "Por perfil" já está estruturalmente correta nisso (um card por perfil, cada um com seu próprio status e seus próprios formatos) — **o que falta é o próximo passo**, descrito abaixo.

## ADICIONAR — modal "Ver conteúdo gerado", com pré-visualização real

Ao clicar num card de perfil que já tem material (status "pronto" ou "parcial"), ou num formato específico dentro dele (Texto/Áudio/Apresentação), abrir um modal com:

1. **Cabeçalho:** nome do perfil + nome do conteúdo (ex.: "Mastermind · Cinemática"), com abas internas **Texto | Áudio | Apresentação**.
2. **O conteúdo de verdade, visível:**
   - Na aba Texto: o markdown renderizado (não só um título).
   - Na aba Áudio: um player de áudio funcional, tocando o áudio real gerado.
   - Na aba Apresentação: os slides de verdade (não só a lista de títulos "Problema de abertura", "A fórmula, deduzida"...) — cada slide deve ser visualizável (miniatura ou preview clicável), com o conteúdo textual/visual dele aparecendo, não só o nome.
3. **Campo de instrução livre**, presente nas 3 abas (não só na de Apresentação): "O que você quer mudar?" — texto livre onde o professor descreve o ajuste desejado antes de regenerar.
4. **Botão de regenerar**, contextual: em Texto/Áudio, regenera aquele formato inteiro; em Apresentação, oferece regenerar **um slide específico** (mantendo a ação "Regenerar apresentação inteira" também disponível, como já existe hoje) — a regeneração por slide isolado já existe, mantenha.
5. **Antes de confirmar a regeneração**, mostrar um resumo curto: o motivo (a instrução que o professor digitou, ou "falha na geração anterior" se for esse o caso) e o que será alterado — não deixar o botão "Regenerar" disparar direto sem esse passo intermediário de confirmação/explicação.

## REVISAR — aba "Estrutura e paleta"

Hoje esta aba mostra, por perfil: campos "Tom", "Estilo", "Nível", "Prioritário" (todos aparecendo vazios, "—", nos dados reais) e uma paleta de 5 cores (Fundo/Superfície/Primária/Borda/Texto). Isso não estava nos apontamentos originais e o valor disso para o professor não está claro — são campos técnicos de configuração de estilo, não de acompanhamento pedagógico.

**Decisão a tomar:** ou (a) dê propósito real a esta aba — explique o que "Tom", "Estilo", "Nível" e "Prioritário" significam para o professor e por que ele precisaria ver/mexer nisso, populando com dados reais; ou (b) **remova esta aba** se ela for só um artefato técnico sem uso prático, e redistribua qualquer informação útil dela (como a cor oficial de cada perfil) para dentro dos cards da aba "Por perfil", como um detalhe visual simples (ex.: a borda colorida do card já cumpre esse papel). Priorize clareza: informação sem função clara para quem usa a tela deve sair.

## OBSERVAÇÃO — não é sobre esta tela, mas afeta ela

O dropdown de "Classe" nesta tela mostrou "SPD - 3N 2026/2 (copia)" repetido 3 vezes na prática — isso é sintoma de um problema na função "Duplicar turma" (tela Classes), não desta tela. Sinalizando aqui porque é aqui que o efeito colateral apareceu: nomes de turma duplicados/repetidos num dropdown confundem qual delas o professor está selecionando. Vale investigar a causa na função de duplicar.
