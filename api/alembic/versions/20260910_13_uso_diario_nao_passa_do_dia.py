"""tempo de uso do dia deixa de passar de 24h

Revision ID: 20260910_13
Revises: 20260910_12

## O que estava errado

`aluno_atividade_diaria.tempo_uso_seg` e somado pelo `notificacoes_heartbeat`:

    SET tempo_uso_seg = aluno_atividade_diaria.tempo_uso_seg
                        + EXCLUDED.tempo_uso_seg

Cada BATIDA ja era limitada -- `v_seg integer := GREATEST(0,
LEAST(COALESCE(p_segundos, 0), 3600))` --, mas o TOTAL do dia nao: N batidas
de ate uma hora somam alem de 24 h.

O contrato esta escrito no corpo da propria funcao -- "O app manda DELTA, nao
total acumulado" -- e o cliente o cumpre: em
`useMonitorDeSessao.enviarTempoAcumulado` o relogio avanca ANTES do await,
entao um envio que falha nao conta o intervalo duas vezes.

O que o contrato nao cobre e o mesmo aluno com o app aberto em mais de um
lugar. Cada sessao manda o proprio delta e as duas somam na mesma linha
`(aluno_id, dia)`, e o total passa do relogio de parede.

Medido em producao, linha 2216 (dia 2026-09-10):

    tempo_uso_seg = 98400  = 27.3 h
    janela entre primeiro e ultimo acesso = 44812 s = 12.4 h
    aberturas = 0

27 horas de uso dentro de uma janela de 12 -- duas sessoes paralelas por
~12.4 h dao ~24.8 h, que e a ordem do valor observado.

O dano nao e so o numero feio. `notificacoes_heartbeat` passa esse total
adiante:

    v_criadas := public.notificacoes_processar_rotinas(
                   v_aluno, 'tempo_uso', v_total);

E o gatilho `tempo_uso` e o que dispara "Hora de uma pausa / Voce ja estudou
bastante hoje". Com o total inflado, o app cobra pausa de quem nao estudou
tanto.

## O que esta migracao faz

Poe a barreira FISICA no ponto de verdade: um dia tem 86400 segundos, e
nenhum acumulado de um dia pode passar disso. Vale para o UPDATE e para o
INSERT -- um unico delta absurdo tambem nao entra.

O limite NAO tenta resolver a semantica de varios aparelhos: se duas sessoes
paralelas contam como uso dobrado, isso e decisao de produto, e continua em
aberto. O que esta migracao garante e que a metrica nunca mais seja
impossivel, e que o gatilho de pausa pare de receber numero inventado.

A linha existente e corrigida pelo mesmo limite.

Create Date: 2026-09-10
"""

from alembic import op

revision = "20260910_13"
down_revision = "20260910_12"
branch_labels = None
depends_on = None


_SEGUNDOS_NO_DIA = 86400

# Substituicao no corpo VIVO: a funcao tambem cria pendencia de notificacao e
# mexe em `aluno_sessoes_app`; recolar texto de uma migracao anterior
# reverteria em silencio qualquer ajuste feito nessas partes.
_ANCORA_UPDATE = (
    "    SET tempo_uso_seg = aluno_atividade_diaria.tempo_uso_seg"
    " + EXCLUDED.tempo_uso_seg,"
)
_TROCA_UPDATE = (
    "    SET tempo_uso_seg = LEAST("
    "aluno_atividade_diaria.tempo_uso_seg + EXCLUDED.tempo_uso_seg,"
    f" {_SEGUNDOS_NO_DIA}),"
)

_ANCORA_INSERT = "  VALUES (v_aluno, v_dia, v_tz, v_seg, now(), now())"
_TROCA_INSERT = (
    f"  VALUES (v_aluno, v_dia, v_tz, LEAST(v_seg, {_SEGUNDOS_NO_DIA}),"
    " now(), now())"
)


