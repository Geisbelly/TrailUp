"""Estrutura da `20261118_01`: quem lê, quem escreve, prazo e paridade com a API."""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from app.services import mascaramento_chat

ARQUIVO = Path(__file__).resolve().parent.parent / "alembic" / "versions" / "20261118_01_chat_guia_registros.py"


def _modulo():
    spec = importlib.util.spec_from_file_location("m20261118_01", ARQUIVO)
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M = _modulo()


def test_encadeia_na_cabeca_anterior() -> None:
    assert (M.revision, M.down_revision) == ("20261118_01", "20261117_04")


def test_listas_e_limites_batem_com_a_api() -> None:
    assert M.INTENCOES == mascaramento_chat.INTENCOES
    assert M.DIFICULDADES == mascaramento_chat.DIFICULDADES
    assert M.MAX_ASSUNTO == mascaramento_chat.MAX_ASSUNTO
    assert M.MAX_CONCEITOS == mascaramento_chat.MAX_CONCEITOS


def test_nao_guarda_o_texto_do_aluno() -> None:
    colunas = re.findall(r"^\s{2}(\w+)\s", M.TABELA, re.MULTILINE)
    assert not {"mensagem", "historico", "texto", "conteudo", "resposta", "reply"} & set(colunas)


def test_tabela_nasce_com_policy_de_leitura_e_sem_escrita_do_cliente() -> None:
    assert "ENABLE ROW LEVEL SECURITY" in M.RLS
    assert "REVOKE ALL ON TABLE public.chat_guia_registros FROM PUBLIC, anon, authenticated" in M.RLS
    assert "GRANT SELECT ON TABLE public.chat_guia_registros TO authenticated" in M.RLS
    assert re.search(r"GRANT (INSERT|UPDATE|DELETE|ALL)[^;]*TO authenticated", M.RLS) is None
    assert "aluno_id = auth.uid()" in M.RLS
    assert "app_classes_do_professor()" in M.RLS


def test_toda_view_tem_security_invoker_e_nao_abre_para_anon() -> None:
    views = re.findall(r"CREATE OR REPLACE VIEW (public\.\w+)\s+WITH \(security_invoker = on\)", M.VIEWS)
    assert len(views) == M.VIEWS.count("CREATE OR REPLACE VIEW") == 3
    assert "FROM PUBLIC, anon, authenticated" in M.VIEWS
    assert re.search(r"GRANT[^;]*\banon\b", M.VIEWS) is None


def test_registra_prazo_de_retencao() -> None:
    assert "INSERT INTO public.retencao_politica" in M.RETENCAO
    assert "'chat_guia_registros', 'apagar'" in M.RETENCAO
    assert M.DIAS_PESQUISA >= M.DIAS


def test_sem_dois_pontos_que_o_text_leria_como_bind() -> None:
    for bloco in (M.TABELA, M.RLS, M.VIEWS, M.RETENCAO):
        assert re.search(r"(?<!:):[A-Za-z_]", bloco) is None
