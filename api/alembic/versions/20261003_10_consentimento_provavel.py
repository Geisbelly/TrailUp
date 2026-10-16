"""Consentimento de telemetria provavel pelo servidor (item 1 da #195)

O aceite vivia SO no cliente: `telemetryConsent.ts` grava em `AsyncStorage`
sob `trailup:telemetry-consent`. O servidor recebia um unico booleano
(`telemetria_sessoes.camera_opt_in`), sobrescrito a cada lote -- ele reflete o
ultimo lote, nao se houve opt-in em algum momento.

Nao existia em lugar nenhum: versao do termo aceito, data do aceite,
finalidades, nem quem consentiu. O onus da prova do consentimento e do
controlador (art. 8 §2), e limpar os dados do app apagava a unica evidencia.

O #306 trouxe `TELEMETRY_CONSENT_VERSION` e `consentimentoEstaVigente`, o que
resolveu a VIGENCIA (aceitar a v3 nao e aceitar a v4). Nao resolveu a PROVA:
tudo continua no aparelho.

## As quatro propriedades que fazem disto prova, e nao log

Cada uma foi conferida ao vivo, como `authenticated` com o JWT de um aluno
real, em transacao revertida:

1. **O carimbo do servidor nao e forjavel.** O cliente tem INSERT aqui (tem de
   ter -- e ele que registra o aceite), entao `registrado_em` vindo dele seria
   forjavel. O trigger `BEFORE INSERT` sobrescreve com `now()`, no mesmo idioma
   de `trg_eventos_aluno_valor_do_banco`. Testado: cliente mandou
   `registrado_em = 2099-01-01` e o banco gravou 2026.

   `decidido_em` continua sendo do cliente -- e o instante em que o aluno
   decidiu, que so o aparelho sabe. Os dois convivem de proposito: um e o que
   o aluno diz, o outro e o que o servidor viu. Prova precisa dos dois.

2. **Ninguem registra consentimento por outro.** `WITH CHECK (aluno_id =
   auth.uid())`. Testado: INSERT para outro aluno levou 42501.

3. **E imutavel para quem o deu.** NAO ha policy de UPDATE nem de DELETE. O
   aluno nao pode reescrever nem apagar o proprio consentimento -- se pudesse,
   nao seria prova. Testado: UPDATE e DELETE ficaram sem efeito.

   Revogar nao e apagar: revogar e INSERT de uma linha nova com
   `status = 'rejected'`. O historico e append-only, que e o que permite
   responder "o que estava aceito no dia X".

4. **Reenvio nao duplica.** `UNIQUE (aluno_id, versao, decidido_em)`. O mobile
   precisa poder repetir o envio quando a rede falha; sem isto, cada tentativa
   viraria uma linha. Testado: segundo envio da mesma decisao levou
   unique_violation.

## O que esta migracao NAO faz

Nao da leitura ao professor. Prova de consentimento interessa ao controlador
(a instituicao), que le por `service_role`; expor consentimento de aluno para
professor e decisao de produto, nao de encanamento, e nao cabe a mim.

Nao mexe em `telemetria_sessoes.camera_opt_in`. Ele continua sendo o sinal
operacional "este lote veio com camera"; esta tabela e outra coisa, e o
item 1 da #195 pede as duas.

Revision ID: 20261003_10
Revises: 20261003_09
Create Date: 2026-10-07
"""

from alembic import op

revision = "20261003_10"
down_revision = "20261003_09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS public.consentimento_telemetria (
          id                         bigserial   PRIMARY KEY,
          aluno_id                   uuid        NOT NULL
                                     REFERENCES public.alunos (id) ON DELETE CASCADE,
          -- Versao do termo que estava na tela. Sem isto nao da' para dizer A QUE
          -- o aluno consentiu.
          versao                     text        NOT NULL,
          status                     text        NOT NULL
                                     CHECK (status IN ('accepted', 'rejected')),
          -- Quando o ALUNO decidiu (relogio do aparelho).
          decidido_em                timestamptz NOT NULL,
          -- Quando o SERVIDOR viu. Forcado por trigger -- ver docstring.
          registrado_em              timestamptz NOT NULL DEFAULT now(),
          -- As finalidades aceitas, uma a uma (camera/uso/desempenho/chat).
          preferencias               jsonb       NOT NULL DEFAULT '{}'::jsonb,
          camera_permissao_concedida boolean,
          -- Plataforma e versao do app, para situar o aceite.
          origem                     jsonb       NOT NULL DEFAULT '{}'::jsonb,
          CONSTRAINT consentimento_telemetria_unico
            UNIQUE (aluno_id, versao, decidido_em)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS consentimento_telemetria_aluno_idx
          ON public.consentimento_telemetria (aluno_id, registrado_em DESC)
        """
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION public.trg_consentimento_carimbo_do_servidor()
        RETURNS trigger
        LANGUAGE plpgsql
        SET search_path TO 'public', 'pg_temp'
        AS $function$
        BEGIN
          -- O cliente tem INSERT nesta tabela, entao `registrado_em` que viesse
          -- dele seria forjavel -- e e' justamente o carimbo que serve de prova.
          NEW.registrado_em := now();
          RETURN NEW;
        END;
        $function$
        """
    )
    op.execute(
        "REVOKE EXECUTE ON FUNCTION public.trg_consentimento_carimbo_do_servidor()"
        " FROM PUBLIC, anon, authenticated"
    )
    op.execute(
        """
        DROP TRIGGER IF EXISTS trg_consentimento_carimbo
          ON public.consentimento_telemetria
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_consentimento_carimbo
          BEFORE INSERT ON public.consentimento_telemetria
          FOR EACH ROW EXECUTE FUNCTION public.trg_consentimento_carimbo_do_servidor()
        """
    )

    op.execute("ALTER TABLE public.consentimento_telemetria ENABLE ROW LEVEL SECURITY")
    # SELECT e INSERT do proprio. Nenhuma policy de UPDATE/DELETE: a prova nao
    # pode ser reescrita nem apagada por quem a deu.
    for nome in ("consentimento_telemetria_aluno_ins", "consentimento_telemetria_aluno_sel"):
        op.execute(
            f"DROP POLICY IF EXISTS {nome} ON public.consentimento_telemetria"
        )
    op.execute(
        """
        CREATE POLICY consentimento_telemetria_aluno_ins
          ON public.consentimento_telemetria
          FOR INSERT TO authenticated
          WITH CHECK (aluno_id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY consentimento_telemetria_aluno_sel
          ON public.consentimento_telemetria
          FOR SELECT TO authenticated
          USING (aluno_id = auth.uid())
        """
    )
    op.execute(
        "GRANT SELECT, INSERT ON public.consentimento_telemetria TO authenticated"
    )
    op.execute(
        "GRANT USAGE, SELECT ON SEQUENCE public.consentimento_telemetria_id_seq"
        " TO authenticated"
    )


def downgrade() -> None:
    op.execute(
        "DROP TRIGGER IF EXISTS trg_consentimento_carimbo"
        " ON public.consentimento_telemetria"
    )
    op.execute(
        "DROP FUNCTION IF EXISTS public.trg_consentimento_carimbo_do_servidor()"
    )
    # A TABELA FICA. Ela e' prova de consentimento: apagar no downgrade
    # destruiria exatamente a evidencia que esta migracao existe para guardar.
