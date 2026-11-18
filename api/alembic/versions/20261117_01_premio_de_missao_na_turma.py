"""Prêmio de missão grava a turma (e passa a somar no rank), e só o banco grava prêmio

Primeira das quatro migrations dos desafios de lógica e cruzadinha como missão
(`docs/superpowers/specs/2026-11-17-desafios-logica-e-cruzadinha-como-missao-design.md`, "Achados" 1 e 2).

## O defeito: prêmio de missão paga 0 ponto

Os gravadores de prêmio fazem `INSERT INTO eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)`
com `referencia = 'missao:<id>'` e sem a turma. Três coisas, em sequência, fazem o prêmio valer 0:

1. `trg_eventos_aluno_valor_do_banco` (BEFORE INSERT, `20261021_06`) **sobrescreve** `classe_id` com
   `fn_eventos_aluno_resolve_classe_id(tipo, referencia)`. O que vier na coluna é ignorado.
2. O resolvedor (`20261003_01`) não conhece o prefixo `missao`, e a turma sai nula.
3. Com a turma nula e uma referência, o gatilho de valor zera o valor, e o rank descarta o evento.

Medido em produção em 17/11 (`BEGIN READ ONLY`), prêmios com `referencia LIKE 'missao:%'`:

| tipo | linhas | soma do valor | sem turma |
|---|---|---|---|
| `missao_concluida` | 2 | 0 | 2 |
| `missao_diaria_concluida` | 65 | 0 | 65 |

`eventos_pontuacao` em produção: `missao_concluida` vale 0 ponto e 0 moeda, `missao_diaria_concluida`
vale 10 pontos e 2 moedas. `missoes.recompensa_tipo` em uso: `missao_concluida` (9 missões) e
`missao_diaria_concluida` (291).

## O que muda

**1. O resolvedor aprende `missao:<id>`.** Ganha a entidade `missao`, com o id no segundo segmento
(como `classe` e `item`), e um `LEFT JOIN public.missoes` que devolve `missoes.classe_id`. Esse é o
conserto de fato: o gatilho de valor e o das moedas (`fn_eventos_aluno_paga_moeda`, `20261020_05`) só
leem a turma pelo resolvedor. O mesmo vale para as views de rank e de XP, que fazem
`COALESCE(classe_id, resolve(...))`.

- **Efeito no passado:** as 67 linhas antigas passam a resolver turma nessas views. Como valem 0,
  nenhum número de rank ou XP muda. O valor gravado não é recalculado (a spec deixa o passado como
  está).
- **Não abre brecha nova:** `classe:<id>` já deixava qualquer evento escolher a turma. Os tipos de
  prêmio, o gatilho novo (item 3) recusa.
- O resolvedor é `SECURITY INVOKER` e lê `missoes` com o papel de quem escreve. O prêmio sai de função
  `SECURITY DEFINER` (dono). Para o aluno, a RLS de `missoes` só mostra as missões das turmas dele.

**2. Os quatro gravadores passam a gravar `classe_id` explicitamente**, com a turma da missão. O
resolvedor já bastaria, mas a coluna explícita deixa o INSERT dizer o que grava. Os laços passam a ler
`m.classe_id`, que antes não estava no registro:

- o laço individual de `trg_eventos_aluno_after_iud`;
- `trg_missao_item_concluido` (`item_no_dia`, `20261103_05`);
- `trg_aluno_atividade_diaria_missao_minutos` (`minutos_no_dia`, `20261021_20`). Este o brief não
  citava, e tinha o mesmo INSERT sem turma;
- `fn_missao_guilda_avaliar` (`20261105_13`), com `v_m.classe_id`.

**3. Só o banco grava prêmio.** O gatilho novo `trg_eventos_aluno_premio_so_do_banco` (BEFORE INSERT,
função `SECURITY INVOKER`) recusa com `42501` quando as três condições valem juntas:

- quem escreve é o cliente: `current_user IN ('authenticated', 'anon')`;
- o sinal `app.missao_premiando` não está `on`;
- o tipo está na lista fixa de prêmio, `TIPOS_DE_PREMIO`: `missao_concluida`,
  `missao_diaria_concluida`, `desafio_logica` ou `desafio_cruzadinha` (estes dois para as tarefas
  seguintes).

Antes, `eventos_aluno_posse_ins` aceitava qualquer tipo não creditado (`20260909_03`), e as moedas só
deduplicam por `(aluno, tipo, referencia)`. Trocando a referência, o aluno recebia de novo.

**A chave que libera o caminho legítimo é `current_user`.** Os quatro gravadores são `SECURITY
DEFINER`. Medido em produção em 17/11 (`prosecdef`): `trg_eventos_aluno_after_iud` = true e
`fn_missao_guilda_avaliar` = true. `trg_missao_item_concluido` e o gatilho de minutos o são pelo próprio
texto da cadeia. Dentro deles `current_user` é o dono, e as claims continuam `authenticated`: é o
padrão de `20261102_04`.

**O sinal `app.missao_premiando` não é a chave desta recusa.** Ele é a guarda de reentrada do gatilho
de eventos (`20261021_04`). Os quatro gravadores o ligam em volta do INSERT do prêmio e o devolvem a
vazio logo depois e no `EXCEPTION`. Como já estão liberados por `current_user`, o sinal fica aceito aqui
só para quem precisar dele.

**Regra para quem ligar o sinal:** devolver a vazio logo depois do INSERT, também no `EXCEPTION`.
`set_config(..., true)` vale até o fim da transação. Ligado dentro de um gatilho e não devolvido, ele
liberaria as linhas seguintes da mesma transação do cliente, inclusive um prêmio forjado num INSERT
em lote. O cliente não liga o sinal sozinho: o PostgREST não expõe `set_config`.

**A recusa vale só para a lista fixa, não para todo `recompensa_tipo` de missão.** Um ramo dinâmico
(`EXISTS` em `missoes.recompensa_tipo`) recusaria também tipos de estudo: bastaria uma missão com
recompensa `atividade_concluida`, `conteudo_*` ou `topico_*` para todo aluno levar `42501` ao gravar
estudo. `fn_missoes_guarda` hoje só confere se o tipo existe em `eventos_pontuacao`. Para a lista
continuar completa, **a Tarefa 2 restringe `missoes.recompensa_tipo` a `TIPOS_DE_PREMIO` na guarda**.

Tipos gravados em `eventos_aluno` nos últimos 30 dias, medidos em produção em 17/11 (`BEGIN READ ONLY`):

| tipo | linhas |
|---|---|
| `ciclo_iniciado` | 370 |
| `ciclo_executado` | 239 |
| `missao_diaria_concluida` | 65 |
| `inatividade` | 44 |
| `topico_aberto` | 5 |
| `conteudo_aberto` | 5 |
| `topico_iniciado` | 4 |
| `conteudo_concluido` | 2 |
| `missao_concluida` | 2 |
| `conquista_desbloqueada` | 1 |

Nenhum tipo de estudo está na lista de prêmio.

**O app não grava nenhum tipo de prêmio.** `git grep "eventos_aluno" origin/main -- mobile/src`: a
única escrita é `EventoAluno.registrar` (`models/Evento.ts`), com tipos de atividade, tópico e
conteúdo (`registrarEvento` em `trilha/[id].tsx` e `useTopicoCompletion.ts`). Nenhuma ocorrência de
`missao_concluida`, `missao_diaria_concluida` nem `missao_cumprida` em `mobile/src`.

## O que mais o prêmio passa a encontrar com a turma preenchida

- **Atraso:** `fn_fator_de_atraso` é schema não versionado e só roda com valor maior que 0, por isso
  nunca rodava no prêmio. Medido em produção em 17/11: ela só reconhece `'^atividade:([0-9]+)$'` e
  devolve 1 para `missao:<id>`. Não reduz o prêmio.
- **Aposta:** `fn_fator_de_aposta` (`20261021_06`) só lê `desafio:<uuid>`. Devolve 1 para
  `missao:<id>`.
- **Moedas:** antes, a turma nula fazia `fn_moedas_do_evento(tipo, NULL)` pagar a moeda global, e a
  diária já pagava 2 moedas sem turma. Agora a moeda vem com a turma (o override por turma de
  `eventos_pontuacao_classe` passa a valer), e `economia_avaliar_metas_de` roda para o prêmio. A
  deduplicação continua por `(aluno, tipo, 'missao:<id>')`, então a moeda não sai duas vezes.
- **Nota final:** turma com `xp_peso_nota_pct > 0` passa a ver o prêmio no XP (`20261102_13`,
  `20261107_01`). É o efeito pedido pela spec.

## Corpos de partida

- **Resolvedor e gatilho de eventos: troca de texto no corpo vivo** (`pg_get_functiondef`), no padrão
  de `20261103_07`. O gatilho de eventos já passou por trocas no banco (`20261101_08`, `20261103_07`),
  e reescrevê-lo apagaria essas trocas.
  - O resolvedor de produção difere do git num comentário. Em produção falta o comentário do
    `com_classe` (o do `classe:<id>:<data>`) que a `20261003_01` tem. As âncoras ficam fora dele e
    existem uma vez nos dois textos.
  - As trocas são idempotentes pela marca `20261117_01` e recusam âncora ausente ou repetida.
  - As âncoras de `TROCAS_GATILHO` foram contadas no corpo vivo de produção de
    `trg_eventos_aluno_after_iud`, e cada uma aparece uma vez.
  - Na importação, as âncoras são conferidas no texto da cadeia do git
    (`gatilho_de_eventos_do_git`, `resolvedor_do_git`).
- **Item, minutos e guilda:** os corpos vêm das migrations que os definiram por último (`20261103_05`,
  `20261021_20`, `20261105_13`; nenhuma troca no banco desde então). A troca é feita no texto em
  Python, e a importação falha se a âncora sumir.

## Downgrade

Devolve os três corpos do git e desfaz as duas trocas no banco (de novo para o texto anterior),
derruba o gatilho e a função novos. Volta ao defeito medido acima.

Revision ID: 20261117_01
Revises: 20261116_02
Create Date: 2026-11-17
"""

