"""progresso do topico e da classe recalculado no BANCO, por trigger

O progresso era calculado no cliente (`Topico.calcularPercentual()` no mobile) e
gravado de volta. Dois problemas, e o segundo e o grave:

1. o calculo do cliente conhece apenas `conteudos`/`atividades` da estrutura da
   classe -- o material PERSONALIZADO (que vive em
   `personalizacao_item_progresso`) ficava de fora. Terminando os itens do
   professor, o topico era gravado como 'concluido' com os passos personalizados
   intocados;

2. quem grava o progresso e quem le sao o mesmo cliente. Nada garante que a
   linha em `topico_aluno` reflita as linhas de item que existem no banco -- se o
   app fecha, perde rede ou simplesmente nao roda aquele trecho, o progresso
   fica parado mesmo com os itens marcados.

Progresso e LOGISTICA, nao IA: o lugar dele e junto do dado. Aqui ele passa a ser
derivado por trigger a partir das tabelas de item, do jeito que o projeto ja faz
com `provisionar_estrutura_aluno_classe` e `trg_eventos_aluno_after_ins`.

O que a funcao NAO faz, de proposito: nao mexe em `tempo_gasto_min`. O tempo e
acumulado incrementalmente pelo app (cada flush soma), e recalcular a partir dos
itens ou dobraria a conta ou perderia o que ja estava la. Progresso e derivavel;
tempo e um contador.

`classe_aluno` existe em dois dialetos de coluna neste projeto (camelCase e
minusculas) -- os repositorios Python ja lidam com isso em tempo de execucao. A
funcao detecta qual esta presente e monta o UPDATE por SQL dinamico, em vez de
assumir um dos dois e falhar em silencio no outro.

Revision ID: 20260826_02
Revises: 20260826_01
Create Date: 2026-08-26
"""

import sqlalchemy as sa

from alembic import op

revision = "20260826_02"
down_revision = "20260826_01"
branch_labels = None
depends_on = None


FUNCAO_TOPICO = """
CREATE OR REPLACE FUNCTION trailup_recalcular_topico_aluno(
  p_aluno uuid,
  p_topico bigint
) RETURNS void AS $$
DECLARE
  v_total    integer := 0;
  v_feitos   integer := 0;
  v_pct      numeric := 0;
  v_status   text;
BEGIN
  IF p_aluno IS NULL OR p_topico IS NULL THEN
    RETURN;
  END IF;

  -- Conteudo do professor
  SELECT COUNT(*),
         COUNT(*) FILTER (
           WHERE position('concl' in lower(coalesce(ca.status, ''))) > 0
              OR coalesce(ca.percentual_concluido, 0) >= 100
         )
    INTO v_total, v_feitos
  FROM conteudos c
  LEFT JOIN conteudo_aluno ca
         ON ca.conteudo_id = c.id AND ca.aluno_id = p_aluno
  WHERE c.topico_id = p_topico;

  -- Atividades do professor
  SELECT v_total + COUNT(*),
         v_feitos + COUNT(*) FILTER (
           WHERE position('concl' in lower(coalesce(aa.status, ''))) > 0
              OR coalesce(aa.percentual_concluido, 0) >= 100
         )
    INTO v_total, v_feitos
  FROM atividades a
  LEFT JOIN atividade_aluno aa
         ON aa.atividade_id = a.id AND aa.aluno_id = p_aluno
  WHERE a.topico_id = p_topico;

  -- Material personalizado. Chave que comeca com `slide:` fica FORA: sao
  -- interacoes dentro da apresentacao (quiz, checklist), nao etapas do
  -- percurso -- inclui-las faria o progresso depender de quantos quizzes o deck
  -- gerou.
  --
  -- Sem LIKE de proposito: sa.text() duplica o caractere por-cento pro
  -- paramstyle do driver, e sem parametros na execucao ele chega duplicado ao
  -- Postgres -- o padrao passaria a casar um por-cento literal e o filtro
  -- morreria em silencio. left() e position() nao tem esse problema.
  SELECT v_total + COUNT(*),
         v_feitos + COUNT(*) FILTER (
           WHERE position('concl' in lower(coalesce(pip.status, ''))) > 0
              OR coalesce(pip.percentual_concluido, 0) >= 100
         )
    INTO v_total, v_feitos
  FROM personalizacao_item_progresso pip
  WHERE pip.aluno_id = p_aluno
    AND pip.topico_id = p_topico
    AND left(coalesce(pip.item_key, ''), 6) <> 'slide:';

  IF v_total > 0 THEN
    v_pct := round((v_feitos::numeric / v_total::numeric) * 100, 2);
  ELSE
    v_pct := 0;
  END IF;

  v_pct := GREATEST(0, LEAST(100, v_pct));

  IF v_pct >= 100 THEN
    v_status := 'concluido';
  ELSIF v_pct > 0 THEN
    v_status := 'em andamento';
  ELSE
    v_status := 'nao iniciado';
  END IF;

  -- Nao toca em tempo_gasto_min: e contador incremental do app, nao valor
  -- derivavel destas tabelas.
  INSERT INTO topico_aluno (aluno_id, topico_id, percentual_concluido, status, updated_at)
  VALUES (p_aluno, p_topico, v_pct, v_status, now())
  ON CONFLICT (aluno_id, topico_id) DO UPDATE
    SET percentual_concluido = EXCLUDED.percentual_concluido,
        status = EXCLUDED.status,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;
"""


