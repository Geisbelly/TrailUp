import json

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.exc import OperationalError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import AdminContext, get_session, require_admin
from app.repositories.access import AccessRepository
from app.schemas.api import AdminAlunoResumo, AdminDashboardData, AdminProfessorResumo


router = APIRouter(tags=["admin"])


def _dashboard_html(data: AdminDashboardData, admin: AdminContext) -> str:
    bootstrap = json.dumps(data.model_dump(mode="json")).replace("</", "<\\/")
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin · TrailUp</title>
    <style>
      :root {{
        --bg:        #0d0f14;
        --surface:   #13161e;
        --card:      #181c26;
        --border:    #252936;
        --border-hi: #343848;
        --text:      #e2e5f0;
        --muted:     #7880a0;
        --accent:    #4ade80;
        --accent-bg: rgba(74,222,128,.10);
        --accent-bd: rgba(74,222,128,.25);
        --danger:    #f87171;
        --danger-bg: rgba(248,113,113,.10);
        --danger-bd: rgba(248,113,113,.25);
        --warn:      #fbbf24;
        --radius:    14px;
        --shadow:    0 4px 24px rgba(0,0,0,.45);
      }}
      *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
      html {{ height: 100%; }}
      body {{
        min-height: 100%;
        background: var(--bg);
        color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 15px;
        line-height: 1.55;
      }}

      /* ── layout ── */
      .wrap {{ width: min(1200px, calc(100vw - 32px)); margin: 28px auto 64px; }}

      /* ── header ── */
      header {{
        display: flex;
        align-items: center;
        gap: 14px;
        flex-wrap: wrap;
        padding: 20px 24px;
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        margin-bottom: 20px;
        box-shadow: var(--shadow);
      }}
      .logo {{
        width: 40px; height: 40px;
        border-radius: 10px;
        background: linear-gradient(135deg, #4ade80, #22c55e);
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; flex-shrink: 0;
      }}
      header h1 {{ font-size: 20px; font-weight: 700; letter-spacing: -.3px; }}
      header p  {{ color: var(--muted); font-size: 13px; }}
      .spacer   {{ flex: 1; }}
      .stats    {{ display: flex; gap: 12px; flex-wrap: wrap; }}
      .stat     {{
        text-align: center;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 18px;
        min-width: 90px;
      }}
      .stat b  {{ display: block; font-size: 22px; font-weight: 700; color: var(--accent); }}
      .stat span {{ font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .5px; }}

      /* ── grid ── */
      .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 16px; }}

      /* ── card ── */
      .card {{
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: var(--radius);
        padding: 20px;
        box-shadow: var(--shadow);
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 0;
        overflow: hidden;
      }}
      .card-head {{ display: flex; align-items: flex-start; gap: 12px; }}
      .avatar {{
        width: 44px; height: 44px; border-radius: 12px; flex-shrink: 0;
        background: linear-gradient(135deg, #2d3550, #1e2437);
        border: 1px solid var(--border-hi);
        display: flex; align-items: center; justify-content: center;
        font-size: 18px;
      }}
      .card-head-info {{ min-width: 0; flex: 1; }}
      .card-head-info h2 {{
        font-size: 16px;
        font-weight: 600;
        overflow-wrap: anywhere;
      }}
      .card-head-info p  {{
        font-size: 12px;
        color: var(--muted);
        margin-top: 2px;
        overflow-wrap: anywhere;
      }}

      /* ── badge ── */
      .badge {{
        display: inline-flex; align-items: center; gap: 5px;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 500;
        border: 1px solid var(--border);
        background: var(--surface);
        color: var(--muted);
      }}
      .badge::before {{ content: ""; display: block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; opacity: .5; }}
      .badge.ok    {{ background: var(--accent-bg); border-color: var(--accent-bd); color: var(--accent); }}
      .badge.off   {{ background: var(--danger-bg); border-color: var(--danger-bd); color: var(--danger); }}

      /* ── buttons ── */
      button, select {{
        font: inherit;
        border-radius: 9px;
        border: 1px solid var(--border-hi);
        padding: 8px 14px;
        cursor: pointer;
        transition: opacity .15s, background .15s, border-color .15s;
        background: var(--surface);
        color: var(--text);
        font-size: 13px;
        min-width: 0;
        max-width: 100%;
      }}
      button:hover {{ opacity: .85; }}
      button:active {{ opacity: .7; }}
      button.primary {{
        background: var(--accent);
        color: #0d0f14;
        border-color: transparent;
        font-weight: 600;
      }}
      button.danger  {{
        background: var(--danger-bg);
        color: var(--danger);
        border-color: var(--danger-bd);
        font-weight: 500;
      }}
      button:disabled {{
        opacity: .4;
        cursor: not-allowed;
      }}
      select {{
        width: 100%;
        background: var(--surface);
        color: var(--text);
      }}
      select option {{ background: var(--card); }}

      /* ── divider ── */
      .divider {{ height: 1px; background: var(--border); }}

      /* ── row ── */
      .row {{ display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }}
      .assign-row {{
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 8px;
        width: 100%;
        align-items: stretch;
      }}
      .assign-row > * {{ min-width: 0; }}

      /* ── student list ── */
      .student-list {{ display: flex; flex-direction: column; gap: 0; }}
      .student-item {{
        display: flex; align-items: center; gap: 12px;
        padding: 10px 0;
        border-top: 1px solid var(--border);
      }}
      .student-item:first-child {{ border-top: none; }}
      .s-icon {{
        width: 30px; height: 30px; border-radius: 8px;
        background: var(--surface);
        border: 1px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        font-size: 13px; flex-shrink: 0;
      }}
      .s-info {{ flex: 1; min-width: 0; }}
      .s-info strong {{ display: block; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }}
      .s-info span   {{ font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: block; }}

      .empty {{ color: var(--muted); font-size: 13px; font-style: italic; padding: 8px 0; }}

      /* ── section label ── */
      .section-label {{ font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .6px; color: var(--muted); }}

      /* ── toast ── */
      #toast-container {{
        position: fixed; bottom: 24px; right: 24px;
        display: flex; flex-direction: column; gap: 8px;
        z-index: 9999;
        pointer-events: none;
      }}
      .toast {{
        display: flex; align-items: center; gap: 10px;
        padding: 12px 18px;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        background: var(--card);
        border: 1px solid var(--border-hi);
        box-shadow: 0 8px 32px rgba(0,0,0,.6);
        opacity: 0;
        transform: translateY(8px);
        transition: opacity .25s, transform .25s;
        pointer-events: all;
        max-width: 360px;
      }}
      .toast.show  {{ opacity: 1; transform: none; }}
      .toast.ok   {{ border-color: var(--accent-bd); }}
      .toast.err  {{ border-color: var(--danger-bd); }}
      .toast .ti {{ font-size: 16px; }}

      /* ── empty state ── */
      .no-data {{
        grid-column: 1 / -1;
        text-align: center;
        padding: 48px 24px;
        color: var(--muted);
      }}
      .no-data span {{ display: block; font-size: 36px; margin-bottom: 12px; }}

      @media (max-width: 720px) {{
        .wrap {{ width: min(100vw - 20px, 1200px); margin-top: 20px; }}
        header {{ padding: 18px; }}
        .spacer {{ display: none; }}
        .stats {{ width: 100%; }}
        .stat {{ flex: 1; min-width: 120px; }}
        .grid {{ grid-template-columns: 1fr; }}
      }}

      @media (max-width: 560px) {{
        .card {{ padding: 16px; }}
        .card-head {{ align-items: center; }}
        .row {{ align-items: stretch; }}
        .assign-row {{ grid-template-columns: 1fr; }}
        .assign-row button {{ width: 100%; }}
        .student-item {{
          align-items: flex-start;
          flex-wrap: wrap;
        }}
        .student-item button {{
          width: 100%;
          margin-left: 42px;
        }}
      }}
    </style>
  </head>
  <body>
    <main class="wrap">
      <header>
        <div class="logo">🎮</div>
        <div>
          <h1>Painel Admin · TrailUp</h1>
          <p>Autenticado como <strong>{admin.username}</strong> · Gerenciamento de professores e alunos</p>
        </div>
        <div class="spacer"></div>
        <div class="stats">
          <div class="stat"><b id="prof-count">—</b><span>Professores</span></div>
          <div class="stat"><b id="student-count">—</b><span>Alunos</span></div>
        </div>
      </header>
      <section class="grid" id="app"></section>
    </main>
    <div id="toast-container"></div>

    <script id="bootstrap-data" type="application/json">{bootstrap}</script>
    <script>
      const data = JSON.parse(document.getElementById("bootstrap-data").textContent);
      document.getElementById("prof-count").textContent = data.professores.length;
      document.getElementById("student-count").textContent = data.alunos.length;

      const app = document.getElementById("app");

      /* ── helpers ── */
      function esc(value) {{
        return String(value ?? "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }}

      function toast(msg, type = "ok") {{
        const el = document.createElement("div");
        el.className = `toast ${{type}}`;
        el.innerHTML = `<span class="ti">${{type === "ok" ? "✓" : "✕"}}</span> ${{esc(msg)}}`;
        document.getElementById("toast-container").appendChild(el);
        requestAnimationFrame(() => {{ requestAnimationFrame(() => el.classList.add("show")); }});
        setTimeout(() => {{
          el.classList.remove("show");
          setTimeout(() => el.remove(), 300);
        }}, 3500);
      }}

      function setLoading(btn, loading) {{
        btn.disabled = loading;
        btn.dataset.orig = btn.dataset.orig ?? btn.textContent;
        btn.textContent = loading ? "Aguarde..." : btn.dataset.orig;
      }}

      async function postJson(url, payload) {{
        const response = await fetch(url, {{
          method: "POST",
          headers: {{ "Content-Type": "application/json" }},
          body: JSON.stringify(payload)
        }});
        if (!response.ok) {{
          const text = await response.text().catch(() => "");
          throw new Error(text || `Erro HTTP ${{response.status}}`);
        }}
        return response;
      }}

      async function toggleLiberado(professorId, liberado, btn) {{
        setLoading(btn, true);
        try {{
          await postJson(`/api/v1/admin/professores/${{professorId}}/liberacao`, {{ liberado }});
          toast(liberado ? "Professor liberado com sucesso." : "Professor bloqueado.");
          setTimeout(() => window.location.reload(), 900);
        }} catch (err) {{
          toast(`Falha ao atualizar liberacao: ${{err.message}}`, "err");
          setLoading(btn, false);
        }}
      }}

      async function setAlunoAcesso(professorId, alunoId, hasAcesso, btn) {{
        setLoading(btn, true);
        try {{
          await postJson(`/api/v1/admin/professores/${{professorId}}/alunos`, {{
            aluno_id: alunoId,
            has_acesso: hasAcesso
          }});
          toast(hasAcesso ? "Aluno atribuido ao professor." : "Aluno removido do professor.");
          setTimeout(() => window.location.reload(), 900);
        }} catch (err) {{
          toast(`Falha ao atualizar acesso: ${{err.message}}`, "err");
          setLoading(btn, false);
        }}
      }}

      function renderProfessor(professor) {{
        const selectedIds = new Set(professor.alunos_diretos.map((a) => a.aluno_id));
        const options = data.alunos
          .filter((a) => !selectedIds.has(a.aluno_id))
          .map((a) => `<option value="${{esc(a.aluno_id)}}">${{esc(a.nome)}} · ${{esc(a.email)}}</option>`)
          .join("");

        const alunosHtml = professor.alunos_diretos.length
          ? professor.alunos_diretos.map((a) => `
              <div class="student-item">
                <div class="s-icon">👤</div>
                <div class="s-info">
                  <strong>${{esc(a.nome)}}</strong>
                  <span>${{esc(a.email)}}</span>
                </div>
                <button class="danger" data-action="revoke"
                  data-professor="${{esc(professor.professor_id)}}"
                  data-aluno="${{esc(a.aluno_id)}}">Remover</button>
              </div>`).join("")
          : `<p class="empty">Nenhum aluno vinculado diretamente.</p>`;

        const initials = (professor.nome || "?").trim()[0].toUpperCase();

        return `
          <article class="card">
            <div class="card-head">
              <div class="avatar">${{esc(initials)}}</div>
              <div class="card-head-info">
                <h2>${{esc(professor.nome || professor.professor_id)}}</h2>
                <p>${{esc(professor.instituicao || "Sem instituicao")}} · ${{esc(professor.disciplina || "Sem disciplina")}}</p>
              </div>
            </div>

            <div class="row">
              <span class="badge ${{professor.liberado ? "ok" : "off"}}">${{professor.liberado ? "Liberado" : "Bloqueado"}}</span>
              <button
                class="${{professor.liberado ? "danger" : "primary"}}"
                data-action="liberacao"
                data-professor="${{esc(professor.professor_id)}}"
                data-liberado="${{String(!professor.liberado)}}"
              >${{professor.liberado ? "Bloquear" : "Liberar acesso"}}</button>
            </div>

            <div class="divider"></div>

            <div>
              <p class="section-label" style="margin-bottom:8px">Atribuir aluno</p>
              <div class="assign-row">
                <select id="select-${{esc(professor.professor_id)}}">
                  <option value="">Selecionar aluno...</option>
                  ${{options}}
                </select>
                <button class="primary" data-action="assign" data-professor="${{esc(professor.professor_id)}}">Atribuir</button>
              </div>
            </div>

            <div>
              <p class="section-label" style="margin-bottom:4px">Alunos diretos (${{professor.alunos_diretos.length}})</p>
              <div class="student-list">${{alunosHtml}}</div>
            </div>
          </article>`;
      }}

      if (data.professores.length === 0) {{
        app.innerHTML = `<div class="no-data"><span>🎓</span>Nenhum professor cadastrado ainda.</div>`;
      }} else {{
        app.innerHTML = data.professores.map(renderProfessor).join("");
      }}

      app.addEventListener("click", async (event) => {{
        const btn = event.target.closest("button[data-action]");
        if (!btn) return;

        const action = btn.dataset.action;
        const professorId = btn.dataset.professor;

        if (action === "liberacao") {{
          await toggleLiberado(professorId, btn.dataset.liberado === "true", btn);
        }} else if (action === "assign") {{
          const select = document.getElementById(`select-${{professorId}}`);
          if (!select.value) {{
            toast("Selecione um aluno antes de atribuir.", "err");
            return;
          }}
          await setAlunoAcesso(professorId, select.value, true, btn);
        }} else if (action === "revoke") {{
          await setAlunoAcesso(professorId, btn.dataset.aluno, false, btn);
        }}
      }});
    </script>
  </body>
</html>"""


def _schema_unavailable_html(admin: AdminContext) -> str:
    return f"""<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Admin · TrailUp</title>
    <style>
      :root {{
        --bg: #0d0f14; --surface: #13161e; --card: #181c26;
        --border: #252936; --text: #e2e5f0; --muted: #7880a0;
        --danger: #f87171; --danger-bg: rgba(248,113,113,.10); --danger-bd: rgba(248,113,113,.25);
        --warn: #fbbf24; --warn-bg: rgba(251,191,36,.10); --warn-bd: rgba(251,191,36,.25);
      }}
      *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
      body {{
        min-height: 100vh; background: var(--bg); color: var(--text);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
      }}
      main {{
        width: 100%; max-width: 600px;
        background: var(--card);
        border: 1px solid var(--border);
        border-radius: 16px;
        padding: 32px;
        box-shadow: 0 8px 40px rgba(0,0,0,.5);
      }}
      .icon {{ font-size: 36px; margin-bottom: 16px; }}
      h1 {{ font-size: 22px; margin-bottom: 8px; }}
      p  {{ color: var(--muted); line-height: 1.6; margin-bottom: 12px; }}
      .alert {{
        display: flex; gap: 12px;
        background: var(--warn-bg); border: 1px solid var(--warn-bd);
        border-radius: 10px; padding: 14px 16px; margin: 20px 0;
      }}
      .alert span {{ color: var(--warn); font-size: 18px; }}
      .alert p {{ color: var(--text); margin: 0; }}
      ul {{ list-style: none; padding: 0; display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }}
      li {{
        display: flex; align-items: flex-start; gap: 10px;
        background: var(--surface); border: 1px solid var(--border);
        border-radius: 9px; padding: 12px 14px;
      }}
      li::before {{ content: "→"; color: var(--muted); flex-shrink: 0; }}
      code {{
        background: var(--surface); color: var(--warn);
        padding: 2px 7px; border-radius: 5px; font-size: 13px;
        border: 1px solid var(--border);
      }}
    </style>
  </head>
  <body>
    <main>
      <div class="icon">⚠️</div>
      <h1>Painel admin indisponivel</h1>
      <p>Autenticado como <strong>{admin.username}</strong>.</p>
      <div class="alert">
        <span>⚡</span>
        <p>A base configurada nao possui o schema principal do TrailUp. Tabelas como <code>professor</code>, <code>alunos</code> e <code>professor_aluno</code> precisam existir.</p>
      </div>
      <p>Para corrigir:</p>
      <ul>
        <li>Aponte <code>DATABASE_URL</code> para o Postgres real do TrailUp</li>
        <li>Ou carregue o schema principal antes de usar a tela admin</li>
      </ul>
    </main>
  </body>
</html>"""


async def _load_dashboard(session: AsyncSession) -> AdminDashboardData:
    repo = AccessRepository(session)
    professores = await repo.list_admin_professors()
    alunos = await repo.list_admin_students()
    atribuicoes = await repo.list_direct_professor_assignments()

    alunos_por_professor: dict[str, list[AdminAlunoResumo]] = {}
    for atribuicao in atribuicoes:
        alunos_por_professor.setdefault(atribuicao["professor_id"], []).append(
            AdminAlunoResumo(
                aluno_id=str(atribuicao["aluno_id"]),
                nome=atribuicao["nome"],
                email=atribuicao["email"],
            )
        )

    return AdminDashboardData(
        professores=[
            AdminProfessorResumo(
                professor_id=str(professor["professor_id"]),
                nome=professor.get("nome"),
                descricao=professor.get("descricao"),
                instituicao=professor.get("instituicao"),
                disciplina=professor.get("disciplina"),
                liberado=bool(professor.get("liberado")),
                alunos_diretos=alunos_por_professor.get(professor["professor_id"], []),
            )
            for professor in professores
        ],
        alunos=[
            AdminAlunoResumo(
                aluno_id=str(aluno["aluno_id"]),
                nome=aluno["nome"],
                email=aluno["email"],
            )
            for aluno in alunos
        ],
    )


@router.get("/admin/professores", response_class=HTMLResponse, include_in_schema=False)
async def admin_professores_page(
    admin: AdminContext = Depends(require_admin),
    session: AsyncSession = Depends(get_session),
) -> HTMLResponse:
    try:
        dashboard = await _load_dashboard(session)
    except OperationalError:
        return HTMLResponse(
            _schema_unavailable_html(admin),
            status_code=503,
        )
    return HTMLResponse(_dashboard_html(dashboard, admin))