from __future__ import annotations

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261117_01"
down_revision = "20261116_02"
branch_labels = None
depends_on = None

MARCA = "20261117_01"


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}_para_17_01", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


M05 = _modulo("20261103_05_missao_diaria_pela_trilha.py")
M07 = _modulo("20261103_07_missao_conta_da_criacao.py")
M13 = _modulo("20261105_13_missao_de_guilda_alvo_por_membro.py")
M20 = _modulo("20261021_20_missao_diaria_coorte_representativa_e_minutos.py")


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


# ------------------------------------------------------------------------- resolvedor de turma
_COMENTARIO_RESOLVEDOR = (
    "                         -- `missao:<id>` (20261117_01): premio de missao. A turma e' a da missao.\n"
)
TROCAS_RESOLVEDOR = (
    (
        "                         WHEN 'item' THEN 'item'\n",
        "                         WHEN 'item' THEN 'item'\n"
        + _COMENTARIO_RESOLVEDOR
        + "                         WHEN 'missao' THEN 'missao'\n",
    ),
    (
        "                     WHEN alvo.entidade IN ('classe', 'item') THEN\n",
        "                     WHEN alvo.entidade IN ('classe', 'item', 'missao') THEN\n",
    ),
    (
        "          SELECT COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, t_i.classe_id, cl.id)\n",
        "          SELECT COALESCE(t.classe_id, t_c.classe_id, t_a.classe_id, t_i.classe_id, cl.id, m_m.classe_id)\n",
    ),
    (
        "          LEFT JOIN public.classe cl    ON com_classe.entidade = 'classe'    AND cl.id = com_classe.id_alvo;",
        "          LEFT JOIN public.classe cl    ON com_classe.entidade = 'classe'    AND cl.id = com_classe.id_alvo\n"
        "          LEFT JOIN public.missoes m_m  ON com_classe.entidade = 'missao'    AND m_m.id = com_classe.id_alvo;",
    ),
)


