"""Roda o Alembic local com COMMIT logo após a trava (ver README: rollback silencioso).

Uso (de dentro de api/): PYTHONPATH=. python ../scripts/e2e_economia/alembic_local.py upgrade head
"""

import contextlib
import sys

from app.db import migrations as m

_original = m.trava_de_migracao


@contextlib.contextmanager
def _trava_com_commit(connection):
    with _original(connection) as ok:
        if connection.in_transaction():
            connection.commit()  # o lock é de sessão: sobrevive ao COMMIT
        yield ok
        if connection.in_transaction():
            connection.commit()


m.trava_de_migracao = _trava_com_commit

from alembic.config import main  # noqa: E402

main(argv=sys.argv[1:])