FUNCAO_CLASSE = """
CREATE OR REPLACE FUNCTION trailup_recalcular_classe_aluno(
  p_aluno uuid,
  p_classe bigint
) RETURNS void AS $$
DECLARE
  v_pct       numeric := 0;
  v_col_pct   text;
  v_col_done  text;
  v_sql       text;
BEGIN
  IF p_aluno IS NULL OR p_classe IS NULL THEN
    RETURN;
  END IF;

  -- Media dos topicos da classe, usando o percentual que a funcao de topico
  -- acabou de derivar.
  SELECT COALESCE(round(AVG(GREATEST(0, LEAST(100, COALESCE(ta.percentual_concluido, 0)))), 2), 0)
    INTO v_pct
  FROM topicos t
  LEFT JOIN topico_aluno ta
         ON ta.topico_id = t.id AND ta.aluno_id = p_aluno
  WHERE t.classe_id = p_classe;

  -- `classe_aluno` existe em dois dialetos neste projeto. Descobrir qual esta
  -- presente evita gravar na coluna errada (ou falhar) no outro ambiente.
  SELECT column_name INTO v_col_pct
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'classe_aluno'
    AND column_name IN ('porcentagemConcluida', 'porcentagemconcluida')
  LIMIT 1;

  IF v_col_pct IS NULL THEN
    RETURN;
  END IF;

  SELECT column_name INTO v_col_done
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'classe_aluno'
    AND column_name IN ('isComplete', 'iscomplete')
  LIMIT 1;

  -- quote_ident em vez de format com placeholder de identificador: aquele
  -- caractere por-cento sofre o mesmo escape do driver e quebraria a citacao.
  -- quote_ident faz a mesma protecao sem por-cento nenhum.
  v_sql := 'UPDATE classe_aluno SET ' || quote_ident(v_col_pct) || ' = $1';
  IF v_col_done IS NOT NULL THEN
    v_sql := v_sql || ', ' || quote_ident(v_col_done) || ' = ($1 >= 100)';
  END IF;
  v_sql := v_sql || ' WHERE aluno_id = $2 AND classe_id = $3';

  EXECUTE v_sql USING v_pct, p_aluno, p_classe;
END;
$$ LANGUAGE plpgsql;
"""


GATILHO = """
CREATE OR REPLACE FUNCTION trailup_progresso_after_item() RETURNS TRIGGER AS $$
DECLARE
  v_aluno  uuid;
  v_topico bigint;
  v_classe bigint;
BEGIN
  v_aluno := COALESCE(NEW.aluno_id, OLD.aluno_id);

  IF TG_TABLE_NAME = 'conteudo_aluno' THEN
    SELECT c.topico_id INTO v_topico
    FROM conteudos c
    WHERE c.id = COALESCE(NEW.conteudo_id, OLD.conteudo_id);
  ELSIF TG_TABLE_NAME = 'atividade_aluno' THEN
    SELECT a.topico_id INTO v_topico
    FROM atividades a
    WHERE a.id = COALESCE(NEW.atividade_id, OLD.atividade_id);
  ELSE
    v_topico := COALESCE(NEW.topico_id, OLD.topico_id);
  END IF;

  IF v_aluno IS NULL OR v_topico IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM trailup_recalcular_topico_aluno(v_aluno, v_topico);

  SELECT t.classe_id INTO v_classe FROM topicos t WHERE t.id = v_topico;
  IF v_classe IS NOT NULL THEN
    PERFORM trailup_recalcular_classe_aluno(v_aluno, v_classe);
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
"""


TABELAS_DE_ITEM = ("conteudo_aluno", "atividade_aluno", "personalizacao_item_progresso")


def upgrade() -> None:
    op.execute(sa.text(FUNCAO_TOPICO))
    op.execute(sa.text(FUNCAO_CLASSE))
    op.execute(sa.text(GATILHO))

    for tabela in TABELAS_DE_ITEM:
        gatilho = f"trg_{tabela}_progresso"
        op.execute(sa.text(f"DROP TRIGGER IF EXISTS {gatilho} ON {tabela}"))
        # AFTER, e por linha: o recalculo le as tabelas de item, entao precisa
        # rodar depois da escrita ter efeito.
        op.execute(
            sa.text(
                f"""
                CREATE TRIGGER {gatilho}
                  AFTER INSERT OR UPDATE OR DELETE ON {tabela}
                  FOR EACH ROW
                  EXECUTE FUNCTION trailup_progresso_after_item()
                """
            )
        )


def downgrade() -> None:
    for tabela in TABELAS_DE_ITEM:
        op.execute(sa.text(f"DROP TRIGGER IF EXISTS trg_{tabela}_progresso ON {tabela}"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS trailup_progresso_after_item()"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS trailup_recalcular_classe_aluno(uuid, bigint)"))
    op.execute(sa.text("DROP FUNCTION IF EXISTS trailup_recalcular_topico_aluno(uuid, bigint)"))
