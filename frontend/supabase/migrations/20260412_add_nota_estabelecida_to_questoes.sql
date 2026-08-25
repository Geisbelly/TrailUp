alter table public.questoes
add column if not exists nota_estabelecida numeric(10,2) not null default 1;

comment on column public.questoes.nota_estabelecida
is 'Nota/peso da questão definido pelo professor.';
