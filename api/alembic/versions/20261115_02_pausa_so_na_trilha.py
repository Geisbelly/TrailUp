"""A pausa saudável conta o tempo na trilha e só é entregue com o aluno lá dentro

Revision ID: 20261115_02
Revises: 20261115_01

## O defeito

`pausa_saudavel` ("Hora de uma pausa. Você já estudou bastante hoje") é a rotina de gatilho
`tempo_uso`. O heartbeat do app somava o tempo de uso do **app inteiro** em
`aluno_atividade_diaria.tempo_uso_seg` e era esse total que cruzava o limiar
(`tempo_uso_limiar_min`, 25 min). Então 25 min no ranking, no chat ou no perfil pediam pausa de um
estudo que não aconteceu, e o push chegava na tela em que o aluno estivesse.

Havia mais dois caminhos que soltavam a pausa fora da trilha, os dois em `notificacoes_entregar`:

- **o adiamento por intervalo** (`20261105_04`) trocava o gatilho para `horario`. Quem não podia
  sair na hora virava push com relógio, e a varredura de 5 em 5 min (`pg_cron`) o entregava quando o
  intervalo vencia, com o app aberto em outra tela ou fechado;
- **o modo foco** (`20261102_18`) segurava a pendente como `fim_foco`, e a saída do foco a entregava
  em qualquer chamada, inclusive na varredura.

## O que muda

1. `aluno_atividade_diaria.tempo_trilha_seg`: a parte do tempo de uso passada num módulo da trilha
   (`estaNaTrilhaDeEstudo` no app, a mesma leitura de rota que esconde a barra de abas).
   `tempo_uso_seg` continua igual: missão diária, sequência, painel e métricas leem ele.
2. `notificacoes_heartbeat` ganha `p_segundos_trilha` e `p_na_trilha`. O gatilho `tempo_uso` passa a
   medir `tempo_trilha_seg` e só é processado e entregue com `p_na_trilha` verdadeiro. Fora da trilha
   a batida entrega só o que tem relógio (`horario`), como a varredura.

   App anterior a esta versão não manda os dois parâmetros: para ele a pausa não sai. Sem saber onde
   o aluno está, não mandar é melhor que mandar em qualquer lugar, que era a reclamação. O app novo,
   se chegar antes desta migração, recebe `PGRST202` e repete a batida com os argumentos antigos.
3. `notificacoes_entregar`, por remendo do corpo vivo:
   - o adiamento mantém o gatilho `tempo_uso` (com o `horario` adiado) em vez de virar `horario`;
   - a pendente `tempo_uso` adiada só fica pronta depois do `horario`, como a de relógio;
   - o foco não a converte em `fim_foco`: ela continua esperando a próxima batida na trilha.
4. `notificacoes_processar_rotinas`: a pendente de gatilho `tempo_uso` vale
   `tempo_uso_expiracao_min` (120 min) em vez das 48 h padrão. Agora ela só sai na trilha, e uma
   pausa pedida por um estudo de horas atrás (ou de ontem) não faz mais sentido.
5. **Dado:** a pausa que ainda está na fila foi contada pelo tempo no app. Ela é expirada
   (`ultimo_erro = 'contada_pelo_tempo_no_app'`). A `dedupe_key` fica como está: quem tinha uma
   dessas hoje só volta a ter pausa amanhã. O downgrade não a devolve à fila.

"Tudo com gatilho `tempo_uso`" e não só `pausa_saudavel`: o gatilho é o que diz "isto é sobre o
estudo em curso". Sugestão da IA promovida com gatilho `tempo_uso` (`notificacoes_ia_promover`
aceita) segue a mesma regra.

## Como as funções são remendadas

Como na `20261105_05`: `pg_get_functiondef` do corpo vivo, troca de trecho conferindo quantas vezes
ele aparece, e para se o corpo não for o que esta migração conhece. O downgrade faz a troca inversa.
O heartbeat é recriado inteiro (muda a assinatura), e o antigo é removido antes: com os dois, a
chamada de 3 argumentos do app antigo ficaria ambígua.
"""

