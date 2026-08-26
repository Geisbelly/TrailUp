"""RLS: posse por tabela — aluno ve o que e dele, professor o que e da classe dele

`20260826_08` tirou o anonimo, mas deixou o predicado `true` para qualquer
AUTENTICADO em ~26 tabelas: um aluno logado ainda enxergava (e apagava) o dado
de outro, e reescrevia o gabarito das questoes de qualquer turma.

Aqui a posse vira predicado. A cadeia ja existe no schema e e limpa:

    professor ─ classe ─┬─ topicos ─┬─ conteudos ─┬─ midias
                        │           │             └─ atividade_conteudos
                        │           └─ atividades ─ questoes
                        ├─ topico_edges / trilha_modelo / ranks
                        └─ classe_aluno ─ aluno

    aluno ─ topico_aluno / conteudo_aluno / atividade_aluno / questao_aluno /
            trilha_aluno / eventos_aluno / conquistas_aluno / aluno_perfil /
            iaDescricao

Segue a convencao que o projeto ja adotou em `conteudo_personalizado` e
`cards_personalizados`: `EXISTS (SELECT 1 FROM classe c WHERE c.id = ... AND
c.professor_id = auth.uid())`.

As funcoes auxiliares sao `SECURITY DEFINER` **de proposito**: uma policy em
`classe_aluno` que consultasse `classe_aluno` entraria em recursao de RLS, e
uma que consultasse `classe` pagaria o custo da policy de `classe` linha a
linha. Rodando como dono, elas leem a tabela cruas e devolvem so o conjunto de
ids — o que a policy precisa, sem recursao.

O aluno CONTINUA lendo o conteudo da classe em que esta matriculado: trilha sem
conteudo nao e trilha. O que ele perde e escrever nesse conteudo, e ler o de
turmas onde nao esta.

Revision ID: 20260826_09
Revises: 20260826_08
Create Date: 2026-08-26
"""

from alembic import op

revision = "20260826_09"
down_revision = "20260826_08"
branch_labels = None
depends_on = None


HELPERS = r"""
-- Classes que EU possuo como professor.
CREATE OR REPLACE FUNCTION public.app_classes_do_professor()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT c.id FROM classe c WHERE c.professor_id = auth.uid()
$$;

-- Classes em que EU estou matriculado como aluno.
CREATE OR REPLACE FUNCTION public.app_classes_do_aluno()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT ca.classe_id FROM classe_aluno ca WHERE ca.aluno_id = auth.uid()
$$;

-- Classes que EU alcanco, por qualquer um dos dois papeis.
CREATE OR REPLACE FUNCTION public.app_minhas_classes()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT public.app_classes_do_professor()
  UNION
  SELECT public.app_classes_do_aluno()
$$;

-- Alunos que EU (professor) posso ver: vinculo direto com acesso, ou
-- matriculados numa classe minha. Mesma regra que
-- `AccessRepository.professor_can_access` ja aplica no Python.
CREATE OR REPLACE FUNCTION public.app_alunos_do_professor()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT pa.aluno_id
    FROM professor_aluno pa
   WHERE pa.professor_id = auth.uid() AND pa.has_acesso
  UNION
  SELECT ca.aluno_id
    FROM classe_aluno ca
    JOIN classe c ON c.id = ca.classe_id
   WHERE c.professor_id = auth.uid()
$$;

-- Colegas de turma. Existe por causa do RANKING: o app mostra nome e posicao
-- dos colegas, entao "so o proprio registro" em `alunos` quebraria a tela.
CREATE OR REPLACE FUNCTION public.app_colegas_de_turma()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT DISTINCT ca.aluno_id
    FROM classe_aluno ca
   WHERE ca.classe_id IN (SELECT ca2.classe_id
                            FROM classe_aluno ca2
                           WHERE ca2.aluno_id = auth.uid())
$$;

-- Posso ver este aluno? (proprio, colega de turma ou meu aluno)
CREATE OR REPLACE FUNCTION public.app_pode_ver_aluno(p_aluno uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT p_aluno = auth.uid()
      OR p_aluno IN (SELECT public.app_alunos_do_professor())
      OR p_aluno IN (SELECT public.app_colegas_de_turma())
$$;

-- Classe do topico / conteudo / atividade / questao, subindo a cadeia.
CREATE OR REPLACE FUNCTION public.app_classe_do_topico(p_topico bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT t.classe_id FROM topicos t WHERE t.id = p_topico
$$;

CREATE OR REPLACE FUNCTION public.app_classe_do_conteudo(p_conteudo bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT t.classe_id FROM conteudos co JOIN topicos t ON t.id = co.topico_id
   WHERE co.id = p_conteudo
$$;

CREATE OR REPLACE FUNCTION public.app_classe_da_atividade(p_atividade bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT t.classe_id FROM atividades a JOIN topicos t ON t.id = a.topico_id
   WHERE a.id = p_atividade
$$;

CREATE OR REPLACE FUNCTION public.app_classe_da_questao(p_questao bigint)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp AS $$
  SELECT t.classe_id
    FROM questoes q
    JOIN atividades a ON a.id = q.atividade_id
    JOIN topicos t ON t.id = a.topico_id
   WHERE q.id = p_questao
$$;
"""


