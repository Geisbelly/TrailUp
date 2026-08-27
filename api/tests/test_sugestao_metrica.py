"""Métricas de efetividade das sugestões de material (fase 3)."""

from app.services.sugestao_metrica import (
    aderencia_da_sugestao,
    churn_de_sugestoes,
    comparar_seguiu_versus_ignorou,
    efeito_das_revisoes,
    montar_registros_do_log,
    resumo_efetividade,
)

# --- aderência -------------------------------------------------------------


def test_consumo_na_ordem_sugerida_da_aderencia_total():
    resultado = aderencia_da_sugestao(
        ordem_sugerida=["markdown", "audio", "cards"],
        ordem_consumida=["markdown", "audio", "cards"],
    )

    assert resultado["aderencia"] == 1.0
    assert resultado["seguiu_inicio"] is True


def test_consumo_na_ordem_inversa_da_aderencia_zero():
    resultado = aderencia_da_sugestao(
        ordem_sugerida=["markdown", "audio", "cards"],
        ordem_consumida=["cards", "audio", "markdown"],
    )

    assert resultado["aderencia"] == 0.0
    assert resultado["seguiu_inicio"] is False


def test_formato_nao_consumido_nao_conta_como_desobediencia():
    # O aluno seguiu a ordem do que consumiu; não abrir o terceiro material não
    # é "ignorar a sugestão".
    resultado = aderencia_da_sugestao(
        ordem_sugerida=["markdown", "audio", "cards"],
        ordem_consumida=["markdown", "audio"],
    )

    assert resultado["aderencia"] == 1.0
    assert resultado["formatos_comparados"] == ["markdown", "audio"]


def test_um_par_trocado_no_meio_da_aderencia_parcial():
    resultado = aderencia_da_sugestao(
        ordem_sugerida=["markdown", "audio", "cards"],
        ordem_consumida=["audio", "markdown", "cards"],
    )

    # 3 pares: (md,audio) trocado, (md,cards) ok, (audio,cards) ok
    assert resultado["pares_comparados"] == 3
    assert resultado["pares_concordantes"] == 2


def test_sem_par_comparavel_devolve_none_nao_zero():
    # "Não deu para medir" é diferente de "não seguiu nada" — zero aqui seria
    # lido como desobediência total.
    resultado = aderencia_da_sugestao(ordem_sugerida=["markdown"], ordem_consumida=["markdown"])

    assert resultado["aderencia"] is None
    assert resultado["seguiu_inicio"] is True


def test_consumo_vazio_nao_quebra():
    resultado = aderencia_da_sugestao(ordem_sugerida=["markdown", "audio"], ordem_consumida=[])

    assert resultado["aderencia"] is None
    assert resultado["seguiu_inicio"] is False


def test_formato_consumido_fora_da_sugestao_e_ignorado_na_comparacao():
    resultado = aderencia_da_sugestao(
        ordem_sugerida=["markdown", "audio"],
        ordem_consumida=["pdf", "markdown", "audio"],
    )

    assert resultado["aderencia"] == 1.0
    assert resultado["seguiu_inicio"] is False  # começou por outro


# --- seguiu x ignorou ------------------------------------------------------


def test_comparacao_exige_amostra_nos_dois_lados():
    registros = [{"seguiu": True, "desempenho": 90} for _ in range(10)]
    registros.append({"seguiu": False, "desempenho": 40})

    resultado = comparar_seguiu_versus_ignorou(registros, minimo_amostra=5)

    assert resultado["n_seguiu"] == 10
    assert resultado["n_ignorou"] == 1
    assert resultado["confiavel"] is False
    # Um lado com n=1 não gera diferença publicável.
    assert resultado["diferenca"] is None


def test_com_amostra_nos_dois_lados_publica_a_diferenca():
    registros = [{"seguiu": True, "desempenho": 80} for _ in range(5)]
    registros += [{"seguiu": False, "desempenho": 50} for _ in range(5)]

    resultado = comparar_seguiu_versus_ignorou(registros, minimo_amostra=5)

    assert resultado["confiavel"] is True
    assert resultado["diferenca"] == 30.0


def test_seguiu_indeterminado_fica_fora_dos_dois_grupos():
    # Contar "não deu para medir" como "não seguiu" enviesaria a métrica a favor
    # do sistema.
    registros = [
        {"seguiu": None, "desempenho": 10},
        {"seguiu": True, "desempenho": 80},
    ]

    resultado = comparar_seguiu_versus_ignorou(registros)

    assert resultado["n_seguiu"] == 1
    assert resultado["n_ignorou"] == 0


