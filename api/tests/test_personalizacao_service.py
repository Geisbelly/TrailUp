import pytest
from unittest.mock import AsyncMock

from app.core.settings import Settings
from app.services import personalizacao as personalizacao_service
from app.services.personalizacao import (
    _build_editorial_model,
    _build_profile_editorial_context,
    _evaluate_media_payload_quality,
    _extract_source_materials,
    _fallback_materiais,
    _fallback_plano_for_state,
    _hydrate_source_materials_content,
    _merge_source_materials,
    _normalize_materiais,
    _persist_hydrated_sources_into_fontes,
    _recomendar_formatos,
    _split_text_chunks,
    _summarize_sources_debug,
    backfill_media_render_jobs,
    build_personalizacao_steps,
    generate_materiais_personalizados,
    persist_personalizacao_record,
)


def test_recomendar_formatos_deriva_multiformato_a_partir_de_pdfs() -> None:
    formatos = _recomendar_formatos(
        perfil="Mastermind",
        modo_operacao="analitico",
        materiais_origem=[
            {
                "tipo": "pdf",
                "titulo": "Apostila 1",
                "url": "https://cdn.example.com/material.pdf",
            }
        ],
    )

    assert "markdown" in formatos
    assert "apresentacao" in formatos
    assert len(formatos) >= 2


def test_fallback_plano_for_state_usa_fontes_originais_no_plano() -> None:
    plano = _fallback_plano_for_state(
        {
            "perfil_brainhex": [{"perfil": "Seeker", "afinidade": 90}],
            "modo_operacao": "exploratorio",
            "materiais_origem": [
                {"tipo": "pdf", "titulo": "PDF base"},
                {"tipo": "video", "titulo": "Video base"},
            ],
        }
    )

    assert plano["formato_prioritario"] in plano["formatos"]
    assert any(formato in plano["formatos"] for formato in ("imagem", "apresentacao", "documento"))


def test_fallback_materiais_gera_documento_apresentacao_e_imagem() -> None:
    materiais = _fallback_materiais(
        formatos=["documento", "apresentacao", "imagem", "cards"],
        conteudos=[{"conteudo": "Conceito principal"}, {"conteudo": "Exemplo aplicado"}],
        perfil="Achiever",
        materiais_origem=[
            {"tipo": "pdf", "titulo": "Guia base", "texto_base": "Resumo do PDF"},
            {"tipo": "video", "titulo": "Video base", "descricao": "Explicacao em video"},
        ],
    )

    assert "documento" in materiais
    assert "apresentacao" in materiais
    assert "imagem" in materiais
    assert materiais["apresentacao"]["slides"]
    assert materiais["imagem"]["prompt_imagem"]
    assert materiais["documento"]["tema_visual"]["cores"]["primaria"] == "#AD6002"
    assert materiais["apresentacao"]["tema_visual"]["perfil"] == "Achiever"


def test_fallback_materiais_nao_gera_texto_com_mojibake() -> None:
    materiais = _fallback_materiais(
        formatos=["quiz", "cards", "audio", "video", "imagem", "documento", "apresentacao", "pdf"],
        conteudos=[{"conteudo": "Conceitos de sistemas distribuídos e sockets."}],
        perfil="Achiever",
        materiais_origem=[{"tipo": "pdf", "titulo": "Aula 1", "texto_base": "Conteúdo base"}],
    )

    serialized = str(materiais)
    assert "Ã" not in serialized


def test_normalize_materiais_preserva_novos_artefatos() -> None:
    materiais = _normalize_materiais(
        {
            "documento": {
                "titulo": "Dossie",
                "resumo": "Resumo",
                "secoes": ["Etapa 1", "Etapa 2"],
            },
            "apresentacao": {
                "titulo": "Slides",
                "abertura": "Abertura",
                "slides": [{"titulo": "Slide 1", "pontos": ["P1", "P2"]}],
            },
            "imagem": {
                "titulo": "Cena",
                "legenda": "Legenda",
                "prompt_imagem": "Prompt",
            },
        },
        {
            "conteudo_foco_id": 44,
            "conteudo_boss_foco_id": 44,
            "perfil_brainhex": [{"perfil": "Seeker", "afinidade": 95}],
        },
    )

    assert materiais["documento"]["payload"]["titulo"] == "Dossie"
    assert materiais["apresentacao"]["payload"]["slides"][0]["titulo"] == "Slide 1"
    assert materiais["imagem"]["payload"]["prompt_imagem"] == "Prompt"
    assert materiais["documento"]["payload"]["tema_visual"]["perfil"] == "Seeker"
    assert materiais["imagem"]["payload"]["tema_visual"]["cores"]["primaria"] == "#A78C07"
    assert materiais["imagem"]["item_key"] == "content:44"


def test_normalize_materiais_pdf_nao_serializa_html_no_contrato() -> None:
    materiais = _normalize_materiais(
        {
            "pdf": {
                "titulo": "Guia final",
                "resumo": "Resumo objetivo",
                "secoes": ["Bloco 1", "Bloco 2"],
            }
        },
        {
            "conteudo_foco_id": 77,
            "conteudo_boss_foco_id": 77,
        },
    )

    assert materiais["pdf"]["payload"]["titulo"] == "Guia final"
    assert "html" not in materiais["pdf"]["payload"]
    assert "render_info" not in materiais["pdf"]["payload"]


def test_normalize_materiais_documento_nao_injeta_secoes_desconexas() -> None:
    materiais = _normalize_materiais(
        {
            "documento": {
                "titulo": "Documento base",
                "resumo": "Resumo alinhado ao tema",
                "secoes": ["Conceito principal", "Exemplo aplicado"],
            }
        },
        {
            "conteudo_foco_id": 120,
            "conteudo_boss_foco_id": 120,
            "topico_contexto": {"nome": "Sistemas DistribuÃ­dos", "descricao": "Conceitos e aplicaÃ§Ãµes"},
            "materiais_origem": [
                {"tipo": "pdf", "texto_extraido": "Texto externo irrelevante sobre assunto diferente."}
            ],
        },
    )

    secoes = materiais["documento"]["payload"]["secoes"]
    assert len(secoes) == 2
    assert secoes == ["Conceito principal", "Exemplo aplicado"]


def test_split_text_chunks_limpa_marcadores_de_fonte_e_truncamentos() -> None:
    raw_text = (
        "[Fonte 1 (O Plano) Ã¢â‚¬â€ Slide 2] ## O Plano - IntroduÃƒÂ§ÃƒÂ£o ÃƒÂ  computaÃƒÂ§ÃƒÂ£o distribuÃƒÂ­da. --- "
        "[Fonte 2 (Programa) Ã¢â‚¬â€ Slide 4] ## Programa - ComunicaÃƒÂ§ÃƒÂ£o em sistemas distribuÃƒÂ­dos. "
        "1.2 Diversos IP associados2 Conectar no IP."
    )

    chunks = _split_text_chunks(raw_text, window=280, overlap=40)

    assert chunks
    assert all("[Fonte" not in chunk for chunk in chunks)
    assert all("##" not in chunk for chunk in chunks)
    assert any("introdu" in chunk.lower() for chunk in chunks)
    assert any("associados 2 Conectar" in chunk for chunk in chunks)


def test_normalize_materiais_limpa_texto_quebrado_para_midias() -> None:
    materiais = _normalize_materiais(
        {
            "audio": {"roteiro": "[Fonte 1] ## Roteiro --- Resumo com exemplos."},
            "video": {
                "roteiro": "[Fonte 2] ## Video --- Explicar conceito.",
                "cenas": ["[Fonte 3] ## Cena 1 --- Abertura", "Cena 2"],
            },
        },
        {
            "conteudo_foco_id": 88,
            "conteudo_boss_foco_id": 88,
        },
    )

    assert "[Fonte" not in materiais["audio"]["payload"]["roteiro"]
    assert "---" not in materiais["audio"]["payload"]["roteiro"]
    assert "[Fonte" not in materiais["video"]["payload"]["roteiro"]
    assert all("[Fonte" not in item for item in materiais["video"]["payload"]["cenas"])


def test_normalize_materiais_fallbacks_mantem_ptbr_com_acentos() -> None:
    materiais = _normalize_materiais(
        {
            "apresentacao": {
                "slides": [],
            },
        },
        {
            "conteudo_foco_id": 99,
            "conteudo_boss_foco_id": 99,
        },
    )

    payload = materiais["apresentacao"]["payload"]
    assert payload["titulo"] == "Apresenta\u00e7\u00e3o: t\u00f3pico"
    assert "aplica\u00e7\u00f5es de t\u00f3pico" in payload["abertura"].lower()


def test_fallback_atividade_ptbr_tem_acentos() -> None:
    atividade = personalizacao_service._fallback_atividade(
        index=1,
        topic_name="Sistemas distribu\u00eddos",
        total=6,
    )

    questao = atividade["questoes"][0]
    assert "Pr\u00e1tica orientada" in atividade["descricao"]
    assert "Sistemas distribu\u00eddos" in questao["enunciado"]


