"""Rotina de notificação com o tópico do aluno, e uma frase diferente a cada dia

## O defeito

Duas migrações escreviam o texto da revisão diária, e a errada sempre ganhava:

- a `20261102_01` monta o texto com o tópico em andamento e o percentual
  (`notificacoes_texto_revisao`) e o job das 09:00 UTC (`notificacoes_recalcular_rotinas`) o grava em
  `notificacoes_agendamentos`;
- a `20261103_12` pôs um gatilho BEFORE UPDATE OF titulo, corpo na mesma tabela que, achando a linha do
  perfil em `notificacoes_textos_perfil`, troca o que chega pelo texto fixo do perfil.

O job gravava, o gatilho apagava. Medido em produção em 20/11: para a aluna de QA,
`notificacoes_texto_revisao` devolvia "Frações no dia a dia: 82% concluído…" e o agendamento guardava
"Mais uma etapa, Belly / Amina está de olho na sua próxima vitória". Nos 30 dias anteriores, as 150
revisões diárias e as 20 retomadas da caixa de entrada saíram todas com a mesma frase do perfil, todo
dia. A IA (`agente_notificacao`) só entra no grafo com emoção negativa ou inatividade e não escreveu
nenhuma notificação desde 06/11, então a rotina é quase tudo o que o aluno recebe.

## O que muda

**Uma fonte só para o texto da rotina:** `notificacoes_texto_rotina(aluno, tipo, fuso)`. O gatilho do
agendamento, o da fila e `notificacoes_texto_revisao` (que o job continua chamando) passam todos por
ela, então não há mais quem sobrescreva quem.

**O texto fala do que o aluno está estudando.** `notificacoes_foco_do_aluno` acha o tópico em andamento
(a mesma consulta de `notificacoes_texto_revisao`) e o próximo conteúdo não concluído (a mesma de
`ContextRepository.fetch_foco_de_estudo`, que a IA usa). Os marcadores novos são `{topico}`,
`{percentual}` e `{proximo}`, além de `{nome}` e `{guia}` da `20261103_12`. Marcação de cadastro no
começo do nome ("[TESTE] Frações") sai, como em `_nome_limpo` do agente.

**Várias frases por tipo × perfil**, em duas variantes: `com_topico` (o aluno tem tópico em andamento)
e `geral` (não tem, ou nenhuma frase com tópico cabe). Frase com `{proximo}` só concorre quando há
próximo conteúdo; com `{percentual}`, só quando ele passou de 0. Toda combinação tem ao menos uma frase
`com_topico` sem os dois (teste de estrutura).

**A frase muda a cada dia**, sem sorteio: `(dia local - 2026-01-01 + hash do aluno) mod n`. No mesmo
dia, o login, o job e a fila escolhem a mesma frase; no dia seguinte, outra. O hash do aluno espalha a
turma, para que dois colegas não recebam a mesma frase no mesmo dia.

**O texto da fila é recalculado na hora em que entra na fila.** O agendamento é reescrito uma vez por
dia (job das 09:00 UTC); a pendente da revisão sai à noite e a da retomada sai no login. Calculando na
inserção da pendente, a caixa de entrada e o push mostram o progresso daquela hora. A notificação local
do app (rotina diária agendada no aparelho) continua usando o texto do agendamento, que o app lê ao
abrir: ela pode chegar com o percentual de quando o app foi aberto por último.

Qual frase saiu fica em `contexto.texto_rotina` da pendente (`variante`, `ordem`, `topico_id`), para
comparar abertura por frase depois.

**O que não muda:** sugestão da IA (`sugestao_id`) continua valendo no lugar da rotina, como na
`20260826_14`; conquista continua no gatilho da caixa (`notificacoes_caixa_texto`), que segue lendo a
linha `geral` 1; a escolha do perfil continua sendo o perfil da tela (`notificacoes_perfil_do_aluno`).
`notificacoes_texto_revisao` usava o dominante e passa a usar o da tela, como todo o resto do texto.

`notificacoes_modelos_texto` (da `20261102_01`) deixa de ser lida. A tabela fica: remover é outra
decisão.

## Tabela

`notificacoes_textos_perfil` ganha `variante` e `ordem`; a chave vira `(tipo, perfil, variante, ordem)`.
As 28 linhas que existem viram `geral` 1 e não são reescritas: se alguém ajustou um texto por `UPDATE`,
o ajuste fica. Continua sem policy, de propósito (ver `20261103_12`).

## Cuidados do SQL

Nenhum `%` literal (o SQL offline do Alembic o dobra): o resto da divisão é `mod()` e o sinal de
porcentagem é `chr(37)`. Nenhum `:palavra` colado (o `text()` leria como parâmetro): o teste de
estrutura confere `text(sql).compile().params`.

Revision ID: 20261120_02
Revises: 20261120_01
Create Date: 2026-11-20
"""

