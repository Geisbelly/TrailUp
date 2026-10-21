"""Portao: RPC que o app chama tem de ser criada por alguma migracao.

Toda RPC que o app chama tem de ser descrita por uma migracao. Hoje UMA das 85
que os clientes chamam nao e -- `fn_auth_email_exists`, feita pelo painel do
Supabase. As outras duas que sobravam (`fn_atualizar_aluno_perfil` e
`fn_cadastrar_aluno_com_perfis`) entraram na `20261021_24`; esta fica de fora
de proposito, porque e a issue #329 e versionar o texto atual registraria o
defeito em vez de corrigi-lo.

## O que este portao NAO promete (corrigido em 21/10)

Este docstring dizia "um banco construido do zero a partir do Alembic tem de
servir o app". **A cadeia nao constroi banco nenhum do zero**, e isso foi
medido: ela cria 83 tabelas, mas nao `alunos`, `classe`, `classe_aluno`,
`perfil`, `aluno_perfil`, `questoes`, `atividades`, `conteudos`, `topicos`,
`professor` nem `notificacoes`. A primeira revisao (`20260405_01`) e de tabelas
de checkpoint do LangGraph: a cadeia e um INCREMENTO sobre um schema base
criado no painel. `docs/architecture/schema-nao-versionado.md` ja concluiu isso
e aponta o caminho -- baseline de `pg_dump --schema-only` + `alembic stamp`.

Entao o que este portao de fato protege e menor e verdadeiro: **nenhuma RPC
nova entra no app sem passar por revisao de migracao**. Foi a ausencia dessa
revisao que deixou passar `fn_questao_gabarito_em_texto`, que impedia salvar
questao dissertativa (22004), e `social_presenca_turma`, que entregava a lista
de alunos de qualquer turma.


Este portao nao conserta a divida -- ele impede que ela cresca. RPC nova
chamada pelo app sem migracao que a crie entra vermelha.

## O numero ja foi 22, e os outros 19 eram do PARSER, nao da base

Ate 21/10 esta lista registrava 22 RPCs como "criadas pelo painel", e o
docstring anunciava que um banco novo nascia "sem guilda nenhuma e sem metade
do social". **Era falso, e a causa era aqui dentro:** o parser lia o texto-fonte
dos `.py` e procurava `CREATE FUNCTION` literal. Dois jeitos legitimos de
escrever migracao escapam disso:

  - **SQL em arquivo externo.** Varias migracoes nao carregam o SQL no proprio
    `.py`: elas fazem `op.execute(path.read_text(...))` sobre um arquivo de
    `docs/mobile/sql/`. As dez RPCs de guildas e as de social nascem dali
    (`20260912_02`, `20260912_03`, `20260913_01`..`_06`).
  - **CREATE montado com o nome interpolado.** A `20260913_10` escreve
    `FUNCTION public.{name}(`, entao o literal nunca aparece no fonte.

Conferido por medicao, nao por leitura: para cada uma das 16 funcoes de guilda
e social, o md5 de `prosrc` da ULTIMA definicao da cadeia bate com o da
producao. Elas estavam versionadas desde setembro.

O custo de acreditar no numero errado foi real: a `20261021_21` e a `_22`
nasceram para "trazer guildas para o Alembic", trabalho que ja estava feito. O
que elas de fato consertam e outra coisa -- o GRANT (abaixo).

**Licao que o portao agora cobra em teste:** uma lista permissiva nunca reclama
de entrada obsoleta, entao ela mente para cima e ninguem percebe. Ver
`test_nenhuma_entrada_da_divida_esta_obsoleta`.

## O que a cadeia realmente NAO faz: revogar o PUBLIC

Medido na producao em 2026-10-20, e este sim e um buraco:

  - o `ALTER DEFAULT PRIVILEGES` do schema `public` concede EXECUTE a `anon`
    em toda funcao nova -- e e schema nao versionado;
  - nenhum `.sql` de `docs/mobile/sql/` revoga EXECUTE de PUBLIC/anon nas
    funcoes que cria (os REVOKE de la sao sobre TABELAS);
  - na producao, `anon` esta revogado nas 16 -- **na mao, fora da cadeia**. A
    prova e `social_par`, a unica que ainda carrega `=X/postgres` (PUBLIC).

Ou seja: a divergencia entre um banco novo e a producao nao esta no codigo das
funcoes, esta no privilegio. Este portao nao mede isso; `test_trigger_fns_acl`
e o REVOKE explicito de cada migration nova e que cobrem.

## O parser precisa ver TODAS as chamadas

Tres servicos embrulham a chamada e passam o nome por variavel
(`socialService.socialAction`, `guildService.action`, `notificacoesDb.chamar`).
Um parser que olhasse so `.rpc("nome")` perderia 27 RPCs e daria a impressao
de cobertura. Por isso:

  - le `.rpc("nome")` direto;
  - le o primeiro literal passado aos wrappers conhecidos;
  - e FALHA se achar `.rpc(variavel)` num arquivo que nao esta no mapa de
    wrappers -- wrapper novo nao pode criar ponto cego calado.
"""

