"""o prazo passa a ter consequencia, e o mecanismo entra desligado

Revision ID: 20260912_01
Revises: 20260911_10
Create Date: 2026-09-12

## O que nao existia

Prazo em TrailUp nao faz nada. `mobile/src/utils/prazoDaAtividade.ts` diz isso
no cabecalho -- "Atrasado e AVISO, nao porta fechada: a atividade continua
aberta e continua pagando" -- e explica por que parou ali:

    descontar pontos exigiria que o banco soubesse do prazo na hora de pagar --
    `fn_pontos_do_evento` recebe so o tipo do evento.

E medido nesta base hoje: **0 das 248 atividades tem `data_entrega`**. Sem
consequencia e sem prazo marcado, o item de loja que estende prazo (#144, o que
mais vendeu no estudo de referencia com 74 compras) compra o nada.

## A correcao

O gatilho de valor passa a multiplicar o que ia pagar por um FATOR DE ATRASO,
que sai de `app_config.prazo_atraso_fator`.

**O fator nasce em 1.0, e 1.0 significa nada muda.** Nenhuma linha da base tem
prazo, e ainda que tivesse, multiplicar por um nao mexe em ponto nenhum. Nao ha
backfill: o mecanismo entra desligado e o piloto liga quando o professor comecar
a marcar prazo. Ligar e um UPDATE numa linha de configuracao, nao uma migracao.

**Nao bloqueia entrega.** A atividade continua aberta depois do prazo e continua
pagando -- so paga menos, se o professor quiser. Bloquear prenderia o aluno que
voltou depois de uma semana doente, que e a razao que `prazoDaAtividade.ts` ja
dava para nao bloquear.

**A punicao e uniforme entre os eventos de atividade.** Quem decide se ha atraso
e a REFERENCIA, nao o tipo: `atividade:1067` olha prazo, `conteudo:174`,
`topico:3` e o UUID do ciclo saem no regex sem tocar em `atividades`. Uma lista
de tipos aqui seria uma segunda lista para divergir da de `eventos_pontuacao`.

## Tres decisoes que nao sao obvias

**1. O parser NAO pode copiar o idioma que o resto do `app_config` usa.** As
outras chaves sao inteiras e sao lidas com
`regexp_replace(valor, '[^0-9]', '', 'g')::int`. Esse idioma aplicado a `0.5`
devolve `05`, ou seja **5** -- um fator que multiplica a pontuacao por cinco em
vez de corta-la pela metade, calado. Aqui o parser preserva o ponto decimal,
aceita virgula de quem edita a linha na mao, e o resultado e aparado em [0, 1]:
acima de 1 pagaria MAIS por atrasar, e abaixo de 0 tiraria ponto -- e errar
nunca anda para tras neste sistema (`atividade_errada` vale 0, nao -5).

**2. Configuracao ilegivel falha para o lado de NAO punir.** Um caractere errado
na linha devolve 1.0, nao zero. O contrario zeraria a pontuacao de todo mundo
por causa de um typo, e o rank le exatamente essa coluna.

**3. `fn_prazo_efetivo` ja nasce com o aluno na assinatura.** Hoje ela devolve
`atividades.data_entrega` e o resultado nao depende do aluno. Ela existe assim
porque a extensao de prazo comprada na loja e POR ALUNO: a fase 3 troca o CORPO
dela e nenhum chamador muda. A alternativa -- comparar contra `data_entrega`
cru agora e trocar a comparacao depois -- criaria duas respostas para "qual e o
prazo deste aluno nesta atividade", que e a divergencia que o CLAUDE.md manda
evitar.

## O que as tres funcoes novas expoem

As tres sao `SECURITY DEFINER` com `search_path` fixo, como manda a higiene da
`20260910_01`. `app_prazo_atraso_fator` e' DEFINER pelo mesmo motivo de
`app_rank_limite_visivel`: a regra nao pode depender de o flag `publico`
continuar ligado.

`fn_prazo_efetivo` e' DEFINER com uma consequencia que vale dizer em voz alta:
quem chamar direto le a `data_entrega` de QUALQUER atividade por id, inclusive
de turma em que nao esta. E um timestamp, e a alternativa e' pior -- como
INVOKER, a punicao passaria a depender do RLS de quem gravou o evento, e a mesma
entrega atrasada pagaria valores diferentes conforme quem a registrou.
`app_classe_da_atividade` ja e' DEFINER com a mesma forma.

**As tres sao revogadas de `PUBLIC` e de `anon`**, e isso nao e' zelo: o Supabase
concede EXECUTE a PUBLIC por padrao, entao uma funcao DEFINER recem-criada fica
exposta em `/rest/v1/rpc/<nome>` para quem nao fez login -- e "anonimo nao le
nada" e' a primeira linha da RLS deste projeto. Conferido depois de aplicar: o
linter do Supabase listou as tres em `anon_security_definer_function_executable`,
enquanto `fn_pontos_do_evento` e `app_rank_limite_visivel` nao aparecem la. O
GRANT para `authenticated` fica: o gatilho de valor NAO e' DEFINER, entao roda
como o aluno e precisa poder chamar.

## Por que o corpo do gatilho e restatado inteiro

`trg_eventos_aluno_valor_do_banco` foi crescendo por quatro migracoes, e a
`20260911_05` emendou o corpo **no lugar**: ela le `pg_get_functiondef`, insere
`NEW.motivo := OLD.motivo;` depois de uma ancora e executa o resultado. Ou seja,
**o texto da `20260911_04` ja nao e o que roda** -- conferido: aquele corpo nao
tem o congelamento de `motivo`. Um `CREATE OR REPLACE` copiado de la apagaria
essa regra em silencio, e o aluno voltaria a reescrever a justificativa do
proprio credito.

Restatar traz a funcao de volta para o repositorio, onde da para ler. E para o
proximo que fizer isso, o `DO` de conferencia abaixo reclama ANTES de substituir
se o corpo vivo tiver ganhado alguma regra que este texto nao tem.

Ver `docs/superpowers/specs/2026-09-12-economia-moedas-e-loja-design.md`, secao
5.1.
"""

