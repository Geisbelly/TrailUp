import os


def _env(name, default=None):
    value = os.environ.get(name, default)
    if value is None:
        raise KeyError(
            f"Variavel de ambiente obrigatoria ausente: {name}. "
            "Configure as variaveis RF_* antes de rodar a suite."
        )
    return value


BASE_URL_FRONTEND = _env("RF_BASE_URL_FRONTEND")
BASE_URL_API = _env("RF_BASE_URL_API")
SUPABASE_URL = _env("RF_SUPABASE_URL")
SUPABASE_ANON_KEY = _env("RF_SUPABASE_ANON_KEY")
PROFESSOR_EMAIL = _env("RF_PROFESSOR_EMAIL")
PROFESSOR_SENHA = _env("RF_PROFESSOR_SENHA")
TIMEOUT_GERACAO = os.environ.get("RF_TIMEOUT_GERACAO", "10 min")
HEADLESS = os.environ.get("RF_HEADLESS", "true").lower() == "true"
