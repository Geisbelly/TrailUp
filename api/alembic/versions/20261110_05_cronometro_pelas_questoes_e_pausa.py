"""O tempo da tentativa sai das questões, e sair da atividade pausa o relógio

## O problema (relatado em 10/11)

1. **O tempo era o mesmo em toda atividade.** `atividade_iniciar_tentativa` (`20261101_13`) dava
   `cronometro_atividade_padrao_seg` (120 s) a qualquer tentativa cronometrada. Um V/F de uma
   questão e uma atividade de código com cinco questões tinham os mesmos dois minutos.
2. **Sair da atividade não pausava nada.** O relógio do banco é `iniciada_em + limite_seg`. Quem
   saía para reler o conteúdo e voltava encontrava o tempo corrido, e o app, que contava por conta
   própria, recomeçava do zero. As duas contas discordavam.

## O que muda

**O limite é a soma do tempo de cada questão** (`fn_tempo_da_atividade`). Cada questão vale:

- o tempo do tipo dela;
- mais o tempo de ler o enunciado e as alternativas, a `cronometro_leitura_caracteres_por_seg`
  (15 caracteres/s, cerca de 180 palavras por minuto, leitura atenta de quem vai responder).

O tipo da questão vale; sem ele, vale o da atividade (`quiz` = múltipla, `essay` = dissertativa…).
Os tempos por tipo ficam em `app_config` (`cronometro_seg_<tipo>`), para ajustar sem migration:

| tipo | s | por quê |
| --- | --- | --- |
| verdadeiro_falso | 30 | uma decisão binária |
| multipla | 45 | comparar alternativas |
| lacuna | 60 | lembrar e digitar a palavra |
| numerica | 120 | fazer a conta |
| expressao | 150 | montar a expressão |
| dissertativa | 300 | escrever um parágrafo |
| codigo | 600 | escrever e conferir o programa |

Atividade sem questão (missão, entrega) continua com `cronometro_atividade_padrao_seg`. O total é
arredondado para cima em múltiplos de 5 s, e o teto é `cronometro_atividade_maximo_seg` (1 h).
`questoes.dificuldade` está NULL em todas as questões de produção (10/11), então não entra na conta:
um fator sobre um campo que ninguém preenche não mediria nada.

**Pausa.** `atividade_pausar_tentativa` marca `pausada_em`; `atividade_retomar_tentativa` soma a
pausa a `pausado_seg` **e a `limite_seg`**. Estender o limite em vez de mudar a conta do "no tempo"
deixa `atividade_responder_tentativa` intocada: `iniciada_em + limite_seg` já desconta a pausa. A
`20261110_04` (corte do gabarito, em PR) redefine a `responder`, e as duas não colidem.
`iniciada_em` continua sendo o início real; o tempo efetivo é `limite_seg - pausado_seg`, e é isso
que o app mostra.

Pausar e retomar são idempotentes: pausar uma tentativa já pausada, retomar uma que não está
pausada, ou mexer numa já respondida ou sem cronômetro não muda nada e devolve o estado.

**O tempo não vale nota**, só o bônus de XP (decisão de 01/11, #136). Por isso a pausa não tem
teto: o que está em jogo é o bônus, e quem sai da tela para estudar não deve perder o bônus por
isso.

Tentativa já aberta mantém o limite que ganhou; só as novas usam a soma.

Revision ID: 20261110_05
Revises: 20261110_03
Create Date: 2026-11-10
"""

from __future__ import annotations

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261110_05"
down_revision = "20261110_03"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"_m_{caminho.stem}", caminho)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_TENTATIVAS = _modulo("20261101_13_tentativas_com_tempo_do_servidor.py")

_INICIO = "CREATE OR REPLACE FUNCTION public.atividade_iniciar_tentativa"
_FIM = "GRANT EXECUTE ON FUNCTION public.atividade_iniciar_tentativa(bigint) TO authenticated;"


def _trecho(texto: str, inicio: str, fim: str) -> str:
    a = texto.index(inicio)
    return texto[a : texto.index(fim, a) + len(fim)]


INICIAR_ANTES = _trecho(_TENTATIVAS.FUNCOES, _INICIO, _FIM)


def _trocar(texto: str, trocas: list[tuple[str, str]]) -> str:
    for antes, depois in trocas:
        if texto.count(antes) != 1:
            raise RuntimeError(f"trecho esperado uma vez: {antes!r}")
        texto = texto.replace(antes, depois)
    return texto


INICIAR = _trocar(
    INICIAR_ANTES,
    [
        (
            "v_limite := public.fn_cronometro_config('cronometro_atividade_padrao_seg', 120);",
            "-- A soma do tempo de cada questão (20261110_05), não mais o padrão para toda atividade.\n"
            "      v_limite := public.fn_tempo_da_atividade(p_atividade);",
        ),
        (
            "    'iniciada_em', v_tent.iniciada_em,\n",
            "    'iniciada_em', v_tent.iniciada_em,\n"
            "    'pausada_em', v_tent.pausada_em,\n"
            "    'pausado_seg', v_tent.pausado_seg,\n",
        ),
    ],
)