def test_normalize_materiais_converte_questoes_achatadas_em_atividades_distintas() -> None:
    materiais = _normalize_materiais(
        {
            "atividades": [
                {
                    "enunciado": "Pergunta 1",
                    "tipo": "quiz",
                    "alternativas": ["A", "B", "C", "D"],
                    "resposta_correta": "A",
                },
                {
                    "enunciado": "Pergunta 2",
                    "tipo": "essay",
                    "resposta_correta": "Guia de resposta",
                },
            ]
        },
        {
            "conteudo_foco_id": 91,
            "conteudo_boss_foco_id": 91,
        },
    )

    atividades = materiais["quiz"]["payload"]["atividades"]
    matched = [
        atividade
        for atividade in atividades
        if (atividade.get("questoes") or [{}])[0].get("enunciado") in {"Pergunta 1", "Pergunta 2"}
    ]

    assert len(matched) == 2
    assert all(len(atividade.get("questoes") or []) == 1 for atividade in matched)


def test_merge_source_materials_preserva_uploads_sem_duplicar_fontes() -> None:
    merged = _merge_source_materials(
        [
            {
                "source_id": "conteudo:1:texto",
                "conteudo_id": 1,
                "tipo": "pdf",
                "titulo": "Guia base",
                "url": "https://cdn.example.com/guia.pdf",
                "texto_base": "Resumo base",
            }
        ],
        [
            {
                "source_id": "fonte:9",
                "conteudo_id": 1,
                "tipo": "pdf",
                "titulo": "Guia base",
                "url": "https://cdn.example.com/guia.pdf",
                "texto_base": "Resumo base",
            },
            {
                "source_id": "fonte:10",
                "conteudo_id": 1,
                "tipo": "apresentacao",
                "titulo": "Slides complementares",
                "url": "https://cdn.example.com/slides.pptx",
                "texto_base": "Aula em slides",
            },
        ],
    )

    assert len(merged) == 2
    assert any(source["source_id"] == "fonte:10" for source in merged)


def test_build_personalizacao_steps_aceita_payloads_legados_em_lista() -> None:
    steps = build_personalizacao_steps(
        {
            "id": 7,
            "topico_id": 20,
            "conteudo_id": 33,
            "formato_prioritario": "cards",
            "formatos_gerados": ["cards", "quiz", "apresentacao"],
            "plano": {"justificativa": "Baseado no seu historico recente."},
            "materiais": {
                "cards": {
                    "payload": [
                        {"frente": "Conceito", "verso": "Explicacao"},
                    ]
                },
                "quiz": {
                    "payload": [
                        {"enunciado": "Pergunta", "alternativas": ["A", "B"], "resposta_correta": 0},
                    ]
                },
                "apresentacao": {
                    "payload": [
                        {"titulo": "Slide 1", "pontos": ["P1", "P2"]},
                    ]
                },
            },
        }
    )

    assert len(steps) >= 3
    cards_step = next(step for step in steps if step["metadata"]["material_type"] == "cards")
    quiz_step = next(step for step in steps if step["kind"] == "activity")
    apresentacao_step = next(step for step in steps if step["metadata"]["material_type"] == "apresentacao")

    assert cards_step["blocks"][0]["payload"]["cards"][0]["frente"] == "Conceito"
    assert quiz_step["activity"]["questoes"][0]["enunciado"] == "Pergunta"
    assert apresentacao_step["blocks"][0]["payload"]["slides"][0]["titulo"] == "Slide 1"


def test_build_personalizacao_steps_ignora_midia_pendente_ou_falha() -> None:
    steps = build_personalizacao_steps(
        {
            "id": 11,
            "topico_id": 2,
            "conteudo_id": 4,
            "formatos_gerados": ["cards", "audio", "markdown"],
            "materiais": {
                "cards": {
                    "payload": [{"frente": "Pergunta", "verso": "Resposta"}],
                    "metadata": {"status": "completed"},
                },
                "audio": {
                    "payload": {"roteiro": "Roteiro de áudio"},
                    "metadata": {"status": "pending"},
                },
                "markdown": {
                    "payload": {"texto": "Grimório narrativo"},
                    "metadata": {"status": "failed"},
                },
            },
        }
    )

    assert len(steps) == 1
    assert steps[0]["metadata"]["material_type"] == "cards"


def test_build_personalizacao_steps_ignora_formatos_failed_quality() -> None:
    steps = build_personalizacao_steps(
        {
            "id": 99,
            "topico_id": 2,
            "conteudo_id": 4,
            "formatos_gerados": ["cards", "quiz"],
            "materiais": {
                "cards": {
                    "payload": [{"frente": "Pergunta", "verso": "Resposta"}],
                    "metadata": {"status": "failed_quality", "quality_gate_rejected": True},
                },
                "quiz": {
                    "payload": {"atividades": [{"titulo": "Atividade 1", "tipo": "quiz", "questoes": []}]},
                    "metadata": {"status": "failed_quality", "quality_gate_rejected": True},
                },
            },
        }
    )

    assert steps == []


def test_collect_quality_rejected_formatos_ignora_nao_midia_do_multimodal() -> None:
    rejected = personalizacao_service._collect_quality_rejected_formatos(
        multistage_meta=None,
        multimodal_meta={"rejected_by_quality": ["quiz", "cards", "audio", "markdown"]},
    )

    assert rejected == {"audio", "markdown"}


def test_extract_source_materials_treats_storage_paths_as_conteudos_bucket() -> None:
    sources = _extract_source_materials(
        [
            {
                "id": 47,
                "titulo": "Video base",
                "tipo": "arquivo",
                "conteudo": None,
                "metadata": {
                    "files": [
                        {
                            "path": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/26/1775449584768_2024-05-01_22-31-11.mp4",
                            "name": "aula.mp4",
                        }
                    ]
                },
            }
        ],
        [],
    )

    assert sources[0]["storage_path"] == "b49f2e21-a6f9-4c8d-9533-5a32bb219754/26/1775449584768_2024-05-01_22-31-11.mp4"
    assert sources[0]["bucket"] == "conteudos"
    assert sources[0]["url"] is None


def test_extract_source_materials_uses_conteudo_payload_path_as_file_source() -> None:
    storage_path = "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
    sources = _extract_source_materials(
        [
            {
                "id": 107,
                "titulo": "Aula 1 - Introducao",
                "tipo": "arquivo",
                "conteudo": storage_path,
                "metadata": None,
            }
        ],
        [],
    )

    arquivo_source = next(source for source in sources if source["source_id"] == "conteudo:107:arquivo")
    assert arquivo_source["storage_path"] == storage_path
    assert arquivo_source["bucket"] == "conteudos"
    assert arquivo_source["tipo"] == "apresentacao"
    assert arquivo_source["texto_base"] in (None, "")
    assert not any(source["source_id"] == "conteudo:107:texto" for source in sources)


def test_summarize_sources_debug_reports_text_length_without_name_error() -> None:
    summary = _summarize_sources_debug(
        [
            {
                "source_id": "fonte:1",
                "origem": "sync_conteudo",
                "tipo": "pdf",
                "texto_extraido": "conteudo relevante",
            }
        ]
    )

    assert summary["total"] == 1
    assert summary["sample"][0]["texto_extraido_len"] == len("conteudo relevante")


@pytest.mark.asyncio
async def test_hydrate_source_materials_recovers_storage_path_from_descricao() -> None:
    sources = [
        {
            "source_id": "fonte:10",
            "origem": "sync_conteudo",
            "tipo": "arquivo",
            "titulo": "Aula 1 - Introducao",
            "descricao": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
            "storage_path": None,
            "bucket": None,
            "texto_base": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
        }
    ]
    settings = Settings(openai_api_key=None, gemini_api_key=None)

    hydrated = await _hydrate_source_materials_content(
        materiais_origem=sources,
        settings=settings,
    )

    assert hydrated[0]["storage_path"] == "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
    assert hydrated[0]["bucket"] == "conteudos"
    assert hydrated[0]["texto_extraido"]
    assert hydrated[0]["texto_extraido"] != sources[0]["descricao"]


