# O que o TrailUp precisaria para falar LTI 1.3

> Documento de levantamento (#146). **Nada aqui está implementado.** O mínimo viável da #146 é o
> CSV: importar a turma (console → Turmas → Matrículas → "Importar lista") e exportar notas/XP
> (console → Notas → "Exportar notas e XP"). LTI vem depois, se a instituição do piloto pedir.

## Por que LTI

O'Donovan et al. (§5.4) montaram a gamificação **dentro do LMS** que a universidade já usava. LTI 1.3
(IMS Global / 1EdTech) é o padrão que Moodle, Canvas, Blackboard e Sakai usam para abrir uma
ferramenta externa por dentro do curso, já com o aluno identificado, e para devolver nota. Com ele
o professor não recadastraria a turma nem lançaria nota duas vezes.

## As três peças que importam

| Serviço LTI | O que resolve no TrailUp | Equivalente hoje |
|---|---|---|
| **Core (launch)** | Aluno clica no link do LMS e cai no TrailUp já autenticado na turma certa | login próprio + escolha de turma |
| **NRPS** (Names and Role Provisioning) | Lista de alunos e papéis do curso | importar a lista por CSV |
| **AGS** (Assignment and Grade Services) | TrailUp publica a nota no diário do LMS | exportar CSV e lançar à mão |

Deep Linking (o professor escolher, no LMS, qual tópico ou atividade vira um link) é opcional e
pode vir depois.

## O que teria de existir

**Do lado do LMS (cadastro, feito pela instituição):** registrar o TrailUp como ferramenta LTI 1.3
com a URL de login OIDC, a URL de launch, a URL do JWKS do TrailUp e os escopos de NRPS/AGS. Em
troca, a instituição informa `issuer`, `client_id`, `deployment_id` e as URLs de autorização, de
token e do JWKS dela.

**Do lado do TrailUp:**

1. **Três endpoints públicos**, fora da API de IA (regra de fronteira do CLAUDE.md: isto é
   encanamento, não modelo de linguagem). O lugar natural é uma Edge Function do Supabase, como
   `storage-redirect`:
   - `/lti/login` — início do login OIDC disparado pelo LMS (gera `state` e `nonce`, redireciona);
   - `/lti/launch` — recebe o `id_token` (JWT) assinado pelo LMS, valida assinatura pelo JWKS da
     plataforma, `iss`, `aud`, `exp`, `nonce` e `deployment_id`, e abre a sessão do aluno ou do
     professor;
   - `/.well-known/jwks.json` — a chave pública do TrailUp (o LMS usa para validar o token de
     serviço que pedimos para NRPS/AGS).
2. **Tabelas novas** (com RLS e política de retenção no mesmo commit, como manda o CLAUDE.md):
   - `lti_plataformas` — `issuer`, `client_id`, `deployment_id`, URLs; só `service_role` lê;
   - `lti_contextos` — curso do LMS ↔ `classe`; resource link ↔ tópico/atividade (se houver Deep
     Linking);
   - `lti_usuarios` — `sub` do LMS ↔ `alunos.id`/professor. O `sub` é estável por plataforma; o
     e-mail não é garantido (o LMS pode não mandar).
3. **Chave do TrailUp** (par RSA) guardada como segredo da função, com rotação. Nunca no repo.
4. **Mapeamento de conta:** primeiro launch de um `sub` desconhecido precisa ligar a uma conta
   existente (por e-mail confirmado) ou criar uma. Isto mexe no cadastro e no consentimento
   (menores, #195): o termo e o aceite do responsável continuam obrigatórios, LTI não dispensa.
5. **AGS:** publicar a nota usa os mesmos números do CSV — `professor_notas_da_turma`
   (`20261101_06`). Cada atividade vira um *line item*; o TrailUp pede um token de serviço
   (client credentials com JWT assinado pela chave do item 3) e faz `POST` do *score*.
6. **NRPS:** sincronizar a lista vira um `GET` no serviço de membros do curso, com o mesmo plano da
   importação por CSV (quem entra, quem já está, quem não tem conta).

## Riscos e decisões em aberto

- **Qual LMS o piloto usa.** Cada um tem detalhes (Moodle exige HTTPS público e cadastro manual
  por administrador; Canvas usa *developer keys*). Sem saber, a estimativa é genérica.
- **Identidade.** Se o LMS for a fonte de verdade do login, o fluxo de cadastro atual (quiz
  BrainHex, termo) precisa de um caminho para quem chega pelo launch.
- **Nota.** O TrailUp tem XP, nota média e pontos por atividade; o diário do LMS espera uma nota
  por *line item*. Decidir o que vai para lá é pedagógico, não técnico.
- **LGPD.** O launch traz dado pessoal do LMS (nome, e-mail, papéis). Precisa de base legal e
  entra na política de retenção.

## Tamanho

Ordem de grandeza, para um LMS conhecido: launch e sessão (1 semana), NRPS (2 a 3 dias), AGS
(3 a 5 dias), cadastro na instituição e testes ponta a ponta (variável, depende do suporte de TI
dela). Deep Linking, mais 1 semana.
