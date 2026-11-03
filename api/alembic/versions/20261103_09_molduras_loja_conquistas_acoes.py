"""Molduras: 40 novas, vendidas na loja, ganhas por conquista ou por ação no app

## O pedido

O Drive tem 50 molduras e o app usa 7 (uma por perfil BrainHex). A dona do projeto pediu para as
outras virarem recompensa: **20 na loja** (caras: 20, 30 ou 40 moedas), **10 por conquista** (do
sistema, não da turma) e **10 raras**, que saem quando o aluno faz algo específico no app (avaliar o
app, reportar um erro…). As ações raras são **configuráveis pelo dev** no painel admin da API.

Três molduras do Drive ficaram de fora (folhas 44, 46 e 47 da folha de contato): reserva.

## O que muda

- `molduras`: o catálogo das 40. `origem` diz como se ganha (`loja`, `conquista`, `acao`); `preco`
  só existe na loja; `conquista_id` e `acao` apontam de onde vem. `ativa = false` tira da vitrine e
  das recompensas, **não** de quem já tem.
- `moldura_aluno`: a posse. Uma linha por aluno × moldura; a chave primária é o que impede ganhar ou
  pagar duas vezes.
- `alunos.moldura_equipada`: a que aparece no lugar da moldura do perfil. `NULL` = a do perfil
  BrainHex, como sempre foi. Fica em `alunos` porque os colegas precisam vê-la (ranking, guilda) e
  `alunos_posse_sel` já resolve quem vê quem. O gatilho `trg_alunos_moldura_equipada` recusa equipar
  o que não é seu — o aluno tem `UPDATE` na própria linha de `alunos`, e sem o gatilho bastaria um
  `UPDATE` para vestir qualquer moldura.
- `molduras_acoes`: as 10 ações e qual moldura cada uma libera. É o que o dev edita.
- `moldura_acao_aluno`: o registro de quem fez cada ação (uma vez por aluno × ação). Fica mesmo com
  a ação desligada: serve de métrica (quantos avaliaram o app) e não credita nada por si.
- Dez conquistas novas do sistema (`classe_id IS NULL`, `tipo = 'moldura_<codigo>'`), avaliadas pelo gatilho
  de sempre (`trg_eventos_aluno_after_iud`). Quando uma é concluída, `trg_conquista_libera_moldura`
  entrega a moldura. `pontos_recompensa = 0`: o prêmio é a moldura, e pontos mexeriam no ranking.
  O `tipo` é um por moldura, e não `'moldura'` para as dez: em produção, `conquistas_tipo_comum_uq`
  é `(COALESCE(classe_id, -1), tipo)` e só aceita UMA conquista do sistema por tipo. A primeira
  versão desta semente gravou as dez com o mesmo tipo e a API não subiu (03/11). O índice de
  produção não é o do Alembic (`20260826_12` cria só `(tipo)`); o teste e2e cria a versão real.

## RPCs (todas `SECURITY DEFINER`, todas conferem `auth.uid()`)

- `molduras_catalogo()`: as 40 com posse, equipada e "como ganhar". Uma chamada monta a tela.
- `moldura_comprar(p_codigo)`: trava a carteira com o **mesmo** advisory lock de `loja_comprar`
  (`hashtextextended(aluno, 0)`), confere o saldo no razão e debita `motivo = 'compra'`,
  `evento_tipo = 'moldura'`, `referencia = <codigo>`. A moeda é global (o saldo é a soma do razão),
  então a compra não tem turma. Repetir a compra não cobra de novo: devolve `repetido`.
- `moldura_equipar(p_codigo)`: `NULL` volta para a do perfil.
- `moldura_registrar_acao(p_acao)`: grava a ação e, se ela estiver ligada e apontar para uma moldura
  ativa, entrega a moldura.

**A ação é declarada pelo app.** O banco não sabe se o relatório foi gerado nem se o aluno abriu a
tela de novidades; quem chama a RPC direto ganha a moldura sem ter feito nada. Aceito de propósito:
é cosmético, não dá vantagem sobre ninguém (o princípio da loja), e cada ação libera uma vez só.

Avaliar o app e reportar um erro são uma tela do próprio app que manda pelo `fn_enviar_contato` (o
e-mail da equipe, o mesmo do pedido de exclusão), e não a loja de aplicativos: o app também circula
como APK, e quem instalou assim não teria onde avaliar.

## Configuração do dev

`molduras_admin_salvar` e `molduras_admin_salvar_acao` não têm GRANT para nenhum papel de cliente: só
a conexão da API (dona do banco) as chama, pelo painel `/admin/molduras` com o login do admin. As duas
gravam o antes e o depois em `economia_auditoria`, ao lado das outras mudanças de configuração.

Revision ID: 20261103_09
Revises: 20261103_08
Create Date: 2026-11-03
"""