import importlib.util
import re
from pathlib import Path

from alembic import op

revision = "20261120_02"
down_revision = "20261120_01"
branch_labels = None
depends_on = None

AQUI = Path(__file__).resolve()

PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")
ROTINAS = ("revisao_diaria", "pausa_saudavel", "retomada_login")

# Limite dos nomes que entram no texto: 60 do tópico + 60 do próximo conteúdo + a frase cabem nos 200
# do corpo (teste de estrutura).
LIMITE_NOME = 60

Frase = tuple[str, str]

# Frases novas. A `geral` 1 de cada tipo × perfil é a da `20261103_12` e não entra aqui.
# `{nome}` só como ", {nome}" (sem nome, sai junto com a vírgula; ver `notificacoes_resolver_texto`).
COM_TOPICO: dict[str, dict[str, list[Frase]]] = {
    "revisao_diaria": {
        "seeker": [
            ("Tem descoberta nova, {nome}", "Em {topico}, o próximo trecho é {proximo}. {guia} quer saber o que você vai achar."),
            ("Bora explorar, {nome}?", "Você já explorou {percentual} de {topico}. Tem mais coisa para descobrir por lá."),
            ("Curiosidade do dia, {nome}", "{guia} achou mais coisa para descobrir em {topico}. Bora ver?"),
        ],
        "survivor": [
            ("Um passo de cada vez, {nome}", "Seu próximo passo em {topico} é {proximo}. Vai no seu ritmo."),
            ("Seu plano segue firme, {nome}", "{topico} já está em {percentual}. Um pouquinho hoje mantém tudo em dia."),
            ("Com calma, {nome}", "{guia} guardou o seu lugar em {topico}. Dá para seguir de onde parou, sem pressa."),
        ],
        "daredevil": [
            ("Desafio do dia, {nome}!", "Próxima missão em {topico}: {proximo}. Topa encarar agora?"),
            ("Rodada rápida, {nome}!", "{topico} está em {percentual}. Uma rodada rápida e você sobe mais."),
            ("Bora, {nome}?", "{guia} deixou uma missão pronta em {topico}. Vai encarar?"),
        ],
        "mastermind": [
            ("A próxima peça, {nome}", "Em {topico}, a próxima parte é {proximo}. Ela se liga ao que você já viu."),
            ("Continuando o raciocínio, {nome}", "Você já fez {percentual} de {topico}. Falta encaixar a próxima parte."),
            ("Uma ideia de cada vez, {nome}", "{guia} guardou o seu ponto em {topico}. A próxima parte continua dali."),
        ],
        "conqueror": [
            ("Próxima etapa, {nome}", "Em {topico}, a próxima etapa é {proximo}. {guia} sabe que você vence essa."),
            ("Avance mais uma, {nome}", "{topico} já está em {percentual}. Mais uma etapa e você chega perto de fechar."),
            ("Hora de avançar, {nome}", "{guia} guardou a sua próxima etapa em {topico}. Vai lá vencer mais uma."),
        ],
        "socializer": [
            ("Vem com a turma, {nome}", "A turma segue em {topico}. Seu próximo passo é {proximo}."),
            ("Bora juntos, {nome}?", "Você está em {percentual} de {topico}. {guia} acompanha você no próximo passo."),
            ("Que tal estudar hoje, {nome}?", "{guia} guardou o seu lugar em {topico}. Depois conta para a turma o que achou."),
        ],
        "achiever": [
            ("Sua meta de hoje, {nome}", "Próximo item de {topico}: {proximo}. Feche e veja o progresso subir."),
            ("Mais um item, {nome}", "{topico} está em {percentual}. Mais um item e a barra sobe."),
            ("Lista do dia, {nome}", "{guia} separou o próximo item de {topico}. Bora riscar mais um?"),
        ],
    },
    "retomada_login": {
        "seeker": [
            ("Que bom te ver, {nome}!", "Você parou em {topico}. O próximo trecho é {proximo}."),
            ("De volta à exploração, {nome}", "{topico} já está em {percentual}. Ainda tem coisa para descobrir."),
            ("Olha você aí, {nome}!", "{guia} guardou {topico} do jeito que você deixou. Bora continuar?"),
        ],
        "survivor": [
            ("De volta com calma, {nome}", "Você parou em {topico}. Dá para seguir por {proximo}, no seu ritmo."),
            ("Bom te ver, {nome}", "{topico} está em {percentual}. Nada se perdeu, siga de onde parou."),
            ("Tudo no lugar, {nome}", "{guia} guardou {topico} para você. Um passo de cada vez."),
        ],
        "daredevil": [
            ("De volta ao jogo, {nome}!", "Próxima missão em {topico}: {proximo}. Bora?"),
            ("Voltou com tudo, {nome}!", "{topico} está em {percentual}. Vamos subir isso agora?"),
            ("Missão aberta, {nome}!", "{guia} deixou {topico} pronto para a próxima rodada."),
        ],
        "mastermind": [
            ("Retomando, {nome}", "Você parou em {topico}. A próxima parte é {proximo}."),
            ("De onde você parou, {nome}", "{topico} está em {percentual}. A próxima parte continua o que você já viu."),
            ("Pronto para continuar, {nome}?", "{guia} guardou o seu ponto em {topico}. Dá para retomar dali."),
        ],
        "conqueror": [
            ("De volta à trilha, {nome}", "Sua próxima etapa em {topico} é {proximo}. Hora de avançar."),
            ("Hora de avançar, {nome}", "{topico} está em {percentual}. Cada etapa deixa você mais perto de fechar."),
            ("Volta com tudo, {nome}", "{guia} guardou a sua próxima etapa em {topico}. Vai lá!"),
        ],
        "socializer": [
            ("Que bom te ver de novo, {nome}!", "Você parou em {topico}. O próximo passo é {proximo}."),
            ("Bom te ver de volta, {nome}!", "{topico} está em {percentual}. Bora seguir junto?"),
            ("Seguimos juntos, {nome}", "{guia} guardou o seu lugar em {topico}. Continue de onde parou."),
        ],
        "achiever": [
            ("De volta à meta, {nome}", "Próximo item de {topico}: {proximo}."),
            ("Seu progresso te espera, {nome}", "{topico} está em {percentual}. Mais um item e ele sobe."),
            ("Continue a lista, {nome}", "{guia} guardou o próximo item de {topico}. Continue de onde parou."),
        ],
    },
}

