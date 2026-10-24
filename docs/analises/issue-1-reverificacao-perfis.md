# Issue #1 — reverificação dos perfis

**24/10/2026 · Base:** `c128779ef6cc7f83def73736b849217a7923941e` (`main`, após o PR #614).

**Resultado: manter a [issue #1](https://github.com/BitStudioLabs/trail-up/issues/1) aberta.** Os sete perfis são alcançáveis e coerentes com seus eixos nos cenários extremos testados, mas há divergências entre dominante, percentuais, escolha no cadastro e consumo nas missões. A confiança também é afetada por empates tratados incorretamente.

Esta verificação complementa o [parecer e a pesquisa bibliográfica](./issue-1-cadastro-brainhex.md). O PR #614 incorporou a pesquisa; não corrigiu o algoritmo. A mudança de consentimento/data de nascimento, #613, também presente nesta base, acrescentou etapas ao cadastro sem alterar o cálculo auditado. A issue permanece aberta com seus três critérios originais.

## Execução e alcance

- **131 testes existentes aprovados**, em 12 arquivos de cadastro, BrainHex, senha e nascimento.
- **Typecheck do frontend aprovado** (`tsconfig.app.json` e `tsconfig.node.json`).
- **20 critérios adicionais de auditoria: 12 aprovados integralmente e 8 com falhas.** São 76.024 verificações dentro dos cenários abaixo, com 5.154 falhas; várias verificações exercitam o mesmo defeito. Não são 76.024 testes independentes nem 5.154 bugs distintos.
- **Sete questionários extremos × 5.040 ordenações**: 35.280 combinações. Para cada perfil, os três itens diretos do eixo correspondente recebem 5 e o reverso recebe 0; nos demais eixos, diretos recebem 0 e reverso recebe 5. Cada dominante esperado foi fixado explicitamente, sem derivá-lo do algoritmo examinado.
- **Escala constante × 5.040 ordenações**: todos os eixos têm preferência corrigida máxima (diretos 5, reversos 0).
- **5.000 questionários sintéticos**, respostas inteiras de 0 a 5, ordenações válidas e semente fixa `20261024`. São casos para encontrar contraexemplos, não amostra de alunos nem estimativa de prevalência.
- Verificação local da integração entre `computarPerfil`, `resolveRepresentativeBrainHexResults`, `montarMedidaDoPerfil` e **a função real** `perfilDaMissao` do mobile. Nenhuma destas chamadas acessa serviços externos.

O [script de aceitação](../../scripts/testar-perfis-issue-1.mjs) importa o código TypeScript real por Vite. O [JSON de evidências](./evidencias/issue-1-testes-perfis.json) registra revisão, instrumento, semente, contagens e até dois contraexemplos por critério. O processo retorna **1 quando há falhas**, sem `.fails`, testes ignorados ou expectativas invertidas. Ele é executado explicitamente, separado da suíte Vitest cotidiana, pois acompanha defeitos abertos nesta auditoria.

## O que passou

| Perfil esperado | Dominante observado, com o perfil em primeiro na ordenação | Percentual nesse cenário | Ordenações mantendo o dominante |
| --- | --- | --- | --- |
| Seeker | Seeker | 94% | 5.040/5.040 |
| Survivor | Survivor | 94% | 5.040/5.040 |
| Daredevil | Daredevil | 94% | 5.040/5.040 |
| Mastermind | Mastermind | 94% | 5.040/5.040 |
| Conqueror | Conqueror | 94% | 5.040/5.040 |
| Socializer | Socializer | 94% | 5.040/5.040 |
| Achiever | Achiever | 94% | 5.040/5.040 |

Os 94% são resultado da transformação e do piso de 1% dos outros seis perfis; **não significam 94% de certeza**. A resistência a todas as ordenações descreve o comportamento atual dos cenários extremos, não valida os pesos de combinação.

Também passaram: polaridade dos itens diretos/reversos; crescimento da afinidade bruta ao aumentar o eixo principal; dominante vindo da ordenação quando a escala não diferencia; rejeição de ordenação incompleta, repetida ou desconhecida; detecção de resposta ausente; soma dos sete percentuais igual a 100; números finitos; preservação do vetor e da ordenação na serialização da medida. O teste de serialização não executa INSERT nem valida RLS.

## Defeitos reproduzidos

### R01 — o dominante pode ter percentual menor que outro perfil

**12/5.000 questionários** violaram `percentual[dominante] === max(percentuais)`. Dois deles também apresentaram inversão estrita entre escores brutos e percentuais, descontada tolerância numérica de `1e-10`.

No caso **843** do JSON, Seeker tem afinidade bruta `2,285300207` e Socializer `2,254865424`. O resultado declara **Seeker** dominante, mas mostra **Seeker 31% e Socializer 32%**. O piso percentual retira unidades do maior componente após o arredondamento e pode inverter dois líderes próximos.

Há ainda um segundo mecanismo: no caso **131**, Seeker e Mastermind empatam no escore bruto. `perfilDominante` desempata pelo nome e escolhe Mastermind; a distribuição do resto desempata pela posição no objeto e entrega Seeker 28%, Mastermind 27%.

**Origem:** [`priorDoPerfil.ts`](../../frontend/src/features/signup/priorDoPerfil.ts), funções `perfilDominante`, `afinidadeEmPercentual` e `computarPerfil`.

**Aceite da correção:** usar uma política comum de ordenação/desempate e uma quantização que preserve ordem, soma 100 e piso, incluindo líderes próximos. Uma transformação corrigida precisa passar pelos contraexemplos, não apenas pelo cenário de um líder muito distante.

### R02 — uma escolha oferecida no cadastro pode ser descartada nas missões

**91/10.587 escolhas oferecidas** nos sete extremos e nos 5.000 questionários não foram preservadas por `perfilDaMissao`.

Exemplo mínimo: o cenário Seeker oferece **Seeker e Mastermind** no cadastro. Os percentuais são Seeker 94% e cada outro perfil 1%. Se o aluno escolhe Mastermind, a função das missões devolve **Seeker**. No cenário Survivor, escolher o Daredevil oferecido também é descartado.

O cadastro recorta os dois primeiros por afinidade **bruta**. O mobile usa afinidade **inteira persistida** e nome em caso de empate. Na primeira situação, os representativos das missões passam a ser Seeker e Achiever; Mastermind deixa de ser elegível. É um teste executável da fronteira entre funções reais, não uma observação de troca de perfil em uma conta de produção.

**Origem:** [`AlunoSignupWizard.tsx`](../../frontend/src/components/auth/AlunoSignupWizard.tsx), [`brainhex.ts`](../../frontend/src/features/signup/brainhex.ts) e [`missaoModel.ts`](../../mobile/src/services/missoes/missaoModel.ts). A função do mobile documenta a mesma regra do SQL; o SQL não foi executado nesta auditoria.

**Aceite da correção:** toda escolha oferecida precisa continuar válida no consumo após a persistência, incluindo empate no segundo lugar. Alinhar frontend, mobile e banco quanto a unidade e desempate; conferir isso também em integração com banco isolado.

### R03 — empates inventam concordância e alteram a confiança

Uma escala constante não permite estimar correlação de Spearman: os postos da escala não variam. Hoje a função retorna **+1** quando o ranking segue a ordem interna do código e **−1** quando a inverte. Entre as 5.040 ordenações da mesma escala constante, a confiança varia de **0,60 a 1,00**; 5.039 diferem da referência.

No teste com empate parcial, o resultado esperado por correlação de Pearson dos **postos médios** é `27,5 / sqrt(27,5 × 28) = 0,9910312089651149`; o código retorna `1`. Ordenar arbitrariamente valores iguais não elimina o empate estatístico. Os dois controles sem empates retornam +1 e −1 corretamente.

**Origem:** [`brainhexOrdenacao.ts`](../../frontend/src/features/signup/brainhexOrdenacao.ts), `concordanciaEntreMetodos` e `combinarPrior`.

**Aceite da correção:** postos médios para empates, estado explícito de concordância não estimável para variância zero e tratamento documentado desse estado na confiança/UI/persistência. Corrigir a matemática não calibra a confiança como probabilidade de acerto.

### R04 — questionário “completo” aceita números inválidos

Substituir apenas `c1` por `NaN`, `Infinity`, `-Infinity`, `-1`, `6`, `99` ou `2.5`, mantendo as outras 31 respostas válidas, continua retornando `true` em `isAllAnswered`: **7/7 entradas inválidas aceitas**. Os botões da UI restringem a entrada; isso não substitui a validação da fronteira de finalização. Não foi demonstrado um ataque pela interface.

**Origem:** [`brainhex.ts`](../../frontend/src/features/signup/brainhex.ts), `isAllAnswered`.

**Aceite da correção:** na finalização, exigir cada item finito, inteiro e dentro de 0–5. Preservar separadamente o uso de cálculo parcial pelo wizard, que hoje calcula a prévia antes de todas as respostas.

### R05 — atualização sem evidência altera confiança 1

Com observações vazias e confiança inicial `1`, `atualizarPerfil` devolve `0,999`. Os controles `0`, `0,15`, `0,5` e `0,999` preservam o valor dentro da tolerância. O limite de precisão contradiz a promessa de preservar o prior sem evidência.

**Origem:** [`atualizacaoDoPerfil.ts`](../../frontend/src/features/signup/atualizacaoDoPerfil.ts). A auditoria anterior não encontrou essa função conectada ao ciclo operacional; a falha é da função local, não prova de alteração de perfil em produção.

**Aceite da correção:** manter estado sem observações e definir o contrato do extremo de confiança, sem apresentar a transformação em precisão como validação empírica.

## Pendências da story e limites

A inspeção da versão atual confirma que `EmailConfirm` ainda depende do marcador em `localStorage`, grava afinidades/perfil ativo/medida em operações separadas, tolera falha na medida e termina em `/login`. Isso não demonstra o aceite de disponibilizar a trilha ao concluir. O critério de aviso explícito de e-mail existente continua conflitante com a decisão de mensagem genérica descrita no parecer anterior; precisa ser ajustado e testado quanto à unicidade.

Não foram executados confirmação de e-mail, retomada em outro dispositivo, persistência real, RLS, unicidade ou navegação até a trilha. O ambiente Python existente não tem `pytest` (`No module named pytest`), portanto os testes da migration de cadastro não chegaram a executar. Não há resultado de integração aprovado para o banco. O utilitário `graphify` também não está instalado; a navegação foi feita diretamente pelo código.

A soma de quatro itens por eixo, em vez da média declarada no pipeline, permanece como achado do parecer anterior. Nesta suíte, o teste de polaridade confirma a soma atual, **sem aprovar sua escala relativa à ordenação**. Trocar soma por média muda resultados e requer uma decisão metodológica explícita, versionamento e análise de sensibilidade.

Os estudos discutidos no parecer continuam sendo a base para tratar o instrumento como adaptação exploratória. Testes determinísticos podem comprovar invariantes de software e encontrar contradições; não determinam o perfil psicológico real de um estudante nem validam eficácia pedagógica. Não houve nova coleta com participantes nesta etapa.

## Reprodução

Com as dependências do frontend instaladas, na raiz do repositório:

```sh
npm --prefix frontend test -- src/features/signup src/lib/cadastroEmUmaEtapa.test.ts src/features/auth/passwordPolicy.test.ts src/lib/dataNascimento.test.ts
npm --prefix frontend run typecheck
node scripts/testar-perfis-issue-1.mjs
```

Para salvar nova evidência: `node scripts/testar-perfis-issue-1.mjs > /tmp/issue-1-testes-perfis.json`. O exit code **1 é reprovação dos critérios**, mesmo com JSON completo. A revisão registrada acompanha o HEAD da execução; a evidência versionada corresponde à base auditada acima. Os critérios devem ser reexecutados após as correções, além de um teste E2E de cadastro até a trilha em ambiente isolado. Esta entrega acrescenta testes e evidências; **não altera o algoritmo nem encerra a issue**.