@pytest.mark.asyncio
async def test_hydrate_source_materials_does_not_use_url_as_fallback_text(monkeypatch) -> None:
    async def _fail_ingest(*args, **kwargs):
        del args, kwargs
        raise RuntimeError("ingest_failed")

    monkeypatch.setattr("app.services.personalizacao._ingest_source", _fail_ingest)

    source_url = (
        "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/"
        "conteudos/b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
    )
    hydrated = await _hydrate_source_materials_content(
        materiais_origem=[
            {
                "source_id": "fonte:13",
                "origem": "sync_conteudo",
                "tipo": "arquivo",
                "titulo": "Aula 1 - Introducao",
                "descricao": source_url,
                "url": source_url,
                "storage_path": None,
                "bucket": "conteudos",
                "texto_base": source_url,
            }
        ],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    assert hydrated[0]["texto_extraido"]
    assert hydrated[0]["texto_extraido"] != source_url
    assert "https://" not in hydrated[0]["texto_extraido"]


@pytest.mark.asyncio
async def test_hydrate_source_materials_uses_storage_preview_text_when_ingestion_fails(monkeypatch) -> None:
    async def _fail_ingest(*args, **kwargs):
        del args, kwargs
        raise RuntimeError("ingest_failed")

    async def _fake_load_preview(self, **kwargs):
        del self, kwargs
        return {
            "arquivo_bytes": 2048,
            "arquivo_mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "texto_extraido": (
                "Sistemas distribuidos permitem cooperacao entre nos autonomos, "
                "com foco em escalabilidade, tolerancia a falhas e comunicacao em rede."
            ),
        }

    monkeypatch.setattr("app.services.personalizacao._ingest_source", _fail_ingest)
    monkeypatch.setattr(
        "app.services.personalizacao.SupabaseStorage.load_source_preview",
        _fake_load_preview,
    )

    hydrated = await _hydrate_source_materials_content(
        materiais_origem=[
            {
                "source_id": "fonte:18",
                "origem": "sync_conteudo",
                "tipo": "arquivo",
                "titulo": "Aula 1 - Introducao",
                "storage_path": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
                "bucket": "conteudos",
                "descricao": "Aula 1 - Introducao",
            }
        ],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    assert hydrated[0]["texto_extraido"].startswith("Sistemas distribuidos permitem cooperacao")
    assert hydrated[0]["tamanho_bytes"] == 2048
    assert (
        hydrated[0]["mime_type"]
        == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )


@pytest.mark.asyncio
async def test_hydrate_source_materials_keeps_preview_text_with_url_when_context_exists(monkeypatch) -> None:
    async def _fail_ingest(*args, **kwargs):
        del args, kwargs
        raise RuntimeError("ingest_failed")

    async def _fake_load_preview(self, **kwargs):
        del self, kwargs
        return {
            "arquivo_bytes": 1024,
            "arquivo_mime": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "texto_extraido": (
                "A aula explica sistemas distribuÃƒÂ­dos, escalabilidade e tolerÃƒÂ¢ncia a falhas. "
                "ReferÃƒÂªncia visual: https://example.com/slide.png"
            ),
        }

    monkeypatch.setattr("app.services.personalizacao._ingest_source", _fail_ingest)
    monkeypatch.setattr(
        "app.services.personalizacao.SupabaseStorage.load_source_preview",
        _fake_load_preview,
    )

    hydrated = await _hydrate_source_materials_content(
        materiais_origem=[
            {
                "source_id": "fonte:25",
                "origem": "sync_conteudo",
                "tipo": "arquivo",
                "titulo": "Aula 1 - Introducao",
                "storage_path": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
                "bucket": "conteudos",
                "descricao": "Aula 1 - Introducao",
            }
        ],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    assert "escalabilidade" in hydrated[0]["texto_extraido"].lower()
    assert hydrated[0]["texto_extraido"] != "Aula 1 IntroduÃƒÂ§ÃƒÂ£o"


@pytest.mark.asyncio
async def test_hydrate_source_materials_uses_doc_plain_text_when_chunks_are_empty(monkeypatch) -> None:
    class _Block:
        def __init__(self, text: str) -> None:
            self.text = text

    class _Doc:
        def __init__(self) -> None:
            self.blocks = [
                _Block("Sistemas distribuÃƒÂ­dos"),
                _Block("Escalabilidade e tolerÃƒÂ¢ncia a falhas"),
                _Block("ComunicaÃƒÂ§ÃƒÂ£o entre nÃƒÂ³s pela rede"),
            ]

        def plain_text(self, separator: str = "\n") -> str:
            return separator.join(block.text for block in self.blocks)

    async def _fake_ingest(*args, **kwargs):
        del args, kwargs
        return _Doc(), []

    monkeypatch.setattr("app.services.personalizacao._ingest_source", _fake_ingest)

    hydrated = await _hydrate_source_materials_content(
        materiais_origem=[
            {
                "source_id": "fonte:22",
                "origem": "sync_conteudo",
                "tipo": "arquivo",
                "titulo": "Aula 1 - Introducao",
                "storage_path": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
                "bucket": "conteudos",
            }
        ],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    assert hydrated[0]["arquivo_real_carregado"] is True
    assert "Escalabilidade e tolerÃ¢ncia a falhas" in hydrated[0]["texto_extraido"]
    assert hydrated[0]["texto_chunks"]


@pytest.mark.asyncio
async def test_hydrate_source_materials_collects_relevant_image_media() -> None:
    hydrated = await _hydrate_source_materials_content(
        materiais_origem=[
            {
                "source_id": "fonte:31",
                "origem": "sync_conteudo",
                "tipo": "imagem",
                "titulo": "Diagrama principal",
                "url": "https://cdn.example.com/assets/diagrama-spd.png",
                "mime_type": "image/png",
                "transcricao": "Diagrama do fluxo de comunicaÃ§Ã£o entre nÃ³s distribuÃ­dos.",
            }
        ],
        settings=Settings(openai_api_key=None, gemini_api_key=None),
    )

    assert hydrated[0]["midias_relevantes"]
    assert hydrated[0]["midias_relevantes"][0]["tipo"] == "imagem"
    assert hydrated[0]["midias_relevantes"][0]["url"] == "https://cdn.example.com/assets/diagrama-spd.png"


@pytest.mark.asyncio
async def test_persist_hydrated_sources_updates_fontes_with_extracted_text_and_file_fields() -> None:
    class _Repo:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        async def atualizar_enriquecimento(self, **kwargs):
            self.calls.append(kwargs)
            return True

    repo = _Repo()
    settings = Settings(
        openai_api_key=None,
        gemini_api_key=None,
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
    )
    extracted_text = (
        "Sistemas distribuÃƒÂ­dos sÃƒÂ£o compostos por nÃƒÂ³s autÃƒÂ´nomos que se comunicam por rede para "
        "compartilhar recursos, escalar processamento e manter tolerÃƒÂ¢ncia a falhas."
    )
    await _persist_hydrated_sources_into_fontes(
        fontes_repo=repo,
        materiais_origem=[
            {
                "source_id": "fonte:16",
                "origem": "sync_conteudo",
                "tipo": "arquivo",
                "bucket": "conteudos",
                "storage_path": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx",
                "mime_type": "application/octet-stream",
                "texto_extraido": extracted_text,
                "titulo": "Aula 1 - Introducao",
            }
        ],
        settings=settings,
    )

    assert len(repo.calls) == 1
    call = repo.calls[0]
    assert call["fonte_id"] == 16
    assert call["descricao"] == extracted_text
    assert call["storage_path"] == "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
    assert call["arquivo_url"] == (
        "https://xrebtkmdewolzmpsdwgh.supabase.co/storage/v1/object/public/"
        "conteudos/b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/1776024640723_SPD-Aula-01-introducao.pptx"
    )
    assert call["mime_type"] == "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    assert call["nome_arquivo"] == "1776024640723_SPD-Aula-01-introducao.pptx"


@pytest.mark.asyncio
async def test_persist_hydrated_sources_persists_midias_relevantes_in_metadata_patch() -> None:
    class _Repo:
        def __init__(self) -> None:
            self.calls: list[dict[str, object]] = []

        async def atualizar_enriquecimento(self, **kwargs):
            self.calls.append(kwargs)
            return True

    repo = _Repo()
    settings = Settings(
        openai_api_key=None,
        gemini_api_key=None,
        supabase_url="https://xrebtkmdewolzmpsdwgh.supabase.co",
    )
    await _persist_hydrated_sources_into_fontes(
        fontes_repo=repo,
        materiais_origem=[
            {
                "source_id": "fonte:91",
                "origem": "sync_conteudo",
                "tipo": "imagem",
                "bucket": "conteudos",
                "storage_path": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/diagrama-spd.png",
                "mime_type": "image/png",
                "texto_extraido": "Imagem de referÃªncia do conteÃºdo.",
                "titulo": "Diagrama SPD",
                "midias_relevantes": [
                    {
                        "tipo": "imagem",
                        "url": "https://cdn.example.com/diagrama-spd.png",
                        "storage_path": "b49f2e21-a6f9-4c8d-9533-5a32bb219754/114/diagrama-spd.png",
                        "bucket": "conteudos",
                        "mime_type": "image/png",
                        "titulo": "Diagrama SPD",
                    }
                ],
            }
        ],
        settings=settings,
    )

    assert len(repo.calls) == 1
    metadata_patch = repo.calls[0]["metadata_patch"]
    assert isinstance(metadata_patch, dict)
    assert metadata_patch["bucket"] == "conteudos"
    assert metadata_patch["midias_relevantes"][0]["tipo"] == "imagem"


@pytest.mark.asyncio
async def test_generate_materiais_fast_only_marks_media_as_pending(monkeypatch) -> None:
    async def _fake_multistage(**kwargs):
        del kwargs
        return (
            {
                "cards": [
                    {"frente": "Qual conceito central?", "verso": "Conceito central explicado."},
                    {"frente": "Qual evidencia principal?", "verso": "Evidencia ancorada no conteudo."},
                    {"frente": "Qual proximo passo?", "verso": "Aplicacao pratica em etapas."},
                ],
            },
            {
                "scores_validacao": {},
                "quality_gate": {},
                "rejected_by_quality": [],
            },
        )

    monkeypatch.setattr(
        personalizacao_service,
        "_invoke_multistage_materiais_por_formato",
        _fake_multistage,
    )

    state = {
        "aluno_id": "aluno-1",
        "classe_id": 10,
        "ciclo_id": "ciclo-fast",
        "payload_topico_id": 5,
        "conteudo_foco_id": 90,
        "conteudo_boss_foco_id": 90,
        "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 80}],
        "topico_contexto": {"nome": "Frac\u00f5es", "descricao": "Base de matem\u00e1tica"},
        "conteudos_topico": [{"titulo": "Conceitos", "descricao": "Descri\u00e7\u00e3o", "conteudo": "Conte\u00fado base"}],
        "cards_conteudo": [],
        "atividades_topico": [],
        "questoes_topico": [],
        "materiais_origem": [],
        "plano_personalizacao": {
            "formato_prioritario": "cards",
            "formatos": ["cards", "audio", "apresentacao"],
            "nivel": "equilibrado",
            "tom": "didatico",
        },
    }
    settings = Settings(
        openai_api_key=None,
        gemini_api_key=None,
        personalizacao_force_all_media_formats=False,
    )

    materiais = await generate_materiais_personalizados(state, settings, phase="fast_only")

    assert materiais["cards"]["metadata"]["status"] == "completed"
    for formato in ("audio", "apresentacao"):
        assert materiais[formato]["metadata"]["status"] == "pending"
    assert state["midias_em_processamento"] is True


@pytest.mark.asyncio
async def test_generate_materiais_fast_only_media_quality_reject_keeps_pending(monkeypatch) -> None:
    async def _fake_multistage(**kwargs):
        del kwargs
        return (
            {
                "cards": [
                    {"frente": "Qual conceito central?", "verso": "Conceito central explicado."},
                    {"frente": "Qual evidencia principal?", "verso": "Evidencia ancorada no conteudo."},
                    {"frente": "Qual proximo passo?", "verso": "Aplicacao pratica em etapas."},
                ],
            },
            {
                "scores_validacao": {},
                "quality_gate": {
                    "apresentacao": {"approved": False, "status": "rejected", "issues": ["conceitos_insuficientes"]},
                    "audio": {"approved": False, "status": "rejected", "issues": ["conceitos_insuficientes"]},
                },
                "rejected_by_quality": ["apresentacao", "audio"],
            },
        )

    async def _fake_multimodal(**kwargs):
        del kwargs
        return None, {"rejected_by_quality": ["apresentacao", "audio"]}

    monkeypatch.setattr(
        personalizacao_service,
        "_invoke_multistage_materiais_por_formato",
        _fake_multistage,
    )
    monkeypatch.setattr(
        personalizacao_service,
        "_invoke_multimodal_materiais",
        _fake_multimodal,
    )

    state = {
        "aluno_id": "aluno-1",
        "classe_id": 10,
        "ciclo_id": "ciclo-fast-quality",
        "payload_topico_id": 5,
        "conteudo_foco_id": 90,
        "conteudo_boss_foco_id": 90,
        "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 80}],
        "topico_contexto": {"nome": "Redes", "descricao": "Conceitos base"},
        "conteudos_topico": [{"titulo": "Conceitos", "descricao": "Descricao", "conteudo": "Conteudo base"}],
        "cards_conteudo": [],
        "atividades_topico": [],
        "questoes_topico": [],
        "materiais_origem": [],
        "plano_personalizacao": {
            "formato_prioritario": "cards",
            "formatos": ["cards", "apresentacao", "audio"],
            "nivel": "equilibrado",
            "tom": "didatico",
        },
    }
    settings = Settings(
        openai_api_key=None,
        gemini_api_key=None,
        personalizacao_force_all_media_formats=False,
    )

    materiais = await generate_materiais_personalizados(state, settings, phase="fast_only")

    assert materiais["cards"]["metadata"]["status"] == "completed"
    assert materiais["apresentacao"]["metadata"]["status"] == "pending"
    assert materiais["audio"]["metadata"]["status"] == "pending"
    assert materiais["apresentacao"]["metadata"].get("quality_gate_warning") is True
    assert materiais["audio"]["metadata"].get("quality_gate_warning") is True
    assert not materiais["apresentacao"]["metadata"].get("quality_gate_rejected")
    assert not materiais["audio"]["metadata"].get("quality_gate_rejected")
    assert state["midias_em_processamento"] is True


@pytest.mark.asyncio
async def test_generate_materiais_slow_only_merges_existing_materials(monkeypatch) -> None:
    async def _fake_materialize(**kwargs):
        media_materiais = kwargs["media_materiais"]
        audio = media_materiais["audio"]
        return (
            {
                "audio": {
                    **audio,
                    "arquivo_url": "https://cdn.example.com/material.mp3",
                    "metadata": {"status": "completed"},
                }
            },
            [],
        )

    monkeypatch.setattr(
        "app.services.personalizacao._materialize_and_upload_media_assets",
        _fake_materialize,
    )
    async def _fake_multistage(**kwargs):
        del kwargs
        return (
            {
                "audio": {
                    "roteiro": "Roteiro sobre o tema com hipotese e evidencia.",
                    "duracao_estimada_seg": 80,
                }
            },
            {
                "scores_validacao": {},
                "quality_gate": {},
                "rejected_by_quality": [],
            },
        )

    monkeypatch.setattr(
        "app.services.personalizacao._invoke_multistage_materiais_por_formato",
        _fake_multistage,
    )

    existing = {
        "cards": {
            "payload": [{"frente": "Q1", "verso": "R1"}],
            "metadata": {"status": "completed"},
        },
        "audio": {
            "payload": {"roteiro": "Roteiro pendente", "duracao_estimada_seg": 60},
            "metadata": {"status": "pending"},
        },
    }
    state = {
        "aluno_id": "aluno-1",
        "classe_id": 10,
        "ciclo_id": "ciclo-slow",
        "payload_topico_id": 5,
        "conteudo_foco_id": 90,
        "conteudo_boss_foco_id": 90,
        "perfil_brainhex": [{"perfil": "Achiever", "afinidade": 80}],
        "topico_contexto": {"nome": "Frac\u00f5es", "descricao": "Base de matem\u00e1tica"},
        "conteudos_topico": [{"titulo": "Conceitos", "descricao": "Descri\u00e7\u00e3o", "conteudo": "Conte\u00fado base"}],
        "cards_conteudo": [],
        "atividades_topico": [],
        "questoes_topico": [],
        "materiais_origem": [],
        "plano_personalizacao": {
            "formato_prioritario": "cards",
            "formatos": ["cards", "audio"],
            "nivel": "equilibrado",
            "tom": "didatico",
        },
    }
    settings = Settings(
        openai_api_key=None,
        gemini_api_key=None,
        personalizacao_force_all_media_formats=False,
    )

    materiais = await generate_materiais_personalizados(
        state,
        settings,
        phase="slow_only",
        existing_materiais=existing,
    )

    assert materiais["cards"]["metadata"]["status"] == "completed"
    assert materiais["audio"]["metadata"]["status"] == "completed"
    assert materiais["audio"]["arquivo_url"] == "https://cdn.example.com/material.mp3"
    assert state["midias_em_processamento"] is False


class _PersistSessionContext:
    async def __aenter__(self):
        return object()

    async def __aexit__(self, exc_type, exc, tb):
        del exc_type, exc, tb
        return False


class _PersistSessionFactory:
    def __call__(self):
        return _PersistSessionContext()


@pytest.mark.asyncio
async def test_persist_personalizacao_record_enqueues_media_job_and_injects_job_id(monkeypatch) -> None:
    state = {
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "classe_id": 30,
        "payload_topico_id": 114,
        "conteudo_foco_id": 107,
        "ciclo_id": "ciclo-xyz",
        "source_hash": "hash-xyz",
        "plano_personalizacao": {"formato_prioritario": "audio"},
        "materiais_personalizados": {
            "cards": {"payload": [{"frente": "Q", "verso": "R"}], "metadata": {"status": "completed"}},
            "audio": {"payload": {"roteiro": "Roteiro de áudio"}, "metadata": {"status": "pending"}},
        },
    }
    record = {
        "id": 106,
        "aluno_id": state["aluno_id"],
        "classe_id": 30,
        "topico_id": 114,
        "conteudo_id": 107,
        "ciclo_id": "ciclo-xyz",
        "source_hash": "hash-xyz",
        "status": "processando_midias",
        "materiais": {
            "cards": {"payload": [{"frente": "Q", "verso": "R"}], "metadata": {"status": "completed"}},
            "audio": {"payload": {"roteiro": "Roteiro de áudio"}, "metadata": {"status": "pending"}},
        },
    }

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.salvar",
        AsyncMock(return_value=record["id"]),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=record),
    )
    monkeypatch.setattr(
        personalizacao_service,
        "reconcile_material_links_for_record",
        AsyncMock(return_value=({"audio": 77}, 1)),
    )
    monkeypatch.setattr(
        personalizacao_service,
        "_enqueue_media_render_job_if_needed",
        AsyncMock(return_value={"id": "job-55"}),
    )
    monkeypatch.setattr(
        "app.repositories.materiais.MateriaisRepository.patch_materiais_media",
        AsyncMock(return_value={"id": 77}),
    )
    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.atualizar_materiais_e_status",
        AsyncMock(
            return_value={
                **record,
                "status": "processando_midias",
                "materiais": {
                    **record["materiais"],
                    "audio": {
                        "payload": {"roteiro": "Roteiro de áudio"},
                        "metadata": {"status": "pending", "job_id": "job-55"},
                        "arquivo_url": None,
                        "storage_path": None,
                    },
                },
            }
        ),
    )

    persisted = await persist_personalizacao_record(
        state=state,
        session_factory=_PersistSessionFactory(),
    )

    assert persisted["media_render_job_id"] == "job-55"
    assert state["media_render_job_id"] == "job-55"
    assert state["midias_em_processamento"] is True


