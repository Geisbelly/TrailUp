"""Notificação fala com o aluno pelo nome, com o guia e no tom do perfil que o app mostra

A `20261102_18` decidiu **para quem** e **quando** cada notificação sai; a IA (`agente_notificacao`)
já escreve no tom do perfil e com o tópico. O que faltava era o **texto que o próprio banco escreve**:
as três rotinas (`revisao_diaria`, `pausa_saudavel`, `retomada_login`) e a conquista desbloqueada
saíam iguais para os sete perfis ("Sua revisão de hoje", "Nova conquista desbloqueada!"), sem o nome
do aluno e sem o guia que ele vê na tela o tempo todo. Nada disso passa por modelo de linguagem, então
fica no banco (regra de fronteira).

## Marcadores: `{nome}` e `{guia}`

`notificacoes_resolver_texto(aluno, texto)` troca:

- `{nome}` pelo apelido do aluno ou, sem apelido, pelo primeiro nome de `alunos.nome`. Sem nome
  utilizável (vazio ou com cara de e-mail), o marcador sai **com a vírgula** (", {nome}") e a frase
  continua de pé: "Bora explorar, {nome}?" vira "Bora explorar?";
- `{guia}` pelo guia do perfil (`microservice/src/constants/brainHex.ts`, `guideName`; paridade
  testada em `test_migration_notificacao_fala_com_o_aluno_no_perfil.py`).

A IA pode escrever `{nome}` (prompt `notificacao_personalizada.txt`), e é aqui que ele vira nome: **o
nome nunca vai ao modelo** (#195). A troca acontece na fila (`notificacoes_pendentes`, BEFORE INSERT OR
UPDATE de texto), que é de onde `notificacoes_entregar` tira o texto da caixa de entrada **e** do push.
`notificacoes_ia` guarda o texto com o marcador, como a IA escreveu.

## Texto por perfil: `notificacoes_textos_perfil`

Uma linha por tipo × perfil. Quem aplica:

- **Rotinas:** gatilho BEFORE INSERT OR UPDATE em `notificacoes_agendamentos`. A rotina já é
  reescrita a cada login (`notificacoes_garantir_rotinas` faz upsert de `titulo`/`corpo`), então o
  texto acompanha o perfil sem mexer na função; mudar `perfil_ativo`, `apelido` ou `nome` em `alunos`
  também reescreve na hora. O texto fica gravado **já resolvido**, porque o app agenda a rotina diária
  como notificação local a partir de `notificacoes_minhas_rotinas` e não troca marcador nenhum.
  Quando a revisão diária promove uma sugestão da IA, vale o texto da sugestão, como antes.
- **Conquista:** gatilho BEFORE INSERT em `notificacoes`, só para `tipo = 'conquista'`. As cinco
  funções que concedem conquista gravam o mesmo texto ('... a conquista "<nome>".'); o gatilho tira o
  nome entre aspas e monta o texto do perfil com `{conquista}`. Corpo em outro formato fica como veio,
  e só o título muda. Reescrever as cinco funções para isto seria colar cópia velha por cima de quem as
  mexeu depois.

**Qual perfil:** o que o app mostra (`perfilVisualDoAluno` → `resolveActiveBrainHexProfile`): o
`perfil_ativo` escolhido pelo aluno, se ele for um dos representativos (1º ou 2º com afinidade > 0, ou
afinidade ≥ 20), senão o dominante (`notificacoes_perfil_dominante`). O texto tem de combinar com a
cor e o guia da tela. A **matriz de quem recebe** (`notificacoes_destino`) continua no dominante: é
decisão de pesquisa (Monterrat), não de aparência. Diferença conhecida: no empate de afinidade o app
desempata pela ordem do vetor que recebeu, e aqui pelo nome, como o resto do motor.

## Nunca derruba quem escreve

Os três gatilhos rodam dentro da transação de quem escreve: o login, a varredura, a concessão de
conquista. Falha vira `WARNING` e o texto segue como veio.

## Tabela e RLS

`notificacoes_textos_perfil` não tem policy, de propósito: só as funções `SECURITY DEFINER` daqui a
leem, e os GRANTs de `anon`/`authenticated` são revogados. Não tem coluna de pessoa (é catálogo), então
não entra em `retencao_politica`. Para ajustar um texto, `UPDATE` na linha: as rotinas pegam o texto
novo no próximo login do aluno.

Revision ID: 20261103_12
Revises: 20261103_11
Create Date: 2026-11-03
"""

