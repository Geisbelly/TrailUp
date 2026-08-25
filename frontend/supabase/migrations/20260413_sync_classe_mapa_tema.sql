-- Classe mapa tema: tabela + trigger para enfileirar job de sincronizacao na API

create extension if not exists pgcrypto;

create table if not exists public.classe_mapa_tema (
  classe_id bigint not null,
  world_name text not null,
  world_subtitle text null,
  world_description text null,
  template_id text null,
  palette jsonb not null default '{}'::jsonb,
  countries jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classe_mapa_tema_pkey primary key (classe_id),
  constraint classe_mapa_tema_classe_id_fkey
    foreign key (classe_id) references public.classe(id) on delete cascade
);

create or replace function public.fn_enqueue_classe_mapa_tema_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_payload jsonb;
  v_has_jobs_table boolean;
begin
  select exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'personalizacao_jobs'
  ) into v_has_jobs_table;

  if not v_has_jobs_table then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.descricao is not distinct from old.descricao
     and new.materia_id is not distinct from old.materia_id then
    return new;
  end if;

  v_payload := jsonb_build_object(
    'event', lower(tg_op),
    'classe_id', new.id,
    'classe_descricao', new.descricao,
    'materia_id', new.materia_id,
    'changed_at', now(),
    'changed_fields', case
      when tg_op = 'UPDATE' then (
        select coalesce(jsonb_agg(field_name), '[]'::jsonb)
        from (
          select 'descricao' as field_name
          where new.descricao is distinct from old.descricao
          union all
          select 'materia_id' as field_name
          where new.materia_id is distinct from old.materia_id
        ) s
      )
      else '[]'::jsonb
    end,
    'old', case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    'new', to_jsonb(new)
  );

  select id
    into v_job_id
  from personalizacao_jobs
  where kind = 'class_theme_sync'
    and classe_id = new.id
    and status in ('pending', 'processing', 'partial')
  order by created_at desc
  limit 1;

  if v_job_id is not null then
    update personalizacao_jobs
       set payload = coalesce(payload, '{}'::jsonb) || v_payload,
           updated_at = now(),
           trigger_source = 'db_classe_trigger'
     where id = v_job_id;
    return new;
  end if;

  insert into personalizacao_jobs (
    id,
    kind,
    status,
    classe_id,
    aluno_id,
    topico_id,
    conteudo_id,
    trigger_source,
    payload,
    total_targets,
    processed_targets,
    error_count,
    last_error,
    created_at,
    updated_at,
    started_at,
    finished_at
  ) values (
    gen_random_uuid(),
    'class_theme_sync',
    'pending',
    new.id,
    null,
    null,
    null,
    'db_classe_trigger',
    v_payload,
    0,
    0,
    0,
    null,
    now(),
    now(),
    null,
    null
  );

  return new;
exception
  when others then
    raise notice 'fn_enqueue_classe_mapa_tema_job falhou: %', sqlerrm;
    return new;
end;
$$;

drop trigger if exists trg_classe_mapa_tema_job on public.classe;
create trigger trg_classe_mapa_tema_job
after insert or update of descricao, materia_id
on public.classe
for each row
execute function public.fn_enqueue_classe_mapa_tema_job();

