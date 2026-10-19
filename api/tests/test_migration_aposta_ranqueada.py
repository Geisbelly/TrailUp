from io import StringIO

from app.db import migrations
from tests.test_migrations import _offline_alembic_config


def _upgrade_sql() -> str:
    output = StringIO()
    migrations.command.upgrade(_offline_alembic_config(output), "20261021_05:20261021_06", sql=True)
    # O renderizador offline do Alembic DOBRA `%`, e esta migration tem `%ROWTYPE` em duas
    # funções. O teste compara com o SQL que vai rodar, não com o renderizado.
    return output.getvalue().replace("%%", "%")


def _downgrade_sql() -> str:
    output = StringIO()
    migrations.command.downgrade(_offline_alembic_config(output), "20261021_06:20261021_05", sql=True)
    return output.getvalue().replace("%%", "%")


def _sem_comentarios(sql: str) -> str:
    """Esta migration descreve nos comentários justamente o que ela remove do código
    (`GREATEST`, `[^0-9]`, `> 0`), então asserção de ausência tem de olhar só o código."""
    return "\n".join(linha.split("--")[0] for linha in sql.splitlines())


# --------------------------------------------------------------------------------------
# Tabela de preços
# --------------------------------------------------------------------------------------
def test_o_check_de_pontos_nao_e_derrubado_para_abrir_negativo() -> None:
    """`eventos_pontuacao` tem `CHECK (pontos >= 0)` — o spec não viu e planejou inserir uma
    linha negativa direto. Derrubar o CHECK deixaria um erro de digitação numa linha de preço
    virar pontuação negativa para todo mundo; a coluna `penalidade` marca quem pode."""
    sql = _upgrade_sql()

    assert "ADD COLUMN IF NOT EXISTS penalidade boolean NOT NULL DEFAULT false" in sql
    assert "CHECK (pontos >= 0 OR penalidade)" in sql
    # O da moeda fica intacto: perder pontuação é uma coisa, confiscar carteira é outra.
    assert "eventos_pontuacao_moedas_check" not in sql


def test_a_derrota_nao_tira_moeda() -> None:
    """`fn_eventos_aluno_paga_moeda` só grava com `v_moedas > 0`, então moedas 0 na linha da
    derrota é o que impede o ledger de andar para trás."""
    sql = _upgrade_sql()

    assert "('desafio_derrota', -6, 0," in sql


def test_o_piso_nasce_privado() -> None:
    sql = _upgrade_sql()

    bloco = sql[sql.index("INSERT INTO public.app_config") :]
    bloco = bloco[: bloco.index("ON CONFLICT")]
    assert "'ranqueada_piso_pontos'" in bloco
    assert "true)" not in bloco, "o piso é teto anti-abuso ao contrário: não é público"


# --------------------------------------------------------------------------------------
# Leitores de configuração
# --------------------------------------------------------------------------------------
def test_o_leitor_numerico_preserva_ponto_e_sinal() -> None:
    """O idioma das outras chaves é `[^0-9]`, que apaga o ponto E o sinal: '2.0' viraria 20 e
    '-50' viraria 50. `app_prazo_atraso_fator` já avisava do ponto; aqui o sinal também
    importa, porque o piso pode ser negativo."""
    sql = _upgrade_sql()
    corpo = sql[sql.index("fn_app_config_num") : sql.index("app_ranqueada_piso_pontos")]

    assert "[^0-9.-]" in corpo
    assert "[^0-9]" not in _sem_comentarios(corpo)
    # Linha malformada cai no padrão em vez de levantar no meio do fluxo do aluno.
    assert "EXCEPTION WHEN others THEN" in corpo


def test_dificuldade_desconhecida_vale_um() -> None:
    """Um valor novo na coluna `dificuldade` não pode mudar a pontuação de ninguém antes de
    ter preset próprio em `app_config`."""
    sql = _upgrade_sql()
    corpo = sql[sql.index("app_desafio_aposta_fator") : sql.index("fn_fator_de_aposta")]

    assert "'dificil'" in corpo and "'normal'" in corpo
    assert "ELSE 1" in corpo


