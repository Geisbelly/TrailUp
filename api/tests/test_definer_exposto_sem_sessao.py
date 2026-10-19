"""Portao: funcao SECURITY DEFINER exposta ao cliente tem de conferir a sessao.

`SECURITY DEFINER` roda com os privilegios do dono, entao as policies das
tabelas base NAO se aplicam -- e o mesmo bypass que o CLAUDE.md descreve para
view sem `security_invoker`, so que por funcao. Com `GRANT EXECUTE` para
`authenticated`, ela vira `/rest/v1/rpc/<nome>` e qualquer sessao chama
passando o id que quiser.

Nao e hipotetico. Medido em producao, como um aluno sem relacao com a turma:

    SELECT direto na nota (RLS barra?)     0 linhas   <- a RLS funciona
    fn_nota_90_10(vitima, prova)           87.00      <- a nota, vazada
    SELECT direto em classe_aluno (RLS)    0 linhas
    social_presenca_turma(turma alheia)    [{aluno_id...}, {aluno_id...}]

Seis funcoes vazavam assim. Este teste existe para que a setima nao chegue
caladamente: ela entra vermelha, e so fica verde quando alguem disser o que a
protege.

## O que o portao cobre, e o que nao cobre

Ele le as MIGRACOES. Pega tudo que entra pelo caminho revisado, que e por onde
as funcoes novas devem entrar.

NAO pega o schema nao versionado -- funcao criada direto pelo painel do
Supabase (ver `docs/architecture/schema-nao-versionado.md`). Foi exatamente de
la que veio `fn_questao_gabarito_em_texto`, e o CI nao tem banco para
consultar. Para essa metade existe `scripts/auditoria_definer.sql`, que roda a
mesma regra contra a base viva.

## A regra

Uma funcao e cobrada quando, somando GRANT e REVOKE na ordem das migracoes,
ela termina com EXECUTE para `authenticated` ou `anon` E e SECURITY DEFINER.
Ela passa se:

  - o corpo cita `auth.uid()` ou `auth.jwt()`; ou
  - esta em `SEM_SESSAO_POR_DECISAO`, com o motivo escrito.

Olhar so `auth.uid()` daria falso positivo em `app_e_dono`, que confere a
sessao pelo e-mail do JWT -- por isso as duas marcas.

Delegacao NAO e detectada automaticamente, de proposito. A versao anterior
deste arquivo tentava: se o corpo chamasse alguma funcao que cita a sessao,
passava. Isso deixou `loja_catalogo` passar -- ela chama uma funcao que olha
a sessao, mas devolve o catalogo da turma que receber, sem conferir turma
nenhuma. Chamar algo que olha a sessao nao e o mesmo que estar protegido por
ela, e um portao que deixa passar calado e pior do que portao nenhum. Quem
delega de verdade (`aprovacoes_pendentes` -> `app_e_dono()`) entra na lista
com a delegacao escrita, que e mais util para quem le do que uma heuristica
acertando por sorte.

A primeira versao deste arquivo sinalizava 33 funcoes, quase todas corretas,
porque o extrator de corpo parava na assinatura.
"""

from __future__ import annotations

import re
from pathlib import Path

VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"

# Marcas de que a funcao olha quem esta chamando.
SESSAO = ("auth.uid()", "auth.jwt()")

# Exposta, DEFINER e sem conferir a sessao -- por decisao, com o motivo.
# Linha nova aqui e decisao de produto, nao conveniencia: diga o que protege o
# dado, ou revogue o EXECUTE.
SEM_SESSAO_POR_DECISAO: dict[str, str] = {
    "aprovacoes_pendentes": (
        "Delega: a primeira instrucao do corpo e "
        "`IF NOT public.app_e_dono() THEN RAISE ... 42501`, e `app_e_dono()` "
        "confere o e-mail do JWT contra `app_config.dono_email`. A leitura de "
        "auth.users vem depois da conferencia."
    ),
    "aprovacoes_ultima": (
        "Mesma delegacao de `aprovacoes_pendentes`: `app_e_dono()` antes de "
        "qualquer leitura, e so o dono do sistema passa."
    ),
}


def _migracoes() -> list[tuple[str, str]]:
    """Cada migracao, cortada antes de `def downgrade`.

    O que esta no downgrade e a REVERSAO, nao o estado que fica. Sem o corte,
    o `GRANT` que `20261018_04` usa para desfazer suas proprias revogacoes era
    lido como se fosse o estado final -- e a funcao revogada continuava
    aparecendo como exposta.
    """
    saida: list[tuple[str, str]] = []
    for f in sorted(VERSOES.glob("*.py")):
        texto = f.read_text(encoding="utf-8", errors="replace")
        saida.append((f.name, texto.split("def downgrade")[0]))
    return saida


def _corpos(nome: str, texto: str) -> list[str]:
    """Cada `CREATE FUNCTION <nome>` ate o fecho da dollar-quote dele.

    Delimitar pela marca de abertura (`$function$`, `$fn$`, ...) e o que
    separa o corpo da proxima instrucao. Sem isso o recorte para na
    assinatura e toda funcao parece nao ter checagem.
    """
    saida: list[str] = []
    padrao = re.compile(
        r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?\"?" + re.escape(nome) + r"\"?\s*\(",
        re.I,
    )
    for m in padrao.finditer(texto):
        resto = texto[m.start():]
        marca = re.search(r"AS\s+(\$[a-zA-Z_]*\$)", resto)
        if not marca:
            saida.append(resto[:400])
            continue
        fim = resto.find(marca.group(1), marca.end())
        saida.append(resto[: fim if fim > 0 else marca.end() + 4000])
    return saida