@pytest.mark.asyncio
async def test_enqueue_media_render_job_reuses_open_job_with_same_profile_and_adds_target(monkeypatch) -> None:
    record = {
        "id": 106,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "classe_id": 30,
        "topico_id": 114,
        "conteudo_id": 107,
        "ciclo_id": "ciclo-xyz",
        "source_hash": "hash-xyz",
        "materiais": {
            "audio": {"payload": {"roteiro": "Roteiro de áudio"}, "metadata": {"status": "pending"}},
        },
    }
    state = {
        "aluno_id": record["aluno_id"],
        "classe_id": record["classe_id"],
        "payload_topico_id": record["topico_id"],
        "conteudo_foco_id": record["conteudo_id"],
        "ciclo_id": record["ciclo_id"],
        "source_hash": record["source_hash"],
        "perfil_dominante": "Achiever",
        "media_pending_payload": {"audio": {"payload": {"roteiro": "Roteiro de áudio"}}},
        "materiais_saved_ids": {"audio": 77},
    }

    find_open_mock = AsyncMock(
        return_value={
            "id": "job-open",
            "payload": {"formatos_pending": ["audio", "apresentacao"], "brainhex_profile_key": "achiever"},
        }
    )
    insert_targets_mock = AsyncMock(return_value=None)
    refresh_counters_mock = AsyncMock(
        return_value={
            "id": "job-open",
            "payload": {"formatos_pending": ["audio", "apresentacao"], "brainhex_profile_key": "achiever"},
        }
    )
    create_job_mock = AsyncMock(return_value={"id": "job-created"})

    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.find_open_job_by_payload",
        find_open_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.inserir_targets",
        insert_targets_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.refresh_job_counters",
        refresh_counters_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job",
        create_job_mock,
    )

    result = await personalizacao_service._enqueue_media_render_job_if_needed(
        session=object(),
        state=state,
        record=record,
    )

    assert result["id"] == "job-open"
    assert insert_targets_mock.await_count == 1
    assert refresh_counters_mock.await_count == 1
    assert create_job_mock.await_count == 0
    assert find_open_mock.await_args.kwargs["brainhex_profile_key"] == "achiever"