def upgrade() -> None:
    op.execute(
        f"""
        DO $migracao$
        DECLARE
          v_def TEXT;
          v_novo TEXT;
          v_oid OID;
        BEGIN
          v_oid := to_regprocedure(
            'public.notificacoes_heartbeat(integer,text,bigint)'
          );
          IF v_oid IS NULL THEN
            RAISE EXCEPTION USING MESSAGE =
              'notificacoes_heartbeat(integer,text,bigint) nao encontrada';
          END IF;

          v_def := pg_get_functiondef(v_oid);

          -- Sentinela ESPECIFICA desta mudanca. A primeira versao desta
          -- migracao usou `position('LEAST(' IN v_def) > 0`, e a funcao JA
          -- tinha um LEAST -- o que limita cada batida a 3600s:
          --
          --   v_seg integer := GREATEST(0, LEAST(COALESCE(p_segundos,0), 3600));
          --
          -- Resultado: a migracao saiu por aqui sem tocar na funcao, e o
          -- CONFERE passou trivialmente pela mesma string generica. O dado
          -- voltou a 86520s na batida seguinte e foi assim que o erro
          -- apareceu.
          IF position('LEAST(aluno_atividade_diaria.tempo_uso_seg' IN v_def) > 0 THEN
            RAISE NOTICE 'heartbeat ja limita o total do dia';
            RETURN;
          END IF;

          IF position($au${_ANCORA_UPDATE}$au$ IN v_def) = 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ancora do UPDATE de tempo_uso_seg nao encontrada no corpo vivo';
          END IF;
          IF position($ai${_ANCORA_INSERT}$ai$ IN v_def) = 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ancora do VALUES de tempo_uso_seg nao encontrada no corpo vivo';
          END IF;

          v_novo := replace(v_def, $au${_ANCORA_UPDATE}$au$,
                                   $tu${_TROCA_UPDATE}$tu$);
          v_novo := replace(v_novo, $ai${_ANCORA_INSERT}$ai$,
                                    $ti${_TROCA_INSERT}$ti$);

          IF v_novo = v_def THEN
            RAISE EXCEPTION USING MESSAGE = 'substituicao nao alterou a definicao';
          END IF;

          EXECUTE v_novo;
        END
        $migracao$;
        """
    )

    # A linha que ja existe: mesmo limite.
    op.execute(
        f"""
        UPDATE public.aluno_atividade_diaria
           SET tempo_uso_seg = {_SEGUNDOS_NO_DIA},
               atualizado_em = now()
         WHERE tempo_uso_seg > {_SEGUNDOS_NO_DIA}
        """
    )

    op.execute(
        f"""
        DO $confere$
        DECLARE
          v_fora INT;
          v_tem BOOLEAN;
        BEGIN
          SELECT count(*) INTO v_fora
            FROM public.aluno_atividade_diaria
           WHERE tempo_uso_seg > {_SEGUNDOS_NO_DIA} OR tempo_uso_seg < 0;
          IF v_fora <> 0 THEN
            RAISE EXCEPTION USING MESSAGE =
              'ainda ha dia com uso impossivel: ' || v_fora::text;
          END IF;

          -- Tambem especifica: conferir por 'LEAST(' daria falso positivo com
          -- o limite por batida que a funcao ja tinha.
          v_tem := position(
            'LEAST(aluno_atividade_diaria.tempo_uso_seg' IN pg_get_functiondef(
              to_regprocedure('public.notificacoes_heartbeat(integer,text,bigint)')
            )
          ) > 0;
          IF NOT v_tem THEN
            RAISE EXCEPTION USING MESSAGE =
              'o heartbeat vivo nao contem o limite do TOTAL do dia';
          END IF;

          RAISE NOTICE USING MESSAGE =
            'CONFERE: uso diario limitado a 86400s no heartbeat e no dado';
        END
        $confere$;
        """
    )


def downgrade() -> None:
    op.execute(
        f"""
        DO $volta$
        DECLARE
          v_def TEXT;
          v_novo TEXT;
          v_oid OID;
        BEGIN
          v_oid := to_regprocedure(
            'public.notificacoes_heartbeat(integer,text,bigint)'
          );
          IF v_oid IS NULL THEN
            RETURN;
          END IF;

          v_def := pg_get_functiondef(v_oid);
          v_novo := replace(v_def, $tu${_TROCA_UPDATE}$tu$,
                                   $au${_ANCORA_UPDATE}$au$);
          v_novo := replace(v_novo, $ti${_TROCA_INSERT}$ti$,
                                    $ai${_ANCORA_INSERT}$ai$);
          IF v_novo = v_def THEN
            RAISE NOTICE 'limite nao encontrado; nada a reverter';
            RETURN;
          END IF;

          EXECUTE v_novo;
        END
        $volta$;
        """
    )