from alembic import op

revision = "20261103_12"
down_revision = "20261103_11"
branch_labels = None
depends_on = None

PERFIS = ("seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever")

# Espelho de `guideName` em microservice/src/constants/brainHex.ts (paridade testada).
GUIAS = {
    "seeker": "Amara",
    "survivor": "Kenji",
    "daredevil": "Ember",
    "mastermind": "Idris",
    "conqueror": "Amina",
    "socializer": "Mateo",
    "achiever": "Kwame",
}

# Textos de produto. `{nome}` só aparece como ", {nome}": sem nome, sai junto com a vírgula.
TEXTOS: dict[str, dict[str, tuple[str, str]]] = {
    "revisao_diaria": {
        "seeker": ("Bora explorar, {nome}?", "{guia} separou o próximo trecho da sua trilha. Tem coisa nova para descobrir."),
        "survivor": ("Um passo de cada vez, {nome}", "{guia} guardou o seu lugar na trilha. Um passo pequeno hoje já ajuda."),
        "daredevil": ("Desafio do dia, {nome}!", "{guia} deixou uma missão rápida na sua trilha. Topa encarar agora?"),
        "mastermind": ("A próxima peça, {nome}", "{guia} separou a próxima parte, que se liga ao que você já viu. Que tal entender como?"),
        "conqueror": ("Mais uma etapa, {nome}", "{guia} está de olho na sua próxima vitória. Avance mais uma etapa hoje."),
        "socializer": ("Vem com a turma, {nome}", "{guia} guardou o seu lugar na trilha. Estudar um pouco hoje te deixa junto da turma."),
        "achiever": ("Sua meta de hoje, {nome}", "{guia} separou o próximo item da sua trilha. Mais um e o progresso sobe."),
    },
    "pausa_saudavel": {
        "seeker": ("Hora de respirar, {nome}", "Você explorou bastante hoje. Uma pausa curta ajuda a guardar as descobertas."),
        "survivor": ("Pausa merecida, {nome}", "Você já fez bastante hoje. Descansar um pouco também faz parte do plano."),
        "daredevil": ("Pausa rápida, {nome}!", "Você mandou bem hoje. Uma pausa curta e você volta com tudo."),
        "mastermind": ("Deixe a ideia assentar, {nome}", "Você estudou bastante hoje. Uma pausa curta ajuda a juntar as peças."),
        "conqueror": ("Recarregue, {nome}", "Você avançou bastante hoje. Uma pausa curta prepara a próxima etapa."),
        "socializer": ("Que tal uma pausa, {nome}?", "Você estudou bastante hoje. Respire um pouco, a turma continua aqui."),
        "achiever": ("Pausa no ritmo certo, {nome}", "Você já fez bastante hoje. Uma pausa curta ajuda a manter o progresso."),
    },
    "retomada_login": {
        "seeker": ("Que bom te ver, {nome}!", "{guia} guardou o ponto onde você parou. Tem mais para descobrir."),
        "survivor": ("De volta com calma, {nome}", "{guia} guardou o ponto onde você parou. Siga no seu ritmo."),
        "daredevil": ("De volta ao jogo, {nome}!", "{guia} já deixou a próxima missão pronta. Bora?"),
        "mastermind": ("Retomando o raciocínio, {nome}", "{guia} guardou o ponto onde você parou. A próxima parte continua dali."),
        "conqueror": ("De volta à trilha, {nome}", "{guia} guardou a sua próxima etapa. Hora de avançar."),
        "socializer": ("Que bom te ver de novo, {nome}!", "{guia} e a turma seguem na trilha. Continue de onde parou."),
        "achiever": ("De volta à meta, {nome}", "{guia} guardou o próximo item da sua lista. Continue de onde parou."),
    },
    "conquista": {
        "seeker": ("Descoberta desbloqueada, {nome}!", "Você encontrou a conquista “{conquista}”. O que mais será que a trilha esconde?"),
        "survivor": ("Você chegou lá, {nome}", "A conquista “{conquista}” é sua. Cada passo valeu."),
        "daredevil": ("Desafio vencido, {nome}!", "A conquista “{conquista}” é sua. Qual é o próximo?"),
        "mastermind": ("Peça encaixada, {nome}", "Você desbloqueou a conquista “{conquista}”. Seu jeito de estudar está funcionando."),
        "conqueror": ("Mais uma vitória, {nome}!", "A conquista “{conquista}” é sua. Rumo à próxima!"),
        "socializer": ("Conquista para comemorar, {nome}!", "Você desbloqueou “{conquista}”. Que tal contar para a turma?"),
        "achiever": ("Mais uma na coleção, {nome}!", "A conquista “{conquista}” entrou para a sua lista. Parabéns!"),
    },
}

