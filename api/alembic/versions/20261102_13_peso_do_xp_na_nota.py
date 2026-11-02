"""Peso do XP na nota final, configurável pelo professor por turma (#143)

## Por quê

Terceiro item do aceite da #143. O estudo de base (O'Donovan et al., §5.3.1) dava ao XP final 2,9%
da nota da disciplina: pesado o bastante para significar algo, leve o bastante para não coagir. O
número do piloto é do professor, então fica numa coluna da turma, e o padrão 0 não muda nenhuma nota.

## A conta (decisão de 02/11, Geisbelly)

- **Meta de XP da turma.** `nota_xp = 10 × min(XP, meta) ÷ meta`. A nota de um aluno depende só do
  XP dele, não do líder da turma, e um evento novo recalcula só a matrícula de quem o ganhou.
- **O XP só soma.** `nota_final = max(notaMedia, (1 − peso) × notaMedia + peso × nota_xp)`. Quem tem
  pouco XP fica com a nota das atividades.
- **Sem nota, sem nota final.** `notaMedia` NULL (nada avaliado) dá `nota_final` NULL: XP sozinho não
  vira nota.
- XP é o da matrícula: a soma de `eventos_aluno.valor` na turma, a mesma conta do rank, do CSV
  (`professor_notas_da_turma`) e das faixas (`aluno_faixa_xp`). Negativo conta 0.

## Onde fica

- `classe.xp_peso_nota_pct` (0 a 50, padrão 0) e `classe.xp_meta_nota` (padrão 1000, a casa de uma
  turma inteira segundo a calibragem das faixas, `20261102_10`). O professor edita os dois no console
  pela policy de posse da turma; o CHECK limita o valor.
- `classe_aluno.nota_final`: coluna nova. **`"notaMedia"` não muda de sentido**: continua sendo só o
  desempenho nas atividades, e é ela que o risco, a distribuição e o modelo de evasão leem. Misturar
  XP ali contaria o engajamento duas vezes no modelo.

## Quem grava

Só o banco, como a nota média:
- `trg_classe_aluno_z_nota_final` (BEFORE, depois da guarda `trg_classe_aluno_nota_pelo_banco` pela
  ordem alfabética — por isso o `z`) refaz `nota_final` sempre que `"notaMedia"` ou a própria
  `nota_final` aparecem no INSERT/UPDATE. O valor do cliente nunca sobrevive: é recalculado.
- `trg_eventos_aluno_nota_final` (AFTER, em `eventos_aluno`): XP novo, corrigido ou apagado recalcula
  a matrícula, só quando a turma tem peso.
- `trg_classe_nota_final` (AFTER, em `classe`): mudar o peso ou a meta recalcula a turma inteira.

As funções que escrevem são `SECURITY DEFINER`: o professor que muda o peso não tem UPDATE na
matrícula dos alunos, e o aluno que ganha XP não lê o XP resolvido por tópico.

`professor_notas_da_turma` (CSV, #146) ganha a coluna `nota_final`. Mudar o tipo de retorno exige
`DROP` + `CREATE`; o GRANT é refeito igual.

Revision ID: 20261102_13
Revises: 20261102_12
Create Date: 2026-11-02
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261102_13"
down_revision = "20261102_12"
branch_labels = None
depends_on = None

PESO_MAXIMO = 50
META_PADRAO = 1000

COLUNAS = f"""
ALTER TABLE public.classe
  ADD COLUMN IF NOT EXISTS xp_peso_nota_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xp_meta_nota integer NOT NULL DEFAULT {META_PADRAO};

ALTER TABLE public.classe DROP CONSTRAINT IF EXISTS classe_xp_peso_nota_pct_check;
ALTER TABLE public.classe ADD CONSTRAINT classe_xp_peso_nota_pct_check
  CHECK (xp_peso_nota_pct >= 0 AND xp_peso_nota_pct <= {PESO_MAXIMO});