from __future__ import annotations

from alembic import op

revision = "20261115_02"
down_revision = "20261115_01"
branch_labels = None
depends_on = None


CONFIG = """
INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES
  ('tempo_uso_expiracao_min', '120',
   'Validade, em minutos, da pendente de gatilho tempo_uso (pausa saudavel). Ela so sai com o aluno '
   'na trilha; uma pausa pedida por um estudo de horas atras nao serve mais (20261115_02).')
ON CONFLICT (chave) DO NOTHING;
"""

COLUNA = """
ALTER TABLE public.aluno_atividade_diaria
  ADD COLUMN IF NOT EXISTS tempo_trilha_seg integer NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.aluno_atividade_diaria.tempo_trilha_seg IS
  'Parte de tempo_uso_seg passada num modulo da trilha, pelo heartbeat. Mede o gatilho tempo_uso '
  '(pausa saudavel) desde 20261115_02. Linhas anteriores ficam com 0.';
"""

# A batida antiga não tem o tempo na trilha: o que ela trouxe nao pode cruzar o limiar.
EXPIRAR_PAUSAS_CONTADAS_NO_APP = """
UPDATE public.notificacoes_pendentes p
   SET status = 'expirada', ultimo_erro = 'contada_pelo_tempo_no_app', atualizado_em = now()
 WHERE p.status = 'pendente'
   AND EXISTS (SELECT 1 FROM public.notificacoes_agendamentos a
                WHERE a.id = p.agendamento_id AND a.gatilho = 'tempo_uso');
"""

HEARTBEAT = r"""
DROP FUNCTION IF EXISTS public.notificacoes_heartbeat(integer, text, bigint);
CREATE OR REPLACE FUNCTION public.notificacoes_heartbeat(
  p_segundos integer DEFAULT 0,
  p_timezone text DEFAULT 'UTC',
  p_sessao_id bigint DEFAULT NULL,
  p_segundos_trilha integer DEFAULT NULL,
  p_na_trilha boolean DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_aluno  uuid := auth.uid();
  v_tz     text := public.notificacoes_tz(p_timezone);
  v_dia    date;
  v_seg    integer := GREATEST(0, LEAST(COALESCE(p_segundos, 0), 3600));
  v_trilha integer;
  v_total  integer;
  v_total_trilha integer;
  v_criadas integer := 0;
  v_entregues integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  v_dia := public.notificacoes_dia_local(v_tz);
  -- O tempo na trilha e uma parte da batida, nunca mais que ela.
  v_trilha := GREATEST(0, LEAST(COALESCE(p_segundos_trilha, 0), v_seg));

  -- O app manda DELTA, nao total acumulado: reenviar uma batida perdida
  -- somaria o total inteiro de novo e inflaria o tempo de estudo.
  INSERT INTO aluno_atividade_diaria (
    aluno_id, dia, timezone, tempo_uso_seg, tempo_trilha_seg, primeiro_acesso_em, ultimo_acesso_em
  )
  VALUES (v_aluno, v_dia, v_tz, v_seg, v_trilha, now(), now())
  ON CONFLICT (aluno_id, dia) DO UPDATE
    SET tempo_uso_seg = aluno_atividade_diaria.tempo_uso_seg + EXCLUDED.tempo_uso_seg,
        tempo_trilha_seg = aluno_atividade_diaria.tempo_trilha_seg + EXCLUDED.tempo_trilha_seg,
        ultimo_acesso_em = now(), timezone = EXCLUDED.timezone, atualizado_em = now()
  RETURNING tempo_uso_seg, tempo_trilha_seg INTO v_total, v_total_trilha;

  IF p_sessao_id IS NOT NULL THEN
    UPDATE aluno_sessoes_app
       SET duracao_seg = duracao_seg + v_seg, atualizado_em = now()
     WHERE id = p_sessao_id AND aluno_id = v_aluno AND encerrada_em IS NULL;
  END IF;

  -- Gatilho tempo_uso (pausa saudavel) e sobre o estudo em curso: mede o tempo
  -- na trilha e so sai com o aluno la dentro. App antigo (sem p_na_trilha) nao
  -- recebe: sem saber onde o aluno esta, nao mandar e melhor que mandar em
  -- qualquer tela.
  IF p_na_trilha IS TRUE THEN
    v_criadas := public.notificacoes_processar_rotinas(v_aluno, 'tempo_uso', v_total_trilha);
  END IF;
  v_criadas := v_criadas + public.notificacoes_processar_rotinas(v_aluno, 'horario');
  v_entregues := public.notificacoes_entregar(
    v_aluno,
    CASE WHEN p_na_trilha IS TRUE THEN ARRAY['tempo_uso', 'horario'] ELSE ARRAY['horario'] END
  );

  RETURN jsonb_build_object(
    'tempo_uso_seg', v_total, 'tempo_trilha_seg', v_total_trilha,
    'pendentes_criadas', v_criadas, 'entregues', v_entregues
  );
END;
$fn$;
REVOKE ALL ON FUNCTION public.notificacoes_heartbeat(integer, text, bigint, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notificacoes_heartbeat(integer, text, bigint, integer, boolean)
  TO authenticated;
"""