from __future__ import annotations

import re
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
CLIENTES = (RAIZ / "frontend" / "src", RAIZ / "mobile" / "src")
VERSOES = Path(__file__).resolve().parents[1] / "alembic" / "versions"
# Varias migracoes nao carregam o SQL no proprio .py: elas leem um arquivo daqui e o executam.
SQL_EXTERNO = RAIZ / "docs" / "mobile" / "sql"

# Arquivo -> funcao que embrulha `supabase.rpc`. O nome da RPC e o primeiro
# literal passado a ela. Mapa explicito: ver o docstring.
WRAPPERS = {
    "mobile/src/services/social/socialService.ts": "socialAction",
    "mobile/src/services/social/guildService.ts": "action",
    "mobile/src/services/notificacoesDb.ts": "chamar",
    "frontend/src/components/console/economia/economiaApi.ts": "chamar",
}

# Migracao que monta o CREATE com o nome da funcao interpolado -- o literal
# `CREATE OR REPLACE FUNCTION public.social_chat_listar(` nunca aparece no fonte,
# so `public.{name}(`. Registro explicito, mesmo principio de WRAPPERS: template
# novo nao pode criar ponto cego calado (ver o teste que cobra isso).
CRIA_POR_TEMPLATE: dict[str, tuple[str, ...]] = {
    "20260913_10_chat_colegas_sem_amizade.py": ("social_chat_listar", "social_chat_enviar"),
    # Interpola o nome so para PROCURAR o bloco dentro da propria constante VERSIONADAS
    # (`_da_producao`). Os CREATE literais estao no arquivo, entao o parser ja os ve: a tupla
    # vazia e a decisao registrada de que aqui nao ha nada escondido.
    "20261021_19_arena_volta.py": (),
}

# RPCs que o app chama e que NENHUMA migracao cria. Entrada aqui e divida
# registrada, nao permissao: trazer a funcao para o Alembic tira a linha.
FORA_DO_ALEMBIC: dict[str, str] = {
    "fn_auth_email_exists": (
        "Criada pelo painel. E a issue #329: permite enumerar e-mail cadastrado "
        "sem autenticar. Trazer para o Alembic so faz sentido junto da correcao."
    ),
}


def _fontes_do_cliente() -> list[tuple[str, str]]:
    saida: list[tuple[str, str]] = []
    for base in CLIENTES:
        for f in base.rglob("*"):
            if f.suffix not in (".ts", ".tsx") or ".test." in f.name:
                continue
            saida.append((
                str(f.relative_to(RAIZ)).replace("\\", "/"),
                f.read_text(encoding="utf-8", errors="replace"),
            ))
    return saida


def _rpcs_chamadas() -> set[str]:
    nomes: set[str] = set()
    for caminho, texto in _fontes_do_cliente():
        nomes |= set(re.findall(r'\.rpc\(\s*["\'`]([a-z_][a-z0-9_]*)', texto))
        wrapper = WRAPPERS.get(caminho)
        for w in {wrapper} | set(WRAPPERS.values()):
            if not w:
                continue
            nomes |= set(re.findall(r"\b" + w + r'(?:<[^>]*>)?\(\s*["\'`]([a-z_][a-z0-9_]*)', texto))
    return nomes


def _chamadas_dinamicas_sem_wrapper() -> list[str]:
    fora: list[str] = []
    for caminho, texto in _fontes_do_cliente():
        if re.search(r"\.rpc\(\s*[a-zA-Z_$][a-zA-Z0-9_$]*\s*,", texto):
            if caminho not in WRAPPERS:
                fora.append(caminho)
    return fora


