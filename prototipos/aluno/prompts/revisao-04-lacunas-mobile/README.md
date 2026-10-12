# Revisão 04 — o que o app mobile tem e o web ainda não

Levantamento de 09/10/2026: rotas de `mobile/src/app/` e componentes de `mobile/src/components/` na `main`, comparados com `prototipos/aluno/v3/` (o resultado vai para `prototipos/aluno/v4/`). O pedido do Rafael foi seguir **em ordem numérica**, sempre com o prompt antes da tela.

| # | No app | Fonte | Prompt | Estado |
|---|---|---|---|---|
| 1 | Modo batalha / Boss do conteúdo + vitória | `ia/IABattlePanel.tsx`, `ia/BossVictoryModal.tsx`, `ia/IABattleHeaderChip.tsx`, `api/app/services/behavioral_personalization.py`, `docs/mobile/boss-visuals.md` | `telas/04-topico-batalha.md` | aplicado em `v4/04-topico.html` |
| 2 | Celebrações: conquista desbloqueada, desbloqueio de funcionalidade (Social, Ranking) | `ConquistaModal.tsx`, `DesbloqueioModal.tsx`, `utils/portoes.ts` | `telas/celebracoes.md` | aplicado: `assets/celebracoes.js` na Trilha (portões), Tópico e Perfil |
| 3 | Mentor dentro do tópico | `ia/IAMentorPanel.tsx` | `telas/04-topico-mentor.md` | aplicado: `assets/mentor.js` no Tópico |
| 4 | Bag de qualquer tela + "Adicionar à Bag" | `bag/BagModal.tsx`, `bag/BagEditorModal.tsx`, `docs/superpowers/specs/2026-09-13-bag-itens-pessoais-design.md` | [telas/bag.md](telas/bag.md) | aplicado (`v4/assets/bag.js`, todas as telas logadas) |
| 5 | Chat da guilda, chat privado, perfil público | `social/GuildChatModal.tsx`, `social/PrivateChatModal.tsx`, `social/SocialProfileModal.tsx` | [telas/06-social-chats.md](telas/06-social-chats.md) | aplicado (`v4/assets/social.js` no Social) |
| 6 | Subtelas das Configurações (informações pessoais, preferências de estudo, lembrete, aparência, estilo das métricas, notificações, resetar senha, excluir conta, info do app) | `app/(tabs)/perfil/*.tsx` | [telas/11-configuracoes-subtelas.md](telas/11-configuracoes-subtelas.md) | aplicado (`v4/11-configuracoes.html`) |
| 7 | Tutorial de primeiro acesso | `FirstAccessTour.tsx` | [telas/tutorial-primeiro-acesso.md](telas/tutorial-primeiro-acesso.md) | aplicado (`v4/assets/tour.js`) |
| 8 | Atividades de texto e vídeo | `TextoActivity.tsx`, `VideoActivity.tsx` | [telas/04-topico-atividades.md](telas/04-topico-atividades.md) | aplicado (partes 4 e 5 do `v4/04-topico.html`) |

Regras gerais: as da revisão 03 (`../revisao-03-loja/00-regras-gerais.md`) continuam valendo.
