"""Missão diária: coorte só de perfil representativo, e `minutos_no_dia` reavaliada pelo tempo de uso

Duas correções achadas ao investigar o primeiro dia da diária em produção (20/10): o cron das 0h
gerou 29 missões e `missao_aluno` ficou com 0 linhas. As 0 linhas são esperadas (ninguém usou o
app no dia, e `missao_aluno` só nasce na conclusão), mas a investigação mostrou dois defeitos.

## 1. Missão é do PERFIL DA MISSÃO do aluno — um só, o mesmo que a tela mostra

`fn_missao_diaria_gerar` (`20261021_05`) montava as coortes com **todo** perfil presente em
`aluno_perfil`, com qualquer afinidade, e o laço de missão do gatilho (`20261021_04`) avaliava
**todos** os perfis representativos do aluno, enquanto o app mostra só um. Em produção, 9 das 29
missões de 20/10 (daredevil, socializer e survivor da turma 56) eram de perfis que ninguém podia
cumprir, e o aluno com dois perfis representativos podia concluir (e receber) missão que não via.

Decisão de produto (20/10): **o banco avalia só as missões do perfil ativo**. O perfil ativo já
está no banco — `alunos.perfil_ativo` (CHECK nos 7 nomes BrainHex, minúsculos), gravado pelo app
em `selecionarPerfilAtivo` e no cadastro. Mas o valor salvo pode ter ficado velho (a afinidade
muda depois), então a regra é a de `perfilDaMissao` no app, determinística e sem estado do app:

    representativos = afinidade >= 20  OU  (afinidade > 0 E está entre os 2 primeiros)
                      ordem: afinidade DESC, nome ASC
    perfil da missão = alunos.perfil_ativo, se for representativo;
                       senão o 1º representativo; senão NULL

`fn_perfil_da_missao(aluno)` é essa regra, num lugar só, e quem a usa:

- o **gerador**: coorte = (turma x perfil da missão de algum aluno dela). Sem missão de perfil que
  ninguém cumpre. `fn_missao_diaria_enfileirar_texto` enumera as coortes a partir das missões do
  dia, então também passa a enfileirar só essas, sem tocar nele;
- o laço de missão **individual** de `trg_eventos_aluno_after_iud`: troca o CTE `representativos`
  por `lower(m.perfil_alvo) = v_perfil_missao`. O laço de conquista (que segue sendo por todos os
  representativos) e o de guilda não mudam — o teste desfaz as trocas e compara byte a byte com o
  corpo de `20261021_15` (md5 conferido contra a produção);
- o gatilho novo de minutos (abaixo).

Missão sem `perfil_alvo` (a do professor) continua valendo para qualquer perfil.

> Limite conhecido: o gerador roda às 0h. O aluno que troca de perfil ativo durante o dia passa a
> ver (e cumprir) as missões da coorte nova só se alguém da turma já tinha esse perfil da missão;
> senão a lista do dia fica com as do professor até o próximo cron.

## 2. `minutos_no_dia` só era reavaliada quando entrava um evento

O avaliador de missão roda em `trg_eventos_aluno_after_iud`, que só dispara em `eventos_aluno`.
O tempo de estudo é gravado em `aluno_atividade_diaria.tempo_uso_seg` (por
`notificacoes_heartbeat`), que não tinha gatilho nenhum. Resultado: o aluno que estudava os 10
minutos sem gerar evento depois nunca concluía "Dez minutos hoje".

Gatilho novo `trg_aluno_atividade_diaria_missao_minutos`:

- `AFTER UPDATE OF tempo_uso_seg` **e** `AFTER INSERT`. O INSERT entra porque o heartbeat é um
  upsert: no primeiro batimento do dia, se o cron de notificações ainda não criou a linha, o
  tempo chega por INSERT (até 3600 s numa batida). `WHEN` corta o que não importa: só tempo > 0,
  e no UPDATE só quando o valor de fato mudou.
- Roda **só** o laço de missão, só para `minutos_no_dia`. Não recalcula agregados nem reavalia
  conquistas: `minutos_no_dia` lê `aluno_atividade_diaria` direto em `fn_avaliar_metrica`, que
  ignora os agregados nesse ramo — por isso recebe `'{}'`.
- Mesmo filtro do laço individual do gatilho de eventos (ativa, aprovação, janela, turma do aluno,
  perfil da missão, não concluída), com `escopo <> 'guilda'`. A missão de guilda de minutos
  é reavaliada por `fn_missao_guilda_avaliar` (`20261021_15`), que já tem trava e pagamento único.
- **Idempotente e paga uma vez:** a conclusão é `ON CONFLICT ... DO UPDATE ... WHERE status <>
  'concluida'` e o prêmio só sai se a linha de fato mudou (`ROW_COUNT`). Duas batidas seguidas,
  ou uma batida e um evento ao mesmo tempo, não pagam duas vezes.
- O prêmio é o mesmo da missão individual (`eventos_aluno` com `tipo = recompensa_tipo`,
  `referencia = 'missao:<id>'`) sob o sinal `app.missao_premiando`, que faz o gatilho de eventos
  voltar cedo e é devolvido a vazio depois.
- `BEGIN ... EXCEPTION WHEN OTHERS` avisa e segue: falha de missão não pode derrubar o heartbeat.

Nenhuma tabela, coluna ou policy nova. `SECURITY DEFINER`, `search_path` fixo e `REVOKE` da
função do gatilho, como as irmãs.

Revision ID: 20261021_20
Revises: 20261021_19
Create Date: 2026-10-20
"""