from alembic import op

revision = "20260912_01"
down_revision = "20260911_10"
branch_labels = None
depends_on = None


CHAVE_FATOR = "prazo_atraso_fator"
FATOR_PADRAO = "1.0"


CONFIG = f"""
INSERT INTO public.app_config (chave, valor, descricao, publico)
VALUES (
  '{CHAVE_FATOR}',
  '{FATOR_PADRAO}',
  'Quanto um evento de atividade paga quando chega depois do prazo. '
  || '1.0 e o padrao e significa sem punicao, 0.5 paga metade, 0 nao paga. '
  || 'Nunca bloqueia a entrega, e nunca tira ponto ja ganho.',
  true
)
ON CONFLICT (chave) DO NOTHING;
"""


# SECURITY DEFINER pelo mesmo motivo de `app_rank_limite_visivel`: a regra de
# pagamento nao pode depender de o flag `publico` continuar ligado.
FUNCAO_FATOR = f"""
CREATE OR REPLACE FUNCTION public.app_prazo_atraso_fator()
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_bruto text;
  v_fator numeric;
BEGIN
  SELECT valor INTO v_bruto
    FROM public.app_config
   WHERE chave = '{CHAVE_FATOR}';

  IF v_bruto IS NULL THEN
    RETURN 1;
  END IF;

  BEGIN
    -- ATENCAO: o idioma das outras chaves e `[^0-9]`, que APAGA o ponto
    -- decimal -- '0.5' viraria '05', isto e, 5. Aqui o ponto fica, e a virgula
    -- de quem edita a linha na mao vira ponto antes.
    v_fator := NULLIF(
      regexp_replace(translate(v_bruto, ',', '.'), '[^0-9.]', '', 'g'),
      ''
    )::numeric;
  EXCEPTION WHEN others THEN
    -- Falha para o lado de NAO punir. O contrario zeraria a pontuacao de todo
    -- mundo por causa de um caractere errado numa linha de configuracao.
    RETURN 1;
  END;

  IF v_fator IS NULL THEN
    RETURN 1;
  END IF;

  -- Acima de 1 pagaria MAIS por atrasar. Abaixo de 0 tiraria ponto, e errar
  -- nunca anda para tras aqui.
  RETURN LEAST(1, GREATEST(0, v_fator));
END;
$fn$;
"""


# `p_aluno` nao e usado HOJE -- ver a decisao 3 no cabecalho. A fase 3 troca o
# corpo para somar os dias das compras de `prazo_extra` do aluno, limitados pelo
# teto, e nenhum chamador muda.
FUNCAO_PRAZO = """
CREATE OR REPLACE FUNCTION public.fn_prazo_efetivo(
  p_aluno uuid,
  p_atividade bigint
)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT a.data_entrega
    FROM public.atividades a
   WHERE a.id = p_atividade;
$fn$;

COMMENT ON FUNCTION public.fn_prazo_efetivo(uuid, bigint) IS
  'Prazo desta atividade PARA ESTE ALUNO. Hoje e a data_entrega do professor. '
  'A fase 3 da loja soma aqui os dias comprados em prazo_extra -- e por isso '
  'que o aluno ja esta na assinatura.';
"""


