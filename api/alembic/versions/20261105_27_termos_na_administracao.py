"""Termos, aceites e assinaturas na Administração, e o aceite do professor passa a existir

O dono só enxergava consentimento lendo o banco, e o professor marcava "li e aceito" no cadastro
sem que nada fosse gravado: a caixinha era só uma trava do formulário.

## Aceite do professor

`consentimento_professor` segue o padrão dos outros consentimentos (`20261003_10`, `20261024_02`):
só cresce, `registrado_em` é do servidor, revogar é uma linha nova `rejected`. O cliente lê a própria
linha e nunca escreve: só `professor_registrar_aceite_termos` grava. Quem aceitou antes desta
migration não tem prova, então vai aceitar uma vez ao abrir o console.

Quando a conta do professor sai, `ON DELETE SET NULL` zera o titular e o gatilho deixa só a prova
mínima (mesmo princípio de `trg_consentimento_anonimiza`, que não serve aqui porque lê `aluno_id`).

## O que o dono faz

Nada apaga e nada reescreve prova. Gerenciar é acrescentar:

- `admin_termos` e `admin_termos_detalhe` leem a situação e o histórico;
- `professor_registrar_termo_papel` passa a aceitar o dono para aluno de qualquer turma (mesma regra e
  mesmas validações; o formulário é o mesmo). A origem diz `administracao`;
- `admin_termo_revogar` grava `rejected` com o motivo em `origem`. Serve a responsável, pesquisa e
  professor, onde a decisão tem efeito no banco: `aluno_modo_restrito`, `aluno_finalidade_permitida`,
  `trg_pesquisa_revogacao` e `professor_meu_aceite`. Termo do aluno (`consentimento_telemetria`) fica
  de fora de propósito: quem governa a coleta é o registro no aparelho, nada no banco lê essa tabela
  para decidir, e uma revogação daqui diria que parou algo que continua rodando;
- `admin_aluno_nascimento_corrigir` é a correção "com a escola" que `aluno_registrar_data_nascimento`
  promete. Ela pode tirar um menor do modo restrito, então exige motivo e deixa a data anterior em
  `aluno_nascimento_correcao`. Essa tabela é só de RPC: RLS ligada e sem policy, de propósito.

`admin_termos` e `admin_termos_detalhe` mostram nome do responsável e data de nascimento: por isso
`app_e_dono()` é a primeira instrução de cada uma.
"""

from __future__ import annotations

from alembic import op

revision = "20261105_27"
down_revision = "20261105_26"
branch_labels = None
depends_on = None

VERSAO_PROFESSOR = "2026-11-05-prof-v1"

TABELAS = r"""
CREATE TABLE public.consentimento_professor (
  id              bigserial PRIMARY KEY,
  professor_id    uuid REFERENCES public.professor(id) ON DELETE SET NULL,
  versao          text NOT NULL,
  status          text NOT NULL CHECK (status IN ('accepted', 'rejected')),
  decidido_em     timestamptz NOT NULL DEFAULT now(),
  registrado_em   timestamptz NOT NULL DEFAULT now(),
  registrado_por  uuid,
  origem          jsonb NOT NULL DEFAULT '{}'::jsonb,
  titular_hash    text,
  anonimizado_em  timestamptz,
  CONSTRAINT consentimento_professor_unico UNIQUE (professor_id, versao, decidido_em)
);
CREATE INDEX consentimento_professor_titular_idx
  ON public.consentimento_professor (professor_id, decidido_em DESC, id DESC);

CREATE TRIGGER trg_consentimento_carimbo
  BEFORE INSERT ON public.consentimento_professor
  FOR EACH ROW EXECUTE FUNCTION public.trg_consentimento_carimbo_do_servidor();

CREATE FUNCTION public.trg_consentimento_professor_anonimiza()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.titular_hash := encode(sha256(convert_to(OLD.professor_id::text, 'UTF8')), 'hex');
  NEW.anonimizado_em := now();
  NEW.origem := '{}'::jsonb;
  IF NEW.registrado_por = OLD.professor_id THEN
    NEW.registrado_por := NULL;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE EXECUTE ON FUNCTION public.trg_consentimento_professor_anonimiza() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_consentimento_professor_anonimiza
  BEFORE UPDATE OF professor_id ON public.consentimento_professor
  FOR EACH ROW
  WHEN (OLD.professor_id IS NOT NULL AND NEW.professor_id IS NULL)
  EXECUTE FUNCTION public.trg_consentimento_professor_anonimiza();

ALTER TABLE public.consentimento_professor ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consentimento_professor FROM anon, authenticated;
GRANT SELECT ON public.consentimento_professor TO authenticated;
CREATE POLICY consentimento_professor_sel ON public.consentimento_professor
  FOR SELECT TO authenticated USING (professor_id = auth.uid());

CREATE TABLE public.aluno_nascimento_correcao (
  id             bigserial PRIMARY KEY,
  aluno_id       uuid NOT NULL REFERENCES public.alunos(id) ON DELETE CASCADE,
  data_anterior  date,
  data_nova      date NOT NULL,
  motivo         text NOT NULL,
  corrigido_por  uuid,
  corrigido_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX aluno_nascimento_correcao_aluno_idx ON public.aluno_nascimento_correcao (aluno_id, corrigido_em DESC);
ALTER TABLE public.aluno_nascimento_correcao ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.aluno_nascimento_correcao FROM anon, authenticated;
"""