import importlib.util
from pathlib import Path

from alembic import op

revision = "20261021_20"
down_revision = "20261021_19"
branch_labels = None
depends_on = None


def _modulo(arquivo: str):
    caminho = Path(__file__).with_name(arquivo)
    spec = importlib.util.spec_from_file_location(f"trailup_{caminho.stem}", caminho)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"não achei {arquivo}")
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


def gerador_anterior() -> str:
    """O gerador como `20261021_05` o deixou — é o que está em produção (md5 conferido)."""
    return _modulo("20261021_05_missao_diaria_deterministica.py").GERADOR


def gatilho_anterior() -> str:
    """O gatilho de eventos como `20261021_15` o deixou — é o que está em produção (md5 conferido)."""
    return _modulo("20261021_15_missao_de_guilda_soma_os_membros.py").gatilho()


def _trocar(texto: str, antes: str, depois: str) -> str:
    if texto.count(antes) != 1:
        raise RuntimeError(f"âncora ausente ou repetida: {antes[:60]!r}")
    return texto.replace(antes, depois)


PERFIL_DA_MISSAO = r"""
CREATE OR REPLACE FUNCTION public.fn_perfil_da_missao(p_aluno uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  -- A regra de `perfilDaMissao` (mobile/src/services/missoes/missaoModel.ts), sem estado do app:
  -- o `perfil_ativo` salvo, se ainda for representativo; senao o 1o representativo; senao NULL.
  -- Representativo e' o mesmo criterio do laco de conquista de `trg_eventos_aluno_after_iud`.
  WITH representativos AS (
    SELECT rep.nome, rep.pos
      FROM (
        SELECT lower(p.nome) AS nome,
               COALESCE(ap.afinidade, 0) AS af,
               row_number() OVER (
                 ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC
               ) AS pos
          FROM public.aluno_perfil ap
          JOIN public.perfil p ON p.id = ap.perfil_id
         WHERE ap.aluno_id = p_aluno
      ) rep
     WHERE rep.af >= 20
        OR (rep.af > 0 AND rep.pos <= 2)
  )
  SELECT COALESCE(
    (SELECT r.nome
       FROM representativos r
       JOIN public.alunos a ON a.id = p_aluno
      WHERE r.nome = lower(btrim(a.perfil_ativo))),
    (SELECT r.nome FROM representativos r ORDER BY r.pos LIMIT 1)
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_perfil_da_missao(uuid) FROM PUBLIC, anon, authenticated;
"""


_COORTE_ANTES = """  FOR v_coorte IN
    SELECT ca.classe_id, lower(p.nome) AS perfil
      FROM public.classe_aluno ca
      JOIN public.aluno_perfil ap ON ap.aluno_id = ca.aluno_id
      JOIN public.perfil p ON p.id = ap.perfil_id
     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
     GROUP BY ca.classe_id, lower(p.nome)
  LOOP
"""

_COORTE_DEPOIS = """  -- Coorte = (turma x perfil da missao de algum aluno dela) (20261021_20). O gatilho so'
  -- avalia a missao do perfil da missao do aluno; perfil que nao e' o de ninguem na turma
  -- geraria missao que ninguem cumpre.
  FOR v_coorte IN
    SELECT ca.classe_id, pm.perfil
      FROM public.classe_aluno ca
      CROSS JOIN LATERAL (SELECT public.fn_perfil_da_missao(ca.aluno_id) AS perfil) pm
     WHERE ca.classe_id IS NOT NULL AND ca.aluno_id IS NOT NULL
       AND pm.perfil IS NOT NULL
     GROUP BY ca.classe_id, pm.perfil
  LOOP
"""