# Texto das rotinas antes desta migração (`20260826_14`), para o downgrade.
TEXTOS_ANTERIORES = {
    "revisao_diaria": ("Sua revisão de hoje", "Sua trilha continua de onde você parou."),
    "pausa_saudavel": ("Hora de uma pausa", "Você já estudou bastante hoje. Uma pausa curta ajuda a fixar."),
    "retomada_login": ("Bem-vindo de volta", "Continue de onde parou na sua trilha."),
}

ROTINAS = ("revisao_diaria", "pausa_saudavel", "retomada_login")


def _sql_texto(valor: str) -> str:
    return "'" + valor.replace("'", "''") + "'"


# Guarda de codificação, como na `20260826_14`: arquivo lido com a codificação errada falha aqui.
GUARDA = f"""
DO $g$
BEGIN
  IF position('ç' in {_sql_texto(TEXTOS["revisao_diaria"]["mastermind"][0])}) = 0 THEN
    RAISE EXCEPTION 'Texto da notificacao chegou sem acento: arquivo lido com a codificacao errada (ver CLAUDE.md).';
  END IF;
END $g$;
"""

TABELA = f"""
CREATE TABLE IF NOT EXISTS public.notificacoes_textos_perfil (
  tipo          text NOT NULL,
  perfil        text NOT NULL CHECK (perfil IN ({", ".join(_sql_texto(p) for p in PERFIS)})),
  titulo        text NOT NULL CHECK (char_length(titulo) BETWEEN 1 AND 60),
  corpo         text NOT NULL CHECK (char_length(corpo) BETWEEN 1 AND 200),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, perfil)
);
ALTER TABLE public.notificacoes_textos_perfil ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notificacoes_textos_perfil FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.notificacoes_textos_perfil IS
  'Texto das notificacoes que o banco escreve, por tipo x perfil BrainHex. Sem policy de proposito: '
  'so as funcoes SECURITY DEFINER de 20261103_12 leem. Marcadores: {{nome}}, {{guia}}, {{conquista}}.';
"""


def sementes() -> str:
    linhas = [
        f"  ({_sql_texto(tipo)}, {_sql_texto(perfil)}, {_sql_texto(titulo)}, {_sql_texto(corpo)})"
        for tipo, por_perfil in TEXTOS.items()
        for perfil, (titulo, corpo) in por_perfil.items()
    ]
    return (
        "INSERT INTO public.notificacoes_textos_perfil (tipo, perfil, titulo, corpo) VALUES\n"
        + ",\n".join(linhas)
        + "\nON CONFLICT (tipo, perfil) DO NOTHING;"
    )