FUNCAO_ATRASO = """
CREATE OR REPLACE FUNCTION public.fn_fator_de_atraso(
  p_aluno uuid,
  p_referencia text,
  p_quando timestamptz
)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_atividade bigint;
  v_prazo timestamptz;
BEGIN
  -- Quem decide se ha prazo e a REFERENCIA, nao o tipo do evento. Conteudo,
  -- topico e o UUID do ciclo caem fora aqui e nem chegam a consultar
  -- `atividades`.
  v_atividade := NULLIF(
    substring(COALESCE(p_referencia, '') from '^atividade:([0-9]+)$'),
    ''
  )::bigint;

  IF v_atividade IS NULL THEN
    RETURN 1;
  END IF;

  v_prazo := public.fn_prazo_efetivo(p_aluno, v_atividade);

  -- Sem prazo marcado nao ha atraso -- que e o caso das 248 atividades desta
  -- base. Entregue dentro do prazo tambem paga cheio.
  IF v_prazo IS NULL OR p_quando IS NULL OR p_quando <= v_prazo THEN
    RETURN 1;
  END IF;

  RETURN public.app_prazo_atraso_fator();
END;
$fn$;
"""


# Cada item tem de estar no corpo VIVO antes da substituicao. Se a cadeia ganhar
# outra emenda no lugar, isto reclama em vez de apagar a regra em silencio.
REGRAS_PRESERVADAS = (
    "NEW.classe_id := OLD.classe_id;",
    "NEW.tipo := OLD.tipo;",
    "NEW.concedido_por := OLD.concedido_por;",
    "NEW.aluno_id := OLD.aluno_id;",
    "NEW.motivo := OLD.motivo;",
    "public.fn_evento_creditado(NEW.tipo)",
    "public.fn_evento_de_conclusao(NEW.tipo)",
    "public.fn_pontos_do_evento(NEW.tipo)",
)


def _confere_corpo_vivo() -> str:
    linhas = ",\n    ".join(f"'{regra}'" for regra in REGRAS_PRESERVADAS)
    return f"""
DO $confere$
DECLARE
  v_def text;
  v_regra text;
  v_exigidas text[] := ARRAY[
    {linhas}
  ];
BEGIN
  v_def := pg_get_functiondef('public.trg_eventos_aluno_valor_do_banco'::regproc);

  FOREACH v_regra IN ARRAY v_exigidas LOOP
    IF position(v_regra IN v_def) = 0 THEN
      RAISE EXCEPTION USING MESSAGE =
        'o corpo vivo de trg_eventos_aluno_valor_do_banco nao tem '
        || v_regra
        || ' -- o CREATE OR REPLACE seguinte apagaria essa regra. Confira a cadeia.';
    END IF;
  END LOOP;
END
$confere$;
"""