GERAL: dict[str, dict[str, list[Frase]]] = {
    "revisao_diaria": {
        "seeker": [
            ("Tem trilha para explorar, {nome}", "{guia} achou um trecho novo na sua trilha. Dá uma olhada quando puder."),
            ("Algo novo te espera, {nome}", "Sua trilha tem mais para descobrir hoje. {guia} já separou o caminho."),
        ],
        "survivor": [
            ("Seu plano continua de pé, {nome}", "Um passo pequeno hoje mantém a trilha em dia. {guia} guardou o seu lugar."),
            ("Sem pressa, {nome}", "Alguns minutos de estudo hoje já contam. Siga no seu ritmo."),
        ],
        "daredevil": [
            ("Missão esperando, {nome}!", "{guia} deixou um desafio na sua trilha. Bora resolver?"),
            ("Topa uma rodada, {nome}?", "Tem missão nova na sua trilha. Entra, resolve e sai."),
        ],
        "mastermind": [
            ("Retome o raciocínio, {nome}", "{guia} guardou o ponto onde você parou. A próxima parte continua dali."),
            ("Mais uma peça, {nome}", "Tem uma ideia nova para ligar ao que você já sabe. Retome quando puder."),
        ],
        "conqueror": [
            ("Sua próxima conquista, {nome}", "Falta pouco para a próxima etapa. {guia} está contando com você."),
            ("Hora de avançar, {nome}", "A próxima etapa da sua trilha está pronta. Vai lá vencer mais uma."),
        ],
        "socializer": [
            ("Sua turma está na trilha, {nome}", "Que tal estudar um pouco hoje? {guia} guardou o seu lugar."),
            ("Estude junto, {nome}", "A trilha fica melhor com a turma. Seu próximo passo já está pronto."),
        ],
        "achiever": [
            ("Mais um passo na meta, {nome}", "Seu próximo item está pronto. Feche hoje e veja o progresso subir."),
            ("Meta do dia, {nome}", "{guia} separou o próximo item da sua lista. Bora riscar mais um?"),
        ],
    },
    "retomada_login": {
        "seeker": [
            ("Olha você aí, {nome}!", "{guia} tem mais trilha para você explorar hoje."),
            ("Bora explorar, {nome}?", "Sua trilha está do jeito que você deixou. Tem mais para descobrir."),
        ],
        "survivor": [
            ("Bom te ver, {nome}", "Nada se perdeu. Siga de onde parou, no seu ritmo."),
            ("Tudo no lugar, {nome}", "{guia} guardou a sua trilha. Um passo de cada vez."),
        ],
        "daredevil": [
            ("Voltou, {nome}!", "{guia} tem missão nova para você. Bora?"),
            ("Partiu trilha, {nome}!", "A próxima missão está pronta. Entra e resolve."),
        ],
        "mastermind": [
            ("De onde você parou, {nome}", "A próxima parte da sua trilha continua o que você já viu."),
            ("Pronto para continuar, {nome}?", "{guia} guardou o seu ponto na trilha. Dá para retomar dali."),
        ],
        "conqueror": [
            ("Hora de avançar, {nome}", "A próxima etapa está pronta. {guia} conta com você."),
            ("Volta com tudo, {nome}", "Mais uma etapa da trilha esperando. Vai lá!"),
        ],
        "socializer": [
            ("Bom te ver de volta, {nome}!", "{guia} guardou o seu lugar na trilha. Bora seguir?"),
            ("Seguimos juntos, {nome}", "Sua trilha está pronta para continuar. Vem!"),
        ],
        "achiever": [
            ("Seu progresso te espera, {nome}", "O próximo item da sua lista está pronto. Continue de onde parou."),
            ("Continue a lista, {nome}", "{guia} guardou o próximo item. Mais um e o progresso sobe."),
        ],
    },
    "pausa_saudavel": {
        "seeker": [
            ("Respira um pouco, {nome}", "Pausa curta agora, e depois tem mais para descobrir."),
            ("Uma pausa, {nome}?", "Um tempo longe da tela ajuda a guardar o que você viu."),
        ],
        "survivor": [
            ("Descanse um pouco, {nome}", "Você já fez bastante hoje. A trilha continua aqui depois."),
            ("Tudo bem parar, {nome}", "Uma pausa curta faz parte do plano. Volte quando quiser."),
        ],
        "daredevil": [
            ("Intervalo, {nome}!", "Você mandou bem. Respira e volta com tudo."),
            ("Respira, {nome}!", "Pausa rápida agora, desafio depois."),
        ],
        "mastermind": [
            ("Uma pausa ajuda, {nome}", "Dar um tempo ajuda a juntar as peças do que você estudou."),
            ("Deixa assentar, {nome}", "Você estudou bastante hoje. Volte depois com a cabeça fresca."),
        ],
        "conqueror": [
            ("Pausa de campeão, {nome}", "Você avançou bastante. Recarregue para a próxima etapa."),
            ("Respira, {nome}", "Quem vence também descansa. A próxima etapa espera você."),
        ],
        "socializer": [
            ("Hora de uma pausa, {nome}", "Você estudou bastante. A turma e a trilha continuam aqui."),
            ("Respira um pouco, {nome}", "Que tal uma pausa? Depois a gente segue junto."),
        ],
        "achiever": [
            ("Pausa no plano, {nome}", "Você já fez bastante hoje. Descansar também mantém o ritmo."),
            ("Intervalo merecido, {nome}", "Seu progresso de hoje está garantido. Uma pausa curta e depois continua."),
        ],
    },
}