@pytest.mark.asyncio
async def test_enqueue_media_render_job_creates_new_job_when_profile_key_differs(monkeypatch) -> None:
    record = {
        "id": 202,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "classe_id": 30,
        "topico_id": 115,
        "conteudo_id": 111,
        "ciclo_id": "ciclo-2",
        "source_hash": "hash-2",
        "materiais": {
            "markdown": {"payload": {"texto": "Grimório narrativo"}, "metadata": {"status": "pending"}},
        },
    }
    state = {
        "aluno_id": record["aluno_id"],
        "classe_id": record["classe_id"],
        "payload_topico_id": record["topico_id"],
        "conteudo_foco_id": record["conteudo_id"],
        "ciclo_id": record["ciclo_id"],
        "source_hash": record["source_hash"],
        "perfil_dominante": "Survivor",
        "media_pending_payload": {"markdown": {"payload": {"texto": "Grimório narrativo"}}},
        "materiais_saved_ids": {"markdown": 601},
    }

    find_open_mock = AsyncMock(return_value=None)
    create_job_mock = AsyncMock(return_value={"id": "job-new"})
    insert_targets_mock = AsyncMock(return_value=None)

    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.find_open_job_by_payload",
        find_open_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.criar_job",
        create_job_mock,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.inserir_targets",
        insert_targets_mock,
    )

    result = await personalizacao_service._enqueue_media_render_job_if_needed(
        session=object(),
        state=state,
        record=record,
    )

    assert result["id"] == "job-new"
    assert create_job_mock.await_count == 1
    assert create_job_mock.await_args.kwargs["payload"]["brainhex_profile_key"] == "survivor"
    assert insert_targets_mock.await_count == 1


class _BackfillResult:
    def __init__(self, rows):
        self._rows = rows

    def mappings(self):
        return list(self._rows)


class _BackfillSession:
    def __init__(self, ids):
        self._ids = ids

    async def execute(self, statement, params=None):
        del statement, params
        return _BackfillResult([{"id": item} for item in self._ids])


@pytest.mark.asyncio
async def test_backfill_media_render_jobs_respects_dry_run(monkeypatch) -> None:
    session = _BackfillSession([101])
    record = {
        "id": 101,
        "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
        "classe_id": 30,
        "topico_id": 114,
        "conteudo_id": 107,
        "ciclo_id": "ciclo-1",
        "source_hash": "hash-1",
        "materiais": {"audio": {"payload": {"roteiro": "Roteiro de áudio"}, "metadata": {"status": "pending"}}},
    }

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        AsyncMock(return_value=record),
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.find_open_job_by_payload",
        AsyncMock(return_value=None),
    )
    monkeypatch.setattr(
        personalizacao_service,
        "reconcile_material_links_for_record",
        AsyncMock(return_value=({"audio": 501}, 1)),
    )
    enqueue_mock = AsyncMock(return_value={"id": "job-1"})
    monkeypatch.setattr(personalizacao_service, "_enqueue_media_render_job_if_needed", enqueue_mock)

    result = await backfill_media_render_jobs(
        session=session,
        classe_id=30,
        dry_run=True,
        limit=20,
    )

    assert result["scanned"] == 1
    assert result["eligible"] == 1
    assert result["enqueued"] == 0
    assert result["already_open_job"] == 0
    assert result["linked_materials"] == 1
    assert result["errors"] == 0
    assert enqueue_mock.await_count == 0


@pytest.mark.asyncio
async def test_backfill_media_render_jobs_enqueues_only_when_no_open_job(monkeypatch) -> None:
    session = _BackfillSession([101, 202])
    records = {
        101: {
            "id": 101,
            "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
            "classe_id": 30,
            "topico_id": 114,
            "conteudo_id": 107,
            "ciclo_id": "ciclo-1",
            "source_hash": "hash-1",
            "materiais": {"audio": {"payload": {"roteiro": "Roteiro de áudio"}, "metadata": {"status": "pending"}}},
        },
        202: {
            "id": 202,
            "aluno_id": "b49f2e21-a6f9-4c8d-9533-5a32bb219754",
            "classe_id": 30,
            "topico_id": 115,
            "conteudo_id": 111,
            "ciclo_id": "ciclo-2",
            "source_hash": "hash-2",
            "materiais": {"markdown": {"payload": {"texto": "Grimório"}, "metadata": {"status": "pending"}}},
        },
    }

    async def _buscar_por_id(self, record_id):
        del self
        return records.get(record_id)

    async def _find_open_job(self, **kwargs):
        del self
        if kwargs.get("topico_id") == 115:
            return {"id": "job-open"}
        return None

    monkeypatch.setattr(
        "app.repositories.conteudo_personalizado.ConteudoPersonalizadoRepository.buscar_por_id",
        _buscar_por_id,
    )
    monkeypatch.setattr(
        "app.repositories.personalizacao_jobs.PersonalizacaoJobsRepository.find_open_job_by_payload",
        _find_open_job,
    )
    monkeypatch.setattr(
        personalizacao_service,
        "reconcile_material_links_for_record",
        AsyncMock(side_effect=[({"audio": 501}, 2), ({"markdown": 601}, 1)]),
    )
    monkeypatch.setattr(
        personalizacao_service,
        "_enqueue_media_render_job_if_needed",
        AsyncMock(return_value={"id": "job-new"}),
    )
    monkeypatch.setattr(
        personalizacao_service,
        "_apply_media_job_metadata",
        AsyncMock(return_value=records[101]),
    )

    result = await backfill_media_render_jobs(
        session=session,
        classe_id=30,
        dry_run=False,
        limit=20,
    )

    assert result["scanned"] == 2
    assert result["eligible"] == 1
    assert result["enqueued"] == 1
    assert result["already_open_job"] == 1
    assert result["linked_materials"] == 3
    assert result["errors"] == 0


