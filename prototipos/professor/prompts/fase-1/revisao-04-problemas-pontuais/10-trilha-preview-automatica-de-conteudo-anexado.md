Prompt de ajuste pontual — tela **Trilha**, problema: falta pré-visualização automática do conteúdo anexado.

## O problema

No editor de conteúdo, tanto para o formato **Link externo** quanto para **PDF**, o professor não tem uma pré-visualização de verdade — só texto e, no caso do PDF, um ícone de olho sem função clara de preview:

- **Link externo:** o campo "URL do link externo" mostra a URL crua e, hoje, aparece misturada com uma frase de descrição no mesmo campo (ex.: "https://phet.colorado.edu/pt_BR/simulations/free-fall — simulador interativo usado como material de apoio para este conteúdo."), tudo dentro de uma única caixa de texto rotulada só como "URL". Não existe nenhum preview visual do link, nem um botão claro para abrir a página em si.
- **PDF (ou outro arquivo):** aparece o nome do arquivo, o tamanho e um ícone de olho — sem nenhuma miniatura/preview do conteúdo do arquivo, e sem confirmação visual do que esse ícone faz.

## CORRIGIR

- **Campo "URL do link externo":** deve conter **só a URL**, nada mais. Se houver uma descrição do link, ela vai em um campo separado (ex.: um campo "Descrição do link", opcional) — não concatenada dentro do campo de URL.

## ADICIONAR

- **Pré-visualização automática do link:** ao preencher a URL, mostrar automaticamente um card de preview abaixo do campo — título da página, ícone/favicon do site de origem, e a descrição (se houver), como um card de link normal.
- **Botão "Abrir página externa"** dentro desse card de preview, que abre a URL em uma nova aba.
- **Pré-visualização automática do arquivo (PDF e afins):** mostrar uma miniatura da primeira página do arquivo junto do nome/tamanho, em vez de só o ícone de olho.
- **Botão "Abrir arquivo"** (ou o mesmo ícone de olho, mas com a ação clara de abrir o arquivo completo numa nova aba/visualizador), ao lado da miniatura.

## MANTER

- O nome do arquivo, o tamanho e o formato exibidos hoje.
- A estrutura de campos "Título do conteúdo" / "Formato" / conteúdo anexado, sem mudança de posição.