# (tipo, segundos). A chave em app_config é `cronometro_seg_<tipo>`.
TEMPO_POR_TIPO = (
    ("verdadeiro_falso", 30),
    ("multipla", 45),
    ("lacuna", 60),
    ("numerica", 120),
    ("expressao", 150),
    ("dissertativa", 300),
    ("codigo", 600),
)
CHAVES = tuple(f"cronometro_seg_{t}" for t, _ in TEMPO_POR_TIPO) + (
    "cronometro_leitura_caracteres_por_seg",
    "cronometro_atividade_maximo_seg",
)

ESTRUTURA = r"""
ALTER TABLE public.atividade_tentativas
  ADD COLUMN IF NOT EXISTS pausada_em timestamptz,
  ADD COLUMN IF NOT EXISTS pausado_seg integer NOT NULL DEFAULT 0 CHECK (pausado_seg >= 0);
COMMENT ON COLUMN public.atividade_tentativas.pausada_em IS
  'Desde quando o aluno está fora da atividade; NULL = relógio correndo. Ver 20261110_05.';
COMMENT ON COLUMN public.atividade_tentativas.pausado_seg IS
  'Segundos pausados, já somados a limite_seg. Tempo efetivo = limite_seg - pausado_seg. Ver 20261110_05.';
"""

CONFIG = (
    "INSERT INTO public.app_config (chave, valor, descricao, publico) VALUES\n"
    + ",\n".join(
        f"  ('cronometro_seg_{tipo}', '{seg}', 'Segundos por questao do tipo {tipo} no cronometro da atividade. Ver 20261110_05.', false)"
        for tipo, seg in TEMPO_POR_TIPO
    )
    + ",\n  ('cronometro_leitura_caracteres_por_seg', '15',"
    " 'Velocidade de leitura somada ao tempo de cada questao (enunciado e alternativas). Ver 20261110_05.', false)"
    + ",\n  ('cronometro_atividade_maximo_seg', '3600',"
    " 'Teto do cronometro de uma atividade, em segundos. Ver 20261110_05.', false)"
    + "\nON CONFLICT (chave) DO NOTHING;\n"
)