def test_registro_sem_desempenho_nao_entra_na_media():
    registros = [
        {"seguiu": True, "desempenho": None},
        {"seguiu": True, "desempenho": 60},
    ]

    resultado = comparar_seguiu_versus_ignorou(registros)

    assert resultado["n_seguiu"] == 1
    assert resultado["desempenho_seguiu"] == 60.0


# --- efeito das revisões ---------------------------------------------------


def _registro(versao: int, acao: str, desempenho: float | None, aluno="a1", topico=1) -> dict:
    return {
        "aluno_id": aluno,
        "topico_id": topico,
        "versao": versao,
        "acao": acao,
        "desempenho_posterior": desempenho,
    }


def test_revisao_que_melhorou_entra_com_delta_positivo():
    historico = [
        _registro(1, "criada", 50),
        _registro(2, "revisada", 70),
    ]

    resultado = efeito_das_revisoes(historico)

    assert resultado["revisoes_comparadas"] == 1
    assert resultado["delta_medio"] == 20.0
    assert resultado["revisoes_que_melhoraram"] == 1


def test_mantida_nao_conta_como_revisao():
    # Comparar com "mantida" mediria a passagem do tempo, não o efeito de ter
    # mudado a ordem.
    historico = [
        _registro(1, "criada", 50),
        _registro(2, "mantida", 90),
    ]

    resultado = efeito_das_revisoes(historico)

    assert resultado["revisoes_comparadas"] == 0
    assert resultado["delta_medio"] is None


def test_compara_apenas_dentro_do_mesmo_aluno_e_topico():
    historico = [
        _registro(1, "criada", 50, aluno="a1"),
        _registro(2, "revisada", 60, aluno="a1"),
        _registro(1, "criada", 10, aluno="a2"),
        _registro(2, "revisada", 90, aluno="a2"),
    ]

    resultado = efeito_das_revisoes(historico)

    assert resultado["revisoes_comparadas"] == 2
    assert resultado["delta_medio"] == 45.0


def test_ordena_por_versao_mesmo_recebendo_fora_de_ordem():
    historico = [_registro(2, "revisada", 70), _registro(1, "criada", 50)]

    resultado = efeito_das_revisoes(historico)

    assert resultado["delta_medio"] == 20.0


def test_desempenho_ausente_nao_gera_delta_falso():
    historico = [_registro(1, "criada", None), _registro(2, "revisada", 70)]

    resultado = efeito_das_revisoes(historico)

    assert resultado["revisoes_comparadas"] == 0


def test_amostra_pequena_marca_nao_confiavel():
    historico = [_registro(1, "criada", 50), _registro(2, "revisada", 60)]

    resultado = efeito_das_revisoes(historico, minimo_amostra=5)

    assert resultado["confiavel"] is False


# --- churn -----------------------------------------------------------------


def test_churn_conta_revisoes_por_alvo():
    historico = [
        _registro(1, "criada", None),
        _registro(2, "revisada", None),
        _registro(3, "revisada", None),
        _registro(1, "criada", None, aluno="a2"),
    ]

    resultado = churn_de_sugestoes(historico)

    assert resultado["alvos"] == 2
    assert resultado["alvos_revisados"] == 1
    assert resultado["maior_numero_de_revisoes"] == 2
    assert resultado["revisoes_por_alvo"] == 1.0


def test_churn_conta_cada_acao():
    historico = [
        _registro(1, "criada", None),
        _registro(2, "mantida", None),
        _registro(3, "revisada", None),
    ]

    resultado = churn_de_sugestoes(historico)

    assert resultado["por_acao"] == {"criada": 1, "revisada": 1, "mantida": 1}


def test_churn_sem_historico_nao_divide_por_zero():
    resultado = churn_de_sugestoes([])

    assert resultado["alvos"] == 0
    assert resultado["revisoes_por_alvo"] is None


# --- resumo ----------------------------------------------------------------


def test_resumo_junta_as_tres_leituras():
    historico = [
        {**_registro(1, "criada", 50), "aderencia": 1.0, "seguiu_inicio": True, "seguiu": True, "desempenho": 80},
        {**_registro(2, "revisada", 70), "aderencia": 0.5, "seguiu_inicio": False, "seguiu": False, "desempenho": 40},
    ]

    resumo = resumo_efetividade(historico)

    assert resumo["total_registros"] == 2
    assert resumo["aderencia_media"] == 0.75
    assert resumo["taxa_seguiu_inicio"] == 0.5
    assert resumo["desempenho"]["n_seguiu"] == 1
    assert resumo["revisoes"]["revisoes_comparadas"] == 1
    assert resumo["churn"]["por_acao"]["revisada"] == 1


