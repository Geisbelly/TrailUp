import importlib.util
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

import pytest

spec = importlib.util.spec_from_file_location(
    "verificar_implantacao", Path(__file__).resolve().parents[2] / "scripts/verificar_implantacao.py"
)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
check = module.check
COMMIT = "a" * 40


@pytest.fixture
def endpoint():
    state = {"body": {}, "type": "application/json", "status": 200, "requests": []}

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            state["requests"].append(self.path)
            self.send_response(state["status"])
            self.send_header("Content-Type", state["type"])
            if state["status"] == 302:
                self.send_header("Location", "/must-not-follow")
            self.end_headers()
            self.wfile.write(json.dumps(state["body"]).encode())

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/health", state
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


@pytest.mark.parametrize("service", ["api", "frontend", "microservice"])
def test_matches_only_explicit_revision_and_valid_service_response(endpoint, service):
    url, state = endpoint
    state["body"] = {"status": "ok", "database": "ok", "service": "frontend",
                     "build_commit": COMMIT, "details": {"build_commit": COMMIT}}
    result = check(service, url, COMMIT)
    assert result["matches"] is True
    assert state["requests"] == ["/health"]


@pytest.mark.parametrize("body, reason", [
    ({"status": "ok", "database": "ok", "details": {}}, "revision_unknown"),
    ({"status": "ok", "database": "ok", "details": {"build_commit": "secret"}}, "revision_unknown"),
    ({"status": "ok", "database": "ok", "details": {"build_commit": "b" * 40}}, "revision_mismatch"),
    ({"status": "error", "database": "ok", "details": {"build_commit": COMMIT}}, "service_not_ready"),
    ({"status": "ok", "details": {"build_commit": COMMIT}}, "service_not_ready"),
    ({"status": "ok", "details": None}, "invalid_payload"),
    ([], "invalid_payload"),
])
def test_no_false_positive_from_unknown_version_or_unhealthy_service(endpoint, body, reason):
    url, state = endpoint
    state["body"] = body
    result = check("api", url, COMMIT)
    assert result["matches"] is False
    assert result["reason"] == reason
    assert "secret" not in json.dumps(result)


def test_rejects_spa_fallback_and_does_not_follow_redirect(endpoint):
    url, state = endpoint
    state["type"] = "text/html"
    assert check("frontend", url, COMMIT)["reason"] == "not_json"
    state["status"] = 302
    assert check("frontend", url, COMMIT)["reason"] == "http_error"
    assert state["requests"] == ["/health", "/health"]


@pytest.mark.parametrize("url", ["http://example.com/health", "https://user:pass@example.com/health",
                                  "https://example.com/health?key=secret", "file:///tmp/a"])
def test_refuses_credentials_and_insecure_remote_transport(url):
    with pytest.raises(ValueError):
        check("api", url, COMMIT)


def test_requires_complete_expected_sha():
    with pytest.raises(ValueError):
        check("api", "http://127.0.0.1/health", "main")


@pytest.mark.parametrize("status", [201, 503])
def test_health_requires_http_200(endpoint, status):
    url, state = endpoint
    state["status"] = status
    state["body"] = {"status": "ok", "database": "ok", "details": {"build_commit": COMMIT}}
    assert check("api", url, COMMIT)["reason"] == "http_error"


def test_rejects_large_response_without_exporting_body(endpoint):
    url, state = endpoint
    state["body"] = {"secret": "x" * 65536}
    result = check("api", url, COMMIT)
    assert result["reason"] == "response_too_large"
    assert "secret" not in json.dumps(result)
