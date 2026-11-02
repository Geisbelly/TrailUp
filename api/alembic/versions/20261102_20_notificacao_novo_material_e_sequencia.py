"""Quem produz `novo_material` e `sequencia`: dois gatilhos no banco, sem passar pela API (#149)

A `20261102_19` pôs os dois tipos na matriz de Monterrat (`novo_material`: Seeker e Achiever;
`sequencia`: Achiever), mas ninguém os enfileirava. Os dois produtores são gatilhos e entram pela porta
dos eventos do banco, `notificacoes_enfileirar_evento`. Ela já decide o destino (perfil e silêncio), o
horário fora da janela de silêncio, a expiração e o dedupe do dia. Nenhum dos dois passa por modelo de
linguagem, então nenhum dos dois é da API (regra de fronteira).

## `novo_material`: a personalização do tópico ficou pronta para o aluno

`trg_conteudo_personalizado_novo_material`, AFTER INSERT OR UPDATE OF status em
`conteudo_personalizado`. O app lê o material por turma × tópico × perfil dominante, então "pronto
para o aluno" quer dizer três coisas:

- **O tópico terminou de gerar para o perfil.** Nenhuma linha da turma × tópico × perfil (da mesma
  camada: a base, `aluno_id` nulo, ou a linha do próprio aluno) está em `processando_midias`, existe
  ao menos uma `pronto` e nenhum alvo de outro conteúdo do tópico espera num job ativo. Um tópico com
  três conteúdos avisa uma vez, quando o último termina, e não três. Por isso o gatilho também roda
  quando uma linha termina em falha: se o último conteúdo falhar, o que ficou pronto ainda avisa.
- **O aluno lê esse perfil.** Recebe quem está matriculado na turma e tem esse perfil como dominante
  (`notificacoes_perfil_dominante`, a mesma ordem do resto do motor). A matriz de Monterrat decide
  depois, dentro de `notificacoes_enfileirar_evento`.
- **O aluno não está numa turma retida pelo estudo** (`estudo_personalizacao_retida`, #13). A trava
  esconde o material do aluno, e o aviso diria que existe algo que ele não consegue abrir.

### Uma vez por aluno × tópico

A regeração faz `UPDATE` in place e passa de novo por `processando_midias` → `pronto`. Um aviso a cada
regeração (um professor que corrige um conteúdo, uma versão nova do pipeline) seria spam com cara de
novidade. A tabela `notificacoes_material_pronto` guarda a primeira vez em que o tópico ficou pronto
para cada aluno, e a chave `(aluno_id, topico_id)` impede o segundo aviso. A linha é gravada mesmo
quando o perfil barra o aviso. Ela registra o fato, não a entrega: "material pronto para o aluno em
tal hora" também serve para medir a latência da geração.

### Sem enxurrada

- **Matrícula recente não recebe aviso** (`novo_material_carencia_horas`, 24 h). A matrícula enfileira
  a geração da camada do aluno em todos os tópicos (`20261011_02`). Para quem acabou de chegar tudo é
  novo, e o aviso viraria uma lista de tópicos. A linha na tabela é gravada igual, então o tópico
  também não avisa depois.
- **Um aviso por turma por dia.** O motivo é `classe:<id>`, então o dedupe do dia junta os tópicos da
  mesma turma num aviso só. Enquanto ele não sai, o tópico seguinte reescreve o texto para "N tópicos
  ganharam material no seu estilo". Depois que ele sai, os outros tópicos do dia ficam sem aviso.

### Quem entrega

O gatilho só enfileira. Ele roda dentro da transação do worker de geração, e o push não deve sair de
lá. A varredura de 5 min (`notificacoes_varrer`) entrega a pendente `horario` vencida, e o login
entrega a pendente `login` (aluno sem aparelho). Foco, teto diário e silêncio decidem lá, como para
todo tipo.

## `sequencia`: dias seguidos de estudo

`trg_aluno_atividade_diaria_sequencia`, AFTER INSERT OR UPDATE OF tempo_uso_seg em
`aluno_atividade_diaria`, a tabela que o heartbeat do app alimenta. É o mesmo dado de "quem estudou
hoje" da revisão diária (`20260826_16`) e da missão de minutos (`20261021_20`).

- **Um dia conta** quando passa de `sequencia_minimo_min` minutos (10, o mesmo corte de
  `revisao_pular_se_uso_min`). Só o tempo de uso conta: a linha que `notificacoes_entregar` cria para
  o teto diário nasce com `tempo_uso_seg = 0`.
- **O gatilho age só quando o dia passa do limiar**, uma vez por dia. Aí ele conta os dias seguidos até
  hoje, sem buraco, e avisa só nos **marcos** (`sequencia_marcos`: 3, 7, 14, 30, 60, 100). Avisar todo
  dia viraria cobrança. Pelo "no pressure" do épico #133, não existe aviso de "sua sequência vai
  quebrar".
- O dia é o `dia` da linha, no fuso do aluno, porque o heartbeat já grava no fuso local.
- A entrega é na hora: o heartbeat chama `notificacoes_entregar` logo depois de somar o tempo. Como o
  aluno está estudando, o foco por atenção pode segurar o aviso até o fim do estudo.

## Nunca derruba quem escreve

Os dois gatilhos rodam dentro de transações que não são deles: o worker de geração e o microservice,
num caso, e o heartbeat do app, no outro. Por isso, `EXCEPTION WHEN OTHERS` → `WARNING`, e quem
escreveu segue. É o mesmo princípio dos gatilhos da caixa do professor (`20261102_17`).

## Tabela e RLS

`notificacoes_material_pronto` não tem policy, de propósito. Só o gatilho (`SECURITY DEFINER`) a lê e
escreve, e o aluno vê o efeito na caixa de entrada. Os GRANTs de `anon`/`authenticated` são revogados.
A tabela entra em `retencao_politica` como `vida_da_conta` e sai com o aluno pela FK.

Nenhum `%` literal no SQL desta migração: o SQL offline do Alembic o dobra.

Revision ID: 20261102_20
Revises: 20261102_19
Create Date: 2026-11-02
"""