ALTER TABLE public.classe DROP CONSTRAINT IF EXISTS classe_xp_meta_nota_check;
ALTER TABLE public.classe ADD CONSTRAINT classe_xp_meta_nota_check CHECK (xp_meta_nota > 0);

COMMENT ON COLUMN public.classe.xp_peso_nota_pct IS
  'Peso do XP na nota final, em pontos percentuais (0 a {PESO_MAXIMO}). 0 = nota final igual à nota média. #143';
COMMENT ON COLUMN public.classe.xp_meta_nota IS
  'XP que vale nota 10 na parte de XP da nota final. #143';

ALTER TABLE public.classe_aluno ADD COLUMN IF NOT EXISTS nota_final numeric;
COMMENT ON COLUMN public.classe_aluno.nota_final IS
  'Nota com o peso do XP da turma (só soma). Gravada só pelo banco; notaMedia segue sem XP. #143';
"""

FUNCOES = r"""
CREATE OR REPLACE FUNCTION public.fn_nota_final(p_nota numeric, p_xp numeric, p_peso_pct numeric, p_meta integer)
 RETURNS numeric
 LANGUAGE sql
 IMMUTABLE
AS $fn$
  -- O XP só soma (decisão de 02/11): nunca abaixo da nota das atividades.
  SELECT CASE
           WHEN p_nota IS NULL THEN NULL
           WHEN COALESCE(p_peso_pct, 0) <= 0 OR COALESCE(p_meta, 0) <= 0 THEN p_nota
           ELSE GREATEST(
                  p_nota,
                  round((1 - p_peso_pct / 100) * p_nota
                        + (p_peso_pct / 100) * 10 * LEAST(GREATEST(COALESCE(p_xp, 0), 0), p_meta) / p_meta, 2))
         END
$fn$;

CREATE OR REPLACE FUNCTION public.fn_xp_da_matricula(p_aluno uuid, p_classe bigint)
 RETURNS numeric
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
  -- A mesma conta do rank, do CSV e de `aluno_faixa_xp`, sem janela de período.
  SELECT GREATEST(COALESCE(sum(ea.valor), 0), 0)
    FROM public.eventos_aluno ea
   WHERE ea.aluno_id = p_aluno
     AND COALESCE(ea.classe_id, public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia)) = p_classe
$fn$;

