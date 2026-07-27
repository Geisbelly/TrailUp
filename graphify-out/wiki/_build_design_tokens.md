# _build_design_tokens

> 23 nodes

## Key Concepts

- **_build_design_tokens()** (17 connections) — `api/app/api/v1/personalizacao.py`
- **test_design_tokens_aaa.py** (8 connections) — `api/tests/test_design_tokens_aaa.py`
- **_hex_to_rgb()** (7 connections) — `api/app/api/v1/personalizacao.py`
- **_contrast_ratio()** (7 connections) — `api/app/api/v1/personalizacao.py`
- **_ensure_min_contrast()** (6 connections) — `api/app/api/v1/personalizacao.py`
- **_blend()** (5 connections) — `api/app/api/v1/personalizacao.py`
- **_set_lightness()** (5 connections) — `api/app/api/v1/personalizacao.py`
- **_rgb_to_hex()** (4 connections) — `api/app/api/v1/personalizacao.py`
- **_darken()** (4 connections) — `api/app/api/v1/personalizacao.py`
- **_relative_luminance()** (4 connections) — `api/app/api/v1/personalizacao.py`
- **_rgba()** (3 connections) — `api/app/api/v1/personalizacao.py`
- **test_accent_meets_aaa_large_text_on_every_surface()** (3 connections) — `api/tests/test_design_tokens_aaa.py`
- **test_body_text_is_aaa_normal_on_background_and_surfaces()** (3 connections) — `api/tests/test_design_tokens_aaa.py`
- **_normalize_profile_name()** (2 connections) — `api/app/api/v1/personalizacao.py`
- **_lighten()** (2 connections) — `api/app/api/v1/personalizacao.py`
- **test_semantic_colors_are_fixed_not_derived_from_accent()** (2 connections) — `api/tests/test_design_tokens_aaa.py`
- **test_accent_preserves_profile_identity_is_distinct()** (2 connections) — `api/tests/test_design_tokens_aaa.py`
- **DesignTokens** (1 connections)
- **Retorna `color` com a luminosidade (HLS) substituida, preservando matiz e satura** (1 connections) — `api/app/api/v1/personalizacao.py`
- **Luminância relativa sRGB (WCAG 2.x).** (1 connections) — `api/app/api/v1/personalizacao.py`
- **Razão de contraste WCAG entre duas cores hex (1.0–21.0).** (1 connections) — `api/app/api/v1/personalizacao.py`
- **Eleva a luminosidade (HLS) de `color` até atingir `min_ratio` de contraste     c** (1 connections) — `api/app/api/v1/personalizacao.py`
- **Garante contraste WCAG AAA dos design tokens por perfil BrainHex, preservando a** (1 connections) — `api/tests/test_design_tokens_aaa.py`

## Relationships

- [v1/personalizacao.py](v1-personalizacao.py.md) (15 shared connections)
- [AccessRepository](AccessRepository.md) (3 shared connections)

## Source Files

- `api/app/api/v1/personalizacao.py`
- `api/tests/test_design_tokens_aaa.py`

## Audit Trail

- EXTRACTED: 90 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*