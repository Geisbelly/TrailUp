# Parte 8 — Configurações e subtelas (celular)

Cole depois de `../00-regras-gerais.md`. Gera `mobile-v1/11-configuracoes.html`.

## De onde vem

- **v4:** `11-configuracoes.html`. Lista lateral com busca e grupos (Conta: Informações pessoais, Resetar senha · Privacidade e termos: Coleta e acessos, Gerar relatório dos dados, Política de privacidade, Solicitar exclusão da conta · Preferências: Lembrete diário, Aparência, Estilo das métricas · Tutorial e informações do app: Rever tutorial inicial, Informações do app · v1.0.4 · Sair deste aparelho) e, à direita, a subtela aberta com um cartão principal e caixas laterais de apoio.
- **App hoje:** `app/(tabs)/perfil/settings.tsx` e as subtelas em `app/(tabs)/perfil/*.tsx` — já são telas empilhadas no celular.

## O que fica igual ao v4 (não mude)

Os grupos, os rótulos, os textos de cada subtela, as caixas de apoio, as confirmações e os estados: Coleta e acessos, Informações pessoais, Informações: nome vazio, Resetar senha, Senha: e-mail enviado, Política de privacidade, Exclusão da conta, Exclusão: solicitação enviada, Lembrete diário, Lembrete desativado, Aparência, Estilo das métricas, Informações do app, Tutorial reiniciado.

## O que muda no celular

- **Duas telas, não duas colunas.** A lista é a tela de entrada (estado novo: **Lista**); tocar numa linha **empilha** a subtela, com voltar no topo. É como o app já faz.
- **Lista** no padrão de ajustes do celular: busca no topo, grupos com título em versal, linhas de 56px com ícone, rótulo e "›"; "Solicitar exclusão da conta" e "Sair deste aparelho" em vermelho; "Gerar relatório dos dados" leva ao Relatório (parte 7).
- **Subtela:** topo com voltar + eyebrow do grupo + título; a descrição; o cartão principal; e **as caixas de apoio do v4 vêm embaixo** do cartão.
- **Interruptores** de 52 × 32px, a linha inteira tocável.
- **Lembrete diário:** os horários como pílulas de 44px em duas linhas.
- **Estilo das métricas:** as 6 opções em lista de cartões de largura total.
- **Informações pessoais:** "Salvar alterações" fixo embaixo, acima da área segura; os campos em uma coluna.
- **Confirmações** (resetar senha) e avisos em folha de baixo e em aviso no rodapé, como nas outras partes. "Rever tutorial inicial" mostra o aviso com "Abrir agora".
- Mantém a barra de abas (Perfil ativo), como as outras telas da pilha do Perfil.