@pytest.mark.asyncio
async def test_multistage_pipeline_includes_study_stage_before_format_steps(monkeypatch) -> None:
    calls: list[str] = []
    review_cycles = 0

    async def _fake_stage_call(**kwargs):
        etapa = kwargs["stage"]
        calls.append(etapa)
        if etapa == "estudo_conteudo":
            return {
                "formato": "global",
                "etapa": etapa,
                "conteudo_estudado": {
                    "tema_central": "Sistemas Distribuidos",
                    "conceitos_nucleares": ["sistemas distribuidos", "sincronizacao"],
                    "fatos_ancorados": ["Conceitos centrais de comunicacao em rede."],
                    "complexidade": "medio",
                    "metas_tamanho": {
                        "slides_min": 6,
                        "slides_max": 8,
                        "secoes_min": 6,
                        "secoes_max": 8,
                        "audio_min_seg": 70,
                        "audio_max_seg": 95,
                        "video_min_seg": 75,
                        "video_max_seg": 105,
                    },
                },
                "revisao": {"status": "ok", "achados": [], "ajustes": []},
            }
        if etapa == "planejamento":
            return {
                "formato": kwargs["formato"],
                "etapa": etapa,
                "plano": {"ordem": ["abertura", "desenvolvimento", "fechamento"]},
            }
        if etapa == "estilizacao":
            return {
                "formato": kwargs["formato"],
                "etapa": etapa,
                "payload": {
                    "titulo": "Apresentacao de estudo com modelo e evidencia",
                    "abertura": "Abertura e contexto de sistemas distribuidos com hipotese inicial.",
                    "slides": [
                        {"titulo": "Slide 1", "pontos": ["abertura e contexto", "sistemas distribuidos"]},
                        {"titulo": "Slide 2", "pontos": ["desenvolvimento em etapas", "sincronizacao"]},
                        {"titulo": "Slide 3", "pontos": ["modelo e trade-off", "evidencia aplicada"]},
                        {"titulo": "Slide 4", "pontos": ["hipotese", "processo em etapa"]},
                        {"titulo": "Slide 5", "pontos": ["analise tecnica", "conceitos nucleares"]},
                        {"titulo": "Slide 6", "pontos": ["sintese e conclusao", "proximos passos"]},
                    ],
                },
            }
        if etapa == "revisao":
            nonlocal review_cycles
            review_cycles += 1
            review_status = "ajustar" if review_cycles == 1 else "ok"
            return {
                "formato": kwargs["formato"],
                "etapa": etapa,
                "revisao": {"status": review_status, "achados": ["ajuste"], "ajustes": ["detalhar slide"]},
            }
        return {
            "formato": kwargs["formato"],
            "etapa": etapa,
            "payload": {
                "titulo": "Apresentacao final com hipotese e evidencia",
                "abertura": "Abertura, contexto e objetivo do modelo.",
                "slides": [
                    {"titulo": "Slide 1", "pontos": ["abertura e contexto", "sistemas distribuidos"]},
                    {"titulo": "Slide 2", "pontos": ["desenvolvimento em etapa", "sincronizacao"]},
                    {"titulo": "Slide 3", "pontos": ["modelo conceitual", "trade-off principal"]},
                    {"titulo": "Slide 4", "pontos": ["hipotese", "evidencia"]},
                    {"titulo": "Slide 5", "pontos": ["analise", "processo"]},
                    {"titulo": "Slide 6", "pontos": ["sintese", "conclusao"]},
                ],
            },
            "revisao": {"status": "ok", "achados": [], "ajustes": []},
        }

    monkeypatch.setattr(personalizacao_service, "_invoke_media_stage_llm", _fake_stage_call)

    state = {
        "perfil_brainhex": [{"perfil": "Mastermind", "afinidade": 88}],
        "modo_operacao": "analitico",
        "modo_resposta": "imediato",
        "topico_contexto": {"nome": "Sistemas Distribuidos", "descricao": "Conceitos centrais"},
        "cards_conteudo": [],
        "atividades_topico": [],
    }
    fallback_payloads = {
        "apresentacao": {
            "titulo": "Fallback",
            "abertura": "Fallback",
            "slides": [{"titulo": "Slide", "pontos": ["Ponto"]}],
        }
    }

    raw, meta = await personalizacao_service._invoke_multistage_materiais_por_formato(
        settings=Settings(
            openai_api_key=None,
            gemini_api_key=None,
            personalizacao_media_min_quality_score=0.6,
        ),
        state=state,
        formatos=["apresentacao"],
        plano={"formatos": ["apresentacao"]},
        perfil_dominante="Mastermind",
        source_chunks=[{"chunk_texto": "Trecho base"}],
        fallback_payloads=fallback_payloads,
    )

    assert raw is not None
    assert raw["apresentacao"]["titulo"] == "Apresentacao final com hipotese e evidencia"
    assert calls[0] == "estudo_conteudo"
    assert calls.count("planejamento") == 1
    assert calls.count("estilizacao") == 1
    assert calls.count("revisao") >= 1
    assert calls.count("correcao") >= 1
    assert meta["estudo_conteudo"]["ok"] is True
    assert len(meta["stages"]["apresentacao"]) >= 4
@pytest.mark.asyncio
async def test_multistage_pipeline_reuses_single_study_for_multiple_formats(monkeypatch) -> None:
    study_calls = 0
    format_calls: list[tuple[str, str]] = []

    async def _fake_stage_call(**kwargs):
        nonlocal study_calls
        etapa = kwargs["stage"]
        formato = kwargs["formato"]
        format_calls.append((etapa, formato))

        if etapa == "estudo_conteudo":
            study_calls += 1
            return {
                "formato": "global",
                "etapa": etapa,
                "conteudo_estudado": {
                    "tema_central": "Sistemas Distribuidos",
                    "conceitos_nucleares": ["sistemas distribuidos", "escalabilidade"],
                    "fatos_ancorados": ["A comunicacao ocorre por rede."],
                    "complexidade": "medio",
                },
                "revisao": {"status": "ok", "achados": [], "ajustes": []},
            }

        if etapa == "planejamento":
            return {"formato": formato, "etapa": etapa, "plano": {"ordem": ["abertura", "desenvolvimento", "fechamento"]}}
        if etapa == "estilizacao" and formato == "pdf":
            return {
                "formato": formato,
                "etapa": etapa,
                "payload": {
                    "titulo": "Guia com hipotese e evidencia",
                    "resumo": "Resumo com hipotese, evidencia e modelo conceitual.",
                    "secoes": [
                        "Abertura e contexto",
                        "Sistemas distribuidos",
                        "Modelo e trade-off",
                        "Desenvolvimento em etapas",
                        "Evidencia aplicada",
                        "Sintese e conclusao",
                    ],
                },
            }
        if etapa == "estilizacao" and formato == "apresentacao":
            return {
                "formato": formato,
                "etapa": etapa,
                "payload": {
                    "titulo": "Slides",
                    "abertura": "Abertura e contexto com hipotese.",
                    "slides": [
                        {"titulo": "S1", "pontos": ["abertura", "sistemas distribuidos"]},
                        {"titulo": "S2", "pontos": ["desenvolvimento", "escalabilidade"]},
                        {"titulo": "S3", "pontos": ["modelo", "trade-off"]},
                        {"titulo": "S4", "pontos": ["hipotese", "evidencia"]},
                        {"titulo": "S5", "pontos": ["etapa", "processo"]},
                        {"titulo": "S6", "pontos": ["sintese", "conclusao"]},
                    ],
                },
            }
        return {"formato": formato, "etapa": etapa, "revisao": {"status": "ok", "achados": [], "ajustes": []}}

    monkeypatch.setattr(personalizacao_service, "_invoke_media_stage_llm", _fake_stage_call)

    raw, _ = await personalizacao_service._invoke_multistage_materiais_por_formato(
        settings=Settings(
            openai_api_key=None,
            gemini_api_key=None,
            personalizacao_media_min_quality_score=0.6,
        ),
        state={
            "perfil_brainhex": [{"perfil": "Mastermind", "afinidade": 88}],
            "topico_contexto": {"nome": "Sistemas Distribuidos", "descricao": "Conceitos centrais"},
            "cards_conteudo": [],
            "atividades_topico": [],
        },
        formatos=["pdf", "apresentacao"],
        plano={"formatos": ["pdf", "apresentacao"]},
        perfil_dominante="Mastermind",
        source_chunks=[{"chunk_texto": "Trecho base"}],
        fallback_payloads={"pdf": {"titulo": "Fallback", "resumo": "Fallback", "secoes": ["Base"]}},
    )

    assert raw is not None
    assert study_calls == 1
    assert raw["pdf"]["titulo"] == "Guia com hipotese e evidencia"
    assert raw["apresentacao"]["titulo"] == "Slides"
    assert [item for item in format_calls if item[0] == "estudo_conteudo"] == [("estudo_conteudo", "global")]


