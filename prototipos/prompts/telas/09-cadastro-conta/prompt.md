Próxima tela: **Criar conta** — cadastro de aluno e de professor. São duas telas quase idênticas (mesmo fluxo, textos e destino final diferentes) — desenhe as duas juntas, como uma família.

Mantenha a linguagem visual já estabelecida.

**Sobre os prints anexados:** mostram só o primeiro passo (pedir o e-mail) de cada uma — é referência de funcionamento, não o visual a replicar. Os demais passos não têm print; estão descritos por escrito abaixo.

## Importante entender antes de desenhar

Esta tela **só cria a conta** (e-mail + senha). Ela **não é** onde o aluno faz o questionário BrainHex nem onde o professor preenche instituição/disciplina — isso acontece depois, numa tela separada ("Finalizar cadastro", prompt 10), depois de confirmar o e-mail. Não misture os dois fluxos no design desta tela.

## O que ela faz (fluxo idêntico nas duas versões — aluno e professor)

Um mini-wizard de 4 estados possíveis, na mesma tela (a tela muda de conteúdo, não navega):

1. **E-mail** — só um campo de e-mail + botão "Continuar". Ao confirmar, o sistema checa se esse e-mail já existe.
2. **Conta já existe** — mostra um aviso explicando isso + campo de senha + botão "Entrar e continuar" (a pessoa está, na prática, fazendo login em vez de se cadastrar de novo).
3. **E-mail disponível (conta nova)** — campo de senha, campo de confirmar senha (mínimo 6 caracteres), checkbox obrigatório "Li e aceito os termos de uso e a política de privacidade", botão "Criar conta e enviar confirmação".
4. **Confirmação enviada** — tela de sucesso intermediária: ícone, mensagem "Enviamos um link de confirmação para [e-mail]...", botão "Ir para confirmação".

Há ainda dois estados de borda que podem ser variações simples do estado 4: "aguardando confirmação de e-mail de uma conta já existente" (com botão de reenviar) e "você já tem uma conta completa" (para o aluno, mostra botões de baixar o app; para o professor, botão de ir pro login).

## Diferenças entre as duas versões

- **Aluno:** título "Cadastro de Aluno", ícone padrão da marca. Estado final "já tem conta" oferece baixar o app (APK / Play Store) — faz sentido, é o aluno que usa o app mobile, não este site.
- **Professor:** título "Cadastro de Professor", ícone da marca com um pequeno emblema de "escola" sobreposto (para diferenciar rapidamente das telas do aluno). Estado final "já tem conta" oferece ir para o login (é o professor que usa este site).

## O que peço

Desenhe o fluxo completo (os 4 estados principais) uma vez, como um componente reutilizável entre aluno e professor, e mostre as duas variações finais (emblema/ícone e texto do estado "já tem conta"). Um card único, central, sem distrações — é uma tela transacional curta, o objetivo é sair dela o mais rápido possível.