def linhas_novas() -> list[tuple[str, str, str, int, str, str]]:
    """(tipo, perfil, variante, ordem, titulo, corpo) de cada frase nova."""
    linhas = []
    for tipo, por_perfil in COM_TOPICO.items():
        for perfil, frases in por_perfil.items():
            for i, (titulo, corpo) in enumerate(frases, start=1):
                linhas.append((tipo, perfil, "com_topico", i, titulo, corpo))
    for tipo, por_perfil in GERAL.items():
        for perfil, frases in por_perfil.items():
            # A `geral` 1 é a da `20261103_12`.
            for i, (titulo, corpo) in enumerate(frases, start=2):
                linhas.append((tipo, perfil, "geral", i, titulo, corpo))
    return linhas


def _sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


GUARDA = """
DO $g$
BEGIN
  IF position('ç' in 'Começo') = 0 THEN
    RAISE EXCEPTION 'Texto da notificacao chegou sem acento: arquivo lido com a codificacao errada (ver CLAUDE.md).';
  END IF;
END $g$;
"""

TABELA = """
ALTER TABLE public.notificacoes_textos_perfil
  ADD COLUMN IF NOT EXISTS variante text NOT NULL DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS ordem smallint NOT NULL DEFAULT 1;
ALTER TABLE public.notificacoes_textos_perfil
  DROP CONSTRAINT IF EXISTS notificacoes_textos_perfil_variante_check,
  ADD CONSTRAINT notificacoes_textos_perfil_variante_check CHECK (variante IN ('geral', 'com_topico')),
  DROP CONSTRAINT IF EXISTS notificacoes_textos_perfil_ordem_check,
  ADD CONSTRAINT notificacoes_textos_perfil_ordem_check CHECK (ordem BETWEEN 1 AND 20);
ALTER TABLE public.notificacoes_textos_perfil DROP CONSTRAINT IF EXISTS notificacoes_textos_perfil_pkey;
ALTER TABLE public.notificacoes_textos_perfil
  ADD CONSTRAINT notificacoes_textos_perfil_pkey PRIMARY KEY (tipo, perfil, variante, ordem);
COMMENT ON TABLE public.notificacoes_textos_perfil IS
  'Texto das notificacoes que o banco escreve, por tipo x perfil BrainHex x variante, varias frases '
  'por combinacao (ordem). Sem policy de proposito: so as funcoes SECURITY DEFINER de 20261103_12 e '
  '20261120_02 leem. Marcadores: {nome}, {guia}, {conquista}, {topico}, {percentual}, {proximo}.';
"""