# O corpo da `20260826_04`, o único que o heartbeat teve até aqui.
HEARTBEAT_ANTES = r"""
DROP FUNCTION IF EXISTS public.notificacoes_heartbeat(integer, text, bigint, integer, boolean);
CREATE OR REPLACE FUNCTION public.notificacoes_heartbeat(
  p_segundos integer DEFAULT 0,
  p_timezone text DEFAULT 'UTC',
  p_sessao_id bigint DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_aluno uuid := auth.uid();
  v_tz    text := public.notificacoes_tz(p_timezone);
  v_dia   date;
  v_seg   integer := GREATEST(0, LEAST(COALESCE(p_segundos, 0), 3600));
  v_total integer;
  v_criadas integer;
  v_entregues integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem sessao autenticada' USING ERRCODE = '28000';
  END IF;
  v_dia := public.notificacoes_dia_local(v_tz);

  -- O app manda DELTA, nao total acumulado: reenviar uma batida perdida
  -- somaria o total inteiro de novo e inflaria o tempo de estudo.
  INSERT INTO aluno_atividade_diaria (
    aluno_id, dia, timezone, tempo_uso_seg, primeiro_acesso_em, ultimo_acesso_em
  )
  VALUES (v_aluno, v_dia, v_tz, v_seg, now(), now())
  ON CONFLICT (aluno_id, dia) DO UPDATE
    SET tempo_uso_seg = aluno_atividade_diaria.tempo_uso_seg + EXCLUDED.tempo_uso_seg,
        ultimo_acesso_em = now(), timezone = EXCLUDED.timezone, atualizado_em = now()
  RETURNING tempo_uso_seg INTO v_total;

  IF p_sessao_id IS NOT NULL THEN
    UPDATE aluno_sessoes_app
       SET duracao_seg = duracao_seg + v_seg, atualizado_em = now()
     WHERE id = p_sessao_id AND aluno_id = v_aluno AND encerrada_em IS NULL;
  END IF;

  v_criadas := public.notificacoes_processar_rotinas(v_aluno, 'tempo_uso', v_total);
  v_criadas := v_criadas + public.notificacoes_processar_rotinas(v_aluno, 'horario');
  v_entregues := public.notificacoes_entregar(v_aluno, ARRAY['tempo_uso', 'horario']);

  RETURN jsonb_build_object(
    'tempo_uso_seg', v_total, 'pendentes_criadas', v_criadas, 'entregues', v_entregues
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.notificacoes_heartbeat(integer, text, bigint) TO authenticated;
"""

