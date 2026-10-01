Próxima tela da mesma área: **Login**.

Mantenha a linguagem visual já estabelecida (ainda tema "mágica" roxo de marca — o aluno ainda não está autenticado, não há perfil BrainHex nesta tela).

## O que ela faz

Autenticação do aluno por e-mail/senha ou Google.

## Conteúdo real de hoje

1. Nome do app + "Acesse sua conta".
2. Campo de e-mail e campo de senha (com validação de formato de e-mail antes de habilitar o botão).
3. Botão principal "Entrar" — desabilitado (visualmente diferente, mais apagado) até e-mail válido e senha preenchida; mostra "Entrando..." enquanto autentica.
4. Botão secundário "Entrar com Google" (OAuth).
5. Link "Esqueceu a senha? Recuperar senha" — vai para a tela de Recuperar Senha (próximo prompt).
6. Rodapé: "Não tem uma conta? Cadastre-se." — mesmo link **externo** de cadastro da tela de Entrada (fora do escopo, não desenhar o que vem depois).

## Estados

- **Erro de credenciais/login:** um diálogo de erro aparece com título "Erro no login" e mensagem específica (ex.: credenciais inválidas). Desenhe esse diálogo de forma que não pareça culpa vaga do aluno — mensagem clara, ação de tentar de novo óbvia.
- **Carregando:** botão em estado "Entrando..." — sem bloquear o resto da tela.

## O que peço

Desenhe a tela de Login completa, incluindo o estado de erro (diálogo/toast de credenciais inválidas). É a porta de entrada de uso diário — priorize fricção mínima (poucos cliques, foco automático, mensagens de erro específicas) sobre densidade visual.
