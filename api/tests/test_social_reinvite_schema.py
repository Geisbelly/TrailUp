from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / "docs/mobile/sql/20260920_01_social_reenviar_convite.sql").read_text(encoding="utf-8")


def test_concurrent_inserts_lock_existing_relationship():
    assert "ON CONFLICT (aluno_a_id, aluno_b_id) DO NOTHING" in SQL
    assert "RETURNING * INTO v_rel" in SQL
    assert "IF NOT FOUND THEN" in SQL
    assert "INTO STRICT v_rel" in SQL
    assert "FOR UPDATE" in SQL


def test_reinvite_preserves_identity_and_resets_response():
    assert "SET status = 'pending', solicitante_id = v_me, blocked_by_id = NULL" in SQL
    assert "responded_at = NULL" in SQL
    assert "DELETE FROM" not in SQL


def test_existing_states_and_authorization_are_preserved():
    for text in ("v_me IS NULL", "public.social_sao_colegas", "RAISE EXCEPTION 'blocked'",
                 "already_friends", "already_pending", "SET status = 'accepted'"):
        assert text in SQL


def test_notifications_are_sent_only_for_state_changes():
    assert SQL.index("'already_pending'") < SQL.index("'social_convite_recebido'")
    assert "gen_random_uuid()::text" in SQL
    assert "'social_convite_aceito'" in SQL