def test_o_fator_de_aposta_nao_faz_cast_para_uuid() -> None:
    """O recorte da referência é um `substring` por regexp: 36 caracteres do alfabeto do uuid
    podem não formar um uuid válido, e o cast levantaria dentro do gatilho de pontuação."""
    sql = _upgrade_sql()
    corpo = sql[sql.index("fn_fator_de_aposta") : sql.index("trg_eventos_aluno_valor_do_banco")]

    assert "d.id::text = v_id" in corpo
    assert "::uuid" not in _sem_comentarios(corpo)
    # Referência que não é de desafio nem chega a consultar a tabela.
    assert "IF v_id IS NULL THEN" in corpo


# --------------------------------------------------------------------------------------
# O gatilho: aposta e piso
# --------------------------------------------------------------------------------------
def test_a_aposta_alcanca_o_negativo() -> None:
    """A guarda do atraso é `> 0`. Copiá-la aqui faria a dificuldade dobrar o prêmio e deixar
    o risco igual — o oposto de "aposta maior"."""
    sql = _upgrade_sql()

    assert "IF COALESCE(NEW.valor, 0) <> 0 THEN" in sql
    assert "NEW.valor := ROUND(NEW.valor * public.fn_fator_de_aposta(NEW.referencia));" in sql


def test_a_aposta_vem_antes_do_atraso() -> None:
    """Os dois são multiplicativos, mas o atraso só roda para positivo: se a aposta viesse
    depois dele, a derrota passaria por fora do fator de dificuldade."""
    sql = _upgrade_sql()

    assert sql.index("fn_fator_de_aposta(NEW.referencia)") < sql.index("fn_fator_de_atraso(")


def test_o_piso_exclui_a_propria_linha_da_soma() -> None:
    """O gatilho também roda em UPDATE, e ali a própria linha JÁ está na tabela com o valor
    antigo — sem excluir-se, um UPDATE veria o próprio desconto como já acumulado."""
    sql = _upgrade_sql()

    assert "AND e.id <> NEW.id" in sql
    assert "app_ranqueada_piso_pontos()" in sql


def test_classe_nula_zera_a_penalidade_por_if_explicito() -> None:
    """Não depender de `e.classe_id = NULL` nunca ser verdade: o resultado certo pelo
    caminho errado é o que o CLAUDE.md chama de lógica de três valores dormindo."""
    sql = _upgrade_sql()
    corpo = sql[sql.index("IF COALESCE(NEW.valor, 0) < 0 THEN") :]

    assert "IF NEW.classe_id IS NULL THEN" in corpo
    assert corpo.index("IF NEW.classe_id IS NULL THEN") < corpo.index("SELECT COALESCE(sum(e.valor)")


def test_o_piso_nunca_vira_premio() -> None:
    """Aluno abaixo do piso (possível se a chave for editada para cima) receberia um valor
    POSITIVO sem ter ganhado nada."""
    sql = _upgrade_sql()

    assert "NEW.valor := LEAST(0, GREATEST(NEW.valor, v_piso - v_acumulado));" in sql


def test_o_gatilho_conserva_as_guardas_que_ja_existiam() -> None:
    """A migration substitui a função inteira; o congelamento de UPDATE e a dedup de
    conclusão têm de continuar lá."""
    sql = _upgrade_sql()

    for guarda in (
        "NEW.tipo := OLD.tipo;",
        "NEW.concedido_por := OLD.concedido_por;",
        "NEW.aluno_id := OLD.aluno_id;",
        "NEW.classe_id := OLD.classe_id;",
        "IF public.fn_evento_creditado(NEW.tipo) THEN",
        "IF public.fn_evento_de_conclusao(NEW.tipo) THEN",
    ):
        assert guarda in sql, f"{guarda} saiu do gatilho"