FUNCOES = r"""
-- Tipo canônico da questão para o cronômetro: o da questão, ou o da atividade quando ela não tem.
CREATE OR REPLACE FUNCTION public.fn_tipo_da_questao_no_cronometro(p_tipo_questao text, p_tipo_atividade text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE lower(COALESCE(NULLIF(btrim(p_tipo_questao), ''), NULLIF(btrim(p_tipo_atividade), ''), ''))
    WHEN 'verdadeiro_falso' THEN 'verdadeiro_falso' WHEN 'true_false' THEN 'verdadeiro_falso'
    WHEN 'vf' THEN 'verdadeiro_falso'
    WHEN 'multipla' THEN 'multipla' WHEN 'quiz' THEN 'multipla' WHEN 'multipla_escolha' THEN 'multipla'
    WHEN 'multiple_choice' THEN 'multipla'
    WHEN 'fill_blank' THEN 'lacuna' WHEN 'lacuna' THEN 'lacuna'
    WHEN 'numerica' THEN 'numerica' WHEN 'numeric' THEN 'numerica'
    WHEN 'expressao' THEN 'expressao' WHEN 'expression' THEN 'expressao'
    WHEN 'dissertativa' THEN 'dissertativa' WHEN 'essay' THEN 'dissertativa'
    WHEN 'texto' THEN 'dissertativa' WHEN 'questao' THEN 'dissertativa'
    WHEN 'codigo' THEN 'codigo' WHEN 'code' THEN 'codigo'
    ELSE 'multipla'
  END;
$function$;

-- Segundos de uma tentativa cronometrada: a soma do tempo de cada questão (tipo + leitura).
-- SECURITY DEFINER porque o aluno não lê tudo de `questoes`; só a RPC de início a chama.
CREATE OR REPLACE FUNCTION public.fn_tempo_da_atividade(p_atividade bigint)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_cps integer := greatest(1, public.fn_cronometro_config('cronometro_leitura_caracteres_por_seg', 15));
  v_padrao integer := public.fn_cronometro_config('cronometro_atividade_padrao_seg', 120);
  v_maximo integer := greatest(v_padrao, public.fn_cronometro_config('cronometro_atividade_maximo_seg', 3600));
  v_total integer;
BEGIN
  SELECT sum(
           public.fn_cronometro_config(
             'cronometro_seg_' || public.fn_tipo_da_questao_no_cronometro(q.tipo, a.tipo),
             45)
           + ceil((char_length(COALESCE(q.enunciado, ''))
                   + COALESCE(char_length(q.alternativas::text), 0))::numeric / v_cps)::integer
         )::integer
    INTO v_total
    FROM public.questoes q
    JOIN public.atividades a ON a.id = q.atividade_id
   WHERE q.atividade_id = p_atividade;

  IF v_total IS NULL OR v_total <= 0 THEN
    RETURN v_padrao;  -- sem questão: missão, entrega
  END IF;
  RETURN least(v_maximo, (ceil(v_total / 5.0) * 5)::integer);
END;
$function$;
REVOKE ALL ON FUNCTION public.fn_tempo_da_atividade(bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_tipo_da_questao_no_cronometro(text, text) FROM PUBLIC, anon;

-- O estado do relógio que o app precisa para contar sozinho entre uma chamada e outra.
CREATE OR REPLACE FUNCTION public.fn_relogio_da_tentativa(p_tent public.atividade_tentativas)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object(
    'tentativa_id', p_tent.id,
    'cronometrada', p_tent.cronometrada,
    'limite_seg', p_tent.limite_seg,
    'iniciada_em', p_tent.iniciada_em,
    'pausada_em', p_tent.pausada_em,
    'pausado_seg', p_tent.pausado_seg,
    'respondida', p_tent.respondida_em IS NOT NULL,
    'agora', now()
  );
$function$;
REVOKE ALL ON FUNCTION public.fn_relogio_da_tentativa(public.atividade_tentativas) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.atividade_pausar_tentativa(p_tentativa bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_tent public.atividade_tentativas%ROWTYPE;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_tent FROM public.atividade_tentativas WHERE id = p_tentativa FOR UPDATE;
  IF v_tent.id IS NULL OR v_tent.aluno_id <> v_aluno THEN
    RAISE EXCEPTION 'tentativa_nao_encontrada' USING ERRCODE = '42501';
  END IF;
  IF v_tent.cronometrada AND v_tent.respondida_em IS NULL AND v_tent.pausada_em IS NULL THEN
    UPDATE public.atividade_tentativas SET pausada_em = now() WHERE id = v_tent.id
    RETURNING * INTO v_tent;
  END IF;
  RETURN public.fn_relogio_da_tentativa(v_tent);
END;
$function$;
REVOKE ALL ON FUNCTION public.atividade_pausar_tentativa(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atividade_pausar_tentativa(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.atividade_retomar_tentativa(p_tentativa bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno uuid := auth.uid();
  v_tent public.atividade_tentativas%ROWTYPE;
  v_pausa integer;
BEGIN
  IF v_aluno IS NULL THEN
    RAISE EXCEPTION 'sem_sessao' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_tent FROM public.atividade_tentativas WHERE id = p_tentativa FOR UPDATE;
  IF v_tent.id IS NULL OR v_tent.aluno_id <> v_aluno THEN
    RAISE EXCEPTION 'tentativa_nao_encontrada' USING ERRCODE = '42501';
  END IF;
  IF v_tent.pausada_em IS NOT NULL AND v_tent.respondida_em IS NULL THEN
    -- A pausa estende o limite: `iniciada_em + limite_seg` (o "no tempo" da responder) já a desconta.
    v_pausa := greatest(0, floor(extract(epoch FROM now() - v_tent.pausada_em))::integer);
    UPDATE public.atividade_tentativas
       SET pausada_em = NULL,
           pausado_seg = pausado_seg + v_pausa,
           limite_seg = CASE WHEN limite_seg IS NULL THEN NULL ELSE limite_seg + v_pausa END
     WHERE id = v_tent.id
    RETURNING * INTO v_tent;
  END IF;
  RETURN public.fn_relogio_da_tentativa(v_tent);
END;
$function$;
REVOKE ALL ON FUNCTION public.atividade_retomar_tentativa(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atividade_retomar_tentativa(bigint) TO authenticated;
"""


def upgrade() -> None:
    op.execute(ESTRUTURA)
    op.execute(CONFIG)
    op.execute(FUNCOES)
    op.execute(INICIAR)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(INICIAR_ANTES)
    op.execute("DROP FUNCTION IF EXISTS public.atividade_retomar_tentativa(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.atividade_pausar_tentativa(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_relogio_da_tentativa(public.atividade_tentativas)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_tempo_da_atividade(bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_tipo_da_questao_no_cronometro(text, text)")
    chaves = ", ".join(f"'{c}'" for c in CHAVES)
    op.execute(f"DELETE FROM public.app_config WHERE chave IN ({chaves})")
    op.execute("ALTER TABLE public.atividade_tentativas DROP COLUMN IF EXISTS pausado_seg")
    op.execute("ALTER TABLE public.atividade_tentativas DROP COLUMN IF EXISTS pausada_em")
    op.execute("NOTIFY pgrst, 'reload schema'")