from __future__ import annotations

from alembic import op

revision = "20261103_09"
down_revision = "20261103_08"
branch_labels = None
depends_on = None

# (codigo, nome, preco). Preço em moedas: 20, 30 ou 40, crescendo com o detalhe da moldura.
LOJA: list[tuple[str, str, int]] = [
    ("folhagem", "Folhagem", 20),
    ("rubi_fino", "Rubi Fino", 20),
    ("ramo_de_jade", "Ramo de Jade", 20),
    ("safira", "Safira", 20),
    ("ametista", "Ametista", 20),
    ("louros", "Louros", 20),
    ("agua_marinha", "Água-Marinha", 20),
    ("quartzo_rosa", "Quartzo Rosa", 30),
    ("petalas", "Pétalas", 30),
    ("esmeralda", "Esmeralda", 30),
    ("cobalto", "Cobalto", 30),
    ("cristal_violeta", "Cristal Violeta", 30),
    ("brasa", "Brasa", 30),
    ("hera_dourada", "Hera Dourada", 30),
    ("lapis_lazuli", "Lápis-Lazúli", 40),
    ("orquidea", "Orquídea", 40),
    ("coroa_de_ouro", "Coroa de Ouro", 40),
    ("turquesa_real", "Turquesa Real", 40),
    ("prata_polida", "Prata Polida", 40),
    ("rubi_real", "Rubi Real", 40),
]

# (codigo, nome da moldura, nome da conquista, descrição, categoria, critério, ícone, cor)
# Critério com a chave que `fn_avaliar_metrica` lê para cada métrica (e que o CHECK
# `conquistas_criterio_valido` confere): chave errada vira alvo zero e destrava para todo mundo.
CONQUISTA: list[tuple[str, str, str, str, str, dict, str, str]] = [
    (
        "geada",
        "Geada",
        "Uma semana sem parar",
        "Estudou 7 dias seguidos.",
        "Constância",
        {"metrica": "dias_seguidos", "dias_seguidos": 7},
        "chama",
        "#6fb3e0",
    ),
    (
        "labareda",
        "Labareda",
        "Duas semanas acesas",
        "Estudou 14 dias seguidos.",
        "Constância",
        {"metrica": "dias_seguidos", "dias_seguidos": 14},
        "chama",
        "#e2574c",
    ),
    (
        "diamante",
        "Diamante",
        "Um mês de constância",
        "Estudou 30 dias seguidos.",
        "Constância",
        {"metrica": "dias_seguidos", "dias_seguidos": 30},
        "medalha",
        "#4fd1c5",
    ),
    (
        "aurora",
        "Aurora",
        "Cinco horas de estudo",
        "Somou 5 horas de estudo.",
        "Dedicação",
        {"metrica": "minutos_totais", "minutos": 300},
        "estrela",
        "#9b5de5",
    ),
    (
        "meia_noite",
        "Meia-Noite",
        "Vinte horas de estudo",
        "Somou 20 horas de estudo.",
        "Dedicação",
        {"metrica": "minutos_totais", "minutos": 1200},
        "estrela",
        "#5b3fd9",
    ),
    (
        "trepadeira",
        "Trepadeira",
        "Cinco tópicos fechados",
        "Concluiu 5 tópicos.",
        "Trilha",
        {"metrica": "topicos_concluidos", "minimo": 5},
        "livro",
        "#5fd99a",
    ),
    (
        "mare",
        "Maré",
        "Quinze tópicos fechados",
        "Concluiu 15 tópicos.",
        "Trilha",
        {"metrica": "topicos_concluidos", "minimo": 15},
        "livro",
        "#17a398",
    ),
    (
        "sol_dourado",
        "Sol Dourado",
        "Vinte e cinco atividades",
        "Concluiu 25 atividades.",
        "Prática",
        {"metrica": "atividades_concluidas", "minimo": 25},
        "alvo",
        "#e0b34d",
    ),
    (
        "fogo_e_ouro",
        "Fogo e Ouro",
        "Setenta e cinco atividades",
        "Concluiu 75 atividades.",
        "Prática",
        {"metrica": "atividades_concluidas", "minimo": 75},
        "trofeu",
        "#c9a227",
    ),
    (
        "coral_vivo",
        "Coral Vivo",
        "Gabarito",
        "Acertou 100% de uma atividade.",
        "Precisão",
        {"metrica": "acertos_percentual", "percentual": 100},
        "raio",
        "#f4623a",
    ),
]

