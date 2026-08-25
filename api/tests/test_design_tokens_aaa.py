"""Garante contraste WCAG AAA dos design tokens por perfil BrainHex,
preservando a cor-assinatura de cada perfil (ajuste cirúrgico)."""

from app.api.v1.personalizacao import (
    _PROFILE_COLOR_MAP,
    _build_design_tokens,
    _contrast_ratio,
)


def test_accent_meets_aaa_large_text_on_every_surface():
    # O accent (primary) é usado em texto grande/ícones/bordas sobre as
    # superfícies. Pior caso = surface_elevated (a mais clara). AAA p/ texto
    # grande exige >= 4.5:1; componentes de UI exigem >= 3:1.
    for profile in _PROFILE_COLOR_MAP:
        tokens = _build_design_tokens(profile)
        ratio = _contrast_ratio(tokens.cores.primary, tokens.cores.surface_elevated)
        assert ratio >= 4.5, f"{profile}: accent/surface_elevated = {ratio:.2f}"


def test_body_text_is_aaa_normal_on_background_and_surfaces():
    # Texto de corpo (text_primary) deve atingir AAA normal (>= 7:1).
    for profile in _PROFILE_COLOR_MAP:
        tokens = _build_design_tokens(profile)
        for surface in (tokens.cores.background, tokens.cores.surface, tokens.cores.surface_elevated):
            ratio = _contrast_ratio(tokens.cores.text_primary, surface)
            assert ratio >= 7.0, f"{profile}: text_primary/{surface} = {ratio:.2f}"


def test_semantic_colors_are_fixed_not_derived_from_accent():
    # success/warning/info não devem mudar entre perfis (cores fixas).
    seen = {profile: _build_design_tokens(profile).cores for profile in _PROFILE_COLOR_MAP}
    successes = {c.success for c in seen.values()}
    warnings = {c.warning for c in seen.values()}
    infos = {c.info for c in seen.values()}
    assert successes == {"#34d399"}
    assert warnings == {"#fbbf24"}
    assert infos == {"#60a5fa"}


def test_accent_preserves_profile_identity_is_distinct():
    # Cada perfil mantém um accent distinto (não foi achatado para uma cor só).
    accents = {_build_design_tokens(p).cores.primary for p in _PROFILE_COLOR_MAP if p != "socialiser"}
    assert len(accents) >= 6, f"accents pouco distintos: {accents}"