RETENCAO = r"""
INSERT INTO public.retencao_politica
  (tabela, acao, coluna_tempo, coluna_aluno, dias, dias_pesquisa, filtro, ajuste, ordem, categoria, motivo, revisado_em)
VALUES
  ('consentimento_professor', 'apagar', 'anonimizado_em', 'professor_id', 1826, NULL, 't.professor_id IS NULL', NULL, 120,
   'prova_consentimento', 'prova minima depois da conta apagada', DATE '2026-11-05'),
  ('aluno_nascimento_correcao', 'vida_da_conta', NULL, 'aluno_id', NULL, NULL, NULL, NULL, 0,
   'vida_da_conta', 'trilha da correcao da data de nascimento; sai com a conta', DATE '2026-11-05')
ON CONFLICT (tabela, acao) DO NOTHING;
"""

ACEITE = rf"""
CREATE FUNCTION public.consentimento_professor_versao_vigente()
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $fn$ SELECT '{VERSAO_PROFESSOR}'::text $fn$;
GRANT EXECUTE ON FUNCTION public.consentimento_professor_versao_vigente() TO authenticated;

CREATE FUNCTION public.professor_meu_aceite()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_ultimo public.consentimento_professor;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  SELECT cp.* INTO v_ultimo
    FROM public.consentimento_professor cp
   WHERE cp.professor_id = v_uid
   ORDER BY cp.decidido_em DESC, cp.id DESC
   LIMIT 1;
  RETURN jsonb_build_object(
    'versao_vigente', public.consentimento_professor_versao_vigente(),
    'vigente', coalesce(v_ultimo.status = 'accepted'
                        AND v_ultimo.versao = public.consentimento_professor_versao_vigente(), false),
    'decidido_em', v_ultimo.decidido_em);
END;
$fn$;
REVOKE ALL ON FUNCTION public.professor_meu_aceite() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professor_meu_aceite() TO authenticated;

CREATE FUNCTION public.professor_registrar_aceite_termos(p_versao text, p_origem jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.professor pr WHERE pr.id = v_uid) THEN
    RAISE EXCEPTION USING MESSAGE = 'apenas professor aceita estes termos', ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM public.consentimento_professor_versao_vigente() THEN
    RAISE EXCEPTION USING MESSAGE = 'versao dos termos desatualizada', ERRCODE = '22023';
  END IF;
  -- Reenviar o mesmo aceite não cria prova nova: o cadastro e o console podem chamar em sequência.
  IF coalesce((public.professor_meu_aceite() ->> 'vigente')::boolean, false) THEN
    RETURN public.professor_meu_aceite();
  END IF;

  INSERT INTO public.consentimento_professor (professor_id, versao, status, decidido_em, registrado_por, origem)
  VALUES (v_uid, p_versao, 'accepted', now(), v_uid, coalesce(p_origem, '{{}}'::jsonb))
  ON CONFLICT ON CONSTRAINT consentimento_professor_unico DO NOTHING;

  RETURN public.professor_meu_aceite();
END;
$fn$;
REVOKE ALL ON FUNCTION public.professor_registrar_aceite_termos(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.professor_registrar_aceite_termos(text, jsonb) TO authenticated;
"""

_FINALIDADES_VAZIAS = (
    "jsonb_build_object('camera', false, 'telemetria', false, 'emocional', false, 'mentor', false, 'pesquisa', false)"
)
_NORMALIZA = "jsonb_build_object(" + ", ".join(
    f"'{f}', coalesce((p_finalidades ->> '{f}') = 'true', false)"
    for f in ("camera", "telemetria", "emocional", "mentor", "pesquisa")
) + ")"