# (acao, rotulo, descrição para o aluno, codigo da moldura, nome da moldura)
ACOES: list[tuple[str, str, str, str, str]] = [
    ("avaliar_app", "Avaliar o app", "Dê uma nota para o TrailUp nas configurações.", "estrela_guia", "Estrela-Guia"),
    ("reportar_erro", "Reportar um erro", "Conte nas configurações um erro que você encontrou.", "bussola", "Bússola"),
    (
        "gerar_relatorio",
        "Gerar o relatório",
        "Gere o PDF do seu relatório de estudo.",
        "lua_crescente",
        "Lua Crescente",
    ),
    ("definir_lembrete", "Criar um lembrete", "Configure o lembrete diário de estudo.", "noite_de_lua", "Noite de Lua"),
    (
        "usar_modo_foco",
        "Usar o modo foco",
        "Ligue o modo foco para estudar sem distração.",
        "lua_violeta",
        "Lua Violeta",
    ),
    ("editar_perfil", "Personalizar o perfil", "Salve sua foto, apelido ou descrição.", "rosa", "Rosa"),
    (
        "compartilhar_guilda",
        "Compartilhar na guilda",
        "Compartilhe algo com a sua guilda.",
        "constelacao",
        "Constelação",
    ),
    ("ativar_notificacoes", "Ativar as notificações", "Ligue as notificações do app.", "chama_rara", "Chama Rara"),
    ("ver_novidades", "Ver as novidades", "Abra as novidades da versão do app.", "ceu_estrelado", "Céu Estrelado"),
    ("ver_estilo", "Conhecer o seu estilo", "Abra as métricas do seu estilo de estudo.", "nebulosa", "Nebulosa"),
]


def _q(texto: str) -> str:
    return "'" + texto.replace("'", "''") + "'"


def _json(valor: dict) -> str:
    import json

    return _q(json.dumps(valor, ensure_ascii=False)) + "::jsonb"