_CRIA = re.compile(
    r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?\"?([a-z_][a-z0-9_]*)",
    re.I,
)
# `op.execute(<var>.read_text(...))` = a migracao executa o .sql INTEIRO. Quem so recorta um
# trecho (`op.execute(texto[i:j])`, como a 20261021_08) nao casa aqui de proposito: creditar o
# arquivo todo a ela diria que ela cria funcoes que ela nao cria.
_EXECUTA_ARQUIVO_INTEIRO = re.compile(r"op\.execute\(\s*\w+\.read_text\(")
_REFERENCIA_SQL = re.compile(r"[\"\']([0-9a-z_]+\.sql)[\"\']")
# Varias migracoes LOCALIZAM um bloco por busca textual:
# `source.index("CREATE OR REPLACE FUNCTION public.social_aceitar_convite(")`.
# Isso nao cria nada, mas casava com `_CRIA` e fazia a funcao contar como versionada --
# falha silenciosa na direcao ERRADA para este portao, que existe para reprovar RPC
# ausente da cadeia. O argumento dessas buscas sai do texto antes de procurar CREATE.
#
# Efeito colateral aceito: quem cria a funcao APENAS recortando um bloco de outro arquivo
# (`op.execute(texto[i:j])`) deixa de ser creditado e volta a aparecer como divida. Isso
# falha alto, nao em silencio, e o lugar de registrar esse caso e CRIA_POR_TEMPLATE.
_ARGUMENTO_DE_BUSCA = re.compile(
    r"\.(?:index|rindex|find|rfind|count|startswith|endswith)\(\s*(['\"])(?:\\.|(?!\1).)*\1",
    re.S,
)


def _texto_emitido(arquivo: Path) -> str:
    """O SQL que a migracao emite: o proprio .py mais cada .sql que ela executa inteiro."""
    texto = arquivo.read_text(encoding="utf-8", errors="replace")
    partes = [_ARGUMENTO_DE_BUSCA.sub("", texto)]
    # A busca por `.sql` usa o texto ORIGINAL: o nome do arquivo nao vem de `.index(...)`.
    if _EXECUTA_ARQUIVO_INTEIRO.search(texto):
        for nome in sorted(set(_REFERENCIA_SQL.findall(texto))):
            externo = SQL_EXTERNO / nome
            if externo.exists():
                partes.append(externo.read_text(encoding="utf-8", errors="replace"))
    return "\n".join(partes)


def _criadas_por_migracao() -> set[str]:
    nomes: set[str] = set()
    for arquivo in sorted(VERSOES.glob("*.py")):
        nomes |= {n.lower() for n in _CRIA.findall(_texto_emitido(arquivo))}
    for criadas in CRIA_POR_TEMPLATE.values():
        nomes |= set(criadas)
    return nomes


def _sql_referenciado_que_nao_existe() -> list[str]:
    faltando: list[str] = []
    for arquivo in sorted(VERSOES.glob("*.py")):
        texto = arquivo.read_text(encoding="utf-8", errors="replace")
        for nome in sorted(set(_REFERENCIA_SQL.findall(texto))):
            if not (SQL_EXTERNO / nome).exists():
                faltando.append(f"{arquivo.name} -> {nome}")
    return faltando


def _migracoes_com_create_interpolado() -> list[str]:
    # Tres estilos de interpolacao, nao so f-string: `{nome}`, concatenacao (`" + nome +`) e
    # `%s`/`%(nome)s`. A versao anterior olhava so `{`, enquanto o docstring prometia cobrir
    # "template novo" -- promessa maior que a entrega.
    padrao = re.compile(
        r"CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?(?:\{|%s|%\(|[\"\']\s*\+|[\"\']\s*%)",
        re.I,
    )
    return [
        a.name
        for a in sorted(VERSOES.glob("*.py"))
        if padrao.search(a.read_text(encoding="utf-8", errors="replace"))
        and a.name not in CRIA_POR_TEMPLATE
    ]


def test_toda_rpc_chamada_nasce_de_uma_migracao() -> None:
    novas = sorted(_rpcs_chamadas() - _criadas_por_migracao() - set(FORA_DO_ALEMBIC))
    assert not novas, (
        "O app chama estas RPCs e nenhuma migracao as cria:\n  " + "\n  ".join(novas) +
        "\n\nUm banco novo, construido a partir do Alembic, nasce sem elas. "
        "Crie a migracao, ou registre em FORA_DO_ALEMBIC com o motivo."
    )