_PAPEL = rf"""
CREATE OR REPLACE FUNCTION public.professor_registrar_termo_papel(
  p_aluno uuid,
  p_versao text,
  p_data_assinatura date,
  p_nome_responsavel text,
  p_relacao text,
  p_finalidades jsonb,
  p_pesquisa_versao text,
  p_aceito boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_nome        text := nullif(btrim(coalesce(p_nome_responsavel, '')), '');
  v_finalidades jsonb;
  v_pesq_versao text;
  v_decidido    timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING MESSAGE = 'sessao ausente', ERRCODE = '42501';
  END IF;
  @@PROFESSOR@@
    RAISE EXCEPTION USING MESSAGE = 'apenas professor registra termo em papel', ERRCODE = '42501';
  END IF;
  -- So aluno matriculado numa turma DESTE professor.
  @@TURMA@@
    SELECT 1
      FROM public.classe_aluno ca
      JOIN public.classe c ON c.id = ca.classe_id
     WHERE ca.aluno_id = p_aluno
       AND c.professor_id = v_uid
  ) THEN
    RAISE EXCEPTION USING MESSAGE = 'aluno fora das suas turmas', ERRCODE = '42501';
  END IF;
  IF p_versao IS DISTINCT FROM public.consentimento_responsavel_versao_vigente() THEN
    RAISE EXCEPTION USING MESSAGE = 'versao do termo do responsavel desatualizada', ERRCODE = '22023';
  END IF;
  IF p_data_assinatura IS NULL
     OR p_data_assinatura > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    RAISE EXCEPTION USING MESSAGE = 'data de assinatura invalida', ERRCODE = '22008';
  END IF;
  v_decidido := (p_data_assinatura::timestamp AT TIME ZONE 'America/Sao_Paulo');

  IF coalesce(p_aceito, true) THEN
    IF v_nome IS NULL OR char_length(v_nome) < 3 OR char_length(v_nome) > 120 THEN
      RAISE EXCEPTION USING MESSAGE = 'nome do responsavel obrigatorio', ERRCODE = '22023';
    END IF;
    IF p_relacao IS NULL OR p_relacao NOT IN ('mae', 'pai', 'responsavel_legal', 'outro') THEN
      RAISE EXCEPTION USING MESSAGE = 'relacao com o aluno invalida', ERRCODE = '22023';
    END IF;
    v_finalidades := {_NORMALIZA};
    IF (v_finalidades ->> 'pesquisa') = 'true' THEN
      IF p_pesquisa_versao IS DISTINCT FROM public.consentimento_pesquisa_versao_vigente() THEN
        RAISE EXCEPTION USING MESSAGE = 'versao do termo de pesquisa desatualizada', ERRCODE = '22023';
      END IF;
      v_pesq_versao := p_pesquisa_versao;
    END IF;
  ELSE
    v_finalidades := {_FINALIDADES_VAZIAS};
  END IF;

  INSERT INTO public.consentimento_responsavel (
    aluno_id, versao, status, metodo, finalidades, pesquisa_versao,
    nome_responsavel, relacao, declaracao, decidido_em, registrado_por,
    professor_id, origem
  ) VALUES (
    p_aluno, p_versao,
    CASE WHEN coalesce(p_aceito, true) THEN 'accepted' ELSE 'rejected' END,
    'papel', v_finalidades, v_pesq_versao,
    v_nome,
    CASE WHEN p_relacao IN ('mae', 'pai', 'responsavel_legal', 'outro') THEN p_relacao END,
    false, v_decidido, v_uid, v_uid,
    jsonb_build_object('canal', @@CANAL@@)
  )
  ON CONFLICT ON CONSTRAINT consentimento_responsavel_unico DO NOTHING;

  RETURN jsonb_build_object(
    'aluno_id', p_aluno,
    'modo_restrito', public.aluno_modo_restrito(p_aluno)
  );
END;
$function$;
"""

