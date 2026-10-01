"""Gate M2: inferência local dos modelos de knowledge tracing (issue #215).

Dois modelos distintos, dois papéis — nunca intercambiáveis:

- ``m2_model_v3`` (25 feats): "o aluno acerta esta questão?" (``dominio``).
- ``m2_gate_v3`` (30 feats): "o aluno vai travar neste tópico?" (``gate``).

Os valores de ``diff``/``global`` são do EdNet (não calibrados em dado
próprio): as probabilidades valem como *ordenação*, nunca como nível
absoluto. Limiar absoluto em produção fica bloqueado até a recalibração
(``m2_calibrated=false``).

Qualquer falha (pickle ausente, sha divergente, feature faltando) devolve
``origem="regra"`` — o ciclo de análise nunca cai por causa do M2.
"""

from __future__ import annotations

import hashlib
import logging
import pickle
import threading
from dataclasses import dataclass, field
from pathlib import Path

logger = logging.getLogger(__name__)

# Features que só existem DEPOIS da resposta (latência/trocas da questão
# atual). O modelo de domínio nunca pode recebê-las — é vazamento
# (RELATORIO_M2 apêndice; 15_treina_v3.py POSTERIOR).
POSTERIOR_FEATURES = frozenset({"log_lat", "log_lat1", "lat_rel", "n_trocas", "q_no_bundle"})

# Sentinelas idênticas às do treino (14_features_v3.py): média vazia -> 0.5,
# tempo/latência sem passado -> -1.0.
COLD_DEFAULTS: dict[str, float] = {
    "n_prev": 0.0,
    "acc_prev": 0.5,
    "ewma": 0.5,
    "n_prev_part": 0.0,
    "acc_prev_part": 0.5,
    "ewma_part": 0.5,
    "streak": 0.0,
    "dt_log": -1.0,
    "dt_part_log": -1.0,
    "seen_before": 0.0,
    "ntags": 0.0,
    "diagnosis": 0.0,
    "part": 1.0,
    "q_n": 0.0,
    "acc5": 0.5,
    "acc10": 0.5,
    "n_sessao": 1.0,
    "pos_sessao": 1.0,
    "lat_med_prev": -1.0,
    "trocas_prev": 0.0,
    "log_lat": 0.0,
    "log_lat1": 0.0,
    "lat_rel": 0.0,
    "n_trocas": 0.0,
    "log_expl": 0.0,
    "n_aulas": 0.0,
    "n_quits": 0.0,
    "mobile": 0.0,
    "q_no_bundle": 0.0,
}

# sha256 pinados (models/README.md). Pickle é código executável: fora
# desses hashes, o loader recusa.
EXPECTED_SHA256 = {
    "m2_model_v3.pkl": "efc647e703b60a4b2dbc28d464769bde6efa576ce9e5a3043e6786ba3037d9b8",
    "m2_gate_v3.pkl": "03a681921b165e517a7697030610e283c6eef99756cb29832868602e68e04a8b",
}

MODEL_DIR = Path(__file__).resolve().parents[3] / "models" / "m2_knowledge_tracing" / "v3"


def _to_diff_dict(diff: object) -> dict[int, float]:
    """Converte a Series de dificuldade (pandas é dep da API)."""
    to_dict = getattr(diff, "to_dict", None)
    if callable(to_dict):
        diff = to_dict()
    if hasattr(diff, "items"):
        return {int(k): float(v) for k, v in (diff.items())}  # type: ignore[union-attr]
    return {int(k): float(v) for k, v in dict(diff).items()}


@dataclass(slots=True)
class M2Bundle:
    name: str
    feats: list[str]
    diff: dict[int, float]
    global_rate: float
    _model: object = field(repr=False)

    def predict(self, row: dict[str, float]) -> float:
        """predict_proba da classe 1 com as colunas na ordem de ``feats`` (numpy, sem pandas)."""
        import numpy as np

        ordered = np.array([[row[feat] for feat in self.feats]], dtype=np.float64)
        return float(self._model.predict_proba(ordered)[0, 1])  # type: ignore[union-attr]


class M2Inference:
    """Carrega os dois .pkl uma vez (lazy) e pontua. Thread-safe."""

    def __init__(self, model_dir: Path = MODEL_DIR) -> None:
        self._model_dir = model_dir
        self._lock = threading.Lock()
        self._bundles: dict[str, M2Bundle | None] = {}

    def _load(self, filename: str) -> M2Bundle | None:
        if filename in self._bundles:
            return self._bundles[filename]
        with self._lock:
            if filename in self._bundles:
                return self._bundles[filename]
            bundle = self._load_artifact(filename)
            self._bundles[filename] = bundle
            return bundle

    def _load_artifact(self, filename: str) -> M2Bundle | None:
        path = self._model_dir / filename
        try:
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
        except OSError:
            return None
        if digest != EXPECTED_SHA256.get(filename):
            return None
        try:
            import sklearn.ensemble  # noqa: F401 — registra HistGradientBoostingClassifier p/ o unpickle.

            with path.open("rb") as fh:
                pacote = pickle.load(fh)
            feats = list(pacote["feats"])
            diff = _to_diff_dict(pacote["diff"])
            return M2Bundle(
                name=filename,
                feats=feats,
                diff=diff,
                global_rate=float(pacote["global"]),
                _model=pacote["model"],
            )
        except Exception as exc:
            logger.warning("M2 %s indisponivel: %s", filename, exc)
            return None

    def build_row(self, bundle: M2Bundle, overrides: dict[str, float]) -> dict[str, float]:
        """Monta a linha na ordem de ``feats``: override + default de treino.

        ``q_dif`` nunca vem de ``overrides``: sempre deriva de
        ``diff``/``global`` do pacote (dificuldade EdNet encolhida, prior 20).
        """
        row: dict[str, float] = {}
        for feat in bundle.feats:
            if feat == "q_dif":
                continue
            if feat in overrides:
                row[feat] = float(overrides[feat])
            else:
                row[feat] = COLD_DEFAULTS[feat]
        return row

    def q_difficulty(self, bundle: M2Bundle, qidx: int | None) -> float:
        if qidx is None:
            return bundle.global_rate
        return bundle.diff.get(int(qidx), bundle.global_rate)

    def score_dominio(self, overrides: dict[str, float], qidx: int | None = None) -> tuple[float | None, str]:
        """P(acerta a próxima questão). Recusa posteriores (vazamento)."""
        if POSTERIOR_FEATURES & set(overrides):
            return None, "regra"
        bundle = self._load("m2_model_v3.pkl")
        if bundle is None:
            return None, "regra"
        row = self.build_row(bundle, overrides)
        row["q_dif"] = self.q_difficulty(bundle, qidx)
        try:
            return bundle.predict(row), "m2:v3"
        except Exception:
            return None, "regra"

    def score_gate(self, overrides: dict[str, float], qidx: int | None = None) -> tuple[float | None, str]:
        """P(trava no tópico: acerto das próximas 10 < 50%)."""
        bundle = self._load("m2_gate_v3.pkl")
        if bundle is None:
            return None, "regra"
        row = self.build_row(bundle, overrides)
        row["q_dif"] = self.q_difficulty(bundle, qidx)
        try:
            return bundle.predict(row), "m2:v3"
        except Exception:
            return None, "regra"


_inference = M2Inference()


def get_m2_inference() -> M2Inference:
    return _inference