def test_nenhum_wrapper_novo_cria_ponto_cego() -> None:
    """`.rpc(variavel)` num arquivo fora do mapa esconde todas as RPCs que
    passam por ele. Foi assim que a primeira versao deste parser viu 34 de 61."""
    fora = _chamadas_dinamicas_sem_wrapper()
    assert not fora, (
        "Estes arquivos chamam `.rpc(` com nome em variavel e nao estao em "
        "WRAPPERS:\n  " + "\n  ".join(fora) +
        "\n\nAcrescente o arquivo e o nome da funcao que embrulha, senao as "
        "RPCs que passam por ali ficam invisiveis para este portao."
    )


def test_o_parser_enxerga_as_chamadas_por_wrapper() -> None:
    """Guarda contra vacuidade: se o trecho dos wrappers quebrar, o portao
    passa a aprovar tudo que passa por eles."""
    nomes = _rpcs_chamadas()
    assert "social_bloquear" in nomes, "literal passado a socialAction nao foi visto"
    assert "notificacoes_registrar_login" in nomes, "literal passado a chamar nao foi visto"
    assert len(nomes) > 50, f"so {len(nomes)} RPCs vistas; o parser provavelmente quebrou"


def test_a_divida_registrada_tem_motivo_escrito() -> None:
    for nome, motivo in FORA_DO_ALEMBIC.items():
        assert len(motivo.strip()) > 40, f"{nome} precisa de um motivo de verdade"


def test_nenhuma_entrada_da_divida_esta_obsoleta() -> None:
    """A lista e permissiva: ela subtrai, nunca cobra. Sem este teste, nome que
    JA virou migracao continua contado como divida e o numero mente para cima --
    foi o que aconteceu com tres entradas entre 18/10 e 21/10."""
    obsoletas = sorted(set(FORA_DO_ALEMBIC) & _criadas_por_migracao())
    assert not obsoletas, (
        "Estas entradas de FORA_DO_ALEMBIC ja sao criadas por migracao:\n  "
        + "\n  ".join(obsoletas)
        + "\n\nTire a linha: divida paga que fica na lista inflama a conta e "
        "esconde o progresso."
    )


def test_o_parser_enxerga_o_sql_em_arquivo_externo() -> None:
    """Guarda contra a regressao que custou a `_21`/`_22`: enquanto o parser lia so o `.py`, as
    dez RPCs de guildas e as de social apareciam como divida, e o docstring anunciava que um
    banco novo nascia sem elas. Se o trecho dos `.sql` externos quebrar, o portao volta a mentir
    para cima -- e a mentira e convincente, porque vem de um teste verde."""
    criadas = _criadas_por_migracao()
    # Nascem de docs/mobile/sql/, nunca de um CREATE literal num .py:
    for nome in ("guilda_convidar", "guilda_dissolver", "social_bloquear", "social_notificar_evento"):
        assert nome in criadas, f"{nome} nasce de .sql externo e o parser deixou de ver"
    # E o template da 20260913_10, que escreve `FUNCTION public.{name}(`:
    for nome in CRIA_POR_TEMPLATE["20260913_10_chat_colegas_sem_amizade.py"]:
        assert nome in criadas, f"{nome} vem do template e o parser deixou de ver"
    assert len(criadas) > 180, f"so {len(criadas)} funcoes vistas; o parser provavelmente quebrou"


def test_nenhum_sql_externo_referenciado_sumiu() -> None:
    """`path.read_text()` de arquivo inexistente derruba a migracao na hora -- mas o portao
    tambem para de ver as funcoes dele, e isso e silencioso. Renomear um `.sql` sem olhar aqui
    reabre o ponto cego."""
    faltando = _sql_referenciado_que_nao_existe()
    assert not faltando, (
        "Migracoes apontam para .sql que nao existe em docs/mobile/sql/:\n  "
        + "\n  ".join(faltando)
    )


def test_nenhum_template_novo_cria_ponto_cego() -> None:
    """Mesmo principio de WRAPPERS, do outro lado: migracao que monta o `CREATE` com o nome
    interpolado e invisivel ao parser, entao ela precisa estar em CRIA_POR_TEMPLATE -- com a
    tupla das funcoes que cria, ou vazia se o interpolado for so busca (caso da `_19`)."""
    fora = _migracoes_com_create_interpolado()
    assert not fora, (
        "Estas migracoes montam `CREATE ... FUNCTION public.{...}(` e nao estao em "
        "CRIA_POR_TEMPLATE:\n  " + "\n  ".join(fora) +
        "\n\nRegistre o que cada uma cria, senao essas funcoes contam como divida sem ser."
    )

