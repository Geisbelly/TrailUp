"""Alias legado do Alembic; a correção da trava está no executor oficial (#545).

Uso (de dentro de api/): PYTHONPATH=. python ../scripts/e2e_economia/alembic_local.py upgrade head
"""

import sys

from alembic.config import main

main(argv=sys.argv[1:])