TABELAS = """
CREATE TABLE public.molduras (
  codigo        text        PRIMARY KEY CHECK (codigo ~ '^[a-z][a-z0-9_]{1,40}$'),
  nome          text        NOT NULL CHECK (length(btrim(nome)) BETWEEN 1 AND 60),
  origem        text        NOT NULL CHECK (origem IN ('loja', 'conquista', 'acao')),
  preco         integer     NULL,
  conquista_id  bigint      NULL REFERENCES public.conquistas(id) ON DELETE SET NULL,
  ordem         integer     NOT NULL DEFAULT 0,
  ativa         boolean     NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT molduras_preco_so_na_loja CHECK (
    (origem = 'loja' AND preco BETWEEN 1 AND 1000) OR (origem <> 'loja' AND preco IS NULL)
  )
);

COMMENT ON TABLE public.molduras IS
  'Catálogo das molduras além das 7 de perfil. ativa=false tira da vitrine e das recompensas, não de quem já tem.';

CREATE TABLE public.moldura_aluno (
  aluno_id       uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  moldura_codigo text        NOT NULL REFERENCES public.molduras(codigo) ON UPDATE CASCADE,
  origem         text        NOT NULL CHECK (origem IN ('compra', 'conquista', 'acao', 'concessao')),
  preco_pago     integer     NULL,
  obtida_em      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, moldura_codigo)
);

COMMENT ON TABLE public.moldura_aluno IS
  'Posse de moldura. A chave primária impede ganhar ou pagar duas vezes. Escrita só pelas RPCs e gatilhos.';

CREATE TABLE public.molduras_acoes (
  acao           text        PRIMARY KEY CHECK (acao ~ '^[a-z][a-z0-9_]{1,40}$'),
  rotulo         text        NOT NULL,
  descricao      text        NOT NULL,
  moldura_codigo text        NULL REFERENCES public.molduras(codigo) ON UPDATE CASCADE ON DELETE SET NULL,
  ativa          boolean     NOT NULL DEFAULT true,
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.molduras_acoes IS
  'Ações do app que liberam moldura rara. Quem edita é o dev, pelo painel admin da API.';

CREATE TABLE public.moldura_acao_aluno (
  aluno_id      uuid        NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  acao          text        NOT NULL REFERENCES public.molduras_acoes(acao) ON UPDATE CASCADE,
  registrada_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (aluno_id, acao)
);

COMMENT ON TABLE public.moldura_acao_aluno IS
  'Quem fez cada ação, uma vez. Declarado pelo app; fica gravado mesmo com a ação desligada.';

ALTER TABLE public.alunos
  ADD COLUMN IF NOT EXISTS moldura_equipada text NULL
  REFERENCES public.molduras(codigo) ON UPDATE CASCADE ON DELETE SET NULL;

COMMENT ON COLUMN public.alunos.moldura_equipada IS
  'Moldura no lugar da do perfil BrainHex; NULL = a do perfil. Só aceita moldura que o aluno tem.';
"""

# Criar tabela e criar a policy são o mesmo commit: o event trigger `ensure_rls` liga RLS em toda
# tabela nova, e sem policy o cliente lê lista vazia em silêncio.
RLS = """
ALTER TABLE public.molduras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moldura_aluno ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.molduras_acoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moldura_acao_aluno ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.molduras, public.moldura_aluno, public.molduras_acoes, public.moldura_acao_aluno
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.molduras, public.moldura_aluno, public.molduras_acoes, public.moldura_acao_aluno
  TO authenticated;

-- O catálogo e as ações não têm segredo: é a vitrine.
CREATE POLICY molduras_sel ON public.molduras FOR SELECT TO authenticated USING (true);
CREATE POLICY molduras_acoes_sel ON public.molduras_acoes FOR SELECT TO authenticated USING (true);
-- Posse e ações feitas: só as próprias.
CREATE POLICY moldura_aluno_sel ON public.moldura_aluno
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
CREATE POLICY moldura_acao_aluno_sel ON public.moldura_acao_aluno
  FOR SELECT TO authenticated USING (aluno_id = auth.uid());
"""

