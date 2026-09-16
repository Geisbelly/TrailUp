import pytest

from app.core.settings import Settings
from app.services import arte_combate
from app.services.behavioral_personalization import (
    _PROFILE_PRESETS,
    build_behavioral_personalization,
)

BASE = "https://pub-exemplo.r2.dev"


def _settings(base: str | None = None) -> Settings:
    return Settings(openai_api_key=None, gemini_api_key=None, arte_base_url=base)


def _context(perfil: str = "Achiever") -> dict:
    return {
        "aluno": {"modo_operacao": "imediato", "modo_resposta": "imediato"},
        "perfil_brainhex": [{"perfil": perfil, "afinidade": 90}],
        "desempenho_recente": {
            "media_acertos": 84,
            "percentual_concluido": 72,
            "tempo_medio_min": 11,
        },
        "historico_eventos": [],
    }


# --------------------------------------------------------------------------
# O catalogo nao pode dessincronizar dos presets
# --------------------------------------------------------------------------


def test_todo_preset_de_perfil_tem_arte_no_catalogo() -> None:
    """Perfil sem entrada aqui viraria boss sem imagem, calado.

    E o mesmo modo de falha das conquistas: cadastrada com sucesso, nunca
    destravada, sem aviso. Este teste e o que impede.
    """
    presets_de_perfil = {dados["preset"] for dados in _PROFILE_PRESETS.values()}
    faltando = presets_de_perfil - set(arte_combate.PRESETS_CONHECIDOS)
    assert not faltando, f"presets sem arte no catalogo: {sorted(faltando)}"


def test_preset_padrao_existe_no_catalogo() -> None:
    assert arte_combate.PRESET_PADRAO in arte_combate.PRESETS_CONHECIDOS


# --------------------------------------------------------------------------
# Sem base configurada, nada muda
# --------------------------------------------------------------------------


def test_sem_base_as_quatro_urls_sao_none() -> None:
    urls = arte_combate.urls_do_preset(_settings(None), "arena")
    assert urls == {
        "avatar_url": None,
        "background_url": None,
        "frame_url": None,
        "effect_url": None,
    }


def test_base_sem_esquema_e_recusada() -> None:
    """`pub-exemplo.r2.dev` sem https vira <Image> quebrada no aparelho."""
    assert arte_combate.base_de_arte(_settings("pub-exemplo.r2.dev")) is None


def test_base_com_barra_final_e_normalizada() -> None:
    urls = arte_combate.urls_do_preset(_settings(BASE + "/"), "arena")
    assert urls["avatar_url"] == f"{BASE}/combate/boss/arena.png"


# --------------------------------------------------------------------------
# Montagem
# --------------------------------------------------------------------------


def test_urls_do_preset_monta_as_quatro() -> None:
    urls = arte_combate.urls_do_preset(_settings(BASE), "rift")
    assert urls["avatar_url"] == f"{BASE}/combate/boss/rift.png"
    assert urls["background_url"] == f"{BASE}/combate/cenario/campina-escura.jpg"
    assert urls["frame_url"] == f"{BASE}/combate/moldura/padrao.png"
    # Nao ha peca de efeito identificada na pasta: None e a resposta honesta.
    assert urls["effect_url"] is None


def test_preset_desconhecido_cai_no_padrao() -> None:
    desconhecido = arte_combate.urls_do_preset(_settings(BASE), "nao-existe")
    padrao = arte_combate.urls_do_preset(_settings(BASE), arte_combate.PRESET_PADRAO)
    assert desconhecido == padrao


def test_catalogo_para_prompt_lista_os_sete() -> None:
    catalogo = arte_combate.catalogo_para_prompt(_settings(BASE))
    assert catalogo["disponivel"] is True
    assert set(catalogo["presets"]) == set(arte_combate.PRESETS_CONHECIDOS)


def test_catalogo_para_prompt_sem_base_manda_emitir_null() -> None:
    catalogo = arte_combate.catalogo_para_prompt(_settings(None))
    assert catalogo["disponivel"] is False
    assert catalogo["presets"] == {}


# --------------------------------------------------------------------------
# Saneamento: URL nao sai de LLM
# --------------------------------------------------------------------------


def test_url_inventada_volta_para_o_default_do_preset() -> None:
    saneado = arte_combate.sanear_visual(
        {"preset": "veil", "avatarUrl": "https://exemplo.invalido/boss-inventado.png"},
        _settings(BASE),
    )
    assert saneado["avatarUrl"] == f"{BASE}/combate/boss/veil.png"


def test_url_legitima_de_outro_preset_e_mantida() -> None:
    """Trocar a cena por outra da lista e permitido; inventar nao."""
    outra_cena = f"{BASE}/combate/cenario/nuvem.jpg"
    saneado = arte_combate.sanear_visual(
        {"preset": "rift", "backgroundUrl": outra_cena},
        _settings(BASE),
    )
    assert saneado["backgroundUrl"] == outra_cena


def test_sem_base_url_inventada_vira_none() -> None:
    saneado = arte_combate.sanear_visual(
        {"preset": "arena", "avatarUrl": "https://exemplo.invalido/x.png"},
        _settings(None),
    )
    assert saneado["avatarUrl"] is None


def test_espaco_em_volta_da_url_nao_a_invalida() -> None:
    legitima = f"{BASE}/combate/boss/arena.png"
    saneado = arte_combate.sanear_visual(
        {"preset": "arena", "avatarUrl": f"  {legitima}  "},
        _settings(BASE),
    )
    assert saneado["avatarUrl"] == legitima