def resolvedor_do_git() -> str:
    """O resolvedor como a `20261003_01` o grava (a última migration que o define)."""
    fonte = Path(__file__).with_name("20261003_01_referencia_de_item_personalizado.py").read_text(encoding="utf-8")
    achado = re.search(
        r"CREATE OR REPLACE FUNCTION public\.fn_eventos_aluno_resolve_classe_id\(.*?\$function\$.*?\$function\$",
        fonte,
        re.S,
    )
    if achado is None:
        raise RuntimeError("fn_eventos_aluno_resolve_classe_id sumiu da 20261003_01")
    return achado.group(0)


# ---------------------------------------------------------------------- gatilho de eventos (laço)
_SELECT_DO_LACO = M07._LACO_DESDE
TROCAS_GATILHO = (
    (
        _SELECT_DO_LACO,
        _trocar(_SELECT_DO_LACO, "             m.recompensa_tipo\n", "             m.recompensa_tipo,\n             m.classe_id\n"),
    ),
    (
        "          INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)\n"
        "          VALUES (v_aluno_id, v_premio, 'missao:' || v_missao.id::text, 0, now());\n",
        "          -- A turma da missao (20261117_01): sem ela o premio nao chega ao rank.\n"
        "          INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)\n"
        "          VALUES (v_aluno_id, v_missao.classe_id, v_premio, 'missao:' || v_missao.id::text, 0, now());\n",
    ),
)