# (tabela, expressao_da_classe) — conteudo do professor. Aluno matriculado le;
# so o professor dono escreve.
CONTEUDO_POR_CLASSE = [
    ("classe", "id"),
    ("topicos", "classe_id"),
    ("topico_edges", "classe_id"),
    ("trilha_modelo", "classe_id"),
    ("ranks", "classe_id"),
    ("conteudos", "public.app_classe_do_topico(topico_id)"),
    ("atividades", "public.app_classe_do_topico(topico_id)"),
    ("questoes", "public.app_classe_da_atividade(atividade_id)"),
    ("atividade_conteudos", "public.app_classe_da_atividade(atividade_id)"),
    ("midias", "public.app_classe_do_conteudo(conteudo_id)"),
]

# Tabelas de dado do aluno: ele le/escreve o proprio; o professor da turma le.
DADO_DO_ALUNO = [
    "eventos_aluno",
    "conquistas_aluno",
    "aluno_perfil",
    "conteudo_aluno",
    "atividade_aluno",
    "questao_aluno",
    "trilha_aluno",
    "iaDescricao",
]

# Referencia sem dono: qualquer autenticado le, ninguem escreve pelo app.
REFERENCIA = ["perfil", "rank_tipo", "conquistas", "modoOperacao"]


def _limpar(tabela: str) -> None:
    """Remove as policies herdadas, que eram `USING (true)`."""
    ident = f'"{tabela}"'
    for nome in (
        "Enable read access for all users",
        "Enable insert for authenticated users only",
        "Policy with table joins",
        "Enable delete for users based on user_id",
    ):
        op.execute(f'DROP POLICY IF EXISTS "{nome}" ON {ident}')
    for sufixo in ("sel", "ins", "upd", "del"):
        op.execute(f'DROP POLICY IF EXISTS {tabela.lower()}_posse_{sufixo} ON {ident}')