from __future__ import annotations

from alembic import op

revision = "20261102_20"
down_revision = "20261102_19"
branch_labels = None
depends_on = None

TRIGGER_MATERIAL = "trg_conteudo_personalizado_novo_material"
TRIGGER_SEQUENCIA = "trg_aluno_atividade_diaria_sequencia"

# (chave, valor, descrição)
CONFIG_PARAMS: list[tuple[str, str, str]] = [
    ("novo_material_carencia_horas", "24",
     "Aluno matriculado há menos horas que isto não recebe novo_material: para quem chegou, tudo é novo."),
    ("novo_material_expiracao_horas", "72", "Horas até o aviso de material novo perder o sentido."),
    ("sequencia_minimo_min", "10", "Minutos de uso no dia para o dia contar na sequência de estudo."),
    ("sequencia_marcos", "3,7,14,30,60,100",
     "Tamanhos de sequência (em dias, separados por vírgula) que geram aviso. Fora deles, nada."),
    ("sequencia_expiracao_horas", "12", "Horas até o aviso de sequência perder o sentido."),
]

CHAVES_CONFIG = [c for c, _, _ in CONFIG_PARAMS]


def _sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


def config() -> str:
    linhas = [
        f"  ({_sql_texto(chave)}, {_sql_texto(valor)}, {_sql_texto(descricao)})"
        for chave, valor, descricao in CONFIG_PARAMS
    ]
    return (
        "INSERT INTO public.notificacoes_config (chave, valor, descricao) VALUES\n"
        + ",\n".join(linhas)
        + "\nON CONFLICT (chave) DO NOTHING;"
    )


TABELA = """
CREATE TABLE IF NOT EXISTS public.notificacoes_material_pronto (
  aluno_id          uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  topico_id         bigint      NOT NULL REFERENCES public.topicos(id) ON DELETE CASCADE,
  classe_id         bigint      NOT NULL,
  perfil            text        NOT NULL,
  personalizacao_id bigint,
  pendente_id       bigint,
  pronto_em         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, topico_id)
);
CREATE INDEX IF NOT EXISTS notificacoes_material_pronto_pendente_idx
  ON public.notificacoes_material_pronto (pendente_id) WHERE pendente_id IS NOT NULL;
COMMENT ON TABLE public.notificacoes_material_pronto IS
  'Primeira vez em que a personalização de um tópico ficou pronta para o aluno (#149): um aviso de '
  'novo_material por aluno x tópico, nunca a cada regeração. Sem policy de propósito: só o gatilho '
  'trg_conteudo_personalizado_novo_material (SECURITY DEFINER) lê e escreve.';
ALTER TABLE public.notificacoes_material_pronto ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.notificacoes_material_pronto FROM PUBLIC, anon, authenticated;
"""

RETENCAO = """
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('notificacoes_material_pronto', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'primeira vez que o material do topico ficou pronto para o aluno; sai com a conta pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

FUNCOES = r"""
-- novo_material: a personalização do tópico ficou pronta para os alunos do perfil.
CREATE OR REPLACE FUNCTION public.notificacoes_novo_material_produzir()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_perfil   text := replace(lower(btrim(COALESCE(NEW.brainhex_profile_key, ''))), 'socialiser', 'socializer');
  v_carencia integer := GREATEST(0, public.notificacoes_cfg_int('novo_material_carencia_horas', 24));
  v_expira   integer := public.notificacoes_cfg_int('novo_material_expiracao_horas', 72);
  v_topico   text;
  v_aluno    uuid;
  v_novo     boolean;
  v_pend     bigint;
  v_n        integer;
