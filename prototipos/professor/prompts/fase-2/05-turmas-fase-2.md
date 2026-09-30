# Prompt Fase 2 — Turmas

## Identificação
- Nome da tela: **Turmas** (item de sidebar), título interno "Turmas". Corresponde ao arquivo `Console Classes.dc.html` da V5 (lá chamada "Classes" — o nome mudou para "Turmas" na Fase 2, o conteúdo é o mesmo).
- Fonte de conteúdo: `Console Classes.dc.html` da V5, anexado a este prompt.

## Referências de estilo
Siga `01-contexto-geral-fase-2.md` e `02-paleta-de-cores-fase-2.md`. As prints mostram a grade de turmas — o modal de matrículas completo não tem print, mas existe no código da V5.

## Estados da tela
`com turmas` (padrão) / `nenhuma turma` / `criando ou editando turma` / `matrícula aberta` — os 4 existem no código e devem continuar existindo.

## Cabeçalho
Título "Turmas" + subtítulo "Crie turmas, matricule alunos e abra a trilha de cada uma." Botão principal "+ Nova turma" à direita.

## Notificações (toast, dispensáveis)
- Sucesso (verde): "Turma criada" — "{Nome} · {período} já aparece na lista. O próximo passo é matricular os alunos."
- Informativo (azul): "Turma duplicada como uma nova entidade" — "'{nome}' foi criada com a mesma trilha, sem alunos matriculados e sem histórico da turma original."

## Formulário Nova/Editar turma (inline, não é modal)
Cabeçalho com título dinâmico ("Nova turma" / "Editar turma") + X. Campos: Nome da turma, Período (só ao criar), Matéria. Nota: "Você pode matricular alunos agora ou depois, pelo botão 'Matrículas' no card da turma." Cancelar + "Salvar turma".

## Estado vazio
Ícone + "Nenhuma turma ainda" + texto explicando que a turma é o ponto de partida (trilha, matrículas, dashboard) + botão "Criar primeira turma".

## Grade de cards de turma
Cada card: ícone hexagonal com iniciais (com brilho/gradiente quando a turma é a mais ativa) + nome (elipse se longo) + "{período} · {matéria}" + pílula de status (**Ativa**=verde / **Rascunho**=amarelo). Linha de estatísticas: Alunos / Tópicos / Conclusão (número grande; "—" e cinza quando não aplicável). Rodapé: **"Matrículas"** (pílula com tom violeta) + **"Abrir trilha"** ou **"Montar trilha"** (quando a turma ainda não tem tópicos) + grupo de ícones **editar / duplicar / excluir**, sempre visíveis, nunca escondidos atrás de hover.

3 exemplos a usar como conteúdo de referência: Física I (Ativa, 34 alunos, 8 tópicos, 62%), Física II (Ativa, 28/6/41%), Laboratório de Física (Rascunho, 12 alunos, 0 tópicos, "—", CTA "Montar trilha"). Tile final tracejado "+ Nova turma" com legenda "nome, período e curso".

## Modal "Matrículas"
Cabeçalho: ícone hexagonal + rótulo "Matrículas" + título "{turma} · {período}" + X.
- **Adicionar aluno:** campo de busca (mostra contagem de resultados) + lista de resultados (avatar+nome+email·perfil+botão "Matricular"); um aluno já matriculado aparece como linha desabilitada, com nota "já matriculado nesta turma".
- **"Alunos matriculados"** + contador. Lista rolável: avatar+nome+perfil·data+link "Remover". **Remover abre confirmação inline**: "Remover {nome} da turma?" + aviso "Ele perde o acesso à trilha de {turma}. O histórico de notas fica guardado por 30 dias." + Cancelar/"Remover mesmo assim".
- Rodapé: nota "Alterações de matrícula são aplicadas na hora." + botão Fechar.

## Modal "Duplicar turma"
Título "Duplicar turma". "Duplicar '{nome}'?" + "Uma cópia será criada com a mesma trilha, sem alunos matriculados e sem histórico da turma original." Cancelar + Duplicar (principal). **Esta confirmação precisa aparecer antes de duplicar — a duplicação não deve acontecer direto ao clicar no ícone.**

## Modal "Excluir turma"
Cabeçalho com ícone de lixeira + "Excluir turma" + X. "Excluir '{nome}'?" + "Isso remove permanentemente a turma, sua trilha, as matrículas e o histórico de desempenho dos alunos nela. Esta ação não pode ser desfeita." Cancelar + "Excluir turma" (destrutivo).

## Assistente "Escriba"
Mesmo componente global, contextualizado: "lê os dados das suas turmas", sugestões "Qual turma precisa de atenção?" / "Quantos alunos ativos hoje?".

## O que NÃO fazer
Não esconda os ícones de editar/duplicar/excluir atrás de hover. Não remova a confirmação de duplicar nem a de excluir. Não simplifique o modal de matrículas (ele tem busca + lista de matriculados + fluxo de remoção com confirmação, são 3 partes distintas).
