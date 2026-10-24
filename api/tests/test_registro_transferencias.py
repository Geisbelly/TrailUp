"""Registro de transferência internacional (#195) x código.

Falha quando aparece, no código da API, nas migrations ou nas edge functions,
um host externo que não está na lista "Hosts externos conhecidos" de
``docs/lgpd/transferencias-internacionais.md``. Detecta:

1. hosts em URLs literais (``https://host/...``);
2. domínios de provedores de IA/armazenamento/e-mail/push mesmo sem esquema
   (ex.: ``f"{conta}.r2.cloudflarestorage.com"``);
3. imports de SDKs que falam com provedores externos (mapa abaixo).

Não pega host que vem só de variável de ambiente; a revisão humana continua
valendo (ver a "Regra de processo" no registro).
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
REGISTRO = REPO / "docs" / "lgpd" / "transferencias-internacionais.md"
SECAO = "### Hosts externos conhecidos (lidos pelo teste)"

PASTAS = [
    (REPO / "api" / "app", (".py",)),
    (REPO / "api" / "alembic" / "versions", (".py",)),
    (REPO / "frontend" / "supabase" / "functions", (".ts", ".js")),
]

# Não são serviços externos (namespace XML, desenvolvimento local, exemplos).
IGNORADOS = {"localhost", "127.0.0.1", "0.0.0.0", "www.w3.org"}
SUFIXOS_IGNORADOS = (".localhost", ".local", ".test", ".example", "example.com")

# Famílias de domínio de provedores que recebem dados. Casam mesmo sem esquema.
PROVEDORES = re.compile(
    r"(?<![\w-])((?:[a-z0-9-]+\.)*(?:"
    r"cloudflarestorage\.com|amazonaws\.com|googleapis\.com|openai\.com|"
    r"anthropic\.com|azure\.com|openai\.azure\.com|huggingface\.co|replicate\.com|"
    r"cohere\.(?:ai|com)|mistral\.ai|groq\.com|deepseek\.com|together\.xyz|"
    r"brevo\.com|sendinblue\.com|sendgrid\.net|mailgun\.net|resend\.com|"
    r"exp\.host|supabase\.co|langchain\.com|sentry\.io|posthog\.com|"
    r"backblazeb2\.com|digitaloceanspaces\.com|blob\.core\.windows\.net"
    r"))(?![\w-])",
    re.IGNORECASE,
)
URL = re.compile(r"https?://([a-z0-9.-]+\.[a-z]{2,}|localhost)(?=[:/\"'`\s?#]|$)", re.IGNORECASE)

# SDK importado -> host com que ele fala.
SDKS = {
    "openai": "api.openai.com",
    "langchain_openai": "api.openai.com",
    "langchain_google_genai": "generativelanguage.googleapis.com",
    "google.genai": "generativelanguage.googleapis.com",
    "google.generativeai": "generativelanguage.googleapis.com",
    "gtts": "translate.google.com",
    "langsmith": "api.smith.langchain.com",
    "anthropic": "api.anthropic.com",
    "langchain_anthropic": "api.anthropic.com",
    "boto3": "*.amazonaws.com",
    "sentry_sdk": "*.sentry.io",
    "posthog": "*.posthog.com",
    "sib_api_v3_sdk": "api.brevo.com",
    "brevo_python": "api.brevo.com",
}


def _hosts_do_registro() -> set[str]:
    texto = REGISTRO.read_text(encoding="utf-8")
    assert SECAO in texto, f"Seção '{SECAO}' sumiu do registro"
    secao = texto.split(SECAO, 1)[1]
    secao = re.split(r"\n#{1,3} ", secao, maxsplit=1)[0]
    hosts = {h.lower() for h in re.findall(r"^\s*-\s*`([^`]+)`", secao, re.MULTILINE)}
    assert hosts, "Lista de hosts vazia no registro"
    return hosts


def _coberto(host: str, conhecidos: set[str]) -> bool:
    host = host.lower().rstrip(".")
    if host in IGNORADOS or host.endswith(SUFIXOS_IGNORADOS):
        return True
    for item in conhecidos:
        if item.startswith("*."):
            base = item[2:]
            if host == base or host.endswith("." + base):
                return True
        elif host == item:
            return True
    return False


def _arquivos():
    for pasta, exts in PASTAS:
        if not pasta.exists():
            continue
        for arq in sorted(pasta.rglob("*")):
            if arq.suffix in exts and "node_modules" not in arq.parts:
                yield arq


def _imports(arq: Path) -> set[str]:
    try:
        arvore = ast.parse(arq.read_text(encoding="utf-8"))
    except SyntaxError:
        return set()
    nomes: set[str] = set()
    for no in ast.walk(arvore):
        if isinstance(no, ast.Import):
            nomes.update(a.name for a in no.names)
        elif isinstance(no, ast.ImportFrom) and no.module and no.level == 0:
            nomes.add(no.module)
    return nomes


def _encontrados() -> dict[str, set[str]]:
    achados: dict[str, set[str]] = {}
    for arq in _arquivos():
        texto = arq.read_text(encoding="utf-8", errors="ignore")
        rel = str(arq.relative_to(REPO))
        hosts = {m.group(1) for m in URL.finditer(texto)}
        hosts |= {m.group(1) for m in PROVEDORES.finditer(texto)}
        if arq.suffix == ".py":
            for nome in _imports(arq):
                for sdk, host in SDKS.items():
                    if nome == sdk or nome.startswith(sdk + "."):
                        hosts.add(host)
        for h in hosts:
            achados.setdefault(h.lower(), set()).add(rel)
    return achados


def test_hosts_externos_estao_no_registro():
    conhecidos = _hosts_do_registro()
    faltando = {h: sorted(arqs) for h, arqs in _encontrados().items() if not _coberto(h, conhecidos)}
    assert not faltando, (
        "Host externo fora do registro de transferências (#195). Atualize "
        "docs/lgpd/transferencias-internacionais.md (linha do fornecedor + lista "
        f"'Hosts externos conhecidos'): {faltando}"
    )


@pytest.mark.parametrize(
    "host,esperado",
    [
        ("abc.r2.cloudflarestorage.com", True),
        ("r2.cloudflarestorage.com", True),
        ("xyz.supabase.co", True),
        ("api.openai.com", True),
        ("api.anthropic.com", False),
        ("s3.amazonaws.com", False),
        ("localhost", True),
    ],
)
def test_cobertura_com_curinga(host, esperado):
    assert _coberto(host, _hosts_do_registro()) is esperado


def test_detecta_dominio_de_provedor_sem_esquema():
    achados = {m.group(1) for m in PROVEDORES.finditer('f"{conta}.r2.cloudflarestorage.com"')}
    assert achados == {"r2.cloudflarestorage.com"}
