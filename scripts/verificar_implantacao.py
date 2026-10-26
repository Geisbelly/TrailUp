"""Consulta somente os manifests/healths informados; não autentica nem altera dados."""

import argparse
import json
import re
from datetime import UTC, datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

SHA = re.compile(r"[0-9a-fA-F]{40}")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(service: str, url: str, expected: str) -> dict:
    parsed = urlsplit(url)
    if (parsed.username or parsed.password or parsed.query or parsed.fragment
            or not parsed.hostname
            or (parsed.scheme != "https" and not (
                parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            ))):
        raise ValueError("Use HTTPS (HTTP apenas local), sem credenciais, query ou fragmento.")
    if not SHA.fullmatch(expected):
        raise ValueError("A revisão esperada deve ser um SHA Git completo de 40 caracteres.")
    result = {"service": service, "url": url, "expected_commit": expected.lower(),
              "reported_commit": None, "matches": False}
    try:
        request = Request(url, headers={"Accept": "application/json", "Cache-Control": "no-cache"})
        with build_opener(NoRedirect).open(request, timeout=20) as response:
            result["http_status"] = response.status
            if response.status != 200:
                result["reason"] = "http_error"
                return result
            if response.headers.get_content_type() != "application/json":
                result["reason"] = "not_json"
                return result
            raw = response.read(65537)
            if len(raw) > 65536:
                result["reason"] = "response_too_large"
                return result
            payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise TypeError("invalid payload")
        details = payload.get("details") if service == "api" else payload
        if not isinstance(details, dict):
            raise TypeError("invalid details")
        reported = details.get("build_commit")
        if isinstance(reported, str) and SHA.fullmatch(reported):
            result["reported_commit"] = reported.lower()
        if service == "frontend":
            healthy = payload.get("service") == "frontend"
        else:
            healthy = payload.get("status") == "ok"
            if service == "api":
                healthy = healthy and payload.get("database") == "ok"
        if not healthy:
            result["reason"] = "service_not_ready"
        elif result["reported_commit"] is None:
            result["reason"] = "revision_unknown"
        elif result["reported_commit"] != expected.lower():
            result["reason"] = "revision_mismatch"
        else:
            result.update(matches=True, reason="declared_revision_matches")
    except HTTPError as error:
        result.update(http_status=error.code, reason="http_error")
    except (URLError, TimeoutError, OSError):
        result["reason"] = "connection_or_tls_error"
    except (ValueError, TypeError, UnicodeError):
        result["reason"] = "invalid_payload"
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    for service in ("frontend", "api", "microservice"):
        parser.add_argument(f"--{service}", nargs=2, metavar=("URL", "EXPECTED_SHA"))
    args = parser.parse_args()
    targets = [(service, values) for service, values in vars(args).items() if values]
    if not targets:
        parser.error("Informe ao menos um serviço com URL e revisão esperada.")
    try:
        checks = [check(service, *values) for service, values in targets]
    except ValueError as error:
        parser.error(str(error))
    print(json.dumps({
        "checked_at": datetime.now(UTC).isoformat(),
        "scope": "declared_build_revisions_only",
        "checks": checks,
        "all_requested_revisions_match": all(item["matches"] for item in checks),
    }, ensure_ascii=False, indent=2))
    return 0 if all(item["matches"] for item in checks) else 1


if __name__ == "__main__":
    raise SystemExit(main())