BEGIN
  IF NEW.topico_id IS NULL OR NEW.classe_id IS NULL OR v_perfil = ''
     OR NEW.status IS NULL OR NEW.status = 'processando_midias' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- Turma retida pelo estudo (#13): o aluno não vê o material, e o aviso mentiria.
    IF public.estudo_personalizacao_retida(NEW.classe_id) THEN
      RETURN NULL;
    END IF;

    -- Pronto para o perfil: algo pronto, nada gerando na mesma camada (base ou a do aluno) e nenhum
    -- alvo de outro conteúdo do tópico esperando num job ativo. Assim o tópico avisa uma vez, no fim.
    IF NOT EXISTS (
         SELECT 1 FROM conteudo_personalizado cp
          WHERE cp.classe_id = NEW.classe_id AND cp.topico_id = NEW.topico_id
            AND cp.aluno_id IS NOT DISTINCT FROM NEW.aluno_id
            AND replace(lower(btrim(cp.brainhex_profile_key)), 'socialiser', 'socializer') = v_perfil
            AND cp.status = 'pronto'
       )
       OR EXISTS (
         SELECT 1 FROM conteudo_personalizado cp
          WHERE cp.classe_id = NEW.classe_id AND cp.topico_id = NEW.topico_id
            AND cp.aluno_id IS NOT DISTINCT FROM NEW.aluno_id
            AND replace(lower(btrim(cp.brainhex_profile_key)), 'socialiser', 'socializer') = v_perfil
            AND cp.status = 'processando_midias'
       )
       OR EXISTS (
         SELECT 1
           FROM personalizacao_job_targets t
           JOIN personalizacao_jobs j ON j.id = t.job_id
          WHERE j.classe_id = NEW.classe_id
            AND j.status IN ('pending', 'processing')
            AND t.topico_id = NEW.topico_id
            AND t.status IN ('pending', 'processing')
            AND t.conteudo_id IS DISTINCT FROM NEW.conteudo_id
            AND t.aluno_id IS NOT DISTINCT FROM NEW.aluno_id
            AND replace(lower(btrim(COALESCE(t.brainhex_profile_key, v_perfil))), 'socialiser', 'socializer')
                = v_perfil
       ) THEN
      RETURN NULL;
    END IF;

    SELECT left(COALESCE(NULLIF(btrim(tp.nome), ''), 'Um tópico'), 60) INTO v_topico
      FROM topicos tp WHERE tp.id = NEW.topico_id;
    v_topico := COALESCE(v_topico, 'Um tópico');

    FOR v_aluno IN
      SELECT ca.aluno_id
        FROM classe_aluno ca
       WHERE ca.classe_id = NEW.classe_id
         AND (NEW.aluno_id IS NULL OR ca.aluno_id = NEW.aluno_id)
         AND public.notificacoes_perfil_dominante(ca.aluno_id) = v_perfil
    LOOP
      v_novo := FALSE;
      INSERT INTO notificacoes_material_pronto (aluno_id, topico_id, classe_id, perfil, personalizacao_id)
      VALUES (v_aluno, NEW.topico_id, NEW.classe_id, v_perfil, NEW.id)
      ON CONFLICT (aluno_id, topico_id) DO NOTHING
      RETURNING TRUE INTO v_novo;
      -- Já avisado deste tópico (ou já registrado): regeração não é novidade.
      CONTINUE WHEN NOT COALESCE(v_novo, FALSE);

      -- Matrícula recente: tudo é novo para quem chegou. Fica registrado, sem aviso.
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM classe_aluno ca
         WHERE ca.classe_id = NEW.classe_id AND ca.aluno_id = v_aluno
           AND ca.created_at > now() - make_interval(hours => v_carencia)
      );

      v_pend := public.notificacoes_enfileirar_evento(
        v_aluno, 'novo_material', 'classe:' || NEW.classe_id::text,
        'Material novo para você',
        v_topico || ' ganhou material no seu estilo.',
        jsonb_build_object('classe_id', NEW.classe_id, 'topico_id', NEW.topico_id,
                           'perfil', v_perfil),
        0, v_expira
      );
      CONTINUE WHEN v_pend IS NULL;

      UPDATE notificacoes_material_pronto
         SET pendente_id = v_pend
       WHERE aluno_id = v_aluno AND topico_id = NEW.topico_id;

      -- Outro tópico da turma já esperava neste aviso do dia: o texto passa a contar os tópicos.
      SELECT count(*) INTO v_n FROM notificacoes_material_pronto m WHERE m.pendente_id = v_pend;
      IF v_n > 1 THEN
        UPDATE notificacoes_pendentes p
           SET corpo = v_n::text || ' tópicos ganharam material no seu estilo.',
               contexto = COALESCE(p.contexto, '{}'::jsonb) || jsonb_build_object('topicos', v_n),
               atualizado_em = now()
         WHERE p.id = v_pend AND p.status = 'pendente';
      END IF;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- A geração não pode cair por causa do aviso.
    RAISE WARNING USING MESSAGE =
      'novo_material: aviso nao enfileirado (personalizacao ' || NEW.id::text || '): ' || SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