def gerador() -> str:
    return _trocar(gerador_anterior(), _COORTE_ANTES, _COORTE_DEPOIS)


_G_DECLARE_ANTES = "  v_premio          text;\n"
_G_DECLARE_DEPOIS = "  v_premio          text;\n  v_perfil_missao   text;\n"

_G_LACO_ANTES = """  BEGIN
    FOR v_missao IN
      WITH representativos AS (
        SELECT rep.nome
          FROM (
            SELECT lower(p.nome) AS nome,
                   COALESCE(ap.afinidade, 0) AS af,
                   row_number() OVER (
                     ORDER BY COALESCE(ap.afinidade, 0) DESC, p.nome ASC
                   ) AS pos
              FROM public.aluno_perfil ap
              JOIN public.perfil p ON p.id = ap.perfil_id
             WHERE ap.aluno_id = v_aluno_id
          ) rep
         WHERE rep.af >= 20
            OR (rep.af > 0 AND rep.pos <= 2)
      )
      SELECT m.id, m.criterio, m.recompensa_tipo
"""
_G_LACO_DEPOIS = """  BEGIN
    -- So' a coorte do perfil da missao do aluno, o mesmo que a tela mostra (20261021_20).
    v_perfil_missao := public.fn_perfil_da_missao(v_aluno_id);

    FOR v_missao IN
      SELECT m.id, m.criterio, m.recompensa_tipo
"""

_G_PERFIL_ANTES = """         AND (m.perfil_alvo IS NULL
              OR lower(m.perfil_alvo) IN (SELECT nome FROM representativos))
"""
_G_PERFIL_DEPOIS = """         AND (m.perfil_alvo IS NULL
              OR lower(m.perfil_alvo) = v_perfil_missao)
"""


def gatilho() -> str:
    g = gatilho_anterior()
    g = _trocar(g, _G_DECLARE_ANTES, _G_DECLARE_DEPOIS)
    g = _trocar(g, _G_LACO_ANTES, _G_LACO_DEPOIS)
    g = _trocar(g, _G_PERFIL_ANTES, _G_PERFIL_DEPOIS)
    return g


