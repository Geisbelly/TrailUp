-- Auditoria: funcao SECURITY DEFINER exposta ao cliente sem conferir a sessao.
--
-- `api/tests/test_definer_exposto_sem_sessao.py` roda esta mesma regra no CI,
-- lendo as MIGRACOES. Ele cobre o caminho revisado e so ele.
--
-- Este arquivo cobre a outra metade: funcao criada direto no painel do
-- Supabase, que nao passa pelo Alembic (ver
-- docs/architecture/schema-nao-versionado.md). Foi de la que vieram
-- `fn_questao_gabarito_em_texto` e `social_presenca_turma`. O CI nao tem banco,
-- entao isto roda na mao -- antes de um deploy, ou quando alguem mexer no
-- schema pelo painel.
--
-- Como rodar: cole no SQL Editor do Supabase, ou
--   psql "$DATABASE_URL" -f scripts/auditoria_definer.sql
--
-- IMPORTANTE: linha de saida NAO e "funcao quebrada". E "funcao a explicar".
-- A regra olha se o CORPO cita `auth.uid()`/`auth.jwt()`, entao quem confere
-- por delegacao aparece aqui como falso positivo -- `guilda_configurar_turma`,
-- por exemplo, usa `app_classes_do_professor()`, que olha a sessao por dentro.
--
-- Isso e de proposito. Aqui quem le e gente: falso positivo custa dez segundos
-- de leitura, falso negativo esconde vazamento. O portao do CI
-- (`test_definer_exposto_sem_sessao.py`) faz o contrario -- la a delegacao
-- entra numa lista escrita, porque teste que grita errado ninguem respeita.
--
-- Use as colunas para triar:
--   `em_policy` ou `em_view` > 0  -> NAO revogue. A avaliacao roda com o papel
--                                    de quem consulta e passaria a dar 42501.
--   `chamadores` so com (DEFINER) -> revogar e a saida segura: eles seguem
--                                    rodando como postgres.
--   `chamadores` com (INVOKER)    -> revogar quebra o chamador.
--   `chamadores` = '-'            -> ninguem chama de dentro; e endpoint puro.
--
-- Para cada linha, uma destas tres:
--   1. usar auth.uid()/auth.jwt() no corpo;
--   2. REVOKE EXECUTE de authenticated e anon, se so outra funcao chama;
--   3. registrar a decisao -- em SEM_SESSAO_POR_DECISAO no teste, se ela
--      tambem nasce de migracao, ou num comentario COMMENT ON FUNCTION.

WITH expostas AS (
  SELECT p.oid, p.proname,
         pg_get_function_identity_arguments(p.oid) AS argumentos,
         p.prosrc,
         obj_description(p.oid, 'pg_proc') AS comentario
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosecdef                                        -- SECURITY DEFINER
     AND p.prokind = 'f'
     AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE'))
)
SELECT e.proname                                   AS funcao,
       e.argumentos,
       has_function_privilege('anon', e.oid, 'EXECUTE')          AS anon_chama,
       has_function_privilege('authenticated', e.oid, 'EXECUTE') AS authenticated_chama,
       -- Quem chama de dentro: se so houver chamador DEFINER, revogar e a
       -- saida mais segura (nao ha predicado a errar).
       (SELECT coalesce(string_agg(c.proname || CASE WHEN c.prosecdef THEN ' (DEFINER)' ELSE ' (INVOKER)' END, ', '), '-')
          FROM pg_proc c JOIN pg_namespace cn ON cn.oid = c.pronamespace
         WHERE cn.nspname = 'public' AND c.proname <> e.proname
           AND c.prosrc ~ ('\m' || e.proname || '\M'))          AS chamadores_internos,
       -- Usada em policy ou view? Entao NAO revogue: a avaliacao roda com o
       -- papel de quem consulta e passaria a dar permission denied.
       (SELECT count(*) FROM pg_policy po JOIN pg_class pc ON pc.oid = po.polrelid
          JOIN pg_namespace pn ON pn.oid = pc.relnamespace
         WHERE pn.nspname = 'public'
           AND (coalesce(pg_get_expr(po.polqual, po.polrelid), '') ||
                coalesce(pg_get_expr(po.polwithcheck, po.polrelid), '')) ~ ('\m' || e.proname || '\M')) AS em_policy,
       (SELECT count(*) FROM pg_views v
         WHERE v.schemaname = 'public' AND v.definition ~ ('\m' || e.proname || '\M')) AS em_view,
       coalesce(e.comentario, '(sem COMMENT ON FUNCTION explicando)') AS decisao_registrada
  FROM expostas e
 WHERE e.prosrc !~ 'auth\.uid\(\)'
   AND e.prosrc !~ 'auth\.jwt\(\)'
 ORDER BY 1;