@pytest.mark.asyncio
async def test_multistage_pipeline_retries_review_until_ok(monkeypatch) -> None:
    review_cycles: list[int] = []
    correction_cycles: list[int] = []

    async def _fake_stage_call(**kwargs):
        etapa = kwargs["stage"]
        formato = kwargs["formato"]
        payload = kwargs.get("context_payload") or {}
        ciclo = int(payload.get("ciclo_revisao") or 0)

        if etapa == "estudo_conteudo":
            return {
                "formato": "global",
                "etapa": etapa,
                "conteudo_estudado": {
                    "tema_central": "Sistemas DistribuÃ­dos",
                    "conceitos_nucleares": ["sistemas distribuÃ­dos"],
                    "fatos_ancorados": ["Conceitos principais."],
                    "complexidade": "medio",
                },
                "revisao": {"status": "ok", "achados": [], "ajustes": []},
            }
        if etapa == "planejamento":
            return {"formato": formato, "etapa": etapa, "plano": {"ordem": ["abertura", "desenvolvimento", "fechamento"]}}
        if etapa == "estilizacao":
            return {
                "formato": formato,
                "etapa": etapa,
                "payload": {"titulo": "Guia inicial", "resumo": "Resumo", "secoes": ["Sistemas distribuÃ­dos"]},
            }
        if etapa == "revisao":
            review_cycles.append(ciclo)
            status = "ajustar" if ciclo == 1 else "ok"
            return {"formato": formato, "etapa": etapa, "revisao": {"status": status, "achados": [], "ajustes": []}}
        if etapa == "correcao":
            correction_cycles.append(ciclo)
            return {
                "formato": formato,
                "etapa": etapa,
                "payload": {"titulo": "Guia final", "resumo": "Resumo", "secoes": ["Sistemas distribuÃ­dos"]},
                "revisao": {"status": "ok", "achados": [], "ajustes": []},
            }
        return {"formato": formato, "etapa": etapa}

    monkeypatch.setattr(personalizacao_service, "_invoke_media_stage_llm", _fake_stage_call)

    raw, meta = await personalizacao_service._invoke_multistage_materiais_por_formato(
        settings=Settings(
            openai_api_key=None,
            gemini_api_key=None,
            personalizacao_media_review_max_cycles=3,
            personalizacao_media_min_quality_score=0.6,
        ),
        state={
            "perfil_brainhex": [{"perfil": "Mastermind", "afinidade": 88}],
            "topico_contexto": {"nome": "Sistemas DistribuÃ­dos", "descricao": "Conceitos centrais"},
            "cards_conteudo": [],
            "atividades_topico": [],
        },
        formatos=["pdf"],
        plano={"formatos": ["pdf"]},
        perfil_dominante="Mastermind",
        source_chunks=[{"chunk_texto": "Sistemas distribuÃ­dos e escalabilidade."}],
        fallback_payloads={"pdf": {"titulo": "Fallback", "resumo": "Fallback", "secoes": ["Base"]}},
    )

    assert raw is not None
    assert raw["pdf"]["titulo"] == "Guia final"
    assert review_cycles == [1, 2]
    assert correction_cycles == [1]
    assert len([step for step in meta["stages"]["pdf"] if step["etapa"] == "revisao"]) == 2


def test_quality_check_enforces_core_concepts_across_formats() -> None:
    study = {
        "conceitos_nucleares": ["sistemas distribuÃ­dos", "tolerÃ¢ncia a falhas"],
        "complexidade": "medio",
    }

    pdf_quality = _evaluate_media_payload_quality(
        formato="pdf",
        payload={
            "titulo": "Guia",
            "resumo": "IntroduÃ§Ã£o a sistemas distribuÃ­dos",
            "secoes": ["TolerÃ¢ncia a falhas em ambientes distribuÃ­dos"],
        },
        conteudo_estudado=study,
        min_quality_score=0.6,
    )
    slides_quality = _evaluate_media_payload_quality(
        formato="apresentacao",
        payload={
            "titulo": "Slides",
            "abertura": "Fundamentos",
            "slides": [{"titulo": "S1", "pontos": ["Sistemas distribuÃ­dos e tolerÃ¢ncia a falhas"]}],
        },
        conteudo_estudado=study,
        min_quality_score=0.6,
    )
    audio_quality = _evaluate_media_payload_quality(
        formato="audio",
        payload={"roteiro": "Vamos estudar sistemas distribuÃ­dos e tolerÃ¢ncia a falhas.", "duracao_estimada_seg": 80},
        conteudo_estudado=study,
        min_quality_score=0.6,
    )
    video_quality = _evaluate_media_payload_quality(
        formato="video",
        payload={
            "roteiro": "Este vÃ­deo explica sistemas distribuÃ­dos com foco em tolerÃ¢ncia a falhas.",
            "cenas": ["Abertura", "Conceitos", "Exemplo"],
            "duracao_estimada_seg": 90,
        },
        conteudo_estudado=study,
        min_quality_score=0.6,
    )

    assert pdf_quality["aprovado"] is True
    assert slides_quality["aprovado"] is True
    assert audio_quality["aprovado"] is True
    assert video_quality["aprovado"] is True
    assert min(
        pdf_quality["conceitos_match"],
        slides_quality["conceitos_match"],
        audio_quality["conceitos_match"],
        video_quality["conceitos_match"],
    ) >= 1


def test_profile_editorial_context_builds_signature_from_brainhex() -> None:
    context = _build_profile_editorial_context(
        perfil_dominante="Daredevil",
        perfil_brainhex=[
            {"perfil": "Daredevil", "afinidade": 91},
            {"perfil": "Achiever", "afinidade": 70},
        ],
    )

    assert context["perfil_dominante"] == "Daredevil"
    assert "Daredevil" in context["assinatura_perfil"]
    assert context["narrativa_preferencial"] == "luta_superacao"
    assert context["top_perfis"][0]["perfil"] == "Daredevil"


def test_editorial_model_includes_required_layers() -> None:
    study = {
        "tema_central": "Sistemas DistribuÃ­dos",
        "objetivo_pedagogico": "Explicar arquitetura distribuÃ­da.",
        "conceitos_nucleares": ["DNS", "RPC", "tolerÃ¢ncia a falhas"],
        "fatos_ancorados": ["DNS resolve nomes para endereÃ§os IP."],
        "narrativa_pedagogica": {
            "abertura": "Contexto do problema",
            "desenvolvimento": "Mecanismos principais",
            "fechamento": "SÃ­ntese prÃ¡tica",
        },
    }
    profile = _build_profile_editorial_context(
        perfil_dominante="Mastermind",
        perfil_brainhex=[{"perfil": "Mastermind", "afinidade": 95}],
    )
    model = _build_editorial_model(
        conteudo_estudado=study,
        perfil_editorial=profile,
        metas_tamanho={
            "slides_min": 6,
            "slides_max": 8,
            "secoes_min": 6,
            "secoes_max": 8,
            "audio_min_seg": 70,
            "audio_max_seg": 95,
            "video_min_seg": 75,
            "video_max_seg": 105,
        },
    )

    assert model["versao"] == "1.0"
    assert model["conteudo_origem"]["mensagem_central"]
    assert model["estrategia_editorial"]["narrativa_tipo"]
    assert model["personalizacao_brainhex"]["perfil_dominante"] == "Mastermind"
    assert "apresentacao" in model["adaptacao_formatos"]


def test_quality_check_returns_editorial_scores_when_profile_is_available() -> None:
    study = {
        "conceitos_nucleares": ["sistemas distribuÃ­dos", "tolerÃ¢ncia a falhas"],
        "complexidade": "medio",
    }
    profile = _build_profile_editorial_context(
        perfil_dominante="Conqueror",
        perfil_brainhex=[{"perfil": "Conqueror", "afinidade": 88}],
    )
    editorial = _build_editorial_model(
        conteudo_estudado={
            **study,
            "tema_central": "Sistemas DistribuÃ­dos",
            "objetivo_pedagogico": "Entender os fundamentos.",
        },
        perfil_editorial=profile,
        metas_tamanho={
            "slides_min": 6,
            "slides_max": 8,
            "secoes_min": 6,
            "secoes_max": 8,
            "audio_min_seg": 70,
            "audio_max_seg": 95,
            "video_min_seg": 75,
            "video_max_seg": 105,
        },
    )
    quality = _evaluate_media_payload_quality(
        formato="audio",
        payload={
            "roteiro": "Meta clara, execuÃ§Ã£o por etapas e resultado com sistemas distribuÃ­dos e tolerÃ¢ncia a falhas.",
            "duracao_estimada_seg": 80,
        },
        conteudo_estudado=study,
        min_quality_score=0.6,
        modelo_editorial=editorial,
        perfil_dominante="Conqueror",
    )

    assert "score_coerencia" in quality
    assert "score_personalizacao" in quality
    assert "score_diferenciacao_interperfil" in quality
    assert quality["perfil_validado"] == "Conqueror"


