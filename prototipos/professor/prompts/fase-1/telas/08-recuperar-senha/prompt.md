Próxima tela: **Recuperar senha** (na verdade são 2 telas curtas do mesmo fluxo — desenhe as duas juntas).

Mantenha a linguagem visual já estabelecida. **Não tenho print destas telas** — descrição integral abaixo, com base no código.

## Tela 1 — "Esqueci minha senha" (pedir o link)

Acessada pelo link na tela de Login.

1. Logo + título "Recuperar senha" + subtítulo "Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."
2. Campo de e-mail + botão "Enviar link de recuperação".
3. Link "Voltar para o login" (com seta), sempre visível.
4. **Estado depois de enviar:** substitui o formulário por uma confirmação — "Confira sua caixa de entrada", com o aviso "Se existir uma conta com esse e-mail, o link de recuperação chega em instantes. Ele vale por tempo limitado e só pode ser usado uma vez." (frase deliberadamente vaga sobre a conta existir ou não, por segurança) — e um botão "Enviar para outro e-mail" que volta ao formulário.

## Tela 2 — "Criar nova senha" (a que abre a partir do link do e-mail)

Tem 3 estados possíveis, mutuamente exclusivos:

1. **Validando** — só uma mensagem "Validando o link de recuperação..." enquanto confere o link.
2. **Link inválido/expirado** — alerta de erro explicando que o link não pôde ser validado (expirou ou já foi usado) + botão "Pedir um novo link" (volta para a Tela 1).
3. **Pronto** — formulário com "Nova senha" e "Confirmar nova senha" (ambos com mostrar/ocultar), regra de mínimo de caracteres visível no subtítulo, botão "Salvar nova senha".

Em todos os estados, link "Voltar para o login" no rodapé.

## O que peço

Desenhe as duas telas com todos os estados relevantes (formulário, confirmação de envio, validando, link inválido, formulário de nova senha). São telas transacionais e de baixa frequência — priorize deixar claríssimo em que passo do processo a pessoa está e o que fazer a seguir, principalmente no estado de erro (é o momento em que a pessoa está mais frustrada: um link que não funcionou).
