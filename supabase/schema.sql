-- Execute no SQL Editor do Supabase. Nao coloque dados de restaurantes ou segredos neste arquivo.
create extension if not exists pgcrypto;
create type public.access_status as enum ('pending','approved','rejected');
create type public.app_role as enum ('admin','gerente','cliente');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  requested_role public.app_role not null default 'cliente',
  role public.app_role not null default 'cliente',
  request_reason text,
  status public.access_status not null default 'pending',
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id)
);
create table public.records (
  id uuid primary key default gen_random_uuid(),
  title text not null check(length(title)<=120),
  description text check(length(description)<=1000),
  status text not null default 'ativo',
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id),
  action text not null,
  details text,
  created_at timestamptz not null default now()
);


-- Permissoes explicitas porque "Expor automaticamente novas tabelas" esta desativado.
-- Visitantes anonimos nao recebem acesso as tabelas.
revoke all on table public.profiles from anon;
revoke all on table public.records from anon;
revoke all on table public.audit_log from anon;

grant select on table public.profiles to authenticated;
grant select, insert, delete on table public.records to authenticated;
grant select on table public.audit_log to authenticated;
grant usage, select on sequence public.audit_log_id_seq to authenticated;

alter table public.profiles enable row level security;
alter table public.records enable row level security;
alter table public.audit_log enable row level security;

create or replace function public.is_approved() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and status='approved')$$;
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from profiles where id=auth.uid() and status='approved' and role='admin')$$;

create policy "own profile or admin read" on profiles for select to authenticated using(id=auth.uid() or is_admin());
create policy "approved read records" on records for select to authenticated using(is_approved());
create policy "approved insert records" on records for insert to authenticated with check(is_approved() and created_by=auth.uid());
create policy "manager delete records" on records for delete to authenticated using(is_approved() and exists(select 1 from profiles where id=auth.uid() and role in ('admin','gerente')));
create policy "approved audit read" on audit_log for select to authenticated using(is_approved());

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into profiles(id,email,full_name,requested_role,role,request_reason)
 values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name','Novo usuario'),coalesce((new.raw_user_meta_data->>'requested_role')::app_role,'cliente'),coalesce((new.raw_user_meta_data->>'requested_role')::app_role,'cliente'),new.raw_user_meta_data->>'reason');
 insert into audit_log(actor_id,action,details) values(new.id,'Solicitacao de acesso','Cadastro pendente criado');
 return new;
end$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

create or replace function public.decide_access(target_user uuid,new_status access_status) returns void language plpgsql security definer set search_path=public as $$
declare requested app_role; begin
 if not is_admin() then raise exception 'Apenas administradores podem autorizar'; end if;
 select requested_role into requested from profiles where id=target_user;
 update profiles set status=new_status,role=case when new_status='approved' then requested else role end,approved_at=case when new_status='approved' then now() else null end,approved_by=auth.uid() where id=target_user;
 insert into audit_log(actor_id,action,details) values(auth.uid(),'Decisao de acesso',new_status::text||' para '||target_user::text);
end$$;
grant execute on function public.decide_access(uuid,access_status) to authenticated;

create or replace function public.audit_records() returns trigger language plpgsql security definer set search_path=public as $$begin insert into audit_log(actor_id,action,details) values(auth.uid(),tg_op||' registro',coalesce(new.title,old.title));return coalesce(new,old);end$$;
create trigger records_audit after insert or update or delete on records for each row execute function audit_records();

-- Realtime
alter publication supabase_realtime add table public.records;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.audit_log;

-- DEPOIS de criar sua propria conta pelo formulario, promova-a manualmente no SQL Editor:
-- update public.profiles set status='approved', role='admin' where email='SEU_EMAIL_DE_ADMIN';
