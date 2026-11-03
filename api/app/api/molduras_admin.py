"""Molduras no painel admin da API: o dev liga, desliga e reprecifica, e escolhe o que cada ação dá.

A regra de negócio fica no banco (`molduras_admin_salvar` e `molduras_admin_salvar_acao`, da
`20261103_09`): validam o preço e que ação só aponta para moldura rara, e gravam o antes/depois em
`economia_auditoria`. As duas não têm GRANT para cliente nenhum; quem chama é esta conexão, a da
API, atrás do mesmo login básico do resto do admin.
"""

from __future__ import annotations

from html import escape

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError, OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminContext, get_session, require_admin

router = APIRouter(tags=["admin"])

_MOLDURAS = text(
    """
    SELECT m.codigo, m.nome, m.origem, m.preco, m.ativa, c.nome AS conquista,
           (SELECT count(*) FROM public.moldura_aluno ma WHERE ma.moldura_codigo = m.codigo) AS donos
      FROM public.molduras m
      LEFT JOIN public.conquistas c ON c.id = m.conquista_id
     ORDER BY CASE m.origem WHEN 'loja' THEN 0 WHEN 'conquista' THEN 1 ELSE 2 END, m.ordem
    """
)

_ACOES = text(
    """
    SELECT a.acao, a.rotulo, a.descricao, a.moldura_codigo, a.ativa,
           (SELECT count(*) FROM public.moldura_acao_aluno x WHERE x.acao = a.acao) AS feitas
      FROM public.molduras_acoes a
     ORDER BY a.rotulo
    """
)

_SALVAR = text(
    "SELECT public.molduras_admin_salvar(CAST(:codigo AS text), CAST(:ativa AS boolean), "
    "CAST(:preco AS integer), CAST(:ator AS text))"
)
_SALVAR_ACAO = text(
    "SELECT public.molduras_admin_salvar_acao(CAST(:acao AS text), CAST(:ativa AS boolean), "
    "CAST(:moldura AS text), CAST(:ator AS text))"
)


class MolduraAdminRequest(BaseModel):
    ativa: bool
    preco: int | None = Field(default=None, ge=1, le=1000)


class MolduraAcaoAdminRequest(BaseModel):
    ativa: bool
    moldura: str | None = Field(default=None, max_length=60)


def _linhas(result) -> list[dict]:
    return [dict(linha) for linha in result.mappings().all()]