def test_sanear_patch_cobre_session_topic_e_items() -> None:
    invento = "https://exemplo.invalido/x.png"

    def _feature() -> dict:
        return {
            "key": "battle_mode",
            "battle": {"enemy": {"visual": {"preset": "oracle", "avatarUrl": invento}}},
        }

    patch = {
        "session": [_feature()],
        "topic": [_feature()],
        "items": {"content:53": [_feature()]},
    }
    arte_combate.sanear_patch(patch, _settings(BASE))

    esperado = f"{BASE}/combate/boss/oracle.png"
    assert patch["session"][0]["battle"]["enemy"]["visual"]["avatarUrl"] == esperado
    assert patch["topic"][0]["battle"]["enemy"]["visual"]["avatarUrl"] == esperado
    assert patch["items"]["content:53"][0]["battle"]["enemy"]["visual"]["avatarUrl"] == esperado


def test_sanear_patch_espelha_avatar_no_enemy() -> None:
    """O mobile le `visual?.avatarUrl ?? enemy.avatarUrl`.

    Sem espelhar, a URL descartada voltaria pelo campo de fora.
    """
    patch = {
        "topic": [
            {
                "battle": {
                    "enemy": {
                        "avatarUrl": "https://exemplo.invalido/x.png",
                        "visual": {"preset": "parade"},
                    }
                }
            }
        ]
    }
    arte_combate.sanear_patch(patch, _settings(BASE))
    inimigo = patch["topic"][0]["battle"]["enemy"]
    assert inimigo["avatarUrl"] == f"{BASE}/combate/boss/parade.png"
    assert inimigo["visual"]["avatarUrl"] == inimigo["avatarUrl"]


def test_sanear_patch_aguenta_shape_torto() -> None:
    """O patch pode vir do modelo: nada aqui pode estourar."""
    for entrada in (None, [], "texto", {"topic": "nao-e-lista"}, {"items": []}):
        arte_combate.sanear_patch(entrada, _settings(BASE))


# --------------------------------------------------------------------------
# Ponta a ponta pelo fallback
# --------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_fallback_entrega_boss_com_arte_quando_ha_base() -> None:
    patch = await build_behavioral_personalization(
        aluno_id="aluno-1",
        ciclo_id="ciclo-1",
        context=_context("Conqueror"),
        plano={"nivel": "equilibrado", "tom": "dinamico"},
        topico={"id": 9, "nome": "Equacoes"},
        conteudos=[{"id": 101, "titulo": "Resumo", "tipo": "texto", "conteudo": "equacao " * 120}],
        atividades=[{"id": 201, "titulo": "Desafio", "tipo": "quiz"}],
        questoes=[{"id": 301, "atividade_id": 201, "tipo": "multipla_escolha"}],
        cards=[{"id": 401, "titulo": "Card-chave"}],
        settings=_settings(BASE),
    )

    batalhas = [
        feature
        for features in patch.items.values()
        for feature in features
        if feature.key == "battle_mode" and feature.battle is not None
    ]
    assert batalhas, "o fallback deveria trazer um battle_mode"
    inimigo = batalhas[0].battle.enemy
    assert inimigo.visual.preset == "arena"
    assert inimigo.visual.avatar_url == f"{BASE}/combate/boss/arena.png"
    assert inimigo.visual.background_url == f"{BASE}/combate/cenario/campina-escura.jpg"
    assert inimigo.visual.frame_url == f"{BASE}/combate/moldura/padrao.png"
    assert inimigo.avatar_url == inimigo.visual.avatar_url


@pytest.mark.asyncio
async def test_fallback_sem_base_mantem_o_comportamento_antigo() -> None:
    patch = await build_behavioral_personalization(
        aluno_id="aluno-1",
        ciclo_id="ciclo-1",
        context=_context("Conqueror"),
        plano={"nivel": "equilibrado", "tom": "dinamico"},
        topico={"id": 9, "nome": "Equacoes"},
        conteudos=[{"id": 101, "titulo": "Resumo", "tipo": "texto", "conteudo": "equacao " * 120}],
        atividades=[{"id": 201, "titulo": "Desafio", "tipo": "quiz"}],
        questoes=[{"id": 301, "atividade_id": 201, "tipo": "multipla_escolha"}],
        cards=[{"id": 401, "titulo": "Card-chave"}],
        settings=_settings(None),
    )

    batalhas = [
        feature
        for features in patch.items.values()
        for feature in features
        if feature.key == "battle_mode" and feature.battle is not None
    ]
    assert batalhas
    visual = batalhas[0].battle.enemy.visual
    assert visual.avatar_url is None
    assert visual.background_url is None
    assert visual.frame_url is None
    assert visual.effect_url is None


def test_enemy_sem_visual_tambem_e_saneado() -> None:
    """O modelo pode abreviar o contrato e mandar so o avatarUrl de fora."""
    patch = {
        "topic": [
            {"battle": {"enemy": {"avatarUrl": "https://exemplo.invalido/x.png"}}}
        ]
    }
    arte_combate.sanear_patch(patch, _settings(BASE))
    avatar = patch["topic"][0]["battle"]["enemy"]["avatarUrl"]
    assert avatar == f"{BASE}/combate/boss/{arte_combate.PRESET_PADRAO}.png"


def test_placeholder_do_prompt_nao_vaza_para_o_app() -> None:
    """Se o modelo copiar o marcador do FORMATO ESPERADO em vez de resolve-lo."""
    saneado = arte_combate.sanear_visual(
        {
            "preset": "veil",
            "avatarUrl": "<arte_de_combate.presets[preset].avatarUrl ou null>",
        },
        _settings(BASE),
    )
    assert saneado["avatarUrl"] == f"{BASE}/combate/boss/veil.png"