@pytest.mark.asyncio
async def test_multistage_pipeline_fail_closed_rejects_low_quality_payload(monkeypatch) -> None:
    async def _fake_stage_call(**kwargs):
        etapa = kwargs["stage"]
        formato = kwargs["formato"]
        if etapa == "estudo_conteudo":
            return {
                "formato": "global",
                "etapa": etapa,
                "conteudo_estudado": {
                    "tema_central": "Sistemas DistribuÃ­dos",
                    "conceitos_nucleares": ["sistemas distribuÃ­dos", "tolerÃ¢ncia a falhas"],
                    "fatos_ancorados": ["DNS resolve nomes para IP."],
                    "complexidade": "medio",
                },
                "revisao": {"status": "ok", "achados": [], "ajustes": []},
            }
        if etapa == "planejamento":
            return {"formato": formato, "etapa": etapa, "plano": {"ordem": ["abertura", "desenvolvimento", "fechamento"]}}
        if etapa == "estilizacao":
            return {"formato": formato, "etapa": etapa, "payload": {"titulo": "SaÃ­da fraca"}}
        if etapa == "revisao":
            return {"formato": formato, "etapa": etapa, "revisao": {"status": "ok", "achados": [], "ajustes": []}}
        return {"formato": formato, "etapa": etapa, "payload": {"titulo": "SaÃ­da fraca"}}

    monkeypatch.setattr(personalizacao_service, "_invoke_media_stage_llm", _fake_stage_call)

    raw, meta = await personalizacao_service._invoke_multistage_materiais_por_formato(
        settings=Settings(openai_api_key=None, gemini_api_key=None),
        state={
            "perfil_brainhex": [{"perfil": "Mastermind", "afinidade": 80}],
            "topico_contexto": {"nome": "Sistemas DistribuÃ­dos", "descricao": "Base"},
            "cards_conteudo": [],
            "atividades_topico": [],
        },
        formatos=["video"],
        plano={"formatos": ["video"]},
        perfil_dominante="Mastermind",
        source_chunks=[{"chunk_texto": "Sistemas distribuÃ­dos e DNS"}],
        fallback_payloads={},
    )

    assert not raw or "video" not in raw
    assert meta["quality_gate"]["video"]["approved"] is False
    assert "video" in meta["rejected_by_quality"]


@pytest.mark.asyncio
async def test_multistage_pipeline_aprova_quando_score_final_aprova(monkeypatch) -> None:
    async def _fake_stage_call(**kwargs):
        etapa = kwargs["stage"]
        formato = kwargs["formato"]
        if etapa == "estudo_conteudo":
            return {
                "formato": "global",
                "etapa": etapa,
                "conteudo_estudado": {
                    "tema_central": "Sistemas Distribuídos",
                    "conceitos_nucleares": ["cliente-servidor", "sockets"],
                    "fatos_ancorados": ["DNS resolve nomes para IP."],
                    "complexidade": "medio",
                },
                "revisao": {"status": "ok", "achados": [], "ajustes": []},
            }
        if etapa == "planejamento":
            return {"formato": formato, "etapa": etapa, "plano": {"ordem": ["abertura", "desenvolvimento", "fechamento"]}}
        if etapa == "estilizacao":
            return {
                "formato": formato,
                "etapa": etapa,
                "payload": {
                    "titulo": "Documento de estudo",
                    "resumo": "Resumo guiado",
                    "secoes": ["Conceito", "Exemplo", "Aplicação", "Resumo"],
                },
            }
        if etapa == "revisao":
            return {"formato": formato, "etapa": etapa, "revisao": {"status": "ajustar", "achados": [], "ajustes": []}}
        if etapa == "correcao":
            return {
                "formato": formato,
                "etapa": etapa,
                "payload": {
                    "titulo": "Documento de estudo",
                    "resumo": "Resumo guiado",
                    "secoes": ["Conceito", "Exemplo", "Aplicação", "Resumo"],
                },
            }
        return {"formato": formato, "etapa": etapa, "payload": {}}

    monkeypatch.setattr(personalizacao_service, "_invoke_media_stage_llm", _fake_stage_call)
    monkeypatch.setattr(
        personalizacao_service,
        "_evaluate_media_payload_quality",
        lambda **_: {
            "score": 0.9,
            "aprovado": True,
            "issues": [],
            "warnings": [],
            "critical_issues": [],
            "markers_hit": 4,
            "markers_total": 4,
            "min_score": 0.72,
            "score_coerencia": 0.9,
            "score_fidelidade": 0.9,
            "score_personalizacao": 0.9,
            "score_diferenciacao_interperfil": 0.8,
            "score_adequacao_formato": 0.9,
            "size_score": 0.9,
            "estrutura_score": 0.9,
            "conceitos_match": 2,
            "conceitos_total": 2,
            "conceitos_score": 1.0,
            "perfil_validado": "Mastermind",
            "narrativa_validada": "fluxo_processo",
            "score_clareza": 0.9,
        },
    )

    raw, meta = await personalizacao_service._invoke_multistage_materiais_por_formato(
        settings=Settings(openai_api_key=None, gemini_api_key=None),
        state={
            "perfil_brainhex": [{"perfil": "Mastermind", "afinidade": 90}],
            "topico_contexto": {"nome": "Sistemas Distribuídos", "descricao": "Base"},
            "cards_conteudo": [],
            "atividades_topico": [],
        },
        formatos=["documento"],
        plano={"formatos": ["documento"]},
        perfil_dominante="Mastermind",
        source_chunks=[{"chunk_texto": "Sistemas distribuídos e DNS"}],
        fallback_payloads={"documento": {"titulo": "Fallback", "secoes": ["A"]}},
    )

    assert isinstance(raw, dict) and "documento" in raw
    assert meta["quality_gate"]["documento"]["approved"] is True
    assert "documento" not in meta["rejected_by_quality"]


def test_normalize_personalized_activities_does_not_pad_without_anchors() -> None:
    atividades = personalizacao_service._normalize_personalized_activities(
        {
            "atividades": [
                {
                    "titulo": "Atividade Ãºnica",
                    "tipo": "quiz",
                    "questoes": [
                        {
                            "tipo": "quiz",
                            "enunciado": "Qual Ã© o conceito central?",
                            "alternativas": ["A", "B", "C", "D"],
                            "resposta_correta": "A",
                        }
                    ],
                }
            ]
        },
        topic_name="Sistemas DistribuÃ­dos",
        target_count=5,
        anchor_concepts=[],
        anchor_facts=[],
    )

    assert len(atividades) == 1


def test_resolve_personalizacao_status_from_materiais_handles_failed_quality() -> None:
    status_failed = personalizacao_service._resolve_personalizacao_status_from_materiais(
        {
            "quiz": {"metadata": {"status": "failed_quality"}},
            "cards": {"metadata": {"status": "failed_quality"}},
        }
    )
    status_partial = personalizacao_service._resolve_personalizacao_status_from_materiais(
        {
            "quiz": {"metadata": {"status": "completed"}},
            "cards": {"metadata": {"status": "failed_quality"}},
        }
    )

    assert status_failed == "failed"
    assert status_partial == "partial"


def test_guide_persona_campos_presentes_por_perfil() -> None:
    from app.services.personalizacao import _build_profile_editorial_context

    casos = [
        ("Seeker", "Orion", "Puck", "#a78c07", "Crônicas da Exploração"),
        ("Survivor", "Valka", "Fenrir", "#720101", "Diretrizes de Campo"),
        ("Daredevil", "Rexa", "Zephyr", "#1b6b1b", "Código de Impacto"),
        ("Mastermind", "Atena", "Charon", "#707c88", "Arquitetura do Conceito"),
        ("Conqueror", "Drako", "Kore", "#01808b", "Tratado de Soberania"),
        ("Socialiser", "Luma", "Kore", "#6d15be", "Elo da Comunidade"),
        ("Achiever", "Auri", "Puck", "#ad6002", "Caminho da Maestria"),
    ]
    for perfil, guia, voz, cor, framing in casos:
        result = _build_profile_editorial_context(perfil, [])
        assert result["guia_nome"] == guia, f"{perfil}: guia_nome errado"
        assert result["guia_voz"] == voz, f"{perfil}: guia_voz errado"
        assert result["guia_cor"] == cor, f"{perfil}: guia_cor errado"
        assert result["framing_narrativo"] == framing, f"{perfil}: framing_narrativo errado"

