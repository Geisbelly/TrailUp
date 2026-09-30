# Prompt Fase 2 — Meus dados

## Identificação
- Nome da tela: **Meus dados** (item de sidebar), título interno "Meus Dados". Corresponde ao arquivo `Console Meus Dados.dc.html` da V5.
- Fonte de conteúdo: `Console Meus Dados.dc.html` da V5, anexado a este prompt.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`.

## Estados
`padrão` / `excluir conta` (modal aberto) — os 2 existem no código.

## Cabeçalho
Avatar hexagonal com iniciais + título "Meus dados" + subtítulo "{email} · professor desde {data}".

## Notificação
Toast de sucesso (dispensável): "Alterações salvas".

## Layout em 2 colunas

### Coluna esquerda (mais larga) — "Informações pessoais"
Subtítulo "Aparecem para os alunos junto do material da sua turma". Campos:
- **Nome completo** (editável).
- **E-mail** (somente leitura, com ícone de cadeado/envelope) + nota "O e-mail é a sua identificação de login e está vinculado à instituição, por isso não pode ser alterado aqui. Para trocar, fale com o suporte."
- **Instituição** e **Disciplina principal** (lado a lado).
- **Descrição/apresentação** (textarea) + contador de caracteres (ex. "148 / 400").
- **Bloco "Geração automática de personalização"** — um toggle (interruptor) com texto que muda conforme o estado: **ligado** = "Ligado: ao criar ou editar um tópico, a IA já gera o material dos 7 perfis. É o padrão recomendado."; **desligado** = "Desligado: criar ou editar tópicos não dispara geração nenhuma. Você aciona manualmente em Personalizações, pelo botão 'Gerar tudo'."
- Rodapé: "Última alteração em {data}" + botão principal "Salvar alterações".

### Coluna direita
**Card "Alterar senha":** ícone+título+subtítulo. Campos Senha atual, Nova senha (com indicador de força — barra de 4 segmentos, ex. 3 preenchidos e rótulo "forte"), Confirmar nova senha — todos com ícone de olho para mostrar/ocultar. Botão "Alterar senha" (tom violeta, não o principal cheio).

**Card "Sua conta em números":** 3 estatísticas (Turmas=3, Alunos=74, Tópicos=14) + nota "É o que seria removido com a conta."

### Zona de perigo (abaixo, largura total, borda esquerda vermelha)
Ícone de alerta + título "Zona de perigo" + texto explicando o que é excluído permanentemente (turmas, tópicos, material gerado por IA, histórico de alunos) + nota tranquilizadora "Se quiser apenas pausar o uso, basta não acessar — nada é apagado por inatividade." Botão "Excluir minha conta…" (contorno destrutivo).

## Modal "Excluir a sua conta"
Cabeçalho: ícone de alerta + título + X. "Isto remove permanentemente:" + lista com marcadores (3 turmas e 74 matrículas / 14 tópicos, atividades e questões / todo o material personalizado gerado pela IA). **Confirmação por digitação**: "Para confirmar, digite **EXCLUIR** no campo abaixo." + campo de texto + nota dinâmica de ajuda. Botões: "Manter minha conta" (contorno) + "Excluir conta permanentemente" (**desabilitado até a palavra ser digitada corretamente**, depois vira destrutivo).

## Assistente "Escriba"
Mesmo componente global, contextualizado: "lê os dados da sua conta", sugestões "Como está meu uso?" / "Alguma pendência?".

## O que NÃO fazer
Não deixe o botão de excluir conta habilitado antes de digitar "EXCLUIR". Não remova a lista do que será apagado nem a nota de que a inatividade sozinha não apaga a conta.