# Posse e ações são dado do aluno: ficam enquanto a conta existir e saem com ela pela FK.
RETENCAO = """
INSERT INTO public.retencao_politica (tabela, acao, coluna_aluno, categoria, motivo) VALUES
  ('moldura_aluno', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'molduras que o aluno comprou ou ganhou; sai com a conta pela FK'),
  ('moldura_acao_aluno', 'vida_da_conta', 'aluno_id', 'vida_da_conta',
   'acoes do app que o aluno fez (uma vez cada), para liberar moldura rara; sai com a conta pela FK')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

GATILHOS = """
CREATE OR REPLACE FUNCTION public.fn_alunos_moldura_equipada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.moldura_equipada IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.moldura_equipada IS NOT DISTINCT FROM OLD.moldura_equipada THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.moldura_aluno ma
     WHERE ma.aluno_id = NEW.id AND ma.moldura_codigo = NEW.moldura_equipada
  ) THEN
    RAISE EXCEPTION 'moldura % nao pertence ao aluno', NEW.moldura_equipada
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_alunos_moldura_equipada
  BEFORE INSERT OR UPDATE OF moldura_equipada ON public.alunos
  FOR EACH ROW EXECUTE FUNCTION public.fn_alunos_moldura_equipada();

-- Conquista concluída entrega a moldura. Dispara no INSERT já concluído e no UPDATE que conclui,
-- que são os dois caminhos de `trg_eventos_aluno_after_iud`.
CREATE OR REPLACE FUNCTION public.fn_conquista_libera_moldura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT COALESCE(NEW.concluida, false) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND COALESCE(OLD.concluida, false) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.moldura_aluno (aluno_id, moldura_codigo, origem)
  SELECT NEW.aluno_id, m.codigo, 'conquista'
    FROM public.molduras m
   WHERE m.conquista_id = NEW.conquista_id
     AND m.origem = 'conquista'
     AND m.ativa
  ON CONFLICT (aluno_id, moldura_codigo) DO NOTHING;
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER trg_conquista_libera_moldura
  AFTER INSERT OR UPDATE OF concluida ON public.conquistas_aluno
  FOR EACH ROW EXECUTE FUNCTION public.fn_conquista_libera_moldura();

