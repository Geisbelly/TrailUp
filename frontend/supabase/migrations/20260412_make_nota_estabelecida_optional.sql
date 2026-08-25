alter table if exists public.questoes
add column if not exists nota_estabelecida numeric(10,2);

alter table if exists public.questoes
alter column nota_estabelecida drop default,
alter column nota_estabelecida drop not null;

comment on column public.questoes.nota_estabelecida
is 'Nota/peso da questao definido pelo professor. Opcional; NULL indica sem nota definida.';