def test_resumo_vazio_nao_quebra_e_nao_inventa_numero():
    resumo = resumo_efetividade([])

    assert resumo["total_registros"] == 0
    assert resumo["aderencia_media"] is None
    assert resumo["taxa_seguiu_inicio"] is None
    assert resumo["desempenho"]["confiavel"] is False


# --- log cru -> registros de metrica ---------------------------------------


def _log(versao, acao, *, ordem_antes=None, observada=None, acertos=None, aluno="a1", topico=1):
    sinais = (
        {formato: {"acertos": valor} for formato, valor in (acertos or {}).items()}
        if acertos
        else {}
    )
    return {
        "aluno_id": aluno,
        "classe_id": 32,
        "topico_id": topico,
        "versao": versao,
        "acao": acao,
        "ordem_antes": (
            [{"formato": f, "posicao": i + 1} for i, f in enumerate(ordem_antes)]
            if ordem_antes
            else None
        ),
        "ordem_depois": None,
        "motivos": [],
        "evidencia": {
            **({"sinais": sinais} if sinais else {}),
            **({"ordem_observada": observada} if observada else {}),
        },
    }


def test_aderencia_sai_da_ordem_valida_contra_a_observada():
    registros = montar_registros_do_log(
        [
            _log(1, "criada"),
            _log(
                2,
                "revisada",
                ordem_antes=["markdown", "audio"],
                observada=["markdown", "audio"],
            ),
        ]
    )

    assert registros[1]["aderencia"] == 1.0
    assert registros[1]["seguiu_inicio"] is True


def test_aluno_comecou_por_outro_formato_marca_que_nao_seguiu():
    registros = montar_registros_do_log(
        [_log(2, "mantida", ordem_antes=["markdown", "audio"], observada=["audio", "markdown"])]
    )

    assert registros[0]["seguiu_inicio"] is False
    assert registros[0]["aderencia"] == 0.0


def test_sem_ordem_observada_a_aderencia_fica_indeterminada():
    # Zero aqui seria lido como desobediencia; None diz "nao deu para medir".
    registros = montar_registros_do_log([_log(1, "criada", ordem_antes=["markdown"])])

    assert registros[0]["aderencia"] is None
    assert registros[0]["seguiu"] is None


def test_desempenho_posterior_vem_do_periodo_seguinte():
    registros = montar_registros_do_log(
        [
            _log(1, "criada", acertos={"markdown": 40}),
            _log(2, "revisada", ordem_antes=["markdown"], acertos={"audio": 80}),
        ]
    )

    assert registros[0]["desempenho"] == 40.0
    assert registros[0]["desempenho_posterior"] == 80.0
    # O ultimo registro nao tem periodo depois dele; preencher faria toda
    # revisao recente parecer neutra.
    assert registros[1]["desempenho_posterior"] is None


def test_efeito_das_revisoes_le_o_que_o_log_produziu():
    registros = montar_registros_do_log(
        [
            _log(1, "criada", acertos={"markdown": 40}),
            _log(2, "revisada", ordem_antes=["markdown"], acertos={"audio": 80}),
            _log(3, "revisada", ordem_antes=["audio"], acertos={"audio": 95}),
        ]
    )

    efeito = efeito_das_revisoes(registros)

    assert efeito["revisoes_comparadas"] == 1
    assert efeito["delta_medio"] == 15.0


def test_acerto_nao_atribuivel_nao_conta_como_zero():
    # A ponte de sinais deixa `acertos` None de proposito quando o conteudo foi
    # visto em dois formatos.
    registros = montar_registros_do_log(
        [_log(1, "criada", acertos=None), _log(2, "revisada", ordem_antes=["markdown"])]
    )

    assert registros[0]["desempenho"] is None
    assert registros[0]["desempenho_posterior"] is None


def test_alvos_diferentes_nao_se_contaminam():
    registros = montar_registros_do_log(
        [
            _log(1, "criada", acertos={"markdown": 10}, aluno="a1"),
            _log(1, "criada", acertos={"markdown": 90}, aluno="a2"),
        ]
    )

    assert all(r["desempenho_posterior"] is None for r in registros)


def test_versoes_fora_de_ordem_sao_reordenadas():
    registros = montar_registros_do_log(
        [
            _log(2, "revisada", ordem_antes=["markdown"], acertos={"audio": 80}),
            _log(1, "criada", acertos={"markdown": 40}),
        ]
    )

    assert [r["versao"] for r in registros] == [1, 2]
    assert registros[0]["desempenho_posterior"] == 80.0


def test_log_vazio_devolve_lista_vazia():
    assert montar_registros_do_log([]) == []