-- sequencia: o dia de hoje passou a contar e a sequência bateu um marco.
CREATE OR REPLACE FUNCTION public.notificacoes_sequencia_produzir()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_limiar integer := GREATEST(1, public.notificacoes_cfg_int('sequencia_minimo_min', 10)) * 60;
  v_marcos text[] := string_to_array(
    replace(public.notificacoes_cfg_txt('sequencia_marcos', '3,7,14,30,60,100'), ' ', ''), ','
  );
  v_expira integer := public.notificacoes_cfg_int('sequencia_expiracao_horas', 12);
  v_antes  integer := 0;
  v_dias   integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_antes := COALESCE(OLD.tempo_uso_seg, 0);
  END IF;
  -- Só no instante em que o dia passa a contar: uma vez por dia.
  IF NEW.aluno_id IS NULL OR v_antes >= v_limiar OR COALESCE(NEW.tempo_uso_seg, 0) < v_limiar THEN
    RETURN NULL;
  END IF;

  BEGIN
    -- Dias seguidos até hoje: os dias que contam, do mais recente para trás, enquanto não há buraco.
    -- Com `dia` único por aluno, a igualdade vale num prefixo e nunca mais depois do primeiro buraco.
    SELECT count(*) INTO v_dias
      FROM (
        SELECT d.dia, row_number() OVER (ORDER BY d.dia DESC) AS ordem
          FROM aluno_atividade_diaria d
         WHERE d.aluno_id = NEW.aluno_id
           AND d.dia <= NEW.dia
           AND d.tempo_uso_seg >= v_limiar
      ) s
     WHERE s.dia = NEW.dia - (s.ordem - 1)::integer;

    IF v_dias::text = ANY(COALESCE(v_marcos, ARRAY[]::text[])) THEN
      PERFORM public.notificacoes_enfileirar_evento(
        NEW.aluno_id, 'sequencia', 'dias:' || v_dias::text,
        'Sequência de ' || v_dias::text || ' dias',
        'Você estudou ' || v_dias::text || ' dias seguidos. Marco alcançado!',
        jsonb_build_object('dias', v_dias, 'ate', NEW.dia::text),
        0, v_expira
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- O heartbeat do app não pode cair por causa do aviso.
    RAISE WARNING USING MESSAGE =
      'sequencia: aviso nao enfileirado (aluno ' || NEW.aluno_id::text || '): ' || SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_novo_material_produzir() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_sequencia_produzir() FROM PUBLIC, anon, authenticated;
"""

GATILHOS = f"""
DROP TRIGGER IF EXISTS {TRIGGER_MATERIAL} ON public.conteudo_personalizado;
CREATE TRIGGER {TRIGGER_MATERIAL}
  AFTER INSERT OR UPDATE OF status ON public.conteudo_personalizado
  FOR EACH ROW
  WHEN (NEW.topico_id IS NOT NULL AND NEW.status IS DISTINCT FROM 'processando_midias')
  EXECUTE FUNCTION public.notificacoes_novo_material_produzir();

DROP TRIGGER IF EXISTS {TRIGGER_SEQUENCIA} ON public.aluno_atividade_diaria;
CREATE TRIGGER {TRIGGER_SEQUENCIA}
  AFTER INSERT OR UPDATE OF tempo_uso_seg ON public.aluno_atividade_diaria
  FOR EACH ROW
  WHEN (COALESCE(NEW.tempo_uso_seg, 0) > 0)
  EXECUTE FUNCTION public.notificacoes_sequencia_produzir();
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(config())
    op.execute(TABELA)
    op.execute(RETENCAO)
    op.execute(FUNCOES)
    op.execute(GATILHOS)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute(f"DROP TRIGGER IF EXISTS {TRIGGER_SEQUENCIA} ON public.aluno_atividade_diaria")
    op.execute(f"DROP TRIGGER IF EXISTS {TRIGGER_MATERIAL} ON public.conteudo_personalizado")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_sequencia_produzir()")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_novo_material_produzir()")
    op.execute("DROP TABLE IF EXISTS public.notificacoes_material_pronto")
    op.execute("DELETE FROM public.retencao_politica WHERE tabela IN ('notificacoes_material_pronto')")
    chaves = ", ".join(_sql_texto(c) for c in CHAVES_CONFIG)
    op.execute(f"DELETE FROM public.notificacoes_config WHERE chave IN ({chaves})")
    op.execute(RELOAD)
