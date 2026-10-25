"""Emite SQL das migrações reais; não acessa banco, .env ou produção."""
import re
import runpy
import sys
import types
from pathlib import Path

root = Path(__file__).resolve().parents[2]
versions = root / 'api/alembic/versions'
sql = []
sys.modules['alembic'] = types.SimpleNamespace(op=types.SimpleNamespace(execute=sql.append))
retention = runpy.run_path(str(versions / '20261024_03_retencao_e_expurgo.py'))['TABELAS_SQL']
sql.append(re.search(r'CREATE TABLE IF NOT EXISTS public.retencao_politica.*?\n\);', retention, re.DOTALL).group())
birth = runpy.run_path(str(versions / '20261024_02_consentimento_do_responsavel.py'))['CLIENTE_SQL']
sql.append(re.search(r'CREATE OR REPLACE FUNCTION public.aluno_registrar_data_nascimento.*?\$function\$;', birth, re.DOTALL).group())
for name in ['20261003_02_medida_do_perfil_brainhex.py', '20261024_04_perfil_exploratorio_sem_confianca.py', '20261024_05_cadastro_aluno_atomico.py', '20261024_08_integridade_cadastro_legado.py']:
    runpy.run_path(str(versions / name))['upgrade']()
print(';\n'.join(sql) + ';')