PAPEL_COM_DONO = (
    _PAPEL.replace("@@PROFESSOR@@", "IF NOT public.app_e_dono() AND NOT EXISTS (SELECT 1 FROM public.professor pr WHERE pr.id = v_uid) THEN")
    .replace("@@TURMA@@", "IF NOT public.app_e_dono() AND NOT EXISTS (")
    .replace("@@CANAL@@", "CASE WHEN public.app_e_dono() THEN 'administracao' ELSE 'console' END")
)
PAPEL_ANTES = (
    _PAPEL.replace("@@PROFESSOR@@", "IF NOT EXISTS (SELECT 1 FROM public.professor pr WHERE pr.id = v_uid) THEN")
    .replace("@@TURMA@@", "IF NOT EXISTS (")
    .replace("@@CANAL@@", "'console'")
)

ADMIN_LER = r"""
CREATE FUNCTION public.admin_termos()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto vê os termos de todos.' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'versoes', jsonb_build_object(
      'responsavel', public.consentimento_responsavel_versao_vigente(),
      'pesquisa', public.consentimento_pesquisa_versao_vigente(),
      'professor', public.consentimento_professor_versao_vigente()),
    'alunos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'aluno_id', a.id, 'nome', a.nome, 'email', a.email,
               'idade', CASE WHEN m.menor IS NULL THEN 'desconhecida' WHEN m.menor THEN 'menor' ELSE 'maior' END,
               'modo_restrito', public.aluno_modo_restrito(a.id),
               'termo', CASE WHEN t.id IS NULL THEN NULL ELSE jsonb_build_object(
                          'status', t.status, 'versao', t.versao, 'decidido_em', t.decidido_em) END,
               'responsavel', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
                          'status', r.status, 'versao', r.versao, 'metodo', r.metodo, 'decidido_em', r.decidido_em,
                          'vigente', r.status = 'accepted' AND r.versao = public.consentimento_responsavel_versao_vigente()) END,
               'pesquisa', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
                          'status', p.status, 'versao', p.versao, 'decidido_em', p.decidido_em,
                          'vigente', p.status = 'accepted' AND p.versao = public.consentimento_pesquisa_versao_vigente()) END
             ) ORDER BY coalesce(a.nome, ''), a.id)
        FROM public.alunos a
        CROSS JOIN LATERAL (SELECT public.aluno_eh_menor(a.id) AS menor) m
        LEFT JOIN LATERAL (
          SELECT ct.id, ct.status, ct.versao, ct.decidido_em FROM public.consentimento_telemetria ct
           WHERE ct.aluno_id = a.id ORDER BY ct.decidido_em DESC, ct.id DESC LIMIT 1) t ON true
        LEFT JOIN LATERAL (
          SELECT cr.id, cr.status, cr.versao, cr.metodo, cr.decidido_em FROM public.consentimento_responsavel cr
           WHERE cr.aluno_id = a.id ORDER BY cr.decidido_em DESC, cr.id DESC LIMIT 1) r ON true
        LEFT JOIN LATERAL (
          SELECT cp.id, cp.status, cp.versao, cp.decidido_em FROM public.consentimento_pesquisa cp
           WHERE cp.aluno_id = a.id ORDER BY cp.decidido_em DESC, cp.id DESC LIMIT 1) p ON true), '[]'::jsonb),
    'professores', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'professor_id', pr.id, 'nome', pr.nome, 'email', u.email, 'instituicao', pr.instituicao,
               'liberado', pr.liberado,
               'aceite', CASE WHEN c.id IS NULL THEN NULL ELSE jsonb_build_object(
                          'status', c.status, 'versao', c.versao, 'decidido_em', c.decidido_em,
                          'vigente', c.status = 'accepted' AND c.versao = public.consentimento_professor_versao_vigente()) END
             ) ORDER BY coalesce(pr.nome, ''), pr.id)
        FROM public.professor pr
        LEFT JOIN auth.users u ON u.id = pr.id
        LEFT JOIN LATERAL (
          SELECT cp.id, cp.status, cp.versao, cp.decidido_em FROM public.consentimento_professor cp
           WHERE cp.professor_id = pr.id ORDER BY cp.decidido_em DESC, cp.id DESC LIMIT 1) c ON true), '[]'::jsonb));
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_termos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_termos() TO authenticated;

CREATE FUNCTION public.admin_termos_detalhe(p_papel text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto vê os termos de todos.' USING ERRCODE = '42501';
  END IF;
  IF p_papel = 'professor' THEN
    RETURN jsonb_build_object('aceites', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'versao', c.versao, 'status', c.status, 'decidido_em', c.decidido_em,
               'registrado_em', c.registrado_em, 'motivo', c.origem ->> 'motivo', 'canal', c.origem ->> 'canal',
               'por', q.nome
             ) ORDER BY c.decidido_em DESC, c.id DESC)
        FROM public.consentimento_professor c
        LEFT JOIN public.professor q ON q.id = c.registrado_por
       WHERE c.professor_id = p_id), '[]'::jsonb));
  END IF;
  IF p_papel IS DISTINCT FROM 'aluno' THEN
    RAISE EXCEPTION 'Papel desconhecido.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'nascimento', (
      SELECT jsonb_build_object('data', n.data_nascimento, 'registrado_em', n.registrado_em)
        FROM public.aluno_nascimento n WHERE n.aluno_id = p_id),
    'correcoes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'data_anterior', k.data_anterior, 'data_nova', k.data_nova, 'motivo', k.motivo,
               'corrigido_em', k.corrigido_em, 'por', q.nome
             ) ORDER BY k.corrigido_em DESC, k.id DESC)
        FROM public.aluno_nascimento_correcao k
        LEFT JOIN public.professor q ON q.id = k.corrigido_por
       WHERE k.aluno_id = p_id), '[]'::jsonb),
    'termos', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', t.id, 'versao', t.versao, 'status', t.status, 'decidido_em', t.decidido_em,
               'registrado_em', t.registrado_em, 'plataforma', t.origem ->> 'plataforma'
             ) ORDER BY t.decidido_em DESC, t.id DESC)
        FROM public.consentimento_telemetria t WHERE t.aluno_id = p_id), '[]'::jsonb),
    'responsavel', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', r.id, 'versao', r.versao, 'status', r.status, 'metodo', r.metodo, 'decidido_em', r.decidido_em,
               'registrado_em', r.registrado_em, 'nome', r.nome_responsavel, 'relacao', r.relacao,
               'finalidades', r.finalidades, 'motivo', r.origem ->> 'motivo', 'canal', r.origem ->> 'canal',
               'por', q.nome
             ) ORDER BY r.decidido_em DESC, r.id DESC)
        FROM public.consentimento_responsavel r
        LEFT JOIN public.professor q ON q.id = r.registrado_por
       WHERE r.aluno_id = p_id), '[]'::jsonb),
    'pesquisa', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'id', p.id, 'versao', p.versao, 'status', p.status, 'decidido_em', p.decidido_em,
               'registrado_em', p.registrado_em, 'motivo', p.origem ->> 'motivo', 'canal', p.origem ->> 'canal'
             ) ORDER BY p.decidido_em DESC, p.id DESC)
        FROM public.consentimento_pesquisa p WHERE p.aluno_id = p_id), '[]'::jsonb));
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_termos_detalhe(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_termos_detalhe(text, uuid) TO authenticated;
"""

