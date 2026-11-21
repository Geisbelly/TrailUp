"""`20261120_02`: a rotina fala do tópico do aluno, muda de frase a cada dia e o gatilho não a apaga.

Mesmo banco do e2e da `20261103_12`, com a `20261120_02` por cima. Alunos de `_semear` da `_18`:
A é Socializer sem tópico em andamento; C é Conqueror ("Cacau"), estudando "[TESTE] Frações" (tópico
11) a 82%, com "Frações equivalentes" concluído e "Soma de frações" pela frente. Dados sintéticos.
"""

from __future__ import annotations

import json
from datetime import date, timedelta

from tests import _f5_banco as f5
from tests import test_e2e_notificacao_fala_com_o_aluno_no_perfil as fala

pytestmark = f5.e2e

M = f5.modulo("20261120_02_notificacao_rotina_com_o_topico_do_aluno.py")
A, C = fala.A, fala.C


def _banco_args() -> list[str]:
    """O SQL do banco deste e2e, para quem monta por cima (`20261120_06`)."""
    return [
        *fala.p.h._motor(),
        *f5.sql_de(fala.p.M01),
        fala.p.ANTES,
        fala.p.RETENCAO,
        fala.p.M_LIMITE.TABELA_CONFIG,
        fala.p.M_LIMITE.FUNCAO_LIMITE,
        *f5.sql_de(fala.p.M),
        *f5.sql_de(fala.g.M),
        *f5.sql_de(fala.M),
        *f5.sql_de(M),
    ]


def _banco():
    return f5.banco(*_banco_args())


def _semear(c) -> None:
    fala._semear(c)
    for t in ("conteudos", "conteudo_aluno"):
        f5.afrouxa(c, t)
    c.execute(
        f"""
UPDATE public.topicos SET nome = '[TESTE] Frações' WHERE id = 11;
INSERT INTO public.topico_aluno (topico_id, aluno_id, status, percentual_concluido, updated_at)
VALUES (11, '{C}', 'em andamento', 82.4, now());
INSERT INTO public.conteudos (id, topico_id, titulo, tipo, ordem) OVERRIDING SYSTEM VALUE VALUES
  (101, 11, 'Frações equivalentes', 'texto', 1),
  (102, 11, 'Soma de frações', 'texto', 2);
INSERT INTO public.conteudo_aluno (conteudo_id, aluno_id, status) VALUES (101, '{C}', 'concluido');
"""
    )


def _texto(c, aluno, tipo: str, dia: date | None = None) -> dict:
    (v,) = c.execute(
        "SELECT public.notificacoes_texto_rotina(%s, %s, 'America/Sao_Paulo', %s)", (aluno, tipo, dia)
    ).fetchone()
    return v


def _rotina(c, aluno, tipo: str) -> tuple[str, str]:
    return c.execute(
        "SELECT titulo, corpo FROM public.notificacoes_agendamentos WHERE aluno_id = %s AND tipo = %s",
        (aluno, tipo),
    ).fetchone()


def test_login_cita_o_topico_sem_a_marcacao_do_cadastro():
    with _banco() as c:
        _semear(c)
        fala._login(c, C)
        caixa = fala._caixa(c, C, "retomada_login")
        ctx = c.execute(
            "SELECT contexto FROM public.notificacoes_pendentes WHERE aluno_id = %s AND tipo = 'retomada_login'",
            (C,),
        ).fetchone()[0]

    assert len(caixa) == 1
    titulo, corpo = caixa[0]
    assert "Cacau" in titulo
    assert "Frações" in corpo and "[TESTE]" not in corpo
    assert "{" not in titulo + corpo
    assert ctx["texto_rotina"]["variante"] == "com_topico"
    assert ctx["texto_rotina"]["topico_id"] == 11


def test_sem_topico_em_andamento_vale_a_frase_geral():
    with _banco() as c:
        _semear(c)
        fala._login(c, A)
        caixa = fala._caixa(c, A, "retomada_login")
        texto = _texto(c, A, "revisao_diaria")

    assert len(caixa) == 1 and "{" not in caixa[0][0] + caixa[0][1]
    assert texto["variante"] == "geral"


def test_frase_muda_a_cada_dia_e_repete_no_mesmo_dia():
    hoje = date(2026, 11, 20)
    with _banco() as c:
        _semear(c)
        dias = [_texto(c, C, "revisao_diaria", hoje + timedelta(days=i)) for i in range(3)]
        de_novo = _texto(c, C, "revisao_diaria", hoje)

    assert len({d["ordem"] for d in dias}) == 3
    assert de_novo == dias[0]
    corpos = {d["corpo"] for d in dias}
    assert any("Soma de frações" in x for x in corpos)  # o próximo conteúdo entra
    assert any("82%" in x for x in corpos)  # o percentual entra, arredondado para baixo


def test_sem_proximo_conteudo_nenhuma_frase_pede_por_ele():
    hoje = date(2026, 11, 20)
    with _banco() as c:
        _semear(c)
        c.execute(f"INSERT INTO public.conteudo_aluno (conteudo_id, aluno_id, status) VALUES (102, '{C}', 'concluido')")
        dias = [_texto(c, C, "revisao_diaria", hoje + timedelta(days=i)) for i in range(6)]

    assert {d["variante"] for d in dias} == {"com_topico"}
    assert all("{" not in d["titulo"] + d["corpo"] for d in dias)
    assert all("Frações" in d["corpo"] for d in dias)


def test_o_job_grava_o_texto_com_topico_e_o_gatilho_nao_o_apaga():
    """O defeito: o job gravava o texto com tópico e o gatilho da 20261103_12 o trocava pelo fixo."""
    with _banco() as c:
        _semear(c)
        fala._login(c, C)
        c.execute("SELECT public.notificacoes_recalcular_rotinas()")
        rotina = _rotina(c, C, "revisao_diaria")
        esperado = _texto(c, C, "revisao_diaria")
        # Rodar de novo no mesmo dia não reescreve nada.
        (segunda,) = c.execute("SELECT public.notificacoes_recalcular_rotinas()").fetchone()

    assert rotina == (esperado["titulo"], esperado["corpo"])
    assert "Frações" in rotina[1]
    assert rotina != ("Mais uma etapa, Cacau", "Amina está de olho na sua próxima vitória. Avance mais uma etapa hoje.")
    assert segunda["textos"] == 0


def test_sugestao_da_ia_continua_valendo_no_lugar_da_rotina():
    with _banco() as c:
        _semear(c)
        c.execute(
            "INSERT INTO public.notificacoes_ia (aluno_id, tipo, contexto, titulo, corpo, origem, prioridade)"
            " VALUES (%s, 'suporte', %s::jsonb, 'Vamos juntos, {nome}?', 'Amina separou um passo curto em Frações.', 'ciclo', 2)",
            (C, json.dumps({"motivo": "emocao_negativa", "texto_guarda": 3})),
        )
        fala._login(c, C)
        caixa = fala._caixa(c, C, "suporte")

    assert caixa == [("Vamos juntos, Cacau?", "Amina separou um passo curto em Frações.")]