_CASE_GUIA = "\n".join(f"    WHEN {_sql_texto(p)} THEN {_sql_texto(g)}" for p, g in GUIAS.items())

FUNCOES = f"""
-- O perfil que o app mostra (perfilVisualDoAluno): o ativo, se for representativo; senão o dominante.
CREATE OR REPLACE FUNCTION public.notificacoes_perfil_do_aluno(p_aluno uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_ativo text;
BEGIN
  SELECT lower(btrim(a.perfil_ativo)) INTO v_ativo FROM alunos a WHERE a.id = p_aluno;
  IF v_ativo IS NOT NULL AND EXISTS (
    SELECT 1
      FROM (
        SELECT CASE WHEN lower(btrim(p.nome)) = 'socialiser' THEN 'socializer'
                    ELSE lower(btrim(p.nome)) END AS perfil,
               COALESCE(ap.afinidade, 0) AS afinidade,
               row_number() OVER (ORDER BY ap.afinidade DESC NULLS LAST, p.nome ASC) AS ordem
          FROM aluno_perfil ap
          JOIN perfil p ON p.id = ap.perfil_id
         WHERE ap.aluno_id = p_aluno
      ) r
     WHERE r.perfil = v_ativo
       AND ((r.ordem <= 2 AND r.afinidade > 0) OR r.afinidade >= 20)
  ) THEN
    RETURN v_ativo;
  END IF;
  RETURN public.notificacoes_perfil_dominante(p_aluno);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.notificacoes_guia(p_perfil text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE lower(btrim(COALESCE(p_perfil, '')))
{_CASE_GUIA}
    ELSE {_sql_texto(GUIAS["mastermind"])}
  END
$fn$;

-- Apelido ou primeiro nome. NULL quando não há nome que se possa dizer ao aluno.
CREATE OR REPLACE FUNCTION public.notificacoes_primeiro_nome(p_aluno uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT CASE WHEN s.nome = '' OR position('@' in s.nome) > 0 THEN NULL ELSE s.nome END
    FROM (
      SELECT COALESCE(
               NULLIF(btrim(a.apelido), ''),
               split_part(regexp_replace(btrim(COALESCE(a.nome, '')), '[[:space:]]+', ' ', 'g'), ' ', 1)
             ) AS nome
        FROM alunos a
       WHERE a.id = p_aluno
    ) s
$fn$;

CREATE OR REPLACE FUNCTION public.notificacoes_resolver_texto(
  p_aluno uuid, p_texto text, p_perfil text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v      text := p_texto;
  v_nome text;
BEGIN
  IF v IS NULL OR position('{{' in v) = 0 THEN
    RETURN v;
  END IF;
  IF position('{{nome}}' in v) > 0 THEN
    v_nome := public.notificacoes_primeiro_nome(p_aluno);
    IF v_nome IS NULL THEN
      v := replace(replace(replace(replace(v, ', {{nome}}', ''), '{{nome}}, ', ''), ' {{nome}}', ''), '{{nome}}', '');
      v := btrim(v);
      v := upper(left(v, 1)) || substr(v, 2);
    ELSE
      v := replace(v, '{{nome}}', v_nome);
    END IF;
  END IF;
  IF position('{{guia}}' in v) > 0 THEN
    v := replace(v, '{{guia}}', public.notificacoes_guia(
      COALESCE(p_perfil, public.notificacoes_perfil_do_aluno(p_aluno))
    ));
  END IF;
  RETURN v;
END;
$fn$;

-- Rotina: texto do perfil, já resolvido (o app agenda a diária localmente com ele).
CREATE OR REPLACE FUNCTION public.notificacoes_agendamentos_texto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_perfil text;
  v_titulo text := NEW.titulo;
  v_corpo  text := NEW.corpo;
  v_modelo record;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_perfil := public.notificacoes_perfil_do_aluno(NEW.aluno_id);
    SELECT t.titulo, t.corpo INTO v_modelo
      FROM notificacoes_textos_perfil t
     WHERE t.tipo = NEW.tipo AND t.perfil = v_perfil;
    IF FOUND THEN
      v_titulo := v_modelo.titulo;
      v_corpo := v_modelo.corpo;
    END IF;
    v_titulo := public.notificacoes_resolver_texto(NEW.aluno_id, v_titulo, v_perfil);
    v_corpo := public.notificacoes_resolver_texto(NEW.aluno_id, v_corpo, v_perfil);
    NEW.titulo := v_titulo;
    NEW.corpo := v_corpo;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE =
      'notificacoes_agendamentos_texto: texto mantido (agendamento ' || COALESCE(NEW.id::text, 'novo') || '): ' || SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

-- Fila: troca os marcadores (a IA escreve {{nome}}). Daqui saem a caixa de entrada e o push.
CREATE OR REPLACE FUNCTION public.notificacoes_pendentes_texto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_titulo text;
  v_corpo  text;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_titulo := public.notificacoes_resolver_texto(NEW.aluno_id, NEW.titulo);
    v_corpo := public.notificacoes_resolver_texto(NEW.aluno_id, NEW.corpo);
    NEW.titulo := v_titulo;
    NEW.corpo := v_corpo;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE =
      'notificacoes_pendentes_texto: texto mantido (pendente ' || COALESCE(NEW.id::text, 'nova') || '): ' || SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

-- Caixa de entrada: conquista no tom do perfil; marcadores de quem grava direto aqui.
CREATE OR REPLACE FUNCTION public.notificacoes_caixa_texto()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  v_perfil    text;
  v_titulo    text := NEW.titulo;
  v_corpo     text := NEW.corpo;
  v_conquista text;
  v_modelo    record;
BEGIN
  IF NEW.aluno_id IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_perfil := public.notificacoes_perfil_do_aluno(NEW.aluno_id);
    IF NEW.tipo = 'conquista' THEN
      SELECT t.titulo, t.corpo INTO v_modelo
        FROM notificacoes_textos_perfil t
       WHERE t.tipo = 'conquista' AND t.perfil = v_perfil;
      IF FOUND THEN
        v_conquista := substring(COALESCE(NEW.corpo, '') FROM '[“"]([^”"]+)[”"]');
        v_titulo := v_modelo.titulo;
        IF v_conquista IS NOT NULL THEN
          v_corpo := replace(v_modelo.corpo, '{{conquista}}', v_conquista);
        END IF;
      END IF;
    END IF;
    v_titulo := public.notificacoes_resolver_texto(NEW.aluno_id, v_titulo, v_perfil);
    v_corpo := public.notificacoes_resolver_texto(NEW.aluno_id, v_corpo, v_perfil);
    NEW.titulo := v_titulo;
    NEW.corpo := v_corpo;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE = 'notificacoes_caixa_texto: texto mantido: ' || SQLERRM;
  END;
  RETURN NEW;
END;
$fn$;

-- Mudou o perfil escolhido, o apelido ou o nome: as rotinas do aluno são reescritas na hora.
CREATE OR REPLACE FUNCTION public.notificacoes_rotinas_do_aluno_mudou()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  BEGIN
    UPDATE notificacoes_agendamentos
       SET titulo = titulo, atualizado_em = now()
     WHERE aluno_id = NEW.id
       AND tipo IN ({", ".join(_sql_texto(t) for t in ROTINAS)});
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING USING MESSAGE =
      'notificacoes_rotinas_do_aluno_mudou: rotinas mantidas (aluno ' || NEW.id::text || '): ' || SQLERRM;
  END;
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.notificacoes_perfil_do_aluno(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_primeiro_nome(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_resolver_texto(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_agendamentos_texto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_pendentes_texto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_caixa_texto() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notificacoes_rotinas_do_aluno_mudou() FROM PUBLIC, anon, authenticated;
"""

