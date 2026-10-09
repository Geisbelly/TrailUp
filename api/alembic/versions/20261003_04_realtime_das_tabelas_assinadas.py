"""Realtime: as tabelas que o app assina entram na publicacao

Seis das oito tabelas que o mobile assina por `postgres_changes` nao estavam
na publicacao `supabase_realtime`. Levantado ao vivo no banco de producao --
a publicacao tinha 9 tabelas:

    classe_aluno, notificacoes, notificacoes_agendamentos, notificacoes_ia,
    notificacoes_pendentes, ranks, telemetria_eventos_app, telemetria_lotes,
    telemetria_time_metric_entries

Fora da publicacao, o Postgres nao escreve a mudanca no WAL logico para o
Realtime: o canal assina, o `.subscribe()` nao reclama, e **evento nenhum
chega, nunca**. Nao e lentidao nem corrida -- e silencio permanente.

O que estava morto, por arquivo:

| arquivo                     | tabela                 | consequencia                                |
| --------------------------- | ---------------------- | ------------------------------------------- |
| `PortoesContext.tsx`        | `conteudo_aluno`       | portao nao abre ao concluir o conteudo      |
| `PortoesContext.tsx`        | `topico_aluno`         | idem, por topico                            |
| `TrilhaContext.tsx`         | `conteudo_aluno`       | trilha nao reflete progresso na hora        |
| `TrilhaContext.tsx`         | `atividade_aluno`      | idem, para atividade                        |
| `TrilhaContext.tsx`         | `topico_aluno`         | idem, para topico                           |
| `TrilhaContext.tsx`         | `classe_mapa_tema`     | tema novo do mapa nao aparece               |
| `ConquistaRankContext.tsx`  | `eventos_aluno`        | ranking/conquista nao atualiza ao pontuar   |
| `TrailupApiProvider.ts`     | `conteudo_personalizado` | material gerado nao aparece sozinho      |

`PortoesContext` e o caso mais visivel: as duas assinaturas dele estavam
mortas, e o unico caminho que sobrava era o `AppState` "active". Na pratica o
portao abria quando o aluno saia do app e voltava -- nao quando ele terminava
o conteudo.

`classe_aluno` e `notificacoes` ja estavam na publicacao e por isso
funcionavam; e o contraste entre elas e as outras que mostra que a intencao
sempre foi ter Realtime aqui (CLAUDE.md: "`mobile -> Supabase` ja e o caminho
autenticado e com Realtime").

Nada de RLS muda aqui: o Realtime reavalia as policies por assinante, e as
seis tabelas ja tem policy de SELECT para `authenticated` (`classe_mapa_tema`
ganhou a sua em `20261003_03` -- sem ela, entrar na publicacao nao resolveria
nada).

**Limite conhecido, de proposito.** As seis ficam com `REPLICA IDENTITY
DEFAULT`, que no WAL leva so a PK na imagem antiga. Como a PK de todas e o
`id` surrogate, evento de DELETE nao casa filtro por `aluno_id`/`classe_id` e
nao e entregue. Nenhum dos handlers depende de DELETE (todos reagem
recalculando a partir do banco), e `REPLICA IDENTITY FULL` dobraria o WAL
dessas tabelas, que sao as mais escritas do app. Fica DEFAULT.
Consequencia ja existente, nao introduzida aqui: o ramo que le
`payload.old.classe_id` em `ConquistaRankContext` e inalcancavel -- ele tem
fallback (`if (!classeId) scheduleRankingRefresh()`), entao nao quebra.

Idempotente e tolerante a banco sem Supabase: se a publicacao nao existir
(Postgres local, CI), a migracao nao faz nada em vez de estourar.

Revision ID: 20261003_04
Revises: 20261003_03
Create Date: 2026-10-06
"""

from alembic import op

revision = "20261003_04"
down_revision = "20261003_03"
branch_labels = None
depends_on = None

PUBLICACAO = "supabase_realtime"

TABELAS = (
    "atividade_aluno",
    "classe_mapa_tema",
    "conteudo_aluno",
    "conteudo_personalizado",
    "eventos_aluno",
    "topico_aluno",
)

_LISTA_SQL = ", ".join(f"'{t}'" for t in TABELAS)


def _bloco(acao: str) -> str:
    """ADD/DROP TABLE na publicacao, pulando o que ja esta no estado desejado."""
    ja_e_membro = (
        "EXISTS (SELECT 1 FROM pg_publication_tables pt"
        f" WHERE pt.pubname = '{PUBLICACAO}'"
        " AND pt.schemaname = 'public' AND pt.tablename = t)"
    )
    condicao = f"NOT {ja_e_membro}" if acao == "ADD" else ja_e_membro
    return f"""
        DO $$
        DECLARE
          t text;
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = '{PUBLICACAO}') THEN
            RAISE NOTICE 'publicacao {PUBLICACAO} ausente; nada a fazer';
            RETURN;
          END IF;

          FOREACH t IN ARRAY ARRAY[{_LISTA_SQL}]::text[] LOOP
            IF EXISTS (
              SELECT 1 FROM pg_class c
               WHERE c.relnamespace = 'public'::regnamespace
                 AND c.relname = t AND c.relkind = 'r'
            ) AND {condicao} THEN
              EXECUTE format('ALTER PUBLICATION {PUBLICACAO} {acao} TABLE public.%I', t);
            END IF;
          END LOOP;
        END $$;
    """


def upgrade() -> None:
    op.execute(_bloco("ADD"))


def downgrade() -> None:
    op.execute(_bloco("DROP"))
