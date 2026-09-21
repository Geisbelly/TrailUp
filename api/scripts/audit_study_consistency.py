"""Read-only study audit, with canonical recalculation always rolled back."""
import argparse
import json

from sqlalchemy import create_engine, text

from app.core.settings import get_settings
from app.db.migrations import normalize_database_url_for_alembic


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--aluno', required=True)
    parser.add_argument('--classe', type=int, required=True)
    parser.add_argument('--graph-json', action='store_true', help='Export only non-sensitive graph fields for the mobile unlock checker')
    args = parser.parse_args()
    settings = get_settings()
    engine = create_engine(normalize_database_url_for_alembic(settings.alembic_database_url or settings.database_url))
    params = {'uid': args.aluno, 'classe': args.classe}
    with engine.connect() as conn:
        tx = conn.begin()
        try:
            if args.graph_json:
                rows = conn.execute(text('''SELECT t.id,t.ordem,t.depende,t.next,
                    coalesce(ta.percentual_concluido,0) AS percentual_concluido
                    FROM topicos t LEFT JOIN topico_aluno ta ON ta.topico_id=t.id AND ta.aluno_id=CAST(:uid AS uuid)
                    WHERE t.classe_id=:classe ORDER BY t.ordem,t.id'''),params).mappings()
                print(json.dumps({'topicos':[dict(row) for row in rows]},default=float))
                return
            print('migration:', conn.execute(text('SELECT version_num FROM alembic_version')).scalar_one())
            print('class_progress:', conn.execute(text("SELECT coalesce(to_jsonb(ca)->>'porcentagemConcluida',to_jsonb(ca)->>'porcentagemconcluida') FROM classe_aluno ca WHERE aluno_id=CAST(:uid AS uuid) AND classe_id=:classe"),params).scalar_one())
            for row in conn.execute(text('''
                SELECT t.id, ta.percentual_concluido, ta.tempo_gasto_min,
                  coalesce(tm.active_min,0) AS telemetry_active_min,
                  coalesce(tm.dwell_min,0) AS telemetry_dwell_min, tm.entries,
                  tm.last_entry
                FROM topicos t LEFT JOIN topico_aluno ta ON ta.topico_id=t.id AND ta.aluno_id=CAST(:uid AS uuid)
                LEFT JOIN LATERAL (
                  SELECT count(*) AS entries, round(sum(active_sec)/60,4) AS active_min,
                    round(sum(dwell_sec)/60,4) AS dwell_min, max(captured_at) AS last_entry
                  FROM telemetria_time_metric_entries WHERE topico_id=t.id AND aluno_id=CAST(:uid AS uuid) AND scope='topic'
                ) tm ON true WHERE t.classe_id=:classe ORDER BY t.id
            '''), params).mappings():
                print('topic:', dict(row))
            for row in conn.execute(text('''
                SELECT a.id, a.topico_id, a.tipo, aa.percentual_concluido,
                  count(q.id) AS questions, count(last_answer.questao_id) AS answered,
                  min(last_answer.criado_em) AS first_answer, max(last_answer.criado_em) AS last_answer
                FROM atividades a JOIN topicos t ON t.id=a.topico_id
                LEFT JOIN atividade_aluno aa ON aa.atividade_id=a.id AND aa.aluno_id=CAST(:uid AS uuid)
                LEFT JOIN questoes q ON q.atividade_id=a.id
                LEFT JOIN LATERAL (
                  SELECT qa.questao_id, qa.criado_em FROM questao_aluno qa
                  WHERE qa.aluno_id=CAST(:uid AS uuid) AND qa.atividade_id=a.id AND qa.questao_id=q.id
                    AND nullif(btrim(qa.resposta),'') IS NOT NULL
                  ORDER BY qa.tentativa DESC LIMIT 1
                ) last_answer ON true
                WHERE t.classe_id=:classe
                GROUP BY a.id, a.topico_id, a.tipo, aa.percentual_concluido
                HAVING coalesce(aa.percentual_concluido,0)<100 AND count(last_answer.questao_id)>0
                ORDER BY a.id
            '''), params).mappings():
                print('answered_but_incomplete:', dict(row))
            conn.execute(text('SELECT trailup_recalcular_topico_aluno(CAST(:uid AS uuid), id) FROM topicos WHERE classe_id=:classe'), params)
            conn.execute(text('SELECT trailup_recalcular_classe_aluno(CAST(:uid AS uuid), :classe)'), params)
            for row in conn.execute(text('SELECT ta.topico_id, ta.percentual_concluido FROM topico_aluno ta JOIN topicos t ON t.id=ta.topico_id WHERE ta.aluno_id=CAST(:uid AS uuid) AND t.classe_id=:classe ORDER BY ta.topico_id'), params).mappings():
                print('recalculated_rollback:', dict(row))
        finally:
            tx.rollback()
            if not args.graph_json:
                print('rolled_back: true')


if __name__ == '__main__':
    main()
