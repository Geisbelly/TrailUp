# Social completo com amizades — Design

- Data: 2026-09-12
- Status: proposta para revisão
- Escopo: aba Social, convites, aceite, recusa, desfazer amizade e bloqueio

## Objetivo

Fazer o Social aparecer de verdade no mobile, cumprindo o contrato já anunciado pelo portão da plataforma:

- enviar convite para colega da turma;
- aceitar ou recusar convite;
- desfazer amizade;
- bloquear e desbloquear usuário;
- abrir a loja contextual pelo ícone personalizado do perfil.

O banco é a fonte única de verdade. O cliente não decide transições de estado nem pode criar relacionamento em nome de outro aluno.

## Experiência mobile

A nova rota `mobile/src/app/(tabs)/social/index.tsx` será uma aba principal chamada “Social”, exibida quando `aberturas.social` estiver habilitado. A aba terá:

1. Cabeçalho com título, perfil ativo e `StoreLauncher`.
2. Segmento “Amigos”, com lista de amizades aceitas.
3. Segmento “Convites”, com convites recebidos e enviados.
4. Segmento “Encontrar colegas”, com colegas da turma que ainda não estão bloqueados ou conectados.

Cada colega exibe nome, avatar, perfil ativo e ação contextual. A tela não mostra eventos privados, métricas detalhadas ou telemetria de outros alunos.

Estados da tela:

- carregando;
- lista de amigos;
- nenhum amigo;
- convites recebidos;
- nenhum convite;
- busca sem resultado;
- erro com retry;
- ação em andamento;
- usuário bloqueado.

A loja continua sendo um modal e não muda a rota. Ao fechar o modal, o estado e o scroll do Social permanecem.

## Modelo de dados

### `social_relacionamentos`

Uma linha representa o relacionamento entre dois alunos. O par é sempre armazenado em ordem lexicográfica para garantir uma única linha por dupla.

Campos:

- `id uuid primary key`;
- `aluno_a_id uuid not null`;
- `aluno_b_id uuid not null`;
- `solicitante_id uuid not null`;
- `status text not null`, limitado a `pending`, `accepted`, `declined`, `blocked`;
- `blocked_by_id uuid null`;
- `created_at timestamptz not null`;
- `updated_at timestamptz not null`;
- `responded_at timestamptz null`.

Restrições:

- `aluno_a_id <> aluno_b_id`;
- `solicitante_id IN (aluno_a_id, aluno_b_id)`;
- `blocked_by_id IS NULL OR blocked_by_id IN (aluno_a_id, aluno_b_id)`;
- unique `(aluno_a_id, aluno_b_id)`;
- `status = 'blocked'` exige `blocked_by_id`;
- `status <> 'blocked'` exige `blocked_by_id IS NULL`.

### Leitura pública controlada

A view/RPC de leitura nunca devolve a linha bruta do relacionamento. Ela retorna um DTO seguro:

```ts
type SocialPerson = {
  alunoId: string;
  nome: string;
  apelido: string | null;
  fotoUrl: string | null;
  perfilAtivo: string | null;
  status: "friend" | "incoming" | "outgoing" | "blocked";
  relationshipId: string;
};
```

Nome, apelido, avatar e perfil ativo seguem a mesma política de leitura já usada pelo ranking para colegas da turma. Nenhum campo de email ou telemetria é exposto.

## Regras de negócio no banco

As ações serão funções `SECURITY DEFINER`, com `search_path = public, pg_temp` e validação de `auth.uid()`.

### Enviar convite

`social_enviar_convite(p_destinatario uuid)`:

- rejeita usuário inexistente, auto-convite ou aluno fora da mesma turma;
- rejeita se houver bloqueio por qualquer lado;
- se já houver amizade, retorna `already_friends`;
- se já houver convite enviado, retorna `already_pending`;
- se existir convite recebido, converte diretamente para `accepted`;
- caso contrário, cria/atualiza `pending` com o solicitante atual.

### Aceitar convite

`social_aceitar_convite(p_relationship_id uuid)` só aceita convite recebido pelo usuário autenticado. Atualiza para `accepted` e registra `responded_at`.

### Recusar convite

