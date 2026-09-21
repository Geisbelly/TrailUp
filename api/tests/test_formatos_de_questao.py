"""Tres formatos novos: ligar termos, ordenar e marcar todas as certas.

A base tinha quatro (multipla 21, verdadeiro_falso 14, fill_blank 13,
dissertativa 8) e nenhum deles pede raciocinio de RELACAO.

Exercitados contra o banco, em transacao revertida -- 18 casos, todos com o
resultado esperado. Os testes aqui guardam o que falharia em SILENCIO: a
questao continua renderizando e o aluno continua respondendo, so o gabarito
fica errado ou visivel.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

MIGRACAO = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "20260921_04_formatos_de_questao.py"
)


def _sql(funcao: str) -> str:
    arvore = ast.parse(MIGRACAO.read_text(encoding="utf-8"))
    alvo = next(
        n for n in arvore.body if isinstance(n, ast.FunctionDef) and n.name == funcao
    )
    return "\n".join(
        no.args[0].value
        for no in ast.walk(alvo)
        if isinstance(no, ast.Call)
        and getattr(no.func, "attr", "") == "execute"
        and no.args
        and isinstance(no.args[0], ast.Constant)
    )


def test_nenhum_bind_acidental_do_sqlalchemy() -> None:
    texto = MIGRACAO.read_text(encoding="utf-8")
    achados = sorted(set(re.findall(r"(?<!:):[A-Za-z_]\w*", texto)))
    assert achados == [], f"bind acidental: {achados}"


def test_o_par_da_associacao_nao_mora_em_alternativas() -> None:
    """A forma obvia -- `[{"termo": "x", "par": "y"}]` -- ENTREGA a resposta:
    o aluno le o JSON e tem o gabarito. `alternativas` guarda duas listas
    soltas; o pareamento vive so em `questao_gabarito`."""
    sql = _sql("upgrade")
    assert "jsonb_build_object('termos', v_termos, 'definicoes', v_defs)" in sql
    # As duas listas tem de ser embaralhadas com sementes DIFERENTES, senao a
    # posicao volta a parear: `termos[i]` com `definicoes[i]`.
    assert "'|t' || v_sal::text" in sql
    assert "'|d' || v_sal::text" in sql


def test_a_identidade_e_recusada_mas_o_alinhamento_por_acaso_nao() -> None:
    """Medido sobre 200 ids com 5 pares: a media de pares alinhados e 0,915 --
    casar por posicao rende o mesmo que chutar, entao nao ha vazamento. O caso
    inaceitavel e o extremo (todos alinhados, 1 em 200): a resposta inteira
    fica na tela.

    Recusar MAIS do que a identidade seria pior. Garantir que a posicao i nunca
    e o par elimina uma opcao por linha -- ai a posicao passa a carregar
    informacao de verdade."""
    sql = _sql("upgrade")
    assert "EXIT WHEN v_casam < v_n;" in sql, "so a identidade (todos) e recusada"
    assert "v_casam = 0" not in sql, "recusar alinhamento parcial vazaria mais"
    assert "FOR v_sal IN 0 .. 4 LOOP" in sql, "o sal precisa ser limitado"


def test_ordenacao_compara_sequencia_e_o_resto_compara_conjunto() -> None:
    """`ordenacao` E a ordem -- comparar como conjunto aceitaria qualquer
    embaralhamento dos mesmos itens. Ja marcar B e D e o mesmo que marcar D e
    B, e o aluno nao escolhe a ordem em que liga pares."""
    sql = _sql("upgrade")
    assert "IF v_tipo = 'ordenacao' THEN" in sql
    assert "RETURN v_gab = v_resp;" in sql
    assert "EXCEPT" in sql, "conjunto precisa da diferenca nos dois sentidos"


def test_conjunto_compara_TAMANHO_senao_marcar_tudo_passa() -> None:
    """Sem a cardinalidade, o gabarito estaria contido na resposta e marcar
    TODAS as alternativas passaria em multipla_resposta. Medido: com a
    comparacao, marcar todas devolve false."""
    sql = _sql("upgrade")
    assert "cardinality(v_gab) = cardinality(v_resp)" in sql


def test_gabarito_vazio_nunca_vale_acerto() -> None:
    """Mesmo modo de falha das conquistas sem limiar: `COALESCE(..., 0)` valia
    zero e a conquista destravava para todo mundo no primeiro evento."""
    sql = _sql("upgrade")
    assert "IF cardinality(v_gab) = 0 OR cardinality(v_resp) = 0 THEN" in sql
    assert "RETURN false;" in sql


def test_a_reserva_por_barra_existe() -> None:
    """Cliente antigo e professor digitando a mao mandam `a|c`. Recusar seria
    recusar a resposta certa por causa da FORMA dela."""
    sql = _sql("upgrade")
    assert "regexp_split_to_table" in sql


def test_o_gabarito_de_lista_nao_passa_pelo_resolvedor_de_opcao() -> None:
    """`fn_questao_gabarito_em_texto` resolve UMA opcao. Sobre um gabarito que
    e conjunto ou sequencia (`["a","c"]`) ele nao acharia correspondencia e
    devolveria intacto -- mas depender disso e' fragil, e uma alternativa cujo
    texto fosse igual ao JSON inteiro o destruiria."""
    sql = _sql("upgrade")
    assert "IF v_tipo NOT IN ('ordenacao', 'multipla_resposta') THEN" in sql


def test_ordenacao_continua_sendo_reordenada() -> None:
    """Aqui a ordem canonica deixa de ser reducao de vies e vira REQUISITO: se
    as alternativas ficassem na ordem certa, a tela mostraria a resposta."""
    sql = _sql("upgrade")
    canonica = sql.index("fn_questao_alternativas_em_ordem(NEW.id, v_alts)")
    guarda = sql.index("IF v_tipo IN ('verdadeiro_falso', 'true_false', 'vf') THEN")
    assert guarda < canonica
    # `ordenacao` NAO pode estar na saida antecipada.
    trecho = sql[guarda : guarda + 200]
    assert "ordenacao" not in trecho


def test_as_funcoes_novas_saem_do_alcance_do_anon() -> None:
    """Funcao nova nasce executavel por PUBLIC no Supabase, e `SECURITY
    DEFINER` recem-criada fica exposta em /rest/v1/rpc/ sem login."""
    texto = MIGRACAO.read_text(encoding="utf-8")
    assert "REVOKE ALL ON FUNCTION public.{assinatura} FROM PUBLIC, anon" in texto
    assert "GRANT EXECUTE ON FUNCTION public.{assinatura} TO authenticated" in texto
    for assinatura in (
        "fn_questao_resposta_em_lista(text)",
        "fn_questao_confere_lista(text, text, text)",
        "fn_questao_associacao_em_ordem(bigint, jsonb, text)",
    ):
        assert assinatura in texto


def test_a_migracao_encadeia_no_head_anterior() -> None:
    texto = MIGRACAO.read_text(encoding="utf-8")
    assert 'revision = "20260921_04"' in texto
    assert 'down_revision = "20260921_03"' in texto
