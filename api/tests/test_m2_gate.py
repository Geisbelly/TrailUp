"""Gate M2 (#215): papéis corretos, ordem de feats e fallback para regra.

- domínio recusa posteriores (blindagem de vazamento do treino);
- gate e domínio têm conjuntos de feats distintos — trocar um pelo outro
  é detectado;
- sem artefato (sha divergente/dir vazio), origem="regra" e p=None;
- M2GatedDecisionEngine sem M2 comporta-se como XGBoostDecisionEngine,
  e com p_gate baixo pula reforço (m2_skipped=True).
"""

import asyncio

import pytest

pytest.importorskip("sklearn", reason="gate M2 exige scikit-learn")

from app.services.linear_analysis_pipeline import (
    AttentionStageResult,
    M2GatedDecisionEngine,
    PerformanceStageResult,
    XGBoostDecisionEngine,
    build_linear_analysis_orchestrator,
)
from app.services.m2_inference import (
    EXPECTED_SHA256,
    POSTERIOR_FEATURES,
    M2Inference,
    get_m2_inference,
)


def _attention(**kw):
    base = {
        "provider_name": "random_forest",
        "estado_atencao": "boa",
        "dificuldade": "media",
        "frustracao": "baixa",
        "engajamento": "medio",
        "score": 0.5,
        "resumo": {},
    }
    base.update(kw)
    return AttentionStageResult(**base)


def _performance(**kw):
    base = {
        "provider_name": "deep_knowledge_tracing",
        "dominio_estimado": 0.6,
        "tendencia": "estavel",
        "confianca": 0.7,
        "resumo": {},
    }
    base.update(kw)
    return PerformanceStageResult(**base)


def test_m2_loads_both_roles_with_distinct_feats():
    inf = get_m2_inference()
    model = inf._load("m2_model_v3.pkl")
    gate = inf._load("m2_gate_v3.pkl")
    assert model is not None and gate is not None
    assert len(model.feats) == 25
    assert len(gate.feats) == 30
    # Troca de papéis é detectável: os conjuntos diferem exatamente nos
    # posteriores (o que o domínio nunca pode receber).
    assert set(gate.feats) - set(model.feats) == set(POSTERIOR_FEATURES)
    assert set(model.feats) - set(gate.feats) == set()


def test_m2_cold_start_sanity_and_sha_pinned():
    inf = get_m2_inference()
    assert set(EXPECTED_SHA256) == {"m2_model_v3.pkl", "m2_gate_v3.pkl"}
    p_dom, origem_dom = inf.score_dominio({})
    p_gate, origem_gate = inf.score_gate({})
    assert origem_dom == origem_gate == "m2:v3"
    assert 0.0 <= p_dom <= 1.0
    assert 0.0 <= p_gate <= 1.0
    # Vetor conhecido (cold-start): domínio ~0.54, gate baixo.
    assert p_dom == pytest.approx(0.5431, abs=0.01)
    assert p_gate < 0.3


def test_m2_dominio_refuses_posterior_features():
    inf = get_m2_inference()
    for feat in POSTERIOR_FEATURES:
        p, origem = inf.score_dominio({feat: 1.0})
        assert p is None and origem == "regra"


def test_m2_missing_artifact_falls_back_to_rule(tmp_path):
    inf = M2Inference(model_dir=tmp_path)
    p_dom, origem_dom = inf.score_dominio({})
    p_gate, origem_gate = inf.score_gate({})
    assert p_dom is None and origem_dom == "regra"
    assert p_gate is None and origem_gate == "regra"


def test_m2gated_without_m2_matches_xgboost_rules():
    engine = M2GatedDecisionEngine()
    reference = XGBoostDecisionEngine()
    cases = [
        ({"frustracao": "alta"}, {"dominio_estimado": 0.6}),
        ({"estado_atencao": "baixa"}, {"dominio_estimado": 0.6}),
        ({"engajamento": "alto"}, {"dominio_estimado": 0.9}),
        ({}, {"dominio_estimado": 0.6}),
    ]
    for att_kw, perf_kw in cases:
        got = asyncio.run(
            engine.decide(
                attention=_attention(**att_kw),
                performance=_performance(**perf_kw),
                m2_gate=None,
                m2_dominio=None,
                m2_origem="regra",
            )
        )
        want = asyncio.run(
            reference.decide(
                attention=_attention(**att_kw),
                performance=_performance(**perf_kw),
            )
        )
        assert got.acoes == want.acoes
        assert got.modo_sugerido == want.modo_sugerido
        assert got.resumo["m2_skipped"] is False


def test_m2gated_low_gate_skips_reforco():
    engine = M2GatedDecisionEngine()
    got = asyncio.run(
        engine.decide(
            attention=_attention(frustracao="alta"),
            performance=_performance(dominio_estimado=0.3),
            m2_gate=0.05,
            m2_dominio=0.8,
            m2_origem="m2:v3",
        )
    )
    assert got.acoes == ["manter_fluxo_atual"]
    assert got.modo_sugerido == "imediato"
    assert got.resumo["m2_skipped"] is True
    assert got.resumo["m2_gate"] == pytest.approx(0.05)


def test_m2gated_high_gate_keeps_reforco():
    engine = M2GatedDecisionEngine()
    got = asyncio.run(
        engine.decide(
            attention=_attention(frustracao="alta"),
            performance=_performance(dominio_estimado=0.3),
            m2_gate=0.9,
            m2_dominio=0.2,
            m2_origem="m2:v3",
        )
    )
    assert got.acoes == ["simplificar_conteudo", "mostrar_exemplos"]
    assert got.modo_sugerido == "reforco"
    assert got.resumo["m2_skipped"] is False


def test_orchestrator_factory_selects_m2gated():
    from app.core.settings import Settings

    settings = Settings(
        supabase_jwt_secret="test",
        decision_model_provider="m2gated",
    )
    orchestrator = build_linear_analysis_orchestrator(settings)
    assert isinstance(orchestrator.decision_engine, M2GatedDecisionEngine)
    settings = Settings(
        supabase_jwt_secret="test",
        decision_model_provider="xgboost",
    )
    orchestrator = build_linear_analysis_orchestrator(settings)
    assert isinstance(orchestrator.decision_engine, XGBoostDecisionEngine)