GATILHOS = """
DROP TRIGGER IF EXISTS trg_notificacoes_agendamentos_texto ON public.notificacoes_agendamentos;
CREATE TRIGGER trg_notificacoes_agendamentos_texto
  BEFORE INSERT OR UPDATE OF titulo, corpo, tipo, aluno_id ON public.notificacoes_agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.notificacoes_agendamentos_texto();

DROP TRIGGER IF EXISTS trg_notificacoes_pendentes_texto ON public.notificacoes_pendentes;
CREATE TRIGGER trg_notificacoes_pendentes_texto
  BEFORE INSERT OR UPDATE OF titulo, corpo ON public.notificacoes_pendentes
  FOR EACH ROW EXECUTE FUNCTION public.notificacoes_pendentes_texto();

DROP TRIGGER IF EXISTS trg_notificacoes_caixa_texto ON public.notificacoes;
CREATE TRIGGER trg_notificacoes_caixa_texto
  BEFORE INSERT ON public.notificacoes
  FOR EACH ROW EXECUTE FUNCTION public.notificacoes_caixa_texto();

DROP TRIGGER IF EXISTS trg_alunos_notificacoes_rotinas ON public.alunos;
CREATE TRIGGER trg_alunos_notificacoes_rotinas
  AFTER UPDATE OF perfil_ativo, apelido, nome ON public.alunos
  FOR EACH ROW
  WHEN (OLD.perfil_ativo IS DISTINCT FROM NEW.perfil_ativo
        OR OLD.apelido IS DISTINCT FROM NEW.apelido
        OR OLD.nome IS DISTINCT FROM NEW.nome)
  EXECUTE FUNCTION public.notificacoes_rotinas_do_aluno_mudou();
"""