REVOKE ALL ON FUNCTION public.fn_alunos_moldura_equipada() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fn_conquista_libera_moldura() FROM PUBLIC, anon, authenticated;
"""

FUNCOES = """
CREATE OR REPLACE FUNCTION public.molduras_catalogo()
RETURNS TABLE (
  codigo      text,
  nome        text,
  origem      text,
  preco       integer,
  como_ganhar text,
  tenho       boolean,
  equipada    boolean,
  obtida_em   timestamptz,
  ordem       integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
  SELECT m.codigo, m.nome, m.origem, m.preco,
         CASE m.origem
           WHEN 'loja' THEN m.preco || ' moedas na loja'
           WHEN 'conquista' THEN COALESCE('Conquista: ' || c.nome, 'Conquista do sistema')
           ELSE COALESCE(a.descricao, 'Ação especial no app')
         END,
         ma.aluno_id IS NOT NULL,
         al.moldura_equipada IS NOT DISTINCT FROM m.codigo,
         ma.obtida_em,
         m.ordem
    FROM public.molduras m
    LEFT JOIN public.conquistas c ON c.id = m.conquista_id
    LEFT JOIN public.molduras_acoes a ON a.moldura_codigo = m.codigo AND m.origem = 'acao'
    LEFT JOIN public.moldura_aluno ma ON ma.moldura_codigo = m.codigo AND ma.aluno_id = auth.uid()
    LEFT JOIN public.alunos al ON al.id = auth.uid()
   WHERE auth.uid() IS NOT NULL
     -- Desligada some da vitrine, mas continua na coleção de quem tem.
     AND (m.ativa OR ma.aluno_id IS NOT NULL)
     -- Rara sem ação ligada apontando para ela não tem como ser ganha: não aparece para quem não tem.
     AND (m.origem <> 'acao' OR ma.aluno_id IS NOT NULL OR a.ativa)
   ORDER BY CASE m.origem WHEN 'loja' THEN 0 WHEN 'conquista' THEN 1 ELSE 2 END, m.ordem, m.nome;
$fn$;

CREATE OR REPLACE FUNCTION public.moldura_comprar(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno  uuid := auth.uid();
  v_mold   public.molduras%ROWTYPE;
  v_saldo  numeric;
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_mold FROM public.molduras WHERE codigo = p_codigo;
  IF NOT FOUND OR NOT v_mold.ativa OR v_mold.origem <> 'loja' THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'moldura_indisponivel');
  END IF;

  -- A mesma trava da carteira que `loja_comprar` usa: duas compras ao mesmo tempo não gastam o
  -- mesmo saldo duas vezes, seja moldura ou item.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_aluno::text, 0));

  IF EXISTS (SELECT 1 FROM public.moldura_aluno WHERE aluno_id = v_aluno AND moldura_codigo = p_codigo) THEN
    RETURN jsonb_build_object('ok', true, 'repetido', true, 'saldo', public.loja_saldo());
  END IF;

  SELECT COALESCE(SUM(delta), 0) INTO v_saldo FROM public.moedas_ledger WHERE aluno_id = v_aluno;
  IF v_saldo < v_mold.preco THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'saldo_insuficiente', 'saldo', v_saldo, 'preco', v_mold.preco);
  END IF;

  INSERT INTO public.moldura_aluno (aluno_id, moldura_codigo, origem, preco_pago)
  VALUES (v_aluno, p_codigo, 'compra', v_mold.preco);

  INSERT INTO public.moedas_ledger (aluno_id, delta, motivo, evento_tipo, referencia)
  VALUES (v_aluno, -v_mold.preco, 'compra', 'moldura', p_codigo);

  PERFORM public.economia_auditar(
    'compra', 'moldura_aluno', p_codigo, NULL, v_aluno,
    jsonb_build_object('saldo', v_saldo),
    jsonb_build_object('moldura', p_codigo, 'preco', v_mold.preco, 'saldo', v_saldo - v_mold.preco)
  );

  RETURN jsonb_build_object('ok', true, 'moldura', p_codigo, 'preco', v_mold.preco, 'saldo', v_saldo - v_mold.preco);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.moldura_equipar(p_codigo text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno uuid := auth.uid();
BEGIN
  IF v_aluno IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;
  IF p_codigo IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.moldura_aluno WHERE aluno_id = v_aluno AND moldura_codigo = p_codigo
  ) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'moldura_nao_e_sua');
  END IF;
  UPDATE public.alunos SET moldura_equipada = p_codigo WHERE id = v_aluno;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_cadastro_de_aluno');
  END IF;
  RETURN jsonb_build_object('ok', true, 'moldura', p_codigo);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.moldura_registrar_acao(p_acao text)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_aluno uuid := auth.uid();
  v_acao  public.molduras_acoes%ROWTYPE;
  v_nova  integer := 0;
  v_nome  text;
BEGIN
  IF v_aluno IS NULL OR NOT EXISTS (SELECT 1 FROM public.alunos WHERE id = v_aluno) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'sem_sessao');
  END IF;

  SELECT * INTO v_acao FROM public.molduras_acoes WHERE acao = p_acao;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'acao_desconhecida');
  END IF;

  INSERT INTO public.moldura_acao_aluno (aluno_id, acao) VALUES (v_aluno, p_acao)
  ON CONFLICT (aluno_id, acao) DO NOTHING;

  IF v_acao.ativa AND v_acao.moldura_codigo IS NOT NULL THEN
    INSERT INTO public.moldura_aluno (aluno_id, moldura_codigo, origem)
    SELECT v_aluno, m.codigo, 'acao'
      FROM public.molduras m
     WHERE m.codigo = v_acao.moldura_codigo AND m.ativa
    ON CONFLICT (aluno_id, moldura_codigo) DO NOTHING;
    GET DIAGNOSTICS v_nova = ROW_COUNT;
  END IF;

  IF v_nova > 0 THEN
    SELECT nome INTO v_nome FROM public.molduras WHERE codigo = v_acao.moldura_codigo;
    RETURN jsonb_build_object('ok', true, 'nova', true, 'moldura', v_acao.moldura_codigo, 'nome', v_nome);
  END IF;
  RETURN jsonb_build_object('ok', true, 'nova', false);
