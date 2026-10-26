# Issue #1 — e-mail duplicado e material correspondente ao perfil

25/10/2026. Base: `2f721973` (PR #626 integrado pelo time).

## Evidência que orienta a mudança

A [OWASP, Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#authentication-and-error-messages)
recomenda respostas genéricas e alerta que mensagens, códigos HTTP e tempos
podem revelar a existência de uma conta. Aplicação nesta entrega: cadastro novo,
duplicado e sucesso ofuscado recebem a mesma orientação na interface. Isso
**não prova** uniformidade de HTTP/tempo no serviço Auth.

O [SDK oficial do Supabase, GoTrueClient.signUp](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/src/GoTrueClient.ts)
e a [documentação oficial de signup](https://supabase.com/docs/reference/python/auth-signup)
descrevem dois resultados possíveis para uma conta confirmada já existente:
objeto ofuscado quando ambas as confirmações estão habilitadas ou erro quando
uma está desabilitada. Logo, um retorno sem erro não comprova conta nova nem
entrega de e-mail. A configuração efetiva do ambiente precisa ser verificada
na etapa integrada; não foi alterada aqui.

A [pesquisa de Oliveira et al. (2022)](https://link.springer.com/article/10.1186/s40561-022-00194-x),
com 121 estudantes, não encontrou efeitos principais da personalização nos
desfechos examinados. Isso não demonstra ineficácia universal, mas impede usar
a seleção correta do arquivo como evidência de benefício pedagógico. A
[fundamentação da adaptação exploratória](issue-1-adaptacao-evidencias.md)
continua válida: não há recalibração do quiz nem nova alegação psicométrica.

## E-mail duplicado

O login do titular continua sendo tentado primeiro. Quando autentica, retoma a
conta existente sem chamar signup. Falha operacional de login não vira tentativa
de criação. Só credenciais inválidas permitem seguir para o signup após as
validações locais de criação.

Os formulários de aluno e professor passam a tratar signup novo, objeto ofuscado
e erro de duplicidade com a mesma tela e texto condicional. Não consultam a RPC
de existência de e-mail nem inspecionam `identities` para anunciar duplicidade.
A tela oferece login e recuperação de acesso e não afirma que um e-mail foi
enviado. Nenhum desses retornos sem sessão é autorização para gravar um perfil.
O cache local é apenas ajuda para a confirmação posterior, não prova de conta.

Aceite reconciliado com a decisão da #329:

> Dado um e-mail já cadastrado, o titular com credenciais válidas retoma sua
> conta existente sem criar outra. Sem autenticação válida, a interface não
> revela se o endereço existe; o resultado da solicitação de cadastro oferece
> orientação uniforme de confirmação, entrada e recuperação. A unicidade da
> conta é verificada no serviço de autenticação em ambiente integrado.

A redação anterior (“o sistema avisa que o e-mail já existe”) deve permanecer
registrada no histórico da issue como substituída, não ser declarada atendida
pela mensagem genérica. Uniformizar a UI não elimina diferenças de respostas
que o próprio serviço Auth possa expor. A contagem de contas e identidades no
Auth real continua sendo um aceite da próxima etapa.

## Perfil salvo até o material da trilha

O caminho existente é: `salvarCadastroAluno` → `concluir_cadastro_aluno` →
`alunos.perfil_ativo` + sete linhas de `aluno_perfil` → `Aluno.loadPerfis` /
`loadPerfilAtivo` → `perfilVisualDoAluno` → `TrilhaContext.activeProfileKey` →
`listarPersonalizacoesPersistidasPerfil`. A escolha salva vale enquanto estiver
entre os perfis representativos; a ausência de escolha elegível usa o dominante.
Esses critérios já existiam e não foram recalibrados nesta entrega.

A geração base já prevê os sete perfis por turma/tópico/conteúdo
(`personalizacao_jobs._build_targets`, `KINDS_BASE_POR_PERFIL`). A matrícula
agenda uma derivação para o dominante, enquanto a interface pode escolher outro
perfil representativo e ler sua base compartilhada. O teste local usa bases
sintéticas dos sete perfis; não comprova que o worker gerou todas em produção.

Defeitos reproduzidos antes da correção:

- Um material sem chave, metadado ou caminho identificável era convertido em
  **Mastermind**. Cards sem identificação também podiam ser anexados a esse
  perfil. Agora ficam sem classificação; identificações legadas explícitas
  continuam aceitas e a chave canônica prevalece.
- A leitura buscava uma janela fixa de `7 × limite` antes de filtrar. Versões
  ou alunos do mesmo perfil podiam ocupar a janela inteira e esconder o arquivo
  solicitado. Agora pagina com desempate por ID até encontrar o limite de
  registros do perfil ou esgotar os resultados. Erro na consulta não vira lista
  vazia. A leitura ainda está sujeita à RLS; não há novas permissões.
- Perfil solicitado desconhecido era aceito. Agora é rejeitado antes da busca.

A paginação pode fazer mais consultas em turmas com muitos registros legados.
Não é um snapshot transacional entre páginas: modificações concorrentes ainda
exigem validação no serviço real. Os cards são complementares e continuam com
seu limite de leitura; uma falha neles não esconde texto/áudio/slides existentes.

Sem turma, continua disponível a introdução comum e a orientação de matrícula.
A tela web atualiza as turmas após matrícula e aponta para o aplicativo sem
transportar tokens na URL. Não foi adicionada uma trilha curricular fictícia
nem foi anunciado material personalizado antes de estar disponível.

## Verificações executadas

| Verificação | Resultado |
| --- | --- |
| Frontend completo | 1.193 testes, 121 arquivos, aprovados |
| Mobile, grupo principal | 903 testes aprovados |
| Chromium | 14 jornadas aprovadas |
| PGlite + cliente de cadastro + consumidor mobile | 23 cenários aprovados (16 anteriores + sete perfis) |
| Lint e typecheck frontend/mobile; build frontend | Aprovados; 7 avisos frontend, 5 mobile e aviso de bundle preexistentes |

As regressões do provider falharam para os três defeitos antes das alterações;
os sete testes do arquivo passaram após a correção. A suíte principal mobile
inclui esse arquivo. O CI passa a disparar o teste cruzado também quando mudam
seus scripts, migrações ou dependências relevantes do mobile.

O teste cruzado `scripts/validar-cadastro-ate-material.mjs`, chamado pela suíte
de banco, executa o cliente real de cadastro e a RPC real no PGlite, lê o vetor
persistido pelo modelo `Aluno` e usa o resolvedor e o provider reais do mobile. Para cada um dos
sete perfis, salva uma escolha secundária elegível, verifica ausência de acesso
sem matrícula, recupera a URL correspondente após matrícula e testa retry sem
sobrescrever a escolha. Os valores dos sete perfis são fixtures de contrato,
não respostas de participantes nem evidência de calibração do questionário.

Limites: os clientes Supabase são substituídos por adaptadores locais. As tabelas
de materiais/matrículas e sua policy são fixtures explícitas, não toda a cadeia
RLS de produção. A renderização nativa não é executada
nesse teste cruzado. O Playwright usa Auth/PostgREST simulados. Não houve geração
LLM, envio real de e-mail, contagem de contas no Auth real ou implantação.
O CLI Docker existe neste ambiente, mas `docker info` não conecta ao daemon
local (socket ausente); não foi iniciado um stack Auth nesta rodada.

Reprodução:

```sh
npm --prefix frontend test
npm --prefix frontend run test:cadastro
npm --prefix frontend run test:cadastro-banco
npm --prefix frontend run lint
npm --prefix frontend run typecheck
npm --prefix frontend run build
npm --prefix mobile test
npm --prefix mobile run lint
npm --prefix mobile run typecheck
python3 scripts/verifica_encoding_docs.py
```

A issue só pode ser encerrada depois da revisão/integração desta entrega e da
validação integrada: unicidade no Auth, confirmação, matrícula, geração/entrega
do material, retomada, concorrência, CI aprovado e versão implantada registrada.
