# Prompt — nova tela: História da turma

## Identificação
- Nome da tela: proposta como uma **seção dentro de "Turmas"** (ex. um botão "Editar história" no card da turma, ou uma aba dentro do formulário de editar turma) — não precisa ser um item de sidebar próprio, já que é uma propriedade de uma turma específica, não uma lista independente.
- Fonte de conteúdo: issue **#145** (História da turma escrita pelo professor), anexada a este prompt.

## Referências de estilo
Siga `../01-contexto-geral-fase-2.md` e `../02-paleta-de-cores-fase-2.md`.

## Por que esta tela existe
Hoje a camada narrativa do sistema existe só **por perfil BrainHex** (cada Guardião já tem tom de voz, guia, assinatura editorial). Não existe uma história **da turma** — um arco narrativo que o professor escreve e que entra na geração de conteúdo junto com o resto. A fonte é explícita: história desconectada do conteúdo não funciona (foi o elemento pior avaliado no estudo que embasa o projeto); a saída é o professor — que já escreve o conteúdo — também escrever o arco.

## Estrutura da tela

### Editor
- Campo de texto livre e generoso (textarea grande, não uma linha) — **"Arco narrativo desta turma"** — com um texto de apoio curto explicando o propósito (ex. "Esse texto entra como contexto na geração de material personalizado para os alunos desta turma. Escreva um tema ou fio condutor que conecte com o conteúdo que você está ensinando.").
- Placeholder de exemplo curto ajudando o professor a entender o formato esperado (ex. um tema/ambientação de uma frase ou parágrafo, não instruções técnicas).
- Estado vazio explícito: "Esta turma ainda não tem um arco narrativo. A personalização continua funcionando normalmente sem ele." — **é importante deixar claro que a história é opcional e nada quebra sem ela** (fonte: critério de aceite explícito).

### Aviso ao salvar uma mudança
Se a turma já tiver material personalizado gerado, mostrar um aviso antes de confirmar a alteração: "Alterar a história desta turma marca o material já gerado para os alunos para ser atualizado na próxima geração." — não prometa que a regeração é imediata; só que o professor está ciente de que o material antigo ficará desatualizado (fonte: a issue exige que o arco entre no `source_hash`, ou seja, editar dispara necessidade de regeração — a tela só precisa avisar disso, não implementar a lógica).

### Botão "Salvar"
Padrão já usado em outros formulários do console (botão principal violeta).

## O que NÃO fazer
Não trate este campo como obrigatório em nenhum fluxo de criação de turma — ele é sempre opcional. Não prometa geração automática/imediata ao salvar — só avise que o material existente ficará marcado como desatualizado.
