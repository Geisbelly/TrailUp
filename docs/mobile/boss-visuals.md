# Visuais de boss por conteúdo

No console do professor, abra o editor de um conteúdo, escolha **Visual do boss deste conteúdo** e salve. O catálogo tem 31 opções e **Automático**, que mantém a aparência da personalização.

A seleção é armazenada em `conteudos.metadata.boss_visual` como `boss-01` a `boss-31`. `null` significa automático. Usa a autorização existente de `conteudos`, sem migração ou gravação em progresso/batalha.

No mobile, o cabeçalho e o painel da batalha resolvem o conteúdo pelo `itemKey` ou `enemy.contentId`, usando os metadados carregados na turma. A seleção substitui apenas a imagem; não ativa batalhas em perfis que não as possuem e não muda HP, dano, cronômetro ou progresso. A atualização fica disponível ao recarregar os dados da turma.

Originais: [Drive — Personagens/Bosses](https://drive.google.com/drive/folders/1Lhjq9DXpbJ1SCVUtrleL5ear7MwjYIjQ). Os 31 PNGs foram copiados sem transformação, na ordem dos nomes do Drive. IDs e arquivos espelhados em `frontend/public/bosses` e `mobile/src/assets/bosses`; o teste do catálogo verifica a igualdade dos arquivos. Os nomes descritivos do seletor são rótulos de interface, não nomes oficiais dos arquivos.

Validação: criar dois conteúdos com bosses diferentes; salvar e reabrir; conferir cada batalha no aluno; voltar a Automático; editar anexos e confirmar que o boss permanece selecionado.