def upgrade() -> None:
    op.execute(HELPERS)
    for fn in (
        "public.app_classes_do_professor()",
        "public.app_classes_do_aluno()",
        "public.app_minhas_classes()",
        "public.app_alunos_do_professor()",
        "public.app_colegas_de_turma()",
        "public.app_pode_ver_aluno(uuid)",
        "public.app_classe_do_topico(bigint)",
        "public.app_classe_do_conteudo(bigint)",
        "public.app_classe_da_atividade(bigint)",
        "public.app_classe_da_questao(bigint)",
    ):
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC, anon")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO authenticated")

    # ------------------------------------------------------------------
    # Conteudo do professor
    # ------------------------------------------------------------------
    for tabela, classe_expr in CONTEUDO_POR_CLASSE:
        ident = f'"{tabela}"'
        low = tabela.lower()
        _limpar(tabela)
        # Le quem e dono OU quem esta matriculado: uma trilha sem conteudo nao
        # e uma trilha.
        op.execute(
            f"""
            CREATE POLICY {low}_posse_sel ON {ident}
              FOR SELECT TO authenticated
              USING ({classe_expr} IN (SELECT public.app_minhas_classes()))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {low}_posse_ins ON {ident}
              FOR INSERT TO authenticated
              WITH CHECK ({classe_expr} IN (SELECT public.app_classes_do_professor()))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {low}_posse_upd ON {ident}
              FOR UPDATE TO authenticated
              USING ({classe_expr} IN (SELECT public.app_classes_do_professor()))
              WITH CHECK ({classe_expr} IN (SELECT public.app_classes_do_professor()))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {low}_posse_del ON {ident}
              FOR DELETE TO authenticated
              USING ({classe_expr} IN (SELECT public.app_classes_do_professor()))
            """
        )

    # `classe` e criada pelo professor, e nesse instante ela ainda nao esta na
    # lista de classes dele — o INSERT precisa olhar para `professor_id`.
    op.execute("DROP POLICY IF EXISTS classe_posse_ins ON classe")
    op.execute(
        """
        CREATE POLICY classe_posse_ins ON classe
          FOR INSERT TO authenticated
          WITH CHECK (professor_id = auth.uid())
        """
    )

    # ------------------------------------------------------------------
    # Dado do aluno
    # ------------------------------------------------------------------
    for tabela in DADO_DO_ALUNO:
        ident = f'"{tabela}"'
        low = tabela.lower()
        _limpar(tabela)
        op.execute(
            f"""
            CREATE POLICY {low}_posse_sel ON {ident}
              FOR SELECT TO authenticated
              USING (aluno_id = auth.uid()
                     OR aluno_id IN (SELECT public.app_alunos_do_professor()))
            """
        )
        op.execute(
            f"""
            CREATE POLICY {low}_posse_ins ON {ident}
              FOR INSERT TO authenticated
              WITH CHECK (aluno_id = auth.uid())
            """
        )
        op.execute(
            f"""
            CREATE POLICY {low}_posse_upd ON {ident}
              FOR UPDATE TO authenticated
              USING (aluno_id = auth.uid()) WITH CHECK (aluno_id = auth.uid())
            """
        )
        # Sem policy de DELETE: nada no app apaga progresso, conquista ou
        # evento. Apagar `eventos_aluno` zeraria o ranking de um aluno, e era
        # exatamente o que a policy aberta permitia a qualquer um.

    # ------------------------------------------------------------------
    # Matricula
    # ------------------------------------------------------------------
    _limpar("classe_aluno")
    op.execute(
        """
        CREATE POLICY classe_aluno_posse_sel ON classe_aluno
          FOR SELECT TO authenticated
          USING (aluno_id = auth.uid()
                 OR classe_id IN (SELECT public.app_classes_do_professor())
                 -- Colegas de turma: o ranking lista quem esta na mesma classe.
                 OR classe_id IN (SELECT public.app_classes_do_aluno()))
        """
    )
    op.execute(
        """
        CREATE POLICY classe_aluno_posse_ins ON classe_aluno
          FOR INSERT TO authenticated
          WITH CHECK (aluno_id = auth.uid()
                      OR classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )
    op.execute(
        """
        CREATE POLICY classe_aluno_posse_upd ON classe_aluno
          FOR UPDATE TO authenticated
          USING (aluno_id = auth.uid()
                 OR classe_id IN (SELECT public.app_classes_do_professor()))
          WITH CHECK (aluno_id = auth.uid()
                      OR classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )
    op.execute(
        """
        CREATE POLICY classe_aluno_posse_del ON classe_aluno
          FOR DELETE TO authenticated
          USING (classe_id IN (SELECT public.app_classes_do_professor()))
        """
    )

    # ------------------------------------------------------------------
    # alunos — PII
    # ------------------------------------------------------------------
    _limpar("alunos")
    op.execute('DROP POLICY IF EXISTS "Alunos podem ver o próprio registro" ON alunos')
    op.execute('DROP POLICY IF EXISTS "Alunos podem atualizar o próprio registro" ON alunos')
    op.execute(
        """
        CREATE POLICY alunos_posse_sel ON alunos
          FOR SELECT TO authenticated
          USING (public.app_pode_ver_aluno(id))
        """
    )
    op.execute(
        """
        CREATE POLICY alunos_posse_ins ON alunos
          FOR INSERT TO authenticated WITH CHECK (id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY alunos_posse_upd ON alunos
          FOR UPDATE TO authenticated
          USING (id = auth.uid()) WITH CHECK (id = auth.uid())
        """
    )

    # ------------------------------------------------------------------
    # professor_aluno — era escalada de privilegio pura
    # ------------------------------------------------------------------
    _limpar("professor_aluno")
    op.execute(
        """
        CREATE POLICY professor_aluno_posse_sel ON professor_aluno
          FOR SELECT TO authenticated
          USING (professor_id = auth.uid() OR aluno_id = auth.uid())
        """
    )
    # Escrita SO do professor do vinculo. Com a policy aberta, qualquer um se
    # concedia acesso a qualquer aluno — ou apagava o acesso de um professor.
    op.execute(
        """
        CREATE POLICY professor_aluno_posse_ins ON professor_aluno
          FOR INSERT TO authenticated WITH CHECK (professor_id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY professor_aluno_posse_upd ON professor_aluno
          FOR UPDATE TO authenticated
          USING (professor_id = auth.uid()) WITH CHECK (professor_id = auth.uid())
        """
    )
    op.execute(
        """
        CREATE POLICY professor_aluno_posse_del ON professor_aluno
          FOR DELETE TO authenticated USING (professor_id = auth.uid())
        """
    )

    # ------------------------------------------------------------------
    # materia — sem dono no schema, mas criada pelo console
    # ------------------------------------------------------------------
    _limpar("materia")
    op.execute(
        """
        CREATE POLICY materia_posse_sel ON materia
          FOR SELECT TO authenticated USING (true)
        """
    )
    # Qualquer professor cria materia (elas sao compartilhadas entre turmas),
    # mas aluno nao. `EXISTS` em `professor` e barato: 3 linhas.
    op.execute(
        """
        CREATE POLICY materia_posse_ins ON materia
          FOR INSERT TO authenticated
          WITH CHECK (EXISTS (SELECT 1 FROM professor p WHERE p.id = auth.uid()))
        """
    )
    op.execute(
        """
        CREATE POLICY materia_posse_upd ON materia
          FOR UPDATE TO authenticated
          USING (EXISTS (SELECT 1 FROM professor p WHERE p.id = auth.uid()))
          WITH CHECK (EXISTS (SELECT 1 FROM professor p WHERE p.id = auth.uid()))
        """
    )

    # ------------------------------------------------------------------
    # Referencia: leitura livre para autenticado, escrita so pelo backend
    # ------------------------------------------------------------------
    for tabela in REFERENCIA:
        ident = f'"{tabela}"'
        low = tabela.lower()
        _limpar(tabela)
        op.execute(
            f"""
            CREATE POLICY {low}_posse_sel ON {ident}
              FOR SELECT TO authenticated USING (true)
            """
        )
        # Sem INSERT/UPDATE/DELETE: os 7 perfis BrainHex, os tipos de rank e o
        # catalogo de conquistas sao dados de sistema. O app nao os edita, e a
        # API escreve como dona da tabela (RLS nao se aplica).


def downgrade() -> None:
    tabelas = (
        [t for t, _ in CONTEUDO_POR_CLASSE]
        + DADO_DO_ALUNO
        + REFERENCIA
        + ["classe_aluno", "alunos", "professor_aluno", "materia"]
    )
    for tabela in tabelas:
        ident = f'"{tabela}"'
        for sufixo in ("sel", "ins", "upd", "del"):
            op.execute(f"DROP POLICY IF EXISTS {tabela.lower()}_posse_{sufixo} ON {ident}")

    for fn in (
        "public.app_classe_da_questao(bigint)",
        "public.app_classe_da_atividade(bigint)",
        "public.app_classe_do_conteudo(bigint)",
        "public.app_classe_do_topico(bigint)",
        "public.app_pode_ver_aluno(uuid)",
        "public.app_colegas_de_turma()",
        "public.app_alunos_do_professor()",
        "public.app_minhas_classes()",
        "public.app_classes_do_aluno()",
        "public.app_classes_do_professor()",
    ):
        op.execute(f"DROP FUNCTION IF EXISTS {fn}")

    # As policies `USING (true)` NAO sao recriadas: elas eram o buraco.
    # Reverter isto deixa as tabelas sem policy nenhuma (nega tudo para o app),
    # que e o lado seguro de errar.
