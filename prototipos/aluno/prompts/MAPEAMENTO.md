# Inventário das rotas → telas → prompts

Levantamento a partir de `mobile/src/app/` (rotas do `expo-router`) e `docs/mobile/` (comportamento real), conforme pedido na issue #219. Diferente do console do professor, **não há prints** — a área do aluno ainda não tem nenhum protótipo, e cada `prompt.md` descreve os dados reais por escrito.

## Autenticação (`(auth)/`)

| Pasta em `telas/` | Rota(s) | O que é |
|---|---|---|
| `00-entrada/` | `(auth)/index.tsx` | Tela de entrada pública: hero + "Já tenho conta" / "Criar conta" (externo) |
| | `(auth)/tela.tsx` | Splash "Bem-vindo(a) de volta" (2s, redireciona pra login) — estado secundário da mesma tela, não uma tela separada |
| `01-login/` | `(auth)/login.tsx` | Login (e-mail/senha + Google) |
| `02-recuperar-senha/` | `(auth)/recuperarSenha.tsx` | Recuperação de senha |

Fora do escopo: cadastro completo + questionário BrainHex acontecem fora do app (`Linking.openURL` para o `frontend/`) — não prototipar aqui.

**Código morto, ignorar:** `mobile/src/app/services/tela_de_entrada/login.tsx` (tela de login alternativa, sem estilo, sem lógica real, não registrada em nenhuma navegação).

## Área autenticada — abas (`(tabs)/`)

| Pasta em `telas/` | Rota(s) | O que mostra |
|---|---|---|
| `03-trilha/` | `(tabs)/trilha/index.tsx` (via `src/screens/TrilhaScreen.tsx` → `TrilhaBase`) | Tela inicial: jornada de tópicos em 3 modos visuais (mapa/árvore/lista), barra de XP, botão da Bag, guia/mentor de IA |
| `04-topico/` | `(tabs)/trilha/[id].tsx` (via `src/components/DocumentBlock.tsx` e afins) | Consumo de conteúdo dentro de um tópico: markdown, áudio guiado, apresentação/deck, atividades (quiz/VF/lacuna/dissertativa), cards de revisão |
| `05-ranking/` | `(tabs)/ranking/index.tsx` | "Sala de honra" — lista de categorias de ranking da turma |
| | `(tabs)/ranking/[id].tsx` | Categoria aberta: pódio da turma + classificação completa + posição do aluno, filtros (Geral/Meu perfil/Outros perfis) |
| `06-social-guildas-loja/` | `(tabs)/social/index.tsx` | Amigos / Convites / Encontrar / Guildas / Bloqueados, busca, chat privado |
| | (modal, lançado daqui) `src/components/loja/StoreModal.tsx` | Loja — economia de moedas e itens |
| `07-notificacoes/` | `(tabs)/notificacoes/index.tsx` | Caixa de entrada: filtros Todas/Não lidas/Lidas, marcar como lida, excluir |
| | `(tabs)/notificacoes/[id].tsx` | Detalhe de uma notificação |
| `08-perfil-hub/` | `(tabs)/perfil/index.tsx` | Identidade do aluno (foto emoldurada, perfil BrainHex), atalhos (Configurações, Biblioteca de conquistas, Bag), prévia de conquistas |

## Perfil — sub-telas

| Pasta em `telas/` | Rota(s) | O que mostra |
|---|---|---|
| `09-biblioteca-conquistas/` | `(tabs)/perfil/biblioteca-conquistas.tsx` | Galeria completa de conquistas: filtros Concluídas/Em progresso/Bloqueadas, resumo, barra de progresso por marco |
| `10-relatorio-dados/` | `(tabs)/perfil/relatorio.tsx` | Relatório de transparência de dados do aluno (LGPD) + geração de PDF para compartilhar — **issue #28: falha em silêncio na web hoje** |
| `11-configuracoes/` | `(tabs)/perfil/settings.tsx` | Hub de configurações (busca + lista, agrupado em Privacidade/Tutorial/Segurança) |
| | `(tabs)/perfil/appearance.tsx` | Aparência (tema) |
| | `(tabs)/perfil/notifications.tsx` | Preferências de notificação |
| | `(tabs)/perfil/lembrete-diario.tsx` | Lembrete diário de estudo (horário, dias da semana) |
| | `(tabs)/perfil/coleta-dados.tsx` | Coleta e acessos: câmera, uso/navegação, desempenho acadêmico, chat com IA |
| | `(tabs)/perfil/metricas-estilo.tsx` | Preferência de estilo visual das métricas (automático ou fixo) |
| | `(tabs)/perfil/study.tsx` | "Estudos" — preferências de estudo, hoje maioria placeholder ("em breve") |
| | `(tabs)/perfil/info.tsx`, `info-app.tsx`, `info-versao.tsx` | Informações pessoais / do app / versão |
| | `(tabs)/perfil/resetar-senha.tsx` | Trocar senha (dentro do app, autenticado) |
| | `(tabs)/perfil/excluir.tsx` | Solicitar exclusão da conta |

## Fora do escopo desta rodada

`mobile/src/app/modal.tsx` — modal genérico de exemplo do template padrão do Expo Router, não usado pelo produto (verificar antes de descartar de vez, mas não prototipar).

## Como usar isso na prática

Ao colar o `prompt.md` de uma pasta em `telas/` na ferramenta de design, ele já inclui a descrição dos dados reais daquela tela (não há print pra anexar). Envie os prompts na mesma conversa, na ordem numérica — cada um assume que o anterior já rodou e manteve a linguagem visual consistente.