# --------------------------------------------------------------------------------------
# A arena
# --------------------------------------------------------------------------------------
def test_treino_nao_escreve_nada() -> None:
    """Não pontua, não move rank, não paga moeda — mas o desafio continua sendo encerrado e
    devolvendo o placar, senão treinar deixaria de mostrar como foi."""
    sql = _upgrade_sql()

    assert "IF v_d.consequencia <> 'treino' THEN" in sql
    assert "v_pagos := 0;" in sql
    assert "SET status = 'encerrado'" in sql


def test_a_derrota_e_so_de_quem_perdeu_de_alguem_em_ranqueada() -> None:
    """`sem_adversario` não é derrota, e `empate` sai no ramo de cima. O ramo da derrota
    precisa vir DEPOIS do ramo do vencedor, senão o vencedor cairia nele."""
    sql = _upgrade_sql()
    corpo = sql[sql.index("ARRAY['desafio_participou']") :]

    i_empate = corpo.index("ARRAY['desafio_empate']")
    i_vencido = corpo.index("ARRAY['desafio_vencido']")
    i_derrota = corpo.index("ARRAY['desafio_derrota']")
    assert i_empate < i_vencido < i_derrota

    ramo = corpo[i_vencido:i_derrota]
    assert "v_d.consequencia = 'ranqueada'" in ramo


def test_a_arena_devolve_os_eixos_ao_cliente() -> None:
    """A fase 7 desenha a tela com eles; sem isso o cliente não sabe se o desafio valeu."""
    sql = _upgrade_sql()

    assert sql.count("'consequencia', v_d.consequencia") == 2, "no atalho de já-encerrado também"
    assert sql.count("'dificuldade', v_d.dificuldade") == 2


# --------------------------------------------------------------------------------------
# A divergência que esta fase existe para resolver
# --------------------------------------------------------------------------------------
def test_a_soma_e_a_mesma_nos_dois_lugares() -> None:
    """Era `sum(GREATEST(valor,0))` na apuração do evento e `sum(valor)` no rank. Com aposta,
    a derrota derrubaria o rank sem mexer na apuração."""
    sql = _sem_comentarios(_upgrade_sql())

    assert "COALESCE(SUM(ea.valor), 0) AS pontos" in sql
    assert "GREATEST(ea.valor, 0)" not in sql
    # O rank já somava bruto e continua.
    assert "sum(e.valor) AS pontuacao" in sql


def test_o_destino_da_soma_aceita_o_que_a_soma_produz() -> None:
    """Tirar o `GREATEST` não bastava: as duas tabelas de resultado têm `CHECK (pontos >= 0)`
    na coluna de destino, e a primeira apuração com uma derrota abortava inteira com 23514 —
    evento não fecha, ninguém recebe medalha. Pego rodando, não lendo."""
    sql = _upgrade_sql()

    assert "DROP CONSTRAINT IF EXISTS eventos_classe_resultado_pontos_check" in sql
    assert "DROP CONSTRAINT IF EXISTS eventos_classe_resultado_guilda_pontos_check" in sql
    # Os outros CHECKs ficam: `posicao` da guilda já nasce NULL quando pontos não é positivo.
    assert "membros_check" not in sql
    assert "posicao_check" not in sql


def test_o_check_sai_antes_da_funcao_que_grava_negativo() -> None:
    sql = _upgrade_sql()

    assert sql.index("DROP CONSTRAINT IF EXISTS eventos_classe_resultado_pontos_check") < sql.index(
        "COALESCE(SUM(ea.valor), 0) AS pontos"
    )


def test_downgrade_sobe_a_linha_negativa_antes_de_recriar_o_check() -> None:
    """Linha negativa gravada enquanto a fase 4 estava de pé impediria o CHECK de validar, e o
    downgrade travaria."""
    sql = _downgrade_sql()

    i_update = sql.index("UPDATE public.eventos_classe_resultado SET pontos = 0 WHERE pontos < 0")
    i_check = sql.index("ADD CONSTRAINT eventos_classe_resultado_pontos_check")
    assert i_update < i_check
    # E a função que volta a somar só positivo vem antes de tudo isso.
    assert sql.index("SUM(GREATEST(ea.valor, 0))") < i_update