TROCAS: list[tuple[str, list[tuple[str, str, int]]]] = [
    (
        "public.notificacoes_entregar(uuid, text[])",
        [
            # Foco: a pendente de tempo_uso nao vira fim_foco (a saida do foco a entregaria em
            # qualquer tela); ela espera a proxima batida na trilha.
            (
                "       AND p.gatilho = ANY(p_gatilhos)\n"
                "       AND (p.gatilho <> 'horario' OR p.horario <= now());\n"
                "    RETURN 0;",
                "       AND p.gatilho = ANY(p_gatilhos)\n"
                "       AND p.gatilho <> 'tempo_uso'\n"
                "       AND (p.gatilho <> 'horario' OR p.horario <= now());\n"
                "    RETURN 0;",
                1,
            ),
            # Pronta: a de tempo_uso adiada espera o horario, como a de relogio.
            (
                "       AND (p.gatilho = 'fim_foco' OR p.gatilho = ANY(p_gatilhos))\n"
                "       AND (p.gatilho <> 'horario' OR p.horario <= now())\n",
                "       AND (p.gatilho = 'fim_foco' OR p.gatilho = ANY(p_gatilhos))\n"
                "       AND (p.gatilho NOT IN ('horario', 'tempo_uso') OR p.horario <= now())\n",
                1,
            ),
            # Adiamento: mantem o gatilho tempo_uso. Virar horario punha a pausa na varredura.
            (
                "SET horario = v_adiar, gatilho = 'horario',",
                "SET horario = v_adiar,"
                " gatilho = CASE WHEN p.gatilho = 'tempo_uso' THEN 'tempo_uso' ELSE 'horario' END,",
                1,
            ),
        ],
    ),
    (
        "public.notificacoes_processar_rotinas(uuid, text, integer)",
        [
            (
                "now() + make_interval(hours => public.notificacoes_cfg_int('expiracao_padrao_horas', 48)),",
                "CASE WHEN v_reg.gatilho = 'tempo_uso'"
                " THEN now() + make_interval(mins => public.notificacoes_cfg_int('tempo_uso_expiracao_min', 120))"
                " ELSE now() + make_interval(hours => public.notificacoes_cfg_int('expiracao_padrao_horas', 48))"
                " END,",
                1,
            ),
        ],
    ),
]


def _dolar(texto: str) -> str:
    assert "$t$" not in texto
    return f"$t${texto}$t$"


def remendo(assinatura: str, trocas: list[tuple[str, str, int]]) -> str:
    """Troca trechos do corpo vivo da função, conferindo quantas vezes cada um aparece."""
    passos = []
    for antes, depois, vezes in trocas:
        a, d = _dolar(antes), _dolar(depois)
        passos.append(
            f"""
  v_n := (length(v_def) - length(replace(v_def, {a}, ''))) / length({a});
  IF v_n <> {vezes} THEN
    RAISE EXCEPTION '20261115_02: % tem % vez(es) de %, esperava {vezes}', {_dolar(assinatura)}, v_n, {a};
  END IF;
  v_def := replace(v_def, {a}, {d});"""
        )
    return f"""
DO $remendo$
DECLARE
  v_def text := pg_get_functiondef({_dolar(assinatura)}::regprocedure);
  v_n   integer;
BEGIN{"".join(passos)}
  EXECUTE v_def;
END $remendo$;
"""


def remendos(*, desfazer: bool = False) -> list[str]:
    if not desfazer:
        return [remendo(f, t) for f, t in TROCAS]
    return [remendo(f, [(d, a, n) for a, d, n in t]) for f, t in reversed(TROCAS)]


RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(COLUNA)
    for sql in remendos():
        op.execute(sql)
    op.execute(HEARTBEAT)
    op.execute(EXPIRAR_PAUSAS_CONTADAS_NO_APP)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(HEARTBEAT_ANTES)
    for sql in remendos(desfazer=True):
        op.execute(sql)
    op.execute("ALTER TABLE public.aluno_atividade_diaria DROP COLUMN IF EXISTS tempo_trilha_seg;")
    op.execute("DELETE FROM public.notificacoes_config WHERE chave = 'tempo_uso_expiracao_min';")
    op.execute(RELOAD)