def _expostas() -> set[str]:
    """Funcoes que TERMINAM com EXECUTE para authenticated/anon.

    GRANT e REVOKE sao somados na ordem das migracoes: revogar depois tira a
    funcao da conta, que e o que `20261018_04` faz com seis delas.
    """
    estado: dict[str, bool] = {}
    for _, texto in _migracoes():
        for m in re.finditer(
            # `[A-Za-z_,\s]+` e nao `[a-z...]`: a linha real e
            # `FROM PUBLIC, anon, authenticated`, e com a classe so minuscula
            # o match falhava inteiro -- os REVOKE ficavam invisiveis e o
            # portao dizia que estava tudo limpo.
            r"(GRANT|REVOKE)\s+(?:EXECUTE|ALL)\s+ON\s+FUNCTION\s+(?:public\.)?\"?([a-z_][a-z0-9_]*)\"?\s*\([^)]*\)\s*(?:TO|FROM)\s+([A-Za-z_,\s]+)",
            texto,
            re.I,
        ):
            verbo, nome, papeis = m.group(1).upper(), m.group(2), m.group(3).lower()
            if re.search(r"authenticated|anon", papeis):
                estado[nome] = verbo == "GRANT"
    return {nome for nome, exposta in estado.items() if exposta}


def _confere_sessao(nome: str, fontes: list[tuple[str, str]]) -> bool:
    definer = False
    for _, texto in fontes:
        for corpo in _corpos(nome, texto):
            if re.search(r"SECURITY\s+DEFINER", corpo, re.I):
                definer = True
            if any(marca in corpo for marca in SESSAO):
                return True
    # SECURITY INVOKER nao precisa: a RLS do chamador continua valendo.
    return not definer


def _desprotegidas() -> dict[str, str]:
    fontes = _migracoes()
    fora: dict[str, str] = {}
    for nome in sorted(_expostas()):
        if not any(_corpos(nome, t) for _, t in fontes):
            continue  # so recebe GRANT aqui; o corpo vive fora do Alembic
        if not _confere_sessao(nome, fontes):
            fora[nome] = "DEFINER exposta a authenticated/anon sem conferir a sessao"
    return fora


def test_toda_definer_exposta_confere_a_sessao() -> None:
    fora = _desprotegidas()
    novas = {n: m for n, m in fora.items() if n not in SEM_SESSAO_POR_DECISAO}
    assert not novas, (
        "Funcao SECURITY DEFINER com EXECUTE para authenticated/anon que nao "
        "confere a sessao:\n  " + "\n  ".join(f"{n}: {m}" for n, m in novas.items()) +
        "\n\nDEFINER ignora a RLS das tabelas base: quem chamar passa o id que "
        "quiser. Faca uma destas tres coisas:\n"
        "  1. use auth.uid()/auth.jwt() no corpo (ou um helper que use);\n"
        "  2. REVOKE EXECUTE de authenticated e anon, se so outra funcao chama;\n"
        "  3. acrescente em SEM_SESSAO_POR_DECISAO, com o motivo."
    )


def test_a_lista_de_excecoes_nao_cria_excecao_muda() -> None:
    """Entrada sem motivo escrito e isencao silenciosa, que e o que o portao
    existe para impedir."""
    for nome, motivo in SEM_SESSAO_POR_DECISAO.items():
        assert len(motivo.strip()) > 40, f"{nome} precisa de um motivo de verdade"


def test_a_lista_nao_guarda_nome_que_ja_saiu() -> None:
    """Excecao que sobrevive a correcao vira permissao esquecida."""
    fora = _desprotegidas()
    sobrando = [n for n in SEM_SESSAO_POR_DECISAO if n not in fora]
    assert not sobrando, (
        f"{sobrando} nao sao mais sinalizadas: ou ganharam checagem, ou o "
        "EXECUTE foi revogado. Tire-as de SEM_SESSAO_POR_DECISAO."
    )


def test_o_portao_realmente_sinaliza_quem_nao_confere() -> None:
    """Guarda contra vacuidade: se o extrator quebrar, tudo passa.

    `fn_questao_gabarito_em_texto` nao e DEFINER, mas serve de controle --
    `_confere_sessao` tem de devolver False para um nome DEFINER inventado que
    nao cita sessao nenhuma.
    """
    falsa = [("falsa.py", "CREATE FUNCTION public.zz_teste(p uuid) RETURNS int "
                          "LANGUAGE sql SECURITY DEFINER AS $fn$ SELECT 1 $fn$;")]
    assert _confere_sessao("zz_teste", falsa) is False
    boa = [("boa.py", "CREATE FUNCTION public.zz_ok(p uuid) RETURNS int "
                      "LANGUAGE sql SECURITY DEFINER AS $fn$ SELECT 1 WHERE p = auth.uid() $fn$;")]
    assert _confere_sessao("zz_ok", boa) is True
