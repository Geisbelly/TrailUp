PROMPT MESTRE DESTA RODADA — cole isto primeiro, **na mesma conversa** onde o protótipo do console já foi gerado (não numa conversa nova — a ferramenta precisa enxergar o que já existe para modificar, não recriar do zero).

---

Recebi apontamentos revisados sobre o protótipo do console que você já gerou. É uma rodada de **ajuste**, não de recriação — quero que você **modifique as telas existentes**, preservando o que já funciona e mudando só o que está listado abaixo. Vou mandar um apontamento por tela nas próximas mensagens, nesta mesma conversa.

## Correção de direção visual (isto substitui/refina o que foi combinado antes)

O protótipo atual está bonito, mas passou do ponto em alguns lugares. Ajuste:

- **Base escura em azul-marinho/preto** (mantém).
- **Roxo como principal cor de ação e seleção**, **lilás para destaque e hierarquia** (mantém — são os tokens de sempre).
- Texto claro e cinzas frios para informação secundária.
- Verde/amarelo/vermelho/azul **somente para estados** (sucesso/aviso/erro/info) — nunca como decoração.
- Bordas finas, cards escuros, **brilho roxo controlado** — não excessivo.
- Atmosfera **tech/geek com toque espacial sutil**: pontos, linhas, constelações discretas ao fundo. **Nada de "tema espacial" caricatural.**
- **Evitar: excesso de neon, gradientes chamativos, glassmorphism, cores aleatórias, aparência infantil.**

**Princípio central desta rodada:** a interface deve parecer uma **central de inteligência educacional**, não um dashboard SaaS genérico — mas também não pode virar decoração por cima da informação. Se ficar em dúvida entre "mais bonito" e "mais claro", escolha claro.

## Regras de UX que valem para o console inteiro (aplicar em toda tela, não só nas listadas)

1. **Informação não pode ser decoração.** Se um elemento representa um dado do sistema, ele precisa ter significado funcional — nada de indicador visual "bonito" sem dado real por trás.
2. **O sistema precisa responder.** Toda ação que demora (gerar, processar, salvar) precisa mostrar o estado disso — gerando, processando, salvando, erro. Nunca deixar a tela parecendo travada.
3. **Destruição exige confirmação.** Excluir turma, tópico ou conteúdo nunca pode acontecer sem uma confirmação explícita no meio do caminho.
4. **IA não pode ser caixa-preta.** Sempre que a IA gerar ou regenerar algo, mostrar o que foi gerado, por que foi gerado, e — quando fizer sentido — o que mudou em relação à versão anterior.
5. **A interface precisa respeitar a arquitetura real do sistema.** Não inventar relações entre dados que o sistema não tem (isto é crítico especialmente na Trilha — ver apontamento 06).

## Critério de aceite desta rodada (o que "pronto" significa)

- No Dashboard, dá pra ir de Turma → Aluno → Jornada → um nó específico → ver resposta, tempo, tentativa e contexto daquele momento.
- Na Trilha, dá pra ir de Tópico → Conteúdo → pedir a IA → Regenerar → ver o Resultado.
- A estética reforça a identidade do TrailUp, mas **nunca esconde a informação**.
- **Prioridade: compreensão primeiro, estética depois.**

---

Os próximos apontamentos (um por tela) seguem essa mesma lógica: o que manter, o que mudar. Não precisa reimportar nenhum print — a referência é o protótipo que já está na conversa.
