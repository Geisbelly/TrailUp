"""Contato do app: o "Nome" do e-mail é o nome cadastrado, não o e-mail

O pedido de exclusão de conta do app (`perfil/excluir.tsx`) manda `p_nome` = e-mail, e o e-mail
chegava com "Nome: fulano@gmail.com". O app foi corrigido junto, mas o 1.0.6 já instalado continua
mandando o e-mail, então a correção que vale para ele é aqui.

`fn_enviar_contato` exige sessão: quem pede é a conta de `auth.uid()`. Quando `p_nome` vem vazio ou
com cara de e-mail (tem `@`), vale o nome cadastrado em `alunos` ou, para professor, em `professor`.
Sem nome cadastrado, fica o que veio. Nome digitado pelo usuário (sem `@`) passa como está.

Só o corpo da função muda: mesma assinatura, mesmos GRANT/REVOKE, nenhuma tabela ou policy.

Revision ID: 20261103_08
Revises: 20261103_07
Create Date: 2026-11-03
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261103_08"
down_revision = "20261103_07"
branch_labels = None
depends_on = None


def _modulo(nome_arquivo: str):
    caminho = Path(__file__).with_name(nome_arquivo)
    spec = importlib.util.spec_from_file_location(f"_m_{caminho.stem}", caminho)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


DECLARE_ANTES = "  v_nl      text := chr(10);\n"
DECLARE_DEPOIS = DECLARE_ANTES + "  v_nome    text := btrim(coalesce(p_nome, ''));\n"

CORPO_ANTES = "  v_corpo := 'Nome: ' || COALESCE(p_nome, '') || v_nl\n"
CORPO_DEPOIS = """  -- O app mandava o e-mail no lugar do nome (exclusao de conta, 20261103_08). Quem pede e' a
  -- conta da sessao: vale o nome cadastrado. Nome digitado (sem @) passa como esta'.
  IF v_nome = '' OR position('@' in v_nome) > 0 THEN
    v_nome := COALESCE(
      (SELECT nullif(btrim(a.nome), '') FROM public.alunos a WHERE a.id = v_aluno),
      (SELECT nullif(btrim(p.nome), '') FROM public.professor p WHERE p.id = v_aluno),
      v_nome
    );
  END IF;

  v_corpo := 'Nome: ' || v_nome || v_nl
"""


def contato_sql() -> str:
    sql = _modulo("20261101_14_email_pelo_apps_script.py").CONTATO_SQL
    for antes, depois in ((DECLARE_ANTES, DECLARE_DEPOIS), (CORPO_ANTES, CORPO_DEPOIS)):
        if sql.count(antes) != 1:
            raise RuntimeError(f"trecho de fn_enviar_contato nao encontrado exatamente uma vez: {antes!r}")
        sql = sql.replace(antes, depois)
    return sql


def upgrade() -> None:
    op.execute(contato_sql())


def downgrade() -> None:
    op.execute(_modulo("20261101_14_email_pelo_apps_script.py").CONTATO_SQL)