def test_participar_e_destaque_nao_mudam_de_sentido() -> None:
    """Jogar conta como participar mesmo perdendo; quem fechou no negativo não é destaque."""
    sql = _upgrade_sql()

    assert "COUNT(ea.id) > 0 AS participou" in sql
    assert "t.participou AND t.pontos > 0 AND t.posicao <= 3" in sql


# --------------------------------------------------------------------------------------
# A view do rank
# --------------------------------------------------------------------------------------
def test_o_case_da_view_conhece_todo_criterio_que_tem_linha_ou_botao() -> None:
    """`ELSE 0` não é erro: critério fora do CASE ranqueia a turma inteira em zero, em
    silêncio. `acertos` é oferecido pelo console desde sempre e nunca esteve no CASE."""
    sql = _upgrade_sql()
    corpo = sql[sql.index("CASE rt.criterio") : sql.index("ELSE 0::numeric")]

    for criterio in ("percentual", "pontuacao", "tempo", "acertos", "ranqueada"):
        assert f"WHEN '{criterio}'::text THEN" in corpo, f"{criterio} ranquearia todo mundo em zero"


def test_acertos_sai_da_coluna_que_ja_existe() -> None:
    sql = _upgrade_sql()

    assert 'COALESCE(ca."acertosPercentual", 0::numeric)' in sql


def test_o_criterio_ranqueada_conta_so_desafio_ranqueado() -> None:
    sql = _upgrade_sql()
    corpo = sql[sql.index("eventos_ranqueada AS (") : sql.index(", base AS (")]

    assert "d.consequencia = 'ranqueada'::text" in corpo
    assert "e.classe_id IS NOT NULL" in corpo
    # Mesmo motivo de `fn_fator_de_aposta`: substring por regexp não garante uuid válido.
    assert "d.id::text =" in corpo
    assert "::uuid" not in _sem_comentarios(corpo)


def test_a_view_nao_ganha_grant_nem_invoker() -> None:
    """O par `vw_rank_posicoes_por_classe{,_todas}` é a exceção deliberada do CLAUDE.md: o que
    a torna segura é o GRANT, não o invoker. `CREATE OR REPLACE VIEW` preserva os dois — mexer
    em qualquer um aqui seria mudança silenciosa de autorização."""
    sql = _upgrade_sql()

    assert "security_invoker" not in sql
    assert "GRANT" not in sql
    assert "DROP VIEW" not in sql, "DROP perderia GRANT e reloptions; REPLACE preserva"


def test_o_tipo_ranqueada_nasce_na_migracao_nao_no_console() -> None:
    """`20260826_09` classificou `rank_tipo` como referência sem dono — "ninguém escreve pelo
    app" — e a medição confirma: INSERT como professor dá 42501."""
    sql = _upgrade_sql()

    assert "INSERT INTO public.rank_tipo" in sql
    assert "WHERE NOT EXISTS (SELECT 1 FROM public.rank_tipo WHERE criterio = 'ranqueada')" in sql


# --------------------------------------------------------------------------------------
# Downgrade
# --------------------------------------------------------------------------------------
def test_downgrade_restaura_as_duas_pontas() -> None:
    sql = _downgrade_sql()

    assert "COALESCE(SUM(GREATEST(ea.valor, 0)), 0) AS pontos" in sql
    assert "CHECK (pontos >= 0)" in sql
    assert "DROP FUNCTION IF EXISTS public.fn_fator_de_aposta(text)" in sql
    assert "DELETE FROM public.eventos_pontuacao WHERE tipo = 'desafio_derrota'" in sql


def test_downgrade_tira_o_tipo_antes_da_view_antiga() -> None:
    """A view antiga não conhece `ranqueada`: deixar o tipo para trás ranquearia em zero quem
    estivesse usando aquele ranking."""
    sql = _downgrade_sql()

    assert sql.index("DELETE FROM public.rank_tipo WHERE criterio = 'ranqueada'") < sql.index(
        "CREATE OR REPLACE VIEW public.vw_rank_posicoes_por_classe_todas"
    )