def gatilho_de_eventos_do_git() -> str:
    """O gatilho de eventos pela cadeia do git: o texto da `20261021_20` com a troca da `20261103_07`.
    A `20261101_08` só mexe no texto da notificação de conquista, longe das âncoras daqui."""
    return _trocar(M20.gatilho(), M07._ANCORA_LACO, M07._LACO_DESDE)


def _trocas_no_banco(funcao: str, assinatura: str, trocas, aplicar: bool) -> str:
    """Troca cada `antes` por `depois` no corpo vivo da função, tudo num EXECUTE só. Idempotente pela
    marca (presente em algum `depois`); recusa se uma âncora sumir ou se repetir."""
    pares = [(a, d) if aplicar else (d, a) for a, d in trocas]
    if not aplicar:
        pares.reverse()
    ja_feito = "> 0" if aplicar else "= 0"
    passos = "".join(
        f"""
  IF (length(v_def) - length(replace(v_def, $a${origem}$a$, ''))) / length($a${origem}$a$) <> 1 THEN
    RAISE EXCEPTION 'ancora {n} ausente ou repetida em {funcao}';
  END IF;
  v_def := replace(v_def, $a${origem}$a$, $r${destino}$r$);
"""
        for n, (origem, destino) in enumerate(pares, start=1)
    )
    return f"""
DO $migracao$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef('public.{funcao}({assinatura})'::regprocedure) INTO v_def;
  IF position($m${MARCA}$m$ IN v_def) {ja_feito} THEN
    RETURN;
  END IF;
{passos}
  EXECUTE v_def;
END;
$migracao$;
"""


def resolvedor(aplicar: bool = True) -> str:
    return _trocas_no_banco("fn_eventos_aluno_resolve_classe_id", "text, text", TROCAS_RESOLVEDOR, aplicar)


def gatilho(aplicar: bool = True) -> str:
    return _trocas_no_banco("trg_eventos_aluno_after_iud", "", TROCAS_GATILHO, aplicar)


# ------------------------------------------------------- item, minutos e guilda (texto da cadeia)
_SELECT_ANTES = "      SELECT m.id, m.criterio, m.recompensa_tipo\n"
_SELECT_DEPOIS = "      SELECT m.id, m.criterio, m.recompensa_tipo, m.classe_id\n"
_PREMIO_ALUNO_ANTES = (
    "          INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)\n"
    "          VALUES (v_aluno_id, v_missao.recompensa_tipo, 'missao:' || v_missao.id::text, 0, now());\n"
)
_PREMIO_ALUNO_DEPOIS = (
    "          -- A turma da missao (20261117_01): sem ela o premio nao chega ao rank.\n"
    "          INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)\n"
    "          VALUES (v_aluno_id, v_missao.classe_id, v_missao.recompensa_tipo, 'missao:' || v_missao.id::text, 0, now());\n"
)
_PREMIO_GUILDA_ANTES = (
    "        INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)\n"
    "        VALUES (v_membro.aluno_id, v_m.recompensa_tipo, 'missao:' || p_missao::text, 0, now());\n"
)
_PREMIO_GUILDA_DEPOIS = (
    "        -- A turma da missao (20261117_01): sem ela o premio nao chega ao rank.\n"
    "        INSERT INTO public.eventos_aluno (aluno_id, classe_id, tipo, referencia, valor, criado_em)\n"
    "        VALUES (v_membro.aluno_id, v_m.classe_id, v_m.recompensa_tipo, 'missao:' || p_missao::text, 0, now());\n"
)