# O corpo inteiro, como roda hoje (quatro migracoes somadas, incluindo a emenda
# no lugar da 20260911_05), mais o ultimo passo.
CORPO_NOVO = """
CREATE OR REPLACE FUNCTION public.trg_eventos_aluno_valor_do_banco()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Resolvida uma vez, aqui. O que o cliente mandar nesta coluna e' ignorado.
    NEW.classe_id := public.fn_eventos_aluno_resolve_classe_id(NEW.tipo, NEW.referencia);
  ELSE
    -- Congelada. Nem exclusao de conteudo nem UPDATE do cliente a mudam -- e o
    -- cliente PODE dar UPDATE nos proprios eventos (`eventos_aluno_posse_upd`),
    -- entao sem esta linha ele moveria a pontuacao para a turma que quisesse.
    NEW.classe_id := OLD.classe_id;

    -- O TIPO congela junto, e ANTES do teste de creditado abaixo. E' o tipo que
    -- decide se o valor vem de quem concedeu ou de `fn_pontos_do_evento`, entao
    -- troca-lo no UPDATE era escolher a regra: `fn_evento_creditado` casa por
    -- prefixo, e um `SET tipo = 'participacao_extra', valor = 55555` saia
    -- pago. Restaurar depois do teste nao resolveria -- a linha ja teria
    -- retornado pelo atalho.
    NEW.tipo := OLD.tipo;

    -- Quem concedeu e para quem tambem sao historico: sem isto o aluno se
    -- declara concedido por um professor, ou passa o evento para outro.
    NEW.concedido_por := OLD.concedido_por;
    NEW.aluno_id := OLD.aluno_id;
    NEW.motivo := OLD.motivo;
  END IF;

  -- Creditado tem valor de quem concede: presenca e participacao vem da RPC,
  -- o premio de conquista vem de `conquistas.pontos_recompensa`.
  IF public.fn_evento_creditado(NEW.tipo) THEN
    -- ... e no UPDATE esse valor ja foi decidido, entao e' historico tambem.
    -- Este era o buraco: o atalho devolvia NEW com o `valor` do cliente, e o
    -- rank le exatamente esta coluna.
    IF TG_OP <> 'INSERT' THEN
      NEW.valor := OLD.valor;
    END IF;
    RETURN NEW;
  END IF;

  -- Para todo o resto, o que o cliente mandou em `valor` e' descartado.
  NEW.valor := public.fn_pontos_do_evento(NEW.tipo);

  IF public.fn_evento_de_conclusao(NEW.tipo) THEN
    -- Conclusao sem referencia nao pode ser atribuida a rank algum.
    IF NULLIF(TRIM(BOTH FROM COALESCE(NEW.referencia, '')), '') IS NULL THEN
      NEW.valor := 0;
      RETURN NEW;
    END IF;

    -- Concluir de novo nao paga de novo. A linha E gravada -- o cliente faz
    -- `.insert().select().single()` e um RETURN NULL o quebraria. No UPDATE a
    -- comparacao e' "existe linha ANTERIOR com a mesma chave": comparar por
    -- existencia acharia a propria vizinha e zeraria as duas.
    IF EXISTS (
      SELECT 1
        FROM public.eventos_aluno e
       WHERE e.aluno_id = NEW.aluno_id
         AND e.tipo = NEW.tipo
         AND e.referencia = NEW.referencia
         AND (
           TG_OP = 'INSERT'
           OR (COALESCE(e.criado_em, 'epoch'::timestamp), e.id)
              < (COALESCE(NEW.criado_em, 'epoch'::timestamp), NEW.id)
         )
    ) THEN
      NEW.valor := 0;
    END IF;
  END IF;

  -- Sem classe resolvida no INSERT, o evento nao chega a rank algum: pagar por
  -- ele inflaria o razao com pontos invisiveis. Agora e' leitura de coluna, nao
  -- consulta -- e no UPDATE le a classe CONGELADA, entao conteudo apagado depois
  -- nao tira os pontos de ninguem.
  --
  -- `conquista:<id>` nao entra aqui: e' creditado e ja retornou acima.
  IF COALESCE(NEW.valor, 0) > 0
     AND NEW.referencia IS NOT NULL
     AND NEW.classe_id IS NULL THEN
    NEW.valor := 0;
  END IF;

  -- ATRASO -- o ULTIMO passo, e multiplicativo. Zero vezes qualquer coisa
  -- continua zero, entao aplicar aqui nao desfaz nenhuma das regras acima:
  -- conclusao repetida, referencia vazia e classe nula continuam valendo 0.
  -- Com o fator em 1.0, que e como ele nasce, esta linha nao muda nada.
  --
  -- O instante julgado e o do EVENTO, nao o de agora: assim um UPDATE futuro
  -- nao transforma em atrasado o que foi entregue no prazo. `criado_em` e
  -- `timestamp without time zone` gravado por `now()` numa sessao UTC (conferido
  -- no banco), entao `AT TIME ZONE 'UTC'` o devolve ao instante certo.
  IF COALESCE(NEW.valor, 0) > 0 THEN
    NEW.valor := ROUND(
      NEW.valor * public.fn_fator_de_atraso(
        NEW.aluno_id,
        NEW.referencia,
        COALESCE(NEW.criado_em AT TIME ZONE 'UTC', now())
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;
"""


CORPO_ANTERIOR = CORPO_NOVO[: CORPO_NOVO.index("  -- ATRASO -- o ULTIMO passo")] + """  RETURN NEW;
END;
$function$;
"""


# Assinaturas completas: `REVOKE ON FUNCTION` exige os tipos dos argumentos.
FUNCOES = (
    "public.app_prazo_atraso_fator()",
    "public.fn_prazo_efetivo(uuid, bigint)",
    "public.fn_fator_de_atraso(uuid, text, timestamptz)",
)


def upgrade() -> None:
    op.execute(CONFIG)
    op.execute(FUNCAO_FATOR)
    op.execute(FUNCAO_PRAZO)
    op.execute(FUNCAO_ATRASO)

    # O Supabase concede EXECUTE a PUBLIC por padrao. Sem isto, as tres ficam
    # expostas em /rest/v1/rpc/<nome> para quem nao fez login. Mesma forma da
    # `20260826_09`, que fez isso com os helpers de posse.
    for fn in FUNCOES:
        op.execute(f"REVOKE ALL ON FUNCTION {fn} FROM PUBLIC, anon")
        op.execute(f"GRANT EXECUTE ON FUNCTION {fn} TO authenticated")

    op.execute(_confere_corpo_vivo())
    op.execute(CORPO_NOVO)


def downgrade() -> None:
    op.execute(CORPO_ANTERIOR)
    op.execute("DROP FUNCTION IF EXISTS public.fn_fator_de_atraso(uuid, text, timestamptz)")
    op.execute("DROP FUNCTION IF EXISTS public.fn_prazo_efetivo(uuid, bigint)")
    op.execute("DROP FUNCTION IF EXISTS public.app_prazo_atraso_fator()")
    op.execute(f"DELETE FROM public.app_config WHERE chave = '{CHAVE_FATOR}'")