def _pagina(admin: AdminContext, molduras: list[dict], acoes: list[dict]) -> str:
    def cel(valor: object) -> str:
        return "—" if valor is None or valor == "" else escape(str(valor))

    raras = [m for m in molduras if m["origem"] == "acao"]

    def opcoes(atual: str | None) -> str:
        itens = ["<option value=''>Nenhuma</option>"] + [
            f"<option value='{escape(m['codigo'])}'{' selected' if m['codigo'] == atual else ''}>{escape(m['nome'])}</option>"
            for m in raras
        ]
        return "".join(itens)

    linhas_acoes = (
        "".join(
            "<tr>"
            f"<td><strong>{cel(a['rotulo'])}</strong><br><small>{cel(a['acao'])} · {cel(a['descricao'])}</small></td>"
            f"<td><select id='m-{escape(a['acao'])}'>{opcoes(a['moldura_codigo'])}</select></td>"
            f"<td><input type='checkbox' id='a-{escape(a['acao'])}'{' checked' if a['ativa'] else ''}></td>"
            f"<td>{cel(a['feitas'])}</td>"
            f"<td><button onclick=\"salvarAcao('{escape(a['acao'])}', this)\">Salvar</button></td>"
            "</tr>"
            for a in acoes
        )
        or "<tr><td colspan='5'>Nenhuma ação cadastrada.</td></tr>"
    )

    def campo_preco(m: dict) -> str:
        if m["origem"] != "loja":
            return "—"
        return f"<input type='number' min='1' max='1000' id='p-{escape(m['codigo'])}' value='{cel(m['preco'])}' style='width:84px'>"

    rotulo_origem = {"loja": "Loja", "conquista": "Conquista", "acao": "Rara (ação)"}
    linhas_molduras = (
        "".join(
            "<tr>"
            f"<td><strong>{cel(m['nome'])}</strong><br><small>{cel(m['codigo'])}</small></td>"
            f"<td>{rotulo_origem.get(m['origem'], cel(m['origem']))}"
            f"{'<br><small>' + cel(m['conquista']) + '</small>' if m['conquista'] else ''}</td>"
            f"<td>{campo_preco(m)}</td>"
            f"<td><input type='checkbox' id='v-{escape(m['codigo'])}'{' checked' if m['ativa'] else ''}></td>"
            f"<td>{cel(m['donos'])}</td>"
            f"<td><button onclick=\"salvarMoldura('{escape(m['codigo'])}', this)\">Salvar</button></td>"
            "</tr>"
            for m in molduras
        )
        or "<tr><td colspan='6'>Nenhuma moldura cadastrada.</td></tr>"
    )

    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Molduras · TrailUp</title>
    <style>
      :root {{
        --bg: #0d0f14; --surface: #13161e; --card: #181c26; --border: #252936;
        --text: #e2e5f0; --muted: #7880a0; --accent: #4ade80; --err: #f87171;
      }}
      * {{ box-sizing: border-box; }}
      body {{ margin: 0; background: var(--bg); color: var(--text);
        font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
      main {{ width: min(1100px, calc(100vw - 32px)); margin: 28px auto 64px; }}
      a {{ color: var(--accent); }}
      header, section {{ background: var(--card); border: 1px solid var(--border); border-radius: 14px; padding: 20px; margin-bottom: 16px; overflow-x: auto; }}
      h1 {{ font-size: 20px; margin: 0 0 4px; }}
      p, small {{ color: var(--muted); }}
      input, select, button {{ font: inherit; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; }}
      button {{ cursor: pointer; }}
      table {{ width: 100%; border-collapse: collapse; font-size: 13px; }}
      th, td {{ text-align: left; vertical-align: middle; border-top: 1px solid var(--border); padding: 8px 6px; }}
      #toast {{ position: fixed; right: 16px; bottom: 16px; padding: 10px 14px; border-radius: 10px; background: var(--card); border: 1px solid var(--accent); display: none; }}
      #toast.err {{ border-color: var(--err); }}
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>Molduras</h1>
        <p>Autenticado como <strong>{escape(admin.username)}</strong>. <a href="/admin/professores">Voltar ao painel</a> · <a href="/admin/economia">Auditoria</a></p>
        <p>Desligar tira a moldura da loja e das recompensas; quem já tem continua com ela. Toda mudança vai para a auditoria da economia.</p>
      </header>
      <section>
        <h2>Ações que liberam moldura rara</h2>
        <p>A ação é declarada pelo app e libera a moldura uma vez por aluno. Desligada, o app continua registrando quem fez, mas não entrega nada.</p>
        <table>
          <thead><tr><th>Ação</th><th>Moldura</th><th>Ligada</th><th>Alunos que fizeram</th><th></th></tr></thead>
          <tbody>{linhas_acoes}</tbody>
        </table>
      </section>
      <section>
        <h2>Catálogo</h2>
        <table>
          <thead><tr><th>Moldura</th><th>Como ganha</th><th>Preço</th><th>Ativa</th><th>Alunos com ela</th><th></th></tr></thead>
          <tbody>{linhas_molduras}</tbody>
        </table>
      </section>
    </main>
    <div id="toast" role="status"></div>
    <script>
      function toast(msg, tipo) {{
        const t = document.getElementById("toast");
        t.textContent = msg; t.className = tipo === "err" ? "err" : ""; t.style.display = "block";
        setTimeout(() => {{ t.style.display = "none"; }}, 3500);
      }}
      async function postJson(url, payload, btn) {{
        btn.disabled = true;
        try {{
          const r = await fetch(url, {{ method: "POST", headers: {{ "Content-Type": "application/json" }}, body: JSON.stringify(payload) }});
          if (!r.ok) throw new Error((await r.text().catch(() => "")) || `Erro HTTP ${{r.status}}`);
          toast("Salvo.");
        }} catch (err) {{
          toast(`Falha ao salvar: ${{err.message}}`, "err");
        }} finally {{
          btn.disabled = false;
        }}
      }}
      function salvarMoldura(codigo, btn) {{
        const preco = document.getElementById(`p-${{codigo}}`);
        postJson(`/admin/molduras/${{codigo}}`, {{
          ativa: document.getElementById(`v-${{codigo}}`).checked,
          preco: preco ? Number(preco.value) : null,
        }}, btn);
      }}
      function salvarAcao(acao, btn) {{
        postJson(`/admin/molduras/acoes/${{acao}}`, {{
          ativa: document.getElementById(`a-${{acao}}`).checked,
          moldura: document.getElementById(`m-${{acao}}`).value || null,
        }}, btn);
      }}
    </script>
  </body>
</html>"""


def _indisponivel() -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><html lang='pt-BR'><body><p>Schema das molduras indisponível nesta base.</p></body></html>",
        status_code=503,
    )


def _erro_do_banco(exc: DBAPIError) -> HTTPException:
    # P0002: não existe; 22023: valor recusado pela regra do banco. A frase do banco vai junto.
    codigo = getattr(getattr(exc, "orig", None), "sqlstate", None) or getattr(
        getattr(exc, "orig", None), "pgcode", None
    )
    mensagem = str(getattr(exc, "orig", exc)).splitlines()[0]
    if codigo == "P0002":
        return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=mensagem)
    if codigo == "22023":
        return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=mensagem)
    raise exc


@router.get("/admin/molduras", response_class=HTMLResponse, include_in_schema=False)
async def admin_molduras(
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> HTMLResponse:
    try:
        molduras = _linhas(await session.execute(_MOLDURAS))
        acoes = _linhas(await session.execute(_ACOES))
    except OperationalError:
        return _indisponivel()
    return HTMLResponse(_pagina(admin, molduras, acoes))


@router.post("/admin/molduras/{codigo}", include_in_schema=False)
async def admin_salvar_moldura(
    codigo: str,
    payload: MolduraAdminRequest,
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    try:
        resultado = (
            await session.execute(
                _SALVAR, {"codigo": codigo, "ativa": payload.ativa, "preco": payload.preco, "ator": admin.username}
            )
        ).scalar_one()
        await session.commit()
    except DBAPIError as exc:
        await session.rollback()
        raise _erro_do_banco(exc) from exc
    return resultado


@router.post("/admin/molduras/acoes/{acao}", include_in_schema=False)
async def admin_salvar_acao(
    acao: str,
    payload: MolduraAcaoAdminRequest,
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> dict:
    try:
        resultado = (
            await session.execute(
                _SALVAR_ACAO, {"acao": acao, "ativa": payload.ativa, "moldura": payload.moldura, "ator": admin.username}
            )
        ).scalar_one()
        await session.commit()
    except DBAPIError as exc:
        await session.rollback()
        raise _erro_do_banco(exc) from exc
    return resultado