ADMIN_GERIR = rf"""
CREATE FUNCTION public.admin_termo_revogar(p_tipo text, p_titular uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_status text;
  v_origem jsonb;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto revoga por aqui.' USING ERRCODE = '42501';
  END IF;
  IF v_motivo IS NULL OR char_length(v_motivo) < 5 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'Escreva o motivo da revogação.' USING ERRCODE = '22023';
  END IF;
  v_origem := jsonb_build_object('canal', 'administracao', 'motivo', v_motivo);

  IF p_tipo = 'responsavel' THEN
    SELECT c.status INTO v_status FROM public.consentimento_responsavel c
     WHERE c.aluno_id = p_titular ORDER BY c.decidido_em DESC, c.id DESC LIMIT 1;
  ELSIF p_tipo = 'pesquisa' THEN
    SELECT c.status INTO v_status FROM public.consentimento_pesquisa c
     WHERE c.aluno_id = p_titular ORDER BY c.decidido_em DESC, c.id DESC LIMIT 1;
  ELSIF p_tipo = 'professor' THEN
    SELECT c.status INTO v_status FROM public.consentimento_professor c
     WHERE c.professor_id = p_titular ORDER BY c.decidido_em DESC, c.id DESC LIMIT 1;
  ELSE
    RAISE EXCEPTION 'Este termo não se revoga por aqui.' USING ERRCODE = '22023';
  END IF;
  IF v_status IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'Não há aceite em vigor para revogar.' USING ERRCODE = 'P0002';
  END IF;

  IF p_tipo = 'responsavel' THEN
    INSERT INTO public.consentimento_responsavel (
      aluno_id, versao, status, metodo, finalidades, declaracao, decidido_em, registrado_por, professor_id, origem)
    VALUES (p_titular, public.consentimento_responsavel_versao_vigente(), 'rejected', 'papel',
            {_FINALIDADES_VAZIAS}, false, now(), v_uid, v_uid, v_origem);
  ELSIF p_tipo = 'pesquisa' THEN
    INSERT INTO public.consentimento_pesquisa (aluno_id, versao, status, decidido_em, origem)
    VALUES (p_titular, public.consentimento_pesquisa_versao_vigente(), 'rejected', now(), v_origem);
  ELSE
    INSERT INTO public.consentimento_professor (professor_id, versao, status, decidido_em, registrado_por, origem)
    VALUES (p_titular, public.consentimento_professor_versao_vigente(), 'rejected', now(), v_uid, v_origem);
  END IF;
  RETURN jsonb_build_object('tipo', p_tipo, 'titular', p_titular, 'revogado', true);
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_termo_revogar(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_termo_revogar(text, uuid, text) TO authenticated;

CREATE FUNCTION public.admin_aluno_nascimento_corrigir(p_aluno uuid, p_data date, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_uid    uuid := auth.uid();
  v_hoje   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_atual  date;
BEGIN
  IF NOT public.app_e_dono() THEN
    RAISE EXCEPTION 'Só o dono do projeto corrige a data de nascimento.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.alunos a WHERE a.id = p_aluno) THEN
    RAISE EXCEPTION 'Aluno não encontrado.' USING ERRCODE = 'P0002';
  END IF;
  IF v_motivo IS NULL OR char_length(v_motivo) < 5 OR char_length(v_motivo) > 500 THEN
    RAISE EXCEPTION 'Escreva o motivo da correção.' USING ERRCODE = '22023';
  END IF;
  IF p_data IS NULL OR p_data > v_hoje OR p_data < (v_hoje - INTERVAL '120 years')::date THEN
    RAISE EXCEPTION 'Data de nascimento inválida.' USING ERRCODE = '22008';
  END IF;

  SELECT n.data_nascimento INTO v_atual
    FROM public.aluno_nascimento n WHERE n.aluno_id = p_aluno FOR UPDATE;
  IF v_atual = p_data THEN
    RAISE EXCEPTION 'A data informada é a que já está registrada.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.aluno_nascimento (aluno_id, data_nascimento, registrado_por)
  VALUES (p_aluno, p_data, v_uid)
  ON CONFLICT (aluno_id) DO UPDATE
    SET data_nascimento = EXCLUDED.data_nascimento, registrado_por = EXCLUDED.registrado_por, registrado_em = now();
  INSERT INTO public.aluno_nascimento_correcao (aluno_id, data_anterior, data_nova, motivo, corrigido_por)
  VALUES (p_aluno, v_atual, p_data, v_motivo, v_uid);

  RETURN jsonb_build_object('aluno_id', p_aluno, 'modo_restrito', public.aluno_modo_restrito(p_aluno));
END;
$fn$;
REVOKE ALL ON FUNCTION public.admin_aluno_nascimento_corrigir(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_aluno_nascimento_corrigir(uuid, date, text) TO authenticated;
"""