def sementes() -> str:
    valores = ",\n".join(
        f"  ({_sql_texto(t)}, {_sql_texto(p)}, {_sql_texto(v)}, {o}, {_sql_texto(ti)}, {_sql_texto(c)})"
        for t, p, v, o, ti, c in linhas_novas()
    )
    return (
        "INSERT INTO public.notificacoes_textos_perfil (tipo, perfil, variante, ordem, titulo, corpo) VALUES\n"
        + valores
        + "\nON CONFLICT (tipo, perfil, variante, ordem) DO NOTHING;"
    )


FUNCOES = r"""
-- Nome do cadastro sem a marcação do começo ("[TESTE] Frações" -> "Frações"), como `_nome_limpo`.
CREATE OR REPLACE FUNCTION public.notificacoes_nome_limpo(p_nome text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT NULLIF(left(btrim(regexp_replace(COALESCE(p_nome, ''), '^\s*(\[[^]]*\]\s*)+', '')), 60), '')
$fn$;

-- Tópico em andamento, percentual e próximo conteúdo não concluído. NULL sem tópico.
-- Tópico: a mesma consulta de `notificacoes_texto_revisao` (20261102_01). Próximo conteúdo: a mesma de
-- `ContextRepository.fetch_foco_de_estudo`, que alimenta a IA.
CREATE OR REPLACE FUNCTION public.notificacoes_foco_do_aluno(p_aluno uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_topico  record;
  v_nome    text;
  v_proximo text;
BEGIN
  SELECT ta.topico_id, t.nome, COALESCE(ta.percentual_concluido, 0) AS percentual
    INTO v_topico
    FROM topico_aluno ta
    JOIN topicos t ON t.id = ta.topico_id
    JOIN classe_aluno ca ON ca.classe_id = t.classe_id AND ca.aluno_id = ta.aluno_id
   WHERE ta.aluno_id = p_aluno
     AND ta.status::text = 'em andamento'
     AND COALESCE(ta.percentual_concluido, 0) < 100
     AND public.notificacoes_nome_limpo(t.nome) IS NOT NULL
   ORDER BY ta.updated_at DESC NULLS LAST, ta.topico_id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  v_nome := public.notificacoes_nome_limpo(v_topico.nome);

  SELECT public.notificacoes_nome_limpo(c.titulo) INTO v_proximo
    FROM conteudos c
    LEFT JOIN conteudo_aluno ca ON ca.conteudo_id = c.id AND ca.aluno_id = p_aluno
   WHERE c.topico_id = v_topico.topico_id
     AND COALESCE(ca.status::text, '') <> 'concluido'
     AND public.notificacoes_nome_limpo(c.titulo) IS NOT NULL
   ORDER BY c.ordem NULLS LAST, c.id
   LIMIT 1;

  RETURN jsonb_build_object(
    'topico_id', v_topico.topico_id,
    'topico', v_nome,
    'percentual', floor(v_topico.percentual)::integer,
    'proximo', v_proximo
  );
END;
$fn$;

-- O texto de uma rotina para o aluno, já resolvido. NULL quando não há frase para o tipo × perfil.
-- A frase muda a cada dia local e é a mesma ao longo do dia (login, job e fila escolhem igual).
-- `p_dia` só serve ao teste: sem ele, vale o dia local de agora.
CREATE OR REPLACE FUNCTION public.notificacoes_texto_rotina(
  p_aluno uuid, p_tipo text, p_timezone text DEFAULT NULL, p_dia date DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_perfil   text := public.notificacoes_perfil_do_aluno(p_aluno);
  v_foco     jsonb;
  v_topico   text;
  v_proximo  text;
  v_pct      integer;
  v_tz       text := p_timezone;
  v_dia      date;
  v_variante text;
  v_frases   jsonb;
  v_n        integer;
  v_frase    jsonb;
  v_titulo   text;
  v_corpo    text;
BEGIN
  IF p_aluno IS NULL OR p_tipo IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_tz IS NULL THEN
    SELECT a.timezone INTO v_tz
      FROM notificacoes_agendamentos a
     WHERE a.aluno_id = p_aluno AND a.tipo = p_tipo
     LIMIT 1;
  END IF;
  v_dia := COALESCE(p_dia, public.notificacoes_dia_local(v_tz));

  v_foco := public.notificacoes_foco_do_aluno(p_aluno);
  v_topico := v_foco->>'topico';
  v_proximo := v_foco->>'proximo';
  v_pct := (v_foco->>'percentual')::integer;

  -- Só concorre frase cujos marcadores têm valor: {proximo} pede próximo conteúdo, {percentual}
  -- pede percentual acima de zero ("Você está em zero por cento de…" não anima ninguém).
  FOREACH v_variante IN ARRAY CASE WHEN v_topico IS NULL THEN ARRAY['geral']
                                   ELSE ARRAY['com_topico', 'geral'] END
  LOOP
    SELECT jsonb_agg(jsonb_build_object('titulo', t.titulo, 'corpo', t.corpo, 'ordem', t.ordem)
                     ORDER BY t.ordem)
      INTO v_frases
      FROM notificacoes_textos_perfil t
     WHERE t.tipo = p_tipo
       AND t.perfil = v_perfil
       AND t.variante = v_variante
       AND (v_proximo IS NOT NULL OR position('{proximo}' in t.titulo || t.corpo) = 0)
       AND (COALESCE(v_pct, 0) > 0 OR position('{percentual}' in t.titulo || t.corpo) = 0);
    EXIT WHEN v_frases IS NOT NULL;
  END LOOP;
  IF v_frases IS NULL THEN
    RETURN NULL;
  END IF;

  v_n := jsonb_array_length(v_frases);
  v_frase := v_frases -> mod((v_dia - DATE '2026-01-01') + abs(mod(hashtext(p_aluno::text), 997)), v_n);

  v_titulo := v_frase->>'titulo';
  v_corpo := v_frase->>'corpo';
  IF v_variante = 'com_topico' THEN
    v_titulo := replace(v_titulo, '{topico}', v_topico);
    v_corpo := replace(v_corpo, '{topico}', v_topico);
    v_titulo := replace(v_titulo, '{proximo}', COALESCE(v_proximo, ''));
    v_corpo := replace(v_corpo, '{proximo}', COALESCE(v_proximo, ''));
    v_titulo := replace(v_titulo, '{percentual}', COALESCE(v_pct, 0)::text || chr(37));
    v_corpo := replace(v_corpo, '{percentual}', COALESCE(v_pct, 0)::text || chr(37));
  END IF;

  RETURN jsonb_build_object(
    'titulo', public.notificacoes_resolver_texto(p_aluno, v_titulo, v_perfil),
    'corpo', public.notificacoes_resolver_texto(p_aluno, v_corpo, v_perfil),
    'perfil', v_perfil,
    'variante', v_variante,
    'ordem', (v_frase->>'ordem')::integer,
    'topico_id', CASE WHEN v_variante = 'com_topico' THEN (v_foco->>'topico_id')::bigint END
  );
END;
$fn$;

-- O job das 09:00 UTC (`notificacoes_recalcular_rotinas`) chama esta. Antes ela tinha texto próprio
-- (com o perfil dominante) e o gatilho do agendamento o apagava; agora é a mesma fonte do gatilho.
CREATE OR REPLACE FUNCTION public.notificacoes_texto_revisao(p_aluno uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT public.notificacoes_texto_rotina(p_aluno, 'revisao_diaria', NULL)
$fn$;

-- Rotina: o texto do dia, já resolvido (o app agenda a diária localmente com ele).
CREATE OR REPLACE FUNCTION public.notificacoes_agendamentos_texto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_texto jsonb;
  v_perfil text;
  v_titulo text;
  v_corpo  text;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_texto := public.notificacoes_texto_rotina(NEW.aluno_id, NEW.tipo, NEW.timezone);
    IF v_texto IS NOT NULL THEN
      v_titulo := v_texto->>'titulo';
      v_corpo := v_texto->>'corpo';
    ELSE
      v_perfil := public.notificacoes_perfil_do_aluno(NEW.aluno_id);
      v_titulo := public.notificacoes_resolver_texto(NEW.aluno_id, NEW.titulo, v_perfil);
      v_corpo := public.notificacoes_resolver_texto(NEW.aluno_id, NEW.corpo, v_perfil);
    END IF;
    NEW.titulo := v_titulo;
    NEW.corpo := v_corpo;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE =
      'notificacoes_agendamentos_texto: texto mantido (agendamento ' || COALESCE(NEW.id::text, 'novo') || '): ' || SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

-- Fila: a rotina entra com o texto daquela hora (progresso atual); o resto só troca marcadores.
CREATE OR REPLACE FUNCTION public.notificacoes_pendentes_texto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_texto  jsonb;
  v_titulo text;
  v_corpo  text;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    IF TG_OP = 'INSERT' AND NEW.agendamento_id IS NOT NULL AND NEW.sugestao_id IS NULL THEN
      v_texto := public.notificacoes_texto_rotina(NEW.aluno_id, NEW.tipo, NEW.contexto->>'timezone');
    END IF;
    IF v_texto IS NOT NULL THEN
      v_titulo := v_texto->>'titulo';
      v_corpo := v_texto->>'corpo';
      NEW.contexto := COALESCE(NEW.contexto, '{}'::jsonb)
        || jsonb_build_object('texto_rotina', v_texto - 'titulo' - 'corpo');
    ELSE
      v_titulo := public.notificacoes_resolver_texto(NEW.aluno_id, NEW.titulo);
      v_corpo := public.notificacoes_resolver_texto(NEW.aluno_id, NEW.corpo);
    END IF;
    NEW.titulo := v_titulo;
    NEW.corpo := v_corpo;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE =
      'notificacoes_pendentes_texto: texto mantido (pendente ' || COALESCE(NEW.id::text, 'nova') || '): ' || SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_nome_limpo(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_foco_do_aluno(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_texto_rotina(uuid, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_texto_revisao(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_agendamentos_texto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_pendentes_texto() FROM PUBLIC, anon, authenticated;
"""