# Rotinas que já existem passam pelo gatilho uma vez; a revisão diária ainda na fila, sem sugestão da
# IA, pega o texto novo da rotina dela.
REESCREVER = f"""
UPDATE public.notificacoes_agendamentos
   SET titulo = titulo, atualizado_em = now()
 WHERE aluno_id IS NOT NULL
   AND tipo IN ({", ".join(_sql_texto(t) for t in ROTINAS)});

UPDATE public.notificacoes_pendentes p
   SET titulo = a.titulo, corpo = a.corpo, atualizado_em = now()
  FROM public.notificacoes_agendamentos a
 WHERE p.agendamento_id = a.id
   AND p.status = 'pendente'
   AND p.sugestao_id IS NULL
   AND a.tipo IN ({", ".join(_sql_texto(t) for t in ROTINAS)});
"""

RELOAD = "NOTIFY pgrst, 'reload schema';"


def upgrade() -> None:
    op.execute(GUARDA)
    op.execute(TABELA)
    op.execute(sementes())
    op.execute(FUNCOES)
    op.execute(GATILHOS)
    op.execute(REESCREVER)
    op.execute(RELOAD)


def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS trg_alunos_notificacoes_rotinas ON public.alunos")
    op.execute("DROP TRIGGER IF EXISTS trg_notificacoes_caixa_texto ON public.notificacoes")
    op.execute("DROP TRIGGER IF EXISTS trg_notificacoes_pendentes_texto ON public.notificacoes_pendentes")
    op.execute("DROP TRIGGER IF EXISTS trg_notificacoes_agendamentos_texto ON public.notificacoes_agendamentos")
    for tipo, (titulo, corpo) in TEXTOS_ANTERIORES.items():
        op.execute(
            f"UPDATE public.notificacoes_agendamentos SET titulo = {_sql_texto(titulo)}, "
            f"corpo = {_sql_texto(corpo)}, atualizado_em = now() WHERE tipo = {_sql_texto(tipo)}"
        )
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_rotinas_do_aluno_mudou()")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_caixa_texto()")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_pendentes_texto()")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_agendamentos_texto()")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_resolver_texto(uuid, text, text)")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_primeiro_nome(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_guia(text)")
    op.execute("DROP FUNCTION IF EXISTS public.notificacoes_perfil_do_aluno(uuid)")
    op.execute("DROP TABLE IF EXISTS public.notificacoes_textos_perfil")
    op.execute(RELOAD)