MINUTOS = r"""
CREATE OR REPLACE FUNCTION public.trg_aluno_atividade_diaria_missao_minutos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_aluno_id       uuid := NEW.aluno_id;
  v_missao         record;
  v_missao_guilda  record;
  v_mudou          integer;
  v_perfil_missao  text;
BEGIN
  IF v_aluno_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Mesmo sinal do gatilho de eventos: se estamos dentro de um premio de missao, nao reentra.
  IF COALESCE(current_setting('app.missao_premiando', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  -- So' o laco de missao, e so' `minutos_no_dia` (20261021_20). Sem agregados: nesse ramo
  -- `fn_avaliar_metrica` le `aluno_atividade_diaria` direto. Falha aqui nao derruba o heartbeat.
  BEGIN
    v_perfil_missao := public.fn_perfil_da_missao(v_aluno_id);

    FOR v_missao IN
      SELECT m.id, m.criterio, m.recompensa_tipo
        FROM public.missoes m
       WHERE m.ativa
         AND m.escopo <> 'guilda'
         AND m.criterio ->> 'metrica' = 'minutos_no_dia'
         AND m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])
         AND (m.janela_inicio IS NULL OR m.janela_inicio <= now())
         AND (m.janela_fim    IS NULL OR m.janela_fim    >= now())
         AND m.classe_id IN (
               SELECT ca.classe_id FROM public.classe_aluno ca WHERE ca.aluno_id = v_aluno_id
             )
         AND (m.perfil_alvo IS NULL
              OR lower(m.perfil_alvo) = v_perfil_missao)
         AND NOT EXISTS (
               SELECT 1 FROM public.missao_aluno ma
                WHERE ma.aluno_id = v_aluno_id AND ma.missao_id = m.id AND ma.status = 'concluida'
             )
    LOOP
      IF public.fn_avaliar_metrica(v_aluno_id, '{}'::jsonb, v_missao.criterio) THEN
        -- Paga uma vez: so' quando a linha de fato virou concluida agora.
        INSERT INTO public.missao_aluno (aluno_id, missao_id, status, progresso, concluida_em)
        VALUES (v_aluno_id, v_missao.id, 'concluida', 100, now())
        ON CONFLICT (aluno_id, missao_id) DO UPDATE
          SET status = 'concluida', progresso = 100, concluida_em = now(), updated_at = now()
          WHERE public.missao_aluno.status <> 'concluida';
        GET DIAGNOSTICS v_mudou = ROW_COUNT;

        IF v_mudou > 0 AND v_missao.recompensa_tipo IS NOT NULL THEN
          PERFORM set_config('app.missao_premiando', 'on', true);
          INSERT INTO public.eventos_aluno (aluno_id, tipo, referencia, valor, criado_em)
          VALUES (v_aluno_id, v_missao.recompensa_tipo, 'missao:' || v_missao.id::text, 0, now());
          PERFORM set_config('app.missao_premiando', '', true);
        END IF;
      END IF;
    END LOOP;

    -- Missao de guilda de minutos: a soma e o pagamento unico sao de `fn_missao_guilda_avaliar`.
    FOR v_missao_guilda IN
      SELECT m.id AS missao_id, gm.guilda_id
        FROM public.guilda_membros gm
        JOIN public.guildas g ON g.id = gm.guilda_id AND g.ativa IS NOT FALSE
        JOIN public.missoes m ON m.classe_id = gm.classe_id
       WHERE gm.aluno_id = v_aluno_id
         AND gm.left_at IS NULL
         AND m.escopo = 'guilda'
         AND m.criterio ->> 'metrica' = 'minutos_no_dia'
         AND m.ativa
         AND m.aprovacao = ANY (ARRAY['nao_requer'::text, 'aprovada'::text])
         AND (m.janela_inicio IS NULL OR m.janela_inicio <= now())
         AND (m.janela_fim    IS NULL OR m.janela_fim    >= now())
    LOOP
      PERFORM public.fn_missao_guilda_avaliar(v_missao_guilda.missao_id, v_missao_guilda.guilda_id);
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.missao_premiando', '', true);
    RAISE WARNING 'avaliacao de missao de minutos do aluno % falhou: %', v_aluno_id, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.trg_aluno_atividade_diaria_missao_minutos() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_aluno_atividade_diaria_missao_minutos_upd ON public.aluno_atividade_diaria;
CREATE TRIGGER trg_aluno_atividade_diaria_missao_minutos_upd
  AFTER UPDATE OF tempo_uso_seg ON public.aluno_atividade_diaria
  FOR EACH ROW
  WHEN (NEW.tempo_uso_seg IS DISTINCT FROM OLD.tempo_uso_seg AND COALESCE(NEW.tempo_uso_seg, 0) > 0)
  EXECUTE FUNCTION public.trg_aluno_atividade_diaria_missao_minutos();

DROP TRIGGER IF EXISTS trg_aluno_atividade_diaria_missao_minutos_ins ON public.aluno_atividade_diaria;
CREATE TRIGGER trg_aluno_atividade_diaria_missao_minutos_ins
  AFTER INSERT ON public.aluno_atividade_diaria
  FOR EACH ROW
  WHEN (COALESCE(NEW.tempo_uso_seg, 0) > 0)
  EXECUTE FUNCTION public.trg_aluno_atividade_diaria_missao_minutos();
"""

SEM_MINUTOS = """
DROP TRIGGER IF EXISTS trg_aluno_atividade_diaria_missao_minutos_ins ON public.aluno_atividade_diaria;
DROP TRIGGER IF EXISTS trg_aluno_atividade_diaria_missao_minutos_upd ON public.aluno_atividade_diaria;
DROP FUNCTION IF EXISTS public.trg_aluno_atividade_diaria_missao_minutos();
"""


def upgrade() -> None:
    op.execute(PERFIL_DA_MISSAO)
    op.execute(gerador())
    op.execute(gatilho())
    op.execute(MINUTOS)
    op.execute("NOTIFY pgrst, 'reload schema'")


def downgrade() -> None:
    op.execute(SEM_MINUTOS)
    op.execute(gatilho_anterior())
    op.execute(gerador_anterior())
    op.execute("DROP FUNCTION IF EXISTS public.fn_perfil_da_missao(uuid)")
    op.execute("NOTIFY pgrst, 'reload schema'")
