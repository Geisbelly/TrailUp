Tela 04 — **Tópico**, com o **Modo batalha**. Arquivo: `v4/04-topico.html` (edite o atual). Conteúdo, áudio e atividade continuam.

## 1. O que o app faz (fonte)
- **Painel da batalha** (`mobile/src/components/ia/IABattlePanel.tsx`): ícone de espadas, título, botão **"Desativar"**, retrato do boss, **nome** e **arquétipo** do inimigo, **cronômetro** do encontro (ícone de ampulheta, `mm:ss`), barras **"Escudo"** e **"HP"** com "valor / máximo", e um texto de ajuda: **"Avance no tópico para reduzir a vida do inimigo."**; derrotado: **"Inimigo derrotado neste conteúdo."**, ícone de rei, barra de HP em verde.
- **Tipos de boss** (paleta própria, sem a cor do perfil): **Boss arcano** (`#a78bfa`, HP `#f97316`), **Boss mecânico** (`#38bdf8`, HP `#fb7185`), **Boss selvagem** (`#fb7185`, HP `#ef4444`), **Boss** genérico (`#f97316`).
- **Arte:** 31 bosses reais em `mobile/src/assets/bosses/boss-01..31.png`; o professor escolhe por conteúdo (`docs/mobile/boss-visuals.md`), "Automático" usa a da personalização. No protótipo: `boss-05`, `boss-12`, `boss-20` (reduzidos para 384px).
- **Vida e dano** (`api/app/services/behavioral_personalization.py`): a vida máxima é proporcional ao tópico; **concluir um conteúdo tira 16**, **concluir uma atividade tira 24** (acertar sozinho não tira, sequência não tira).
- **Quando existe:** só para quem tem **sinal de Survivor** no perfil; **desliga** se o aluno está **ansioso** ou **sobrecarregado** (e, para Survivor dominante, também cansado ou frustrado). Tópico sem conteúdo nem atividade não tem boss.
- **Vitória** (`BossVictoryModal.tsx`): **"Parabéns!"**, **"Você derrotou o boss!"**, botão **"Continuar jornada"**.

## 2. Na web
O Tópico era uma coluna de 760px no meio da tela. A batalha entra como **coluna lateral sticky** (360px) ao lado do conteúdo, para o aluno ver o efeito do que faz sem rolar:
```
[seletor flutuante]
┌ header do tópico (largura toda) ───────────────────────────────────────────────┐
┌ conteúdo + áudio + atividade (minmax(0,1fr)) ─┐ ┌ batalha (360, sticky top 24) ──┐
```
Painel (fundo com o degradê da paleta do boss, raio 18, borda da cor primária):
1. Topo: espadas + **"Modo batalha"** + botão fantasma **"Desativar"**.
2. Retrato do boss (160px, com brilho da cor primária) + nome em Cinzel ("Guardião das Equações") + chip do tipo ("Boss arcano") + cronômetro **"Encontro termina em 12:40"**, que corre.
3. Barras: **Escudo** e **HP** com "valor / máximo".
4. **Como causar dano** (lista curta): "Concluir um conteúdo · −16 HP", "Concluir uma atividade · −24 HP".
5. Texto de ajuda do app.

**Números do exemplo:** Equações do 1º grau tem 4 conteúdos e 3 atividades → **HP máximo 136** (4×16 + 3×24). A Amina já concluiu 2 conteúdos → HP **104 / 136**. Escudo **20 / 20** (proposta: o escudo absorve o primeiro dano; o app mostra a barra, mas o valor do escudo vem da IA).

**Interação no protótipo:**
- Responder a atividade certo e clicar em **"Concluir atividade"** tira 24 (primeiro do escudo, depois do HP), com um número "−24" flutuando sobre o boss.
- **"Marcar conteúdo como concluído"** (no fim do texto) tira 16.
- HP zerou → modal de **vitória**: retrato do boss apagado + "Parabéns!" / "Você derrotou o boss!" / "Continuar jornada" (→ Trilha).
- **"Desativar"** some com o painel e deixa um chip discreto "Modo batalha desligado · Ligar" no header.

## 3. Estados (seletor flutuante, novo nesta tela)
"Em batalha" · "Boss quase derrotado" (HP 8) · "Boss derrotado" (modal de vitória) · "Batalha desativada" · "Sem batalha (perfil sem sinal Survivor)" · "Batalha suspensa (ansiedade)"
- **Sem batalha:** a coluna lateral vira o resumo do tópico (progresso 3 de 5, conteúdos e atividades), sem boss.
- **Suspensa:** a coluna mostra "A batalha foi pausada para você estudar no seu ritmo." (regra do app: ansioso/sobrecarregado desliga o boss).

## 4. Não fazer
- Não pintar o boss com a cor do perfil (a paleta é do boss).
- Não deixar a batalha mudar nota, progresso ou ranking: é só visual, como no app.

## 5. Aceite
- [ ] Painel da batalha ao lado do conteúdo, com retrato, tipo, cronômetro, Escudo e HP.
- [ ] Concluir conteúdo e atividade causam 16 e 24 de dano; vitória com os textos do app.
- [ ] Desativar e os estados de "sem batalha" e "suspensa".
