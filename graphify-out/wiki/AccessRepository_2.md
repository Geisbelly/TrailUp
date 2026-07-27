# AccessRepository

> God node · 52 connections · `api/app/repositories/access.py`

**Community:** [AccessRepository](AccessRepository.md)

## Connections by Relation

### calls
- personalizar() `EXTRACTED`
- conversar_com_mentor_personalizacao() `EXTRACTED`
- upload_fontes_personalizacao() `EXTRACTED`
- upsert_progresso_personalizado() `EXTRACTED`
- listar_personalizacoes_por_perfil() `EXTRACTED`
- ensure_professor_access() `EXTRACTED`
- criar_job_enrollment() `EXTRACTED`
- criar_job_class_delta() `EXTRACTED`
- criar_job_class_theme() `EXTRACTED`
- criar_job_student_cleanup() `EXTRACTED`
- criar_job_full_sync() `EXTRACTED`
- obter_job_personalizacao() `EXTRACTED`
- atualizar_liberacao_professor() `EXTRACTED`
- atualizar_acesso_aluno_professor() `EXTRACTED`
- obter_adequacao_grupo() `EXTRACTED`
- listar_jobs_personalizacao() `EXTRACTED`
- _load_dashboard() `EXTRACTED`
- test_access_repository_admin_queries_and_updates() `EXTRACTED`

### contains
- access.py `EXTRACTED`

### imports
- [v1/personalizacao.py](v1-personalizacao.py.md) `EXTRACTED`
- [test_api.py](test_api.py.md) `EXTRACTED`
- [test_repositories.py](test_repositories.py.md) `EXTRACTED`
- deps.py `EXTRACTED`
- v1/admin.py `EXTRACTED`
- api/admin.py `EXTRACTED`
- auth.py `EXTRACTED`

### method
- .__init__() `EXTRACTED`
- .resolve_user_identity() `EXTRACTED`
- .resolve_user_role() `EXTRACTED`
- .aluno_belongs_to_classe() `EXTRACTED`
- .aluno_exists() `EXTRACTED`
- .get_professor_access() `EXTRACTED`
- .get_professor_profile() `EXTRACTED`
- .list_accessible_students() `EXTRACTED`
- .list_admin_professors() `EXTRACTED`
- .list_admin_students() `EXTRACTED`
- .list_direct_professor_assignments() `EXTRACTED`
- .professor_can_access() `EXTRACTED`
- .professor_exists() `EXTRACTED`
- .professor_owns_classe() `EXTRACTED`
- .set_professor_liberado() `EXTRACTED`
- .set_professor_student_access() `EXTRACTED`

### references
- .__init__() `EXTRACTED`

### uses
- RecordingSession `INFERRED`
- MappingResult `INFERRED`
- ScalarResult `INFERRED`
- [UserContext](UserContext.md) `INFERRED`
- AuthService `INFERRED`
- MappingRows `INFERRED`
- DummyResult `INFERRED`
- FakeRow `INFERRED`
- AdminContext `INFERRED`

---

*Part of the graphify knowledge wiki. See [index](index.md) to navigate.*