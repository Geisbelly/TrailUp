# Visuais de boss por conteúdo

No console do professor, abra o editor de um conteúdo, escolha **Visual do boss deste conteúdo** e salve. O catálogo tem 31 opções e **Automático**, em que o boss segue a paleta do perfil BrainHex do aluno.

A seleção é armazenada em `conteudos.metadata.boss_visual` como `boss-01` a `boss-31`. `null` significa automático. Usa a autorização existente de `conteudos`, sem migração ou gravação em progresso/batalha.

No mobile, o cabeçalho, o painel da batalha e o card de vitória resolvem o conteúdo pelo `itemKey` ou `enemy.contentId`, usando os metadados carregados na turma. A escolha do professor aparece como ele a fez, mesmo fora da paleta do aluno. A seleção substitui apenas a imagem; não ativa batalhas em perfis que não as possuem e não muda HP, dano, cronômetro ou progresso. A atualização fica disponível ao recarregar os dados da turma.

Originais: [Drive — Personagens/Bosses](https://drive.google.com/drive/folders/1Lhjq9DXpbJ1SCVUtrleL5ear7MwjYIjQ). Os 31 PNGs foram copiados sem transformação, na ordem dos nomes do Drive. IDs e arquivos espelhados em `frontend/public/bosses` e `mobile/src/assets/bosses`; o teste do catálogo verifica a igualdade dos arquivos. Os nomes descritivos do seletor são rótulos de interface, não nomes oficiais dos arquivos.

Validação: criar dois conteúdos com bosses diferentes; salvar e reabrir; conferir cada batalha no aluno; voltar a Automático; editar anexos e confirmar que o boss permanece selecionado.

## Automático: boss na paleta do perfil

Sem escolha do professor, o boss sai de `BOSSES_DO_PERFIL` (`mobile/src/utils/contentBossVisual.ts`): para cada perfil, os bosses do catálogo cuja cor dominante é a da cor-assinatura oficial (`microservice/src/constants/brainHex.ts`). A escolha dentro da lista é estável por conteúdo (hash do `content:<id>`), então o mesmo confronto mostra sempre o mesmo boss e conteúdos diferentes variam.

Os PNGs não são recoloridos: são pintados à mão com vários matizes, e tingir no app (`tintColor` ou a matriz do `ProfileArtwork`) achataria a arte num tom só. O catálogo já traz famílias com a mesma forma em cores diferentes (01–06, 07–12, 13–20), e o perfil escolhe entre essas variantes. O Survivor (ardósia, quase sem saturação) não tem par nas famílias: usa o Lorde necromante (29), o único boss dessaturado, e os golems glaciais (23–27), de mesmo matiz frio. O teste `contentBossVisual.test.ts` decodifica cada PNG e confere o matiz dominante contra o da assinatura: trocar um asset ou uma cor oficial acusa o boss que deixou de combinar.

A imagem gerada pela IA (`enemy.avatarUrl`, Gemini ou placeholder) **não aparece** no chip, no painel nem no card de vitória: o prompt dela não conhece a cor do perfil e o fluxo ainda não foi validado. O painel também troca a paleta por arquétipo que a IA manda (`enemy.visual.palette`) pela do perfil (`paletaDoBossNoPerfil`): accent com luminosidade elevada até 4.5:1 sobre o fundo do painel, nunca misturado com branco, e escudo em cor fixa.