CREATE OR REPLACE FUNCTION public.fn_nota_final_da_matricula(p_aluno uuid, p_classe bigint, p_nota numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_peso numeric;
  v_meta integer;
BEGIN
  IF p_nota IS NULL THEN RETURN NULL; END IF;
  SELECT c.xp_peso_nota_pct, c.xp_meta_nota INTO v_peso, v_meta FROM public.classe c WHERE c.id = p_classe;
  -- Sem peso não soma XP nenhum: a turma padrão não paga a leitura de eventos_aluno.
  IF COALESCE(v_peso, 0) <= 0 THEN RETURN p_nota; END IF;
  RETURN public.fn_nota_final(p_nota, public.fn_xp_da_matricula(p_aluno, p_classe), v_peso, v_meta);
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_xp_da_matricula(uuid, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_nota_final_da_matricula(uuid, bigint, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_xp_da_matricula(uuid, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_nota_final_da_matricula(uuid, bigint, numeric) TO service_role;

-- Matrícula: a nota final é refeita a cada gravação de nota (ou tentativa de gravar a nota final).
CREATE OR REPLACE FUNCTION public.trg_classe_aluno_nota_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  NEW.nota_final := public.fn_nota_final_da_matricula(NEW.aluno_id, NEW.classe_id, NEW."notaMedia");
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_classe_aluno_z_nota_final ON public.classe_aluno;
CREATE TRIGGER trg_classe_aluno_z_nota_final
  BEFORE INSERT OR UPDATE OF "notaMedia", nota_final, aluno_id, classe_id ON public.classe_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_classe_aluno_nota_final();

CREATE OR REPLACE FUNCTION public.fn_recalcular_nota_final(p_aluno uuid, p_classe bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN RETURN; END IF;
  -- O gatilho BEFORE refaz a conta; o WHERE só evita gravar a linha quando nada mudou.
  UPDATE public.classe_aluno ca SET nota_final = NULL
   WHERE ca.aluno_id = p_aluno AND ca.classe_id = p_classe
     AND ca.nota_final IS DISTINCT FROM public.fn_nota_final_da_matricula(ca.aluno_id, ca.classe_id, ca."notaMedia");
END;
$fn$;

REVOKE ALL ON FUNCTION public.fn_recalcular_nota_final(uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recalcular_nota_final(uuid, bigint) TO service_role;

-- XP: evento novo, corrigido ou apagado recalcula a matrícula, se a turma tiver peso.
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_nota_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_novo bigint;
  v_velho bigint;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_novo := COALESCE(NEW.classe_id, public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia));
    IF EXISTS (SELECT 1 FROM public.classe c WHERE c.id = v_novo AND c.xp_peso_nota_pct > 0) THEN
      PERFORM public.fn_recalcular_nota_final(NEW.aluno_id, v_novo);
    END IF;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_velho := COALESCE(OLD.classe_id, public.fn_eventos_aluno_resolve_classe_id(OLD.tipo, OLD.referencia));
    IF (TG_OP = 'DELETE' OR OLD.aluno_id IS DISTINCT FROM NEW.aluno_id OR v_velho IS DISTINCT FROM v_novo)
       AND EXISTS (SELECT 1 FROM public.classe c WHERE c.id = v_velho AND c.xp_peso_nota_pct > 0) THEN
      PERFORM public.fn_recalcular_nota_final(OLD.aluno_id, v_velho);
    END IF;
  END IF;
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_eventos_aluno_nota_final ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_nota_final
  AFTER INSERT OR DELETE OR UPDATE OF valor, aluno_id, classe_id, tipo, referencia ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.trg_eventos_aluno_nota_final();

-- Turma: mudar o peso ou a meta recalcula todas as matrículas dela.
CREATE OR REPLACE FUNCTION public.trg_classe_nota_final()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  UPDATE public.classe_aluno ca SET nota_final = NULL
   WHERE ca.classe_id = NEW.id
     AND ca.nota_final IS DISTINCT FROM public.fn_nota_final_da_matricula(ca.aluno_id, ca.classe_id, ca."notaMedia");
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_classe_nota_final ON public.classe;
CREATE TRIGGER trg_classe_nota_final
  AFTER UPDATE OF xp_peso_nota_pct, xp_meta_nota ON public.classe
  FOR EACH ROW
  WHEN (OLD.xp_peso_nota_pct IS DISTINCT FROM NEW.xp_peso_nota_pct
        OR OLD.xp_meta_nota IS DISTINCT FROM NEW.xp_meta_nota)
  EXECUTE FUNCTION public.trg_classe_nota_final();
"""

# Com peso 0 em todas as turmas, a nota final de hoje é a nota média de hoje.
PREENCHE = """
UPDATE public.classe_aluno SET nota_final = NULL WHERE nota_final IS DISTINCT FROM "notaMedia";
"""

NOTAS_DA_TURMA = r"""
DROP FUNCTION IF EXISTS public.professor_notas_da_turma(bigint);
CREATE FUNCTION public.professor_notas_da_turma(p_classe_id bigint)
RETURNS TABLE (
  aluno_id uuid,
  nome text,
  email text,
  xp numeric,
  nota_media numeric,
  nota_final numeric,
  progresso_pct numeric,
  atividades_avaliadas integer,
  pontos_obtidos numeric,
  pontos_maximos numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
#variable_conflict use_column
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_classes_do_professor() AS minha(id) WHERE minha.id = p_classe_id
  ) THEN
    RAISE EXCEPTION 'turma_nao_encontrada_ou_sem_permissao' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH matriculas AS (
    SELECT ca.aluno_id, ca."notaMedia" AS nota_media, ca.nota_final, ca."porcentagemConcluida" AS progresso
      FROM public.classe_aluno ca
     WHERE ca.classe_id = p_classe_id
  ), xp AS (
    SELECT ea.aluno_id, sum(ea.valor) AS total
      FROM public.eventos_aluno ea
     WHERE ea.aluno_id IN (SELECT m.aluno_id FROM matriculas m)
       AND COALESCE(ea.classe_id, public.fn_eventos_aluno_resolve_classe_id(ea.tipo, ea.referencia)) = p_classe_id
     GROUP BY ea.aluno_id
  ), avaliadas AS (
    SELECT aa.aluno_id,
           count(*)::integer AS quantas,
           sum(aa.pontuacao_obtida) AS obtidos,
           sum(aa.pontuacao_maxima) AS maximos
      FROM public.atividade_aluno aa
      JOIN public.atividades a ON a.id = aa.atividade_id
      JOIN public.topicos t ON t.id = a.topico_id
     WHERE t.classe_id = p_classe_id
       AND aa.pontuacao_obtida IS NOT NULL
       AND aa.aluno_id IN (SELECT m.aluno_id FROM matriculas m)
     GROUP BY aa.aluno_id
  )
  SELECT m.aluno_id,
         COALESCE(NULLIF(btrim(al.nome), ''), 'Aluno'),
         al.email,
         COALESCE(x.total, 0),
         m.nota_media,
         m.nota_final,
         m.progresso,
         COALESCE(av.quantas, 0),
         av.obtidos,
         av.maximos
    FROM matriculas m
    LEFT JOIN public.alunos al ON al.id = m.aluno_id
    LEFT JOIN xp x ON x.aluno_id = m.aluno_id
    LEFT JOIN avaliadas av ON av.aluno_id = m.aluno_id
   ORDER BY lower(COALESCE(al.nome, '')), m.aluno_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.professor_notas_da_turma(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professor_notas_da_turma(bigint) TO authenticated, service_role;
"""


def _notas_da_turma_anterior() -> str:
    caminho = Path(__file__).with_name("20261101_06_notas_da_turma_para_exportar.py")
    spec = importlib.util.spec_from_file_location("notas_da_turma_20261101_06", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return "DROP FUNCTION IF EXISTS public.professor_notas_da_turma(bigint);\n" + modulo.FUNCAO


DESFAZ = """
DROP TRIGGER IF EXISTS trg_classe_nota_final ON public.classe;
DROP TRIGGER IF EXISTS trg_eventos_aluno_nota_final ON public.eventos_aluno;
DROP TRIGGER IF EXISTS trg_classe_aluno_z_nota_final ON public.classe_aluno;
DROP FUNCTION IF EXISTS public.trg_classe_nota_final();
DROP FUNCTION IF EXISTS public.trg_eventos_aluno_nota_final();
DROP FUNCTION IF EXISTS public.trg_classe_aluno_nota_final();
DROP FUNCTION IF EXISTS public.fn_recalcular_nota_final(uuid, bigint);
DROP FUNCTION IF EXISTS public.fn_nota_final_da_matricula(uuid, bigint, numeric);
DROP FUNCTION IF EXISTS public.fn_xp_da_matricula(uuid, bigint);
DROP FUNCTION IF EXISTS public.fn_nota_final(numeric, numeric, numeric, integer);
ALTER TABLE public.classe_aluno DROP COLUMN IF EXISTS nota_final;
ALTER TABLE public.classe DROP CONSTRAINT IF EXISTS classe_xp_meta_nota_check;
ALTER TABLE public.classe DROP CONSTRAINT IF EXISTS classe_xp_peso_nota_pct_check;
ALTER TABLE public.classe DROP COLUMN IF EXISTS xp_meta_nota;
ALTER TABLE public.classe DROP COLUMN IF EXISTS xp_peso_nota_pct;
"""


def upgrade() -> None:
    op.execute(COLUNAS)
    op.execute(FUNCOES)
    op.execute(PREENCHE)
    op.execute(NOTAS_DA_TURMA)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(_notas_da_turma_anterior())
    op.execute(DESFAZ)
    op.execute("NOTIFY pgrst, 'reload schema'")
