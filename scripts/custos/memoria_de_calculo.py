"""Memória de cálculo dos custos do Resumo Expandido JIC 2026 (v7).

Reproduz, a partir de `parametros.json`, o que dá para reproduzir hoje e
marca como PENDENTE o que depende de uma entrada ainda não registrada
(fatura, preço de tabela com data, amostra de tokens). Nunca inventa valor.

Uso (da raiz do repositório):

    python3 scripts/custos/memoria_de_calculo.py
    python3 scripts/custos/memoria_de_calculo.py --logs logs-microservice.txt
    python3 scripts/custos/memoria_de_calculo.py --saida docs/analises/saida.md

`--logs` lê as linhas `[gemini-diag]` do microservice
(microservice/src/services/geminiService.ts) e resume o `usageMetadata`
real devolvido pelo Gemini: é a única medição de tokens que o projeto tem.

Só biblioteca padrão.
"""

from __future__ import annotations

import argparse
import json
import re
import statistics
import subprocess
from datetime import UTC, datetime
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PARAMETROS = Path(__file__).with_name("parametros.json")
PENDENTE = "PENDENTE"


def brl(valor: float | None) -> str:
    if valor is None:
        return PENDENTE
    return "R$ " + f"{valor:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")


def num(valor: float | None, casas: int = 0) -> str:
    if valor is None:
        return PENDENTE
    return f"{valor:,.{casas}f}".replace(",", "X").replace(".", ",").replace("X", ".")


# --------------------------------------------------------------------- horas