def upgrade() -> None:
    op.execute(TABELAS)
    op.execute(RETENCAO)
    op.execute(ACEITE)
    op.execute(PAPEL_COM_DONO)
    op.execute(ADMIN_LER)
    op.execute(ADMIN_GERIR)


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.admin_aluno_nascimento_corrigir(uuid, date, text)")
    op.execute("DROP FUNCTION IF EXISTS public.admin_termo_revogar(text, uuid, text)")
    op.execute("DROP FUNCTION IF EXISTS public.admin_termos_detalhe(text, uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.admin_termos()")
    op.execute(PAPEL_ANTES)
    op.execute("DROP FUNCTION IF EXISTS public.professor_registrar_aceite_termos(text, jsonb)")
    op.execute("DROP FUNCTION IF EXISTS public.professor_meu_aceite()")
    op.execute("DROP FUNCTION IF EXISTS public.consentimento_professor_versao_vigente()")
    op.execute(
        "DELETE FROM public.retencao_politica"
        " WHERE tabela IN ('consentimento_professor', 'aluno_nascimento_correcao')"
    )
    op.execute("DROP TABLE IF EXISTS public.aluno_nascimento_correcao")
    op.execute("DROP TABLE IF EXISTS public.consentimento_professor")
    op.execute("DROP FUNCTION IF EXISTS public.trg_consentimento_professor_anonimiza()")
