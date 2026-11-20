"""`20261120_02`: estrutura das frases e do SQL da rotina com o tópico do aluno (sem banco)."""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from sqlalchemy import text

VERSOES = Path(__file__).resolve().parent.parent / "alembic" / "versions"


def _modulo(arquivo: str):
    spec = importlib.util.spec_from_file_location(f"t_{arquivo[:11]}", VERSOES / arquivo)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


M = _modulo("20261120_02_notificacao_rotina_com_o_topico_do_aluno.py")
M12 = _modulo("20261103_12_notificacao_fala_com_o_aluno_no_perfil.py")

MARCADORES = {"{nome}", "{guia}", "{topico}", "{percentual}", "{proximo}"}
# O pior caso de cada marcador depois de resolvido.
PIOR = {"{nome}": "N" * 20, "{guia}": "G" * 6, "{topico}": "T" * 60, "{proximo}": "P" * 60, "{percentual}": "99%"}


def _todas():
    for tipo, perfil, variante, ordem, titulo, corpo in M.linhas_novas():
        yield (tipo, perfil, variante, ordem), titulo, corpo


def _resolvido(texto: str) -> str:
    for marcador, valor in PIOR.items():
        texto = texto.replace(marcador, valor)
    return texto


def test_encadeia_na_cabeca_da_main():
    assert M.down_revision == "20261120_01"
    outras = [p.name for p in VERSOES.glob("*.py") if p.name != Path(M.__file__).name]
    assert not any(f'down_revision = "{M.revision}"' in (VERSOES / n).read_text(encoding="utf-8") for n in outras)


def test_todo_tipo_tem_os_sete_perfis():
    for grupo in (M.COM_TOPICO, M.GERAL):
        for tipo, por_perfil in grupo.items():
            assert set(por_perfil) == set(M.PERFIS), tipo


def test_frase_com_topico_sempre_tem_saida_sem_proximo_e_sem_percentual():
    """Sem próximo conteúdo e com 0%, ainda sobra frase `com_topico` para o tipo × perfil."""
    for tipo, por_perfil in M.COM_TOPICO.items():
        for perfil, frases in por_perfil.items():
            livres = [f for f in frases if not any(m in f[0] + f[1] for m in ("{proximo}", "{percentual}"))]
            assert livres, (tipo, perfil)
            assert all("{topico}" in t + c for t, c in frases), (tipo, perfil)


def test_geral_nao_usa_marcador_de_topico():
    for chave, titulo, corpo in _todas():
        if chave[2] == "geral":
            assert not re.search(r"\{(topico|percentual|proximo)\}", titulo + corpo), chave


def test_so_marcadores_conhecidos_e_nome_so_depois_de_virgula():
    for chave, titulo, corpo in _todas():
        for texto in (titulo, corpo):
            assert set(re.findall(r"\{\w+\}", texto)) <= MARCADORES, chave
            assert texto.count("{nome}") == texto.count(", {nome}"), chave
        assert "{nome}" not in corpo, chave


def test_cabe_nos_limites_mesmo_no_pior_caso():
    for chave, titulo, corpo in _todas():
        assert 1 <= len(titulo) <= 60 and 1 <= len(corpo) <= 200, chave
        assert len(_resolvido(titulo)) <= 60, (chave, titulo)
        assert len(_resolvido(corpo)) <= 200, (chave, corpo)


def test_nao_repete_frase_nem_a_da_20261103_12():
    vistas = {(t, c) for por_tipo in M12.TEXTOS.values() for t, c in por_tipo.values()}
    for chave, titulo, corpo in _todas():
        assert (titulo, corpo) not in vistas, chave
        vistas.add((titulo, corpo))


def test_sql_sem_porcento_nem_bind_acidental():
    sqls = [M.GUARDA, M.TABELA, M.sementes(), M.FUNCOES, M.REESCREVER]
    for sql in sqls:
        assert "%" not in sql
        assert text(sql).compile().params == {}


def test_downgrade_recorta_as_funcoes_de_origem():
    sql = M.anteriores()
    for nome in ("notificacoes_texto_revisao", "notificacoes_agendamentos_texto", "notificacoes_pendentes_texto"):
        assert f"FUNCTION public.{nome}(" in sql
    assert "notificacoes_modelos_texto" in sql  # a revisão volta a ler a tabela da 20261102_01