def _timestamps(repo: Path, autores: str) -> list[int]:
    saida = subprocess.run(
        ["git", "-C", str(repo), "log", "--all", f"--author={autores}", "--perl-regexp", "--format=%at"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    return sorted({int(linha) for linha in saida.split() if linha.strip()})


def _coautoria_ia(repo: Path, autores: str) -> tuple[int, int]:
    saida = subprocess.run(
        ["git", "-C", str(repo), "log", "--all", f"--author={autores}", "--perl-regexp", "--format=%H%x00%B%x01"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    commits = [c for c in saida.split("\x01") if c.strip()]
    com_ia = sum(1 for c in commits if re.search(r"co-authored-by:\s*(claude|cursor)", c, re.IGNORECASE))
    return len(commits), com_ia


def horas_por_sessao(ts: list[int], intervalo_h: float, acrescimo_h: float) -> tuple[float, int]:
    """Agrupa commits em sessões: um intervalo maior que `intervalo_h` abre
    sessão nova. Cada sessão vale (último - primeiro commit) + `acrescimo_h`,
    que cobre o trabalho antes do primeiro commit da sessão."""
    if not ts:
        return 0.0, 0
    total, sessoes, inicio, anterior = 0.0, 1, ts[0], ts[0]
    for t in ts[1:]:
        if t - anterior > intervalo_h * 3600:
            total += (anterior - inicio) / 3600 + acrescimo_h
            sessoes += 1
            inicio = t
        anterior = t
    total += (anterior - inicio) / 3600 + acrescimo_h
    return total, sessoes


def secao_horas(p: dict) -> list[str]:
    cfg = p["horas"]
    linhas = ["## 1. Horas de desenvolvimento (histórico de commits)", ""]
    ts: list[int] = []
    linhas += ["| Repositório | Commits (horários únicos) | Primeiro | Último | Commits com coautoria de IA |", "|---|---|---|---|---|"]
    for rel in cfg["repositorios"]:
        repo = (RAIZ / rel).resolve()
        t = _timestamps(repo, cfg["autores_regex"])
        total, com_ia = _coautoria_ia(repo, cfg["autores_regex"])
        ts += t
        primeiro = datetime.fromtimestamp(t[0], UTC).date().isoformat() if t else "-"
        ultimo = datetime.fromtimestamp(t[-1], UTC).date().isoformat() if t else "-"
        linhas.append(f"| `{rel}` | {len(t)} | {primeiro} | {ultimo} | {com_ia} de {total} |")
    ts = sorted(set(ts))
    linhas.append("")

    inicio_decl = cfg["periodo_declarado"]["inicio"]
    if ts and datetime.fromtimestamp(ts[0], UTC).date().isoformat() > inicio_decl:
        linhas += [
            f"> **Cobertura incompleta:** o período declarado começa em {inicio_decl}, mas o primeiro "
            f"commit encontrado é de {datetime.fromtimestamp(ts[0], UTC).date().isoformat()}. "
            "As horas anteriores não saem deste histórico: acrescente os repositórios de onde vieram "
            "(em `horas.repositorios`) ou declare no texto que a estimativa cobre só este intervalo.",
            "",
        ]

    linhas += ["Sensibilidade aos dois parâmetros do agrupamento (horas):", ""]
    acrescimos = cfg["acrescimo_por_sessao_h"]
    linhas.append("| Intervalo que abre sessão | " + " | ".join(f"+{num(a, 1)} h/sessão" for a in acrescimos) + " |")
    linhas.append("|---|" + "---|" * len(acrescimos))
    grade = []
    for intervalo in cfg["intervalos_sessao_h"]:
        celulas = []
        for a in acrescimos:
            h, _ = horas_por_sessao(ts, intervalo, a)
            grade.append((intervalo, a, h))
            celulas.append(num(h))
        linhas.append(f"| {num(intervalo, 0)} h | " + " | ".join(celulas) + " |")
    linhas.append("")

    publicado = cfg["valor_publicado_h"]
    proximos = [g for g in grade if abs(g[2] - publicado) / publicado <= 0.03]
    escolhido = cfg["parametro_escolhido"]
    if escolhido["intervalo_sessao_h"] is not None and escolhido["acrescimo_por_sessao_h"] is not None:
        h, s = horas_por_sessao(ts, escolhido["intervalo_sessao_h"], escolhido["acrescimo_por_sessao_h"])
        linhas.append(
            f"Parâmetro declarado: intervalo {escolhido['intervalo_sessao_h']} h, +{escolhido['acrescimo_por_sessao_h']} h "
            f"por sessão → **{num(h)} h** em {s} sessões (v7: {publicado} h)."
        )
    else:
        linhas.append(
            f"Parâmetro usado na v7: **{PENDENTE}** (`horas.parametro_escolhido`). Valor publicado: {publicado} h, "
            f"faixa {cfg['faixa_publicada_h'][0]}–{cfg['faixa_publicada_h'][1]} h."
        )
        if proximos:
            pares = ", ".join(f"{i} h/+{a} h ({num(h)} h)" for i, a, h in proximos)
            linhas.append(f"Combinações da grade a até 3% do publicado: {pares}.")
        else:
            linhas.append("Nenhuma combinação da grade chega a 3% do valor publicado.")
    linhas += [
        "",
        "Limites do método: horário de commit não é hora trabalhada; commits com coautoria de IA "
        "registram sessões com agente, não só trabalho humano; squash e rebase mudam horários; "
        "leitura, reuniões e escrita fora do git não aparecem.",
        "",
    ]
    return linhas


# -------------------------------------------------------------------- tokens


def _chars(rel: str) -> int:
    return len((RAIZ / rel).read_text(encoding="utf-8"))


def _resumo_logs(caminho: Path) -> list[str]:
    campos = ("promptTokenCount", "candidatesTokenCount", "thoughtsTokenCount", "totalTokenCount")
    valores: dict[str, list[int]] = {c: [] for c in campos}
    for linha in caminho.read_text(encoding="utf-8", errors="replace").splitlines():
        if "[gemini-diag]" not in linha:
            continue
        inicio = linha.find("{")
        if inicio < 0:
            continue
        try:
            dado = json.loads(linha[inicio:])
        except json.JSONDecodeError:
            continue
        uso = dado.get("usageMetadata") or {}
        for c in campos:
            if isinstance(uso.get(c), int):
                valores[c].append(uso[c])
    n = len(valores["totalTokenCount"])
    if not n:
        return [f"Nenhuma linha `[gemini-diag]` com `usageMetadata` em `{caminho}`.", ""]
    out = [f"Amostra real: **{n} chamadas** em `{caminho.name}`.", "", "| Campo | Média | Mediana | Máx. |", "|---|---|---|---|"]
    for c in campos:
        v = valores[c]
        if v:
            out.append(f"| `{c}` | {num(statistics.mean(v))} | {num(statistics.median(v))} | {num(max(v))} |")
    return out + [""]


def secao_tokens(p: dict, logs: Path | None) -> tuple[list[str], dict]:
    t = p["tokens"]
    cpt = t["chars_por_token"]
    linhas = ["## 2. Tokens (estimados pelo tamanho dos arquivos)", ""]
    linhas += [f"Conversão: **{cpt} caracteres por token** — {t['chars_por_token_fonte']}.", ""]
    linhas += ["| Prompt (modelo fixo, sem o contexto) | Caracteres | Tokens estimados |", "|---|---|---|"]
    grupos = {
        "por perfil": t["prompts_base_por_perfil"],
        "por tópico": t["prompts_base_por_topico"],
        "por aluno e ciclo": t["prompts_por_aluno_por_ciclo"],
        "mentor (por chamada)": [t["prompt_mentor"]],
    }
    soma: dict[str, int] = {}
    for grupo, arquivos in grupos.items():
        soma[grupo] = 0
        for rel in arquivos:
            c = _chars(rel)
            soma[grupo] += c
            linhas.append(f"| `{Path(rel).name}` ({grupo}) | {num(c)} | {num(c / cpt)} |")
    linhas.append("")

    material = t["material_professor_chars_por_topico"]
    saida_txt = t["saida_texto_chars_por_perfil"]
    roteiro = t["roteiro_audio_chars_por_perfil"]
    entrada_perfil = None if material is None else (soma["por perfil"] + material) / cpt
    saida_perfil = None if saida_txt is None else saida_txt / cpt
    linhas += [
        "Por geração (tópico × perfil):",
        "",
        f"- entrada ≈ (prompts por perfil {num(soma['por perfil'])} + material {num(material)}) / {cpt} = **{num(entrada_perfil)} tokens**",
        f"- saída de texto ≈ {num(saida_txt)} / {cpt} = **{num(saida_perfil)} tokens**",
        f"- roteiro de áudio (TTS) = **{num(roteiro)} caracteres** (o TTS cobra por caractere ou por áudio, não pelo token de texto)",
        f"- fator de novas tentativas = **{num(t['fator_novas_tentativas'], 2)}**",
        "",
        "O microservice monta parte dos prompts no próprio código (`geminiService.ts`), fora dos `.txt`: "
        "a contagem acima é um piso. A amostra real abaixo corrige isso.",
        "",
    ]
    if logs:
        linhas += _resumo_logs(logs)
    else:
        linhas += [
            "Amostra real: **PENDENTE** — rode com `--logs <arquivo>` sobre os logs do microservice no Dokploy "
            "(linhas `[gemini-diag]`).",
            "",
        ]
    return linhas, {"entrada": entrada_perfil, "saida": saida_perfil, "roteiro": roteiro, "soma": soma}


# -------------------------------------------------------------------- custos


def _custo_geracao_usd(p: dict, tok: dict) -> float | None:
    pr = p["precos"]
    fator = p["tokens"]["fator_novas_tentativas"]
    necessarios = [tok["entrada"], tok["saida"], tok["roteiro"], fator, pr["texto_entrada_usd_por_mtok"], pr["texto_saida_usd_por_mtok"], pr["tts_usd_por_mtok_ou_mchar"]]
    if any(v is None for v in necessarios):
        return None
    texto = tok["entrada"] * pr["texto_entrada_usd_por_mtok"] / 1e6 + tok["saida"] * pr["texto_saida_usd_por_mtok"] / 1e6
    unidade_tts = tok["roteiro"] if pr["tts_unidade"] == "char" else tok["roteiro"] / p["tokens"]["chars_por_token"]
    tts = unidade_tts * pr["tts_usd_por_mtok_ou_mchar"] / 1e6
    img = 0.0
    if pr["imagem_usd_por_unidade"] is not None and pr["imagens_por_topico"] is not None:
        img = pr["imagem_usd_por_unidade"] * pr["imagens_por_topico"] / p["cenario"]["perfis_brainhex"]
    return (texto + tts + img) * fator


def secao_custos(p: dict, tok: dict) -> list[str]:
    c = p["cenario"]
    pub = p["publicado_v7"]
    cambio = p["cambio"]["usd_brl"]
    alunos, topicos, perfis, turmas = c["alunos_por_turma"], c["topicos_por_turma_mes"], c["perfis_brainhex"], c["turmas_comparacao"]
    linhas = ["## 3. Custos", "", f"Câmbio: R$ {num(cambio, 4)} por US$ ({p['cambio']['fonte']}).", ""]

    # 3.1 gerações
    ger_perfil = topicos * min(perfis, alunos)
    ger_aluno = topicos * alunos
    linhas += [
        "### 3.1 Gerações de mídia por turma e mês",
        "",
        f"- por perfil: {topicos} tópicos × min({perfis} perfis, {alunos} alunos) = **{ger_perfil}**",
        f"- por aluno: {topicos} tópicos × {alunos} alunos = **{ger_aluno}**",
        f"- redução por tópico: 1 − {perfis}/{alunos} = **{num((1 - perfis / alunos) * 100, 1)}%** (v7: {num(pub['reducao_geracoes_por_topico'] * 100, 1)}%) — é teto: supõe os 7 perfis presentes",
        "",
    ]

    # 3.2 custo por geração
    usd = _custo_geracao_usd(p, tok)
    implicito_perfil = pub["geracao_turma_mes_por_perfil_brl"] / ger_perfil
    implicito_aluno = pub["geracao_turma_mes_por_aluno_brl"] / ger_aluno
    linhas += ["### 3.2 Custo de uma geração (tópico × perfil)", ""]
    if usd is not None:
        unit = usd * cambio
        linhas.append(f"Calculado dos preços e tokens: US$ {num(usd, 4)} × {num(cambio, 4)} = **{brl(unit)}**.")
    else:
        unit = None
        linhas.append("Calculado dos preços e tokens: **PENDENTE** (faltam preços com data e/ou tokens em `parametros.json`).")
    linhas += [
        "",
        f"Implícito nos números da v7: {brl(pub['geracao_turma_mes_por_perfil_brl'])} / {ger_perfil} = **{brl(implicito_perfil)}** "
        f"e {brl(pub['geracao_turma_mes_por_aluno_brl'])} / {ger_aluno} = **{brl(implicito_aluno)}** "
        f"(diferença de {num(abs(implicito_perfil - implicito_aluno) / implicito_aluno * 100, 1)}%: os dois valores usam o mesmo custo unitário, arredondado).",
        "",
    ]
    base = unit if unit is not None else implicito_perfil
    origem = "calculado" if unit is not None else "implícito na v7, não medido"

    # 3.3 parte fixa
    itens = p["custo_fixo_mensal_brl"]["itens"]
    conhecidos = [i for i in itens if i["brl"] is not None]
    soma_fixa = sum(i["brl"] for i in conhecidos)
    completo = len(conhecidos) == len(itens)
    linhas += ["### 3.3 Parte fixa mensal (planos pagos)", "", "| Serviço | Valor | Fonte |", "|---|---|---|"]
    for i in itens:
        linhas.append(f"| {i['servico']} | {brl(i['brl'])} | {i['fonte'] or PENDENTE} |")
    linhas += [
        "",
        f"Soma com fonte: **{brl(soma_fixa)}**{'' if completo else ' (incompleta)'}; v7: {brl(p['custo_fixo_mensal_brl']['valor_publicado_brl'])}.",
        "",
    ]
    fixo = soma_fixa if completo else p["custo_fixo_mensal_brl"]["valor_publicado_brl"]
    origem_fixo = "soma das faturas" if completo else "valor da v7, sem decomposição"

    # 3.4 por aluno
    por_aluno = p["custo_por_aluno_mes_brl"]["valor"]
    origem_aluno = "registrado"
    if por_aluno is None:
        por_aluno = p["custo_por_aluno_mes_brl"]["valor_publicado_brl"]
        origem_aluno = "valor da v7, sem memória"
    linhas += [
        "### 3.4 Segunda camada, por aluno e mês",
        "",
        f"Usado: **{brl(por_aluno)}** ({origem_aluno}). Para calcular: ciclos de telemetria por aluno e mês "
        f"({num(p['tokens']['ciclos_por_aluno_mes'])}) × tokens dos prompts por ciclo "
        f"({num(tok['soma']['por aluno e ciclo'] / p['tokens']['chars_por_token'])} só de modelo fixo) + mensagens ao mentor "
        f"({num(p['tokens']['mensagens_mentor_por_aluno_mes'])}) × {p['tokens']['chamadas_por_mensagem_mentor']} chamadas, a preço de tabela.",
        "",
    ]

    # 3.5 comparação
    def total(n_turmas: int, geracoes_por_turma: int) -> float:
        return fixo + n_turmas * geracoes_por_turma * base + n_turmas * alunos * por_aluno

    linhas += [
        f"### 3.5 Comparação com {turmas} turmas",
        "",
        f"Total = fixo + turmas × gerações × custo da geração + turmas × alunos × custo por aluno "
        f"(geração: {origem}; fixo: {origem_fixo}; por aluno: {origem_aluno}).",
        "",
        "| Estratégia | Fixo | Geração | Por aluno | Total/mês |",
        "|---|---|---|---|---|",
    ]
    for nome, g in (("por perfil", ger_perfil), ("por aluno", ger_aluno)):
        linhas.append(
            f"| {nome} | {brl(fixo)} | {brl(turmas * g * base)} | {brl(turmas * alunos * por_aluno)} | **{brl(total(turmas, g))}** |"
        )
    reducao = 1 - total(turmas, ger_perfil) / total(turmas, ger_aluno)
    linhas += ["", f"Redução: **{num(reducao * 100, 1)}%** (v7: {num(pub['reducao_dez_turmas'] * 100, 0)}%).", ""]

    # 3.6 gasto real
    faturas = p["gasto_desenvolvimento"]["faturas"]
    linhas += ["### 3.6 Gasto real com IA no desenvolvimento", ""]
    if faturas:
        linhas += ["| Data | Serviço | Moeda | Valor | Câmbio | R$ |", "|---|---|---|---|---|---|"]
        soma = 0.0
        for f in faturas:
            reais = f["valor"] * (f.get("cambio") or 1)
            soma += reais
            linhas.append(f"| {f['data']} | {f['servico']} | {f['moeda']} | {num(f['valor'], 2)} | {num(f.get('cambio') or 1, 4)} | {brl(reais)} |")
        linhas += ["", f"Soma: **{brl(soma)}** (v7: {brl(p['gasto_desenvolvimento']['valor_publicado_brl'])})."]
    else:
        linhas.append(
            f"**PENDENTE**: nenhuma fatura em `gasto_desenvolvimento.faturas`. v7: {brl(p['gasto_desenvolvimento']['valor_publicado_brl'])}."
        )
    return linhas + [""]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--parametros", type=Path, default=PARAMETROS)
    ap.add_argument("--logs", type=Path, help="logs do microservice com linhas [gemini-diag]")
    ap.add_argument("--saida", type=Path, help="grava o relatório em vez de imprimir")
    args = ap.parse_args()

    p = json.loads(args.parametros.read_text(encoding="utf-8"))
    linhas = [
        "# Memória de cálculo — saída do script",
        "",
        f"Gerado em {datetime.now(UTC).strftime('%Y-%m-%d %H:%M')} UTC por `scripts/custos/memoria_de_calculo.py`. "
        f"`{PENDENTE}` = entrada ainda não registrada em `parametros.json`.",
        "",
    ]
    linhas += secao_horas(p)
    tok_linhas, tok = secao_tokens(p, args.logs)
    linhas += tok_linhas
    linhas += secao_custos(p, tok)
    texto = "\n".join(linhas)
    if args.saida:
        args.saida.write_text(texto, encoding="utf-8")
    else:
        print(texto)


if __name__ == "__main__":
    main()