def _com_turma_no_laco(corpo: str) -> str:
    return _trocar(_trocar(corpo, _SELECT_ANTES, _SELECT_DEPOIS), _PREMIO_ALUNO_ANTES, _PREMIO_ALUNO_DEPOIS)


# Calculados na importação: âncora que sumir derruba a migration antes de ela tocar no banco.
ITEM = _com_turma_no_laco(M05.GATILHO_ITEM)
MINUTOS = _com_turma_no_laco(M20.MINUTOS)
GUILDA = _trocar(M13.avaliar_novo(), _PREMIO_GUILDA_ANTES, _PREMIO_GUILDA_DEPOIS)
for _antes, _ in TROCAS_GATILHO:
    _trocar(gatilho_de_eventos_do_git(), _antes, _antes)
for _antes, _ in TROCAS_RESOLVEDOR:
    _trocar(resolvedor_do_git(), _antes, _antes)


# ---------------------------------------------------------------------- só o banco grava prêmio
TIPOS_DE_PREMIO = ("missao_concluida", "missao_diaria_concluida", "desafio_logica", "desafio_cruzadinha")

RECUSA = (
    r"""
CREATE OR REPLACE FUNCTION public.fn_eventos_aluno_premio_so_do_banco()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY INVOKER
 SET search_path = ''
AS $function$
BEGIN
  -- `current_user`, nao as claims: os quatro gravadores de premio sao SECURITY DEFINER, e dentro
  -- deles as claims continuam `authenticated`; o que muda e' o `current_user` (padrao de 20261102_04).
  -- O sinal fica para quem precisar dele, e quem o ligar o devolve a vazio logo depois do INSERT,
  -- tambem no EXCEPTION: `set_config(..., true)` vale ate o fim da transacao.
  IF current_user NOT IN ('authenticated', 'anon')
     OR COALESCE(current_setting('app.missao_premiando', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- So' a lista fixa. Um ramo por `missoes.recompensa_tipo` recusaria estudo se uma missao usasse
  -- um tipo de estudo como recompensa; quem fecha a lista e' a guarda de `missoes`.
  IF NEW.tipo IN ("""
    + ", ".join(f"'{t}'" for t in TIPOS_DE_PREMIO)
    + r""") THEN
    RAISE EXCEPTION USING
      MESSAGE = 'eventos_aluno: ' || NEW.tipo || ' e premio de missao; so o banco o grava',
      ERRCODE = '42501',
      HINT = 'O premio sai quando a missao fecha, pelo proprio banco.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_eventos_aluno_premio_so_do_banco ON public.eventos_aluno;
CREATE TRIGGER trg_eventos_aluno_premio_so_do_banco
  BEFORE INSERT ON public.eventos_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_eventos_aluno_premio_so_do_banco();
"""
)

SEM_RECUSA = (
    "DROP TRIGGER IF EXISTS trg_eventos_aluno_premio_so_do_banco ON public.eventos_aluno;\n"
    "DROP FUNCTION IF EXISTS public.fn_eventos_aluno_premio_so_do_banco();\n"
)


def upgrade() -> None:
    op.execute(resolvedor())
    op.execute(gatilho())
    op.execute(ITEM)
    op.execute(MINUTOS)
    op.execute(GUILDA)
    op.execute(RECUSA)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(SEM_RECUSA)
    op.execute(M13.avaliar_novo())
    op.execute(M20.MINUTOS)
    op.execute(M05.GATILHO_ITEM)
    op.execute(gatilho(aplicar=False))
    op.execute(resolvedor(aplicar=False))
    op.execute("NOTIFY pgrst, 'reload schema'")