END;
$fn$;

REVOKE ALL ON FUNCTION public.molduras_catalogo() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moldura_comprar(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moldura_equipar(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.moldura_registrar_acao(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.molduras_catalogo() TO authenticated;
GRANT EXECUTE ON FUNCTION public.moldura_comprar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moldura_equipar(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.moldura_registrar_acao(text) TO authenticated;
"""

# Configuração do dev. Sem GRANT para cliente nenhum: só a conexão da API (dona) chama, pelo
# painel admin. `p_ator` é o login do admin, gravado na auditoria (auth.uid() é nulo ali).
ADMIN = """
CREATE OR REPLACE FUNCTION public.molduras_admin_salvar(
  p_codigo text, p_ativa boolean, p_preco integer, p_ator text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes public.molduras%ROWTYPE;
  v_depois public.molduras%ROWTYPE;
BEGIN
  SELECT * INTO v_antes FROM public.molduras WHERE codigo = p_codigo FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'moldura % nao existe', p_codigo USING ERRCODE = 'P0002';
  END IF;
  IF v_antes.origem = 'loja' AND (p_preco IS NULL OR p_preco NOT BETWEEN 1 AND 1000) THEN
    RAISE EXCEPTION 'preco da loja precisa ficar entre 1 e 1000' USING ERRCODE = '22023';
  END IF;

  UPDATE public.molduras
     SET ativa = COALESCE(p_ativa, ativa),
         preco = CASE WHEN origem = 'loja' THEN p_preco ELSE NULL END,
         atualizado_em = now()
   WHERE codigo = p_codigo
  RETURNING * INTO v_depois;

  PERFORM public.economia_auditar(
    'config', 'molduras', p_codigo, NULL, NULL,
    jsonb_build_object('ativa', v_antes.ativa, 'preco', v_antes.preco),
    jsonb_build_object('ativa', v_depois.ativa, 'preco', v_depois.preco, 'ator', p_ator)
  );
  RETURN jsonb_build_object('codigo', p_codigo, 'ativa', v_depois.ativa, 'preco', v_depois.preco);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.molduras_admin_salvar_acao(
  p_acao text, p_ativa boolean, p_moldura text, p_ator text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_antes public.molduras_acoes%ROWTYPE;
  v_depois public.molduras_acoes%ROWTYPE;
BEGIN
  SELECT * INTO v_antes FROM public.molduras_acoes WHERE acao = p_acao FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'acao % nao existe', p_acao USING ERRCODE = 'P0002';
  END IF;
  -- Ação só entrega moldura rara: apontar para uma da loja daria de graça o que se compra.
  IF p_moldura IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.molduras WHERE codigo = p_moldura AND origem = 'acao'
  ) THEN
    RAISE EXCEPTION 'moldura % nao e rara (origem acao)', p_moldura USING ERRCODE = '22023';
  END IF;

  UPDATE public.molduras_acoes
     SET ativa = COALESCE(p_ativa, ativa),
         moldura_codigo = p_moldura,
         atualizado_em = now()
   WHERE acao = p_acao
  RETURNING * INTO v_depois;

  PERFORM public.economia_auditar(
    'config', 'molduras_acoes', p_acao, NULL, NULL,
    jsonb_build_object('ativa', v_antes.ativa, 'moldura', v_antes.moldura_codigo),
    jsonb_build_object('ativa', v_depois.ativa, 'moldura', v_depois.moldura_codigo, 'ator', p_ator)
  );
  RETURN jsonb_build_object('acao', p_acao, 'ativa', v_depois.ativa, 'moldura', v_depois.moldura_codigo);
END;
$fn$;

REVOKE ALL ON FUNCTION public.molduras_admin_salvar(text, boolean, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.molduras_admin_salvar_acao(text, boolean, text, text) FROM PUBLIC, anon, authenticated;
"""


def _semente() -> str:
    partes: list[str] = []
    for ordem, (codigo, nome, preco) in enumerate(LOJA, start=1):
        partes.append(
            "INSERT INTO public.molduras (codigo, nome, origem, preco, ordem) "
            f"VALUES ({_q(codigo)}, {_q(nome)}, 'loja', {preco}, {ordem});"
        )
    for ordem, (codigo, nome, conquista, descricao, categoria, criterio, icone, cor) in enumerate(CONQUISTA, start=1):
        criterio_com_aparencia = {**criterio, "aparencia": {"icone": icone, "cor": cor}}
        partes.append(
            f"""
WITH c AS (
  INSERT INTO public.conquistas
    (nome, descricao, categoria, tipo, escopo, criterio, pontos_recompensa, classe_id, criado_por, ativa)
  VALUES ({_q(conquista)}, {_q(descricao + " Libera a moldura " + nome + ".")}, {_q(categoria)},
          {_q('moldura_' + codigo)}, 'comum', {_json(criterio_com_aparencia)}, 0, NULL, NULL, true)
  RETURNING id
)
INSERT INTO public.molduras (codigo, nome, origem, conquista_id, ordem)
SELECT {_q(codigo)}, {_q(nome)}, 'conquista', c.id, {ordem} FROM c;"""
        )
    for ordem, (acao, rotulo, descricao, codigo, nome) in enumerate(ACOES, start=1):
        partes.append(
            "INSERT INTO public.molduras (codigo, nome, origem, ordem) "
            f"VALUES ({_q(codigo)}, {_q(nome)}, 'acao', {ordem});"
        )
        partes.append(
            "INSERT INTO public.molduras_acoes (acao, rotulo, descricao, moldura_codigo) "
            f"VALUES ({_q(acao)}, {_q(rotulo)}, {_q(descricao)}, {_q(codigo)});"
        )
    return "\n".join(partes)


SEMENTE = _semente()

DOWNGRADE = """
DELETE FROM public.retencao_politica WHERE tabela IN ('moldura_aluno', 'moldura_acao_aluno');
DROP FUNCTION IF EXISTS public.molduras_admin_salvar_acao(text, boolean, text, text);
DROP FUNCTION IF EXISTS public.molduras_admin_salvar(text, boolean, integer, text);
DROP FUNCTION IF EXISTS public.moldura_registrar_acao(text);
DROP FUNCTION IF EXISTS public.moldura_equipar(text);
DROP FUNCTION IF EXISTS public.moldura_comprar(text);
DROP FUNCTION IF EXISTS public.molduras_catalogo();
DROP TRIGGER IF EXISTS trg_conquista_libera_moldura ON public.conquistas_aluno;
DROP TRIGGER IF EXISTS trg_alunos_moldura_equipada ON public.alunos;
DROP FUNCTION IF EXISTS public.fn_conquista_libera_moldura();
DROP FUNCTION IF EXISTS public.fn_alunos_moldura_equipada();
ALTER TABLE public.alunos DROP COLUMN IF EXISTS moldura_equipada;
DROP TABLE IF EXISTS public.moldura_acao_aluno;
DROP TABLE IF EXISTS public.molduras_acoes;
DROP TABLE IF EXISTS public.moldura_aluno;
-- As conquistas saem antes do catálogo perder a referência; quem já ganhou perde o registro junto.
DELETE FROM public.conquistas_aluno
 WHERE conquista_id IN (SELECT conquista_id FROM public.molduras WHERE conquista_id IS NOT NULL);
DELETE FROM public.conquistas
 WHERE id IN (SELECT conquista_id FROM public.molduras WHERE conquista_id IS NOT NULL);
DROP TABLE IF EXISTS public.molduras;
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(RLS)
    op.execute(RETENCAO)
    op.execute(GATILHOS)
    op.execute(FUNCOES)
    op.execute(ADMIN)
    op.execute(SEMENTE)


def downgrade() -> None:
    op.execute(DOWNGRADE)