`social_recusar_convite(p_relationship_id uuid)` só aceita convite recebido pelo usuário autenticado. Atualiza para `declined`; a linha permanece para impedir reprocessamento ambíguo e manter auditoria mínima.

### Desfazer amizade

`social_desfazer_amizade(p_relationship_id uuid)` só pode ser executada por um dos amigos. Atualiza para `declined`, sem apagar a linha.

### Bloquear

`social_bloquear(p_alvo uuid)` pode ser executada por qualquer um dos envolvidos ou por um colega elegível. Cria ou atualiza o par para `blocked`, define `blocked_by_id = auth.uid()` e encerra a conexão anterior.

### Desbloquear

`social_desbloquear(p_relationship_id uuid)` só pode ser executada por quem bloqueou. Atualiza para `declined`, limpa `blocked_by_id` e `responded_at`.

Todas as funções devem ser idempotentes para repetição da mesma ação e seguras contra duas respostas concorrentes.

## Colegas elegíveis

O destinatário precisa compartilhar uma turma ativa com o usuário autenticado. A função deve reutilizar `app_colegas_de_turma()` ou a mesma regra SQL equivalente já usada pelo ranking, sem confiar em `classe_id` enviado pelo mobile.

A lista “Encontrar colegas” exclui:

- o próprio usuário;
- usuários bloqueados por qualquer lado;
- amigos aceitos;
- convites pendentes enviados ou recebidos;
- usuários fora da turma atual.

## RLS e privacidade

- O aluno pode ler seus próprios relacionamentos através da view segura.
- O aluno não pode inserir, atualizar ou apagar diretamente `social_relacionamentos`.
- As funções RPC são o único caminho de mutação.
- O aluno nunca lê telemetria, email ou dados privados do colega.
- Professores não ganham automaticamente capacidade de alterar amizades de alunos.
- Bloqueio é bilateral na leitura: nenhum dos dois aparece na lista social do outro enquanto bloqueado.

## Serviço mobile

Criar `mobile/src/services/social/socialService.ts` com:

- `carregarSocial(alunoId)`;
- `enviarConvite(alvoId)`;
- `aceitarConvite(relationshipId)`;
- `recusarConvite(relationshipId)`;
- `desfazerAmizade(relationshipId)`;
- `bloquear(alvoId)`;
- `desbloquear(relationshipId)`.

O serviço chama as RPCs e converte erros conhecidos em códigos de domínio. O estado local só é atualizado após a resposta do banco.

## Componentes

- `SocialScreen`: orquestra carregamento, segmento ativo e retry.
- `SocialPersonCard`: apresenta pessoa e ação contextual.
- `SocialInviteCard`: aceita/recusa convite.
- `SocialSearchSection`: lista colegas elegíveis e envia convite.
- `StoreLauncher` e `StoreModal`: reutilizados da implementação anterior.

A aba será adicionada ao `mobile/src/app/(tabs)/_layout.tsx` entre Notificações e Ranking. O `href` será `null` enquanto `aberturas.social` for falso.

## Testes de aceitação

- Social fica invisível antes de o portão abrir.
- Social aparece depois que o aluno conclui o primeiro conteúdo.
- Usuário não consegue convidar a si mesmo ou alguém fora da turma.
- Dois convites simultâneos para o mesmo par produzem uma única linha.
- Convite recebido pode ser aceito ou recusado apenas pelo destinatário.
- Convite recebido aceito vira amizade para os dois lados.
- Amizade desfeita deixa de aparecer em “Amigos”.
- Bloqueio remove a pessoa das listas e impede novo convite.
- Somente o bloqueador consegue desbloquear.
- Repetir uma ação não cria linhas nem efeitos duplicados.
- Dados mostrados do colega não incluem email, telemetria ou eventos privados.
- O ícone da loja aparece no cabeçalho do Social e abre o modal personalizado pelo perfil ativo.
- A aba Ranking continua independente e preserva o comportamento atual.

## Fora de escopo

- chat entre amigos;
- feed de atividades;
- notificações push específicas de amizade;
- aprovação de professor;
- amizades entre turmas;
- recomendações algorítmicas de colegas.