_ROTINAS_SQL = ", ".join(_sql_texto(t) for t in ROTINAS)

# As rotinas que existem passam pelo gatilho uma vez; a rotina ainda na fila, sem sugestão da IA, pega
# o texto novo da rotina dela (como na `20261103_12`).
REESCREVER = f"""
UPDATE public.notificacoes_agendamentos
   SET titulo = titulo, atualizado_em = now()
 WHERE aluno_id IS NOT NULL
   AND tipo IN ({_ROTINAS_SQL});

UPDATE public.notificacoes_pendentes p
   SET titulo = a.titulo, corpo = a.corpo, atualizado_em = now()
  FROM public.notificacoes_agendamentos a
 WHERE p.agendamento_id = a.id
   AND p.status = 'pendente'
   AND p.sugestao_id IS NULL
   AND a.tipo IN ({_ROTINAS_SQL});
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(GUARDA)
    op.execute(TABELA)
    op.execute(sementes())
    op.execute(FUNCOES)
    op.execute(REESCREVER)
    op.execute(RELOAD)


# --- downgrade: as funções voltam ao texto das migrações de origem, recortado delas ----------------


def _load(nome: str):
    path = AQUI.with_name(nome)
    spec = importlib.util.spec_from_file_location(f"m_{nome[:11]}_para_20_02", path)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _funcao(texto: str, nome: str, origem: str) -> str:
    m = re.search(rf"CREATE OR REPLACE FUNCTION public\.{re.escape(nome)}\(.*?\bAS (\$\w*\$)", texto, re.S)
    if m is None:
        raise RuntimeError(f"{nome} não encontrado em {origem}; revise a 20261120_02")
    fim = texto.find(m.group(1), m.end())
    if fim < 0:
        raise RuntimeError(f"fim de {nome} não encontrado em {origem}; revise a 20261120_02")
    return texto[m.start() : fim + len(m.group(1))] + ";"


def anteriores() -> str:
    m01 = _load("20261102_01_notificacao_no_horario_do_aluno.py")
    m12 = _load("20261103_12_notificacao_fala_com_o_aluno_no_perfil.py")
    return "\n\n".join(
        [
            _funcao(m01.FUNCOES, "notificacoes_texto_revisao", "20261102_01"),
            _funcao(m12.FUNCOES, "notificacoes_agendamentos_texto", "20261103_12"),
            _funcao(m12.FUNCOES, "notificacoes_pendentes_texto", "20261103_12"),
        ]
    )


def downgrade() -> None:
    op.execute(anteriores())
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_texto_rotina(uuid, text, text, date)")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_foco_do_aluno(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_nome_limpo(text)")
    op.execute("DELETE FROM public.notificacoes_textos_perfil WHERE variante <> 'geral' OR ordem <> 1")
    op.execute(
        """
ALTER TABLE public.notificacoes_textos_perfil DROP CONSTRAINT IF EXISTS notificacoes_textos_perfil_pkey;
ALTER TABLE public.notificacoes_textos_perfil ADD CONSTRAINT notificacoes_textos_perfil_pkey PRIMARY KEY (tipo, perfil);
ALTER TABLE public.notificacoes_textos_perfil
  DROP CONSTRAINT IF EXISTS notificacoes_textos_perfil_variante_check,
  DROP CONSTRAINT IF EXISTS notificacoes_textos_perfil_ordem_check,
  DROP COLUMN IF EXISTS variante,
  DROP COLUMN IF EXISTS ordem;
"""
    )
    op.execute(REESCREVER)
    op.execute(RELOAD)
