"""Junta as duas cabeças da cadeia: `20261106_02` e `20261106_06`.

## O defeito

`20261106_02_estudo_por_plataforma` (#1046) e `20261106_05_bag_salva_material` (`82fe4866`)
apontam as duas para `20261106_01`, e `20261106_06` segue a `_05`. A `main` ficou com duas
cabeças, e a API, que roda `alembic upgrade head` ao subir, recusa mais de uma cabeça e não
sobe (502).

## Por que merge, e não renumerar

Renumerar a `_05` para depender da `_02` só é seguro sabendo o que produção já aplicou. Se o
`alembic_version` estiver em `_06`, o alembic passaria a ver a `_02` como ancestral já aplicada
e ela nunca rodaria. Esta revisão não depende do estado do banco:

| `alembic_version` em produção | `upgrade head` aplica |
| --- | --- |
| `20261106_01` | `_02`, `_05`, `_06` e esta |
| `20261106_02` | `_05`, `_06` e esta |
| `20261106_06` | `_02` e esta |
| `_02` e `_06` (duas linhas) | só esta |

Não muda o schema: `upgrade` e `downgrade` são vazios.
"""

revision = "20261106_07"
down_revision = ("20261106_02", "20261106_06")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
