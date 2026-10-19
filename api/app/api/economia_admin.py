"""Auditoria da economia no painel admin da API.

O professor não lê esta trilha. O cliente Supabase também não: a tabela não
tem GRANT de SELECT para `authenticated`. Quem consulta é este painel, com o
mesmo login básico do resto do admin, pela conexão do banco.
"""

from html import escape

from fastapi import APIRouter, Depends, Query
from fastapi.responses import HTMLResponse
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminContext, get_session, require_admin

router = APIRouter(tags=["admin"])

_AUDITORIA = text(
    """
    SELECT id, ocorrido_em, ator_id, operacao, entidade, entidade_id,
           classe_id, aluno_id, antes, depois
      FROM public.economia_auditoria
     WHERE CAST(:operacao AS text) IS NULL OR operacao = CAST(:operacao AS text)
     ORDER BY ocorrido_em DESC, id DESC
     LIMIT CAST(:limite AS integer)
    """
)

_CONSISTENCIA = text("SELECT * FROM public.economia_consistencia()")


def _linhas(result) -> list[dict]:
    if result is None:
        return []
    return [dict(linha) for linha in result.mappings().all()]


async def carregar_painel(session: AsyncSession, operacao: str | None, limite: int) -> tuple[list[dict], list[dict]]:
    auditoria = await session.execute(_AUDITORIA, {"operacao": operacao, "limite": limite})
    consistencia = await session.execute(_CONSISTENCIA)
    return _linhas(auditoria), _linhas(consistencia)


def _pagina(admin: AdminContext, auditoria: list[dict], consistencia: list[dict], operacao: str | None) -> str:
    def celula(valor: object) -> str:
        if valor is None or valor == "":
            return "—"
        return escape(str(valor))

    linhas = "".join(
        "<tr>"
        f"<td>{celula(linha.get('ocorrido_em'))}</td>"
        f"<td>{celula(linha.get('operacao'))}</td>"
        f"<td>{celula(linha.get('entidade'))} {celula(linha.get('entidade_id'))}</td>"
        f"<td>{celula(linha.get('aluno_id'))}</td>"
        f"<td><code>{celula(linha.get('antes'))}</code></td>"
        f"<td><code>{celula(linha.get('depois'))}</code></td>"
        "</tr>"
        for linha in auditoria
    ) or "<tr><td colspan='6'>Nenhuma operação registrada.</td></tr>"

    quebras = "".join(
        "<li>"
        f"{celula(linha.get('aluno_id'))}: saldo {celula(linha.get('saldo'))}, "
        f"compras sem débito {celula(linha.get('compras_sem_debito'))}, "
        f"estornos sem crédito {celula(linha.get('estornos_sem_credito'))}"
        "</li>"
        for linha in consistencia
    ) or "<li>Nenhuma carteira divergente. O saldo é a soma do razão.</li>"

    filtro = escape(operacao or "")
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Auditoria da economia · TrailUp</title>
    <style>
      :root {{
        --bg: #0d0f14; --surface: #13161e; --card: #181c26; --border: #252936;
        --text: #e2e5f0; --muted: #7880a0; --accent: #4ade80;
      }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; background: var(--bg); color: var(--text);
        font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
      main {{ width: min(1100px, calc(100vw - 32px)); margin: 28px auto 64px; }}
      a {{ color: var(--accent); }}
      header, section {{ background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 16px; }}
      h1 {{ font-size: 20px; margin: 0 0 4px; }}
      p, li {{ color: var(--muted); }}
      form {{ display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }}
      input, button {{ font: inherit; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; }}
      table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
      th, td {{ text-align: left; vertical-align: top; border-top: 1px solid var(--border); padding: 8px 6px; }}
      code {{ white-space: pre-wrap; word-break: break-word; color: var(--text); }}
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Auditoria da economia</h1>
        <p>Autenticado como <strong>{escape(admin.username)}</strong>. <a href="/admin/professores">Voltar ao painel</a></p>
        <form method="get">
          <input name="operacao" value="{filtro}" placeholder="operação (compra, uso, estorno, config)" aria-label="Filtrar por operação" />
          <button type="submit">Filtrar</button>
        </form>
      </header>
      <section>
        <h2>Consistência</h2>
        <ul>{quebras}</ul>
      </section>
      <section>
        <h2>Trilha</h2>
        <table>
          <thead><tr><th>Quando</th><th>Operação</th><th>Entidade</th><th>Aluno</th><th>Antes</th><th>Depois</th></tr></thead>
          <tbody>{linhas}</tbody>
        </table>
      </section>
    </main>
  </body>
</html>"""


@router.get("/admin/economia", response_class=HTMLResponse, include_in_schema=False)
async def admin_economia(
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
    operacao: str | None = Query(default=None, max_length=80),
    limite: int = Query(default=80, ge=1, le=200),
) -> HTMLResponse:
    filtro = operacao.strip() if operacao else None
    try:
        auditoria, consistencia = await carregar_painel(session, filtro or None, limite)
    except OperationalError:
        return HTMLResponse(
            "<!doctype html><html lang='pt-BR'><body><p>Schema da economia indisponível nesta base.</p></body></html>",
            status_code=503,
        )
    return HTMLResponse(_pagina(admin, auditoria, consistencia, filtro))
