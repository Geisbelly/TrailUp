Item 8: **atividades de texto e vídeo**. Arquivo: `v4/04-topico.html`. A batalha (item 1), o guia (item 3) e a Bag (item 4) continuam como estão.

## 1. O que o app faz
Fontes: `mobile/src/components/ActivityRenderer.tsx`, `TextoActivity.tsx`, `VideoActivity.tsx`, `VideoBlock.tsx` e `DocumentBlock.tsx`.

- O `ActivityRenderer` escolhe o componente pelo `tipo` da atividade:
  - `texto` → **TextoActivity**;
  - `video` → **VideoActivity**;
  - os demais tipos (quiz, dissertativa, múltipla escolha…) → **QuestionActivity**, que é a atividade que o Tópico já mostra.
- **TextoActivity** mostra:
  - o título (24px);
  - a descrição ou o conteúdo;
  - um cartão de **mídias anexas** (PDF, imagem, áudio, documento, apresentação), desenhado pelo `ContentRenderer`.
- **VideoActivity** mostra:
  - o **player** no topo (`VideoPlayer`, com o título da atividade ou "Vídeo");
  - o título (20px, negrito) e a descrição;
  - os anexos embaixo.
- **Leitor de documento** (`DocumentBlock`): rótulos "Leitura do PDF", "Modo página" / "Modo rolagem" e "Abrir arquivo". Erro: "Não foi possível abrir este arquivo para visualização nativa.".
- Concluir uma atividade dá **24 de dano** no boss, a mesma regra do item 1.

## 2. Na web
O Tópico tem 5 partes: 4 conteúdos e 3 atividades, que é o que já consta no painel. Hoje os 5 pontos do cabeçalho são só decoração.

- **Os pontos viram navegação.**
  - As partes 1 e 2 aparecem como concluídas.
  - A parte 3 é a atual: o conteúdo e a atividade de múltipla escolha que já existem.
  - A parte 4 é a **atividade de texto** e a parte 5, a **atividade de vídeo**.
  - O contador muda junto ("4 de 5"). Cada ponto tem rótulo acessível.
- **Atividade de texto (parte 4)**
  - Etiqueta "Atividade — leitura".
  - Título "Diário de campanha: a balança das equações".
  - Descrição: "Leia o relato do capitão e anote, no seu diário, os três movimentos que ele fez para descobrir quantos soldados havia em cada tropa."
  - Cartão de anexos com dois blocos:
    1. **PDF** "Diário de campanha.pdf" (4 páginas), com o leitor: barra "Leitura do PDF", alternância **Modo página / Modo rolagem**, a página 1 de 4 com setas e o botão "Abrir arquivo";
    2. **Imagem** "Balança em equilíbrio", com legenda.
  - Botão "Concluir atividade".
- **Atividade de vídeo (parte 5)**
  - Player 16:9 com o título "Isolando o x em 3 movimentos", capa da arte do perfil e botão de play central. Embaixo: tempo 0:00 / 3:12, barra, velocidade 1.0× e tela cheia.
  - Ao dar play, a barra avança (simulado); no fim aparece "Vídeo assistido".
  - Título da atividade e descrição: "Assista à Amina resolvendo 5x − 4 = 21 e pause em cada movimento para tentar antes dela."
  - Anexo: **Documento** "Roteiro do vídeo.docx" com "Abrir arquivo".
  - Botão "Concluir atividade".
- Cada atividade, ao ser concluída, causa **−24** no boss e o botão vira "Atividade concluída". As três atividades somam 72, e com os 4 conteúdos (64) dão o HP de 136 do boss.

## 3. Estados (no seletor que já existe)
Acrescentar:
- "Atividade de texto";
- "Atividade de vídeo";
- "Vídeo assistido";
- "Anexo com erro" (o PDF mostra o erro do app).

## 4. Aceite
- [ ] Os pontos do cabeçalho navegam entre as partes 3, 4 e 5, e o contador acompanha.
- [ ] Atividade de texto com título, descrição e anexos (leitor de PDF com os dois modos, e a imagem).
- [ ] Atividade de vídeo com player, descrição e anexo.
- [ ] Concluir cada atividade tira 24 de HP do boss.
