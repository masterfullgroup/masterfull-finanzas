-- Masterfull Finanzas: ejecutar una sola vez en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.personas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null, relacion text not null default 'TITULAR', email text, telefono text, color text default '#315efb', created_at timestamptz default now()
);
create table if not exists public.propietarios (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null check(char_length(trim(nombre)) between 1 and 80), tipo text not null default 'PERSONA' check(tipo in ('PERSONA','EMPRESA','COMPARTIDA')),
 color text default '#315efb', icono text default 'PERSONA', estado text not null default 'ACTIVO' check(estado in ('ACTIVO','INACTIVO')),
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists propietarios_user_nombre_uidx on public.propietarios(user_id,lower(trim(nombre)));
create table if not exists public.instituciones (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
 nombre text not null, tipo text not null check(tipo in ('BANCO','CAJA','FINANCIERA','BILLETERA_DIGITAL','COOPERATIVA','OTRA')),
 pais text not null default 'PE', logo_url text, color text default '#315efb', estado text not null default 'ACTIVO' check(estado in ('ACTIVO','INACTIVO')),
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists instituciones_global_nombre_uidx on public.instituciones(lower(trim(nombre))) where user_id is null;
create table if not exists public.tipos_cuenta (
 id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade,
 codigo text not null, nombre text not null, naturaleza text not null check(naturaleza in ('ACTIVO','PASIVO')),
 icono text default 'CAJA', color text default '#315efb', orden smallint not null default 0,
 estado text not null default 'ACTIVO' check(estado in ('ACTIVO','INACTIVO')),
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists tipos_cuenta_global_codigo_uidx on public.tipos_cuenta(lower(trim(codigo))) where user_id is null;
create unique index if not exists tipos_cuenta_user_codigo_uidx on public.tipos_cuenta(user_id,lower(trim(codigo))) where user_id is not null;
create table if not exists public.cuentas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 propietario_id uuid not null references public.propietarios(id) on delete restrict, nombre text not null, tipo text not null,
 tipo_cuenta_id uuid references public.tipos_cuenta(id) on delete restrict,
 institucion_id uuid references public.instituciones(id) on delete restrict, naturaleza text not null default 'ACTIVO' check(naturaleza in ('ACTIVO','PASIVO')),
 saldo_inicial numeric(14,2) not null default 0 check(saldo_inicial>=0), moneda text not null default 'PEN', fecha_saldo_inicial date not null default current_date,
 color text default '#315efb', icono text default 'CAJA', descripcion text, estado text not null default 'ACTIVA' check(estado in ('ACTIVA','INACTIVA','ARCHIVADA')),
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create table if not exists public.categorias (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null, tipo text not null check(tipo in ('INGRESO','GASTO')), color text default '#315efb', created_at timestamptz default now(), unique(user_id,nombre,tipo)
);
create table if not exists public.tarjetas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 tipo text not null default 'CREDITO' check(tipo in ('CREDITO','DEBITO')), nombre text not null, entidad text not null,
 cuenta_id uuid references public.cuentas(id) on delete restrict, linea_credito numeric(14,2) check(linea_credito>0), saldo_inicial_usado numeric(14,2) default 0 check(saldo_inicial_usado>=0), dia_cierre smallint check(dia_cierre between 1 and 31), dia_pago smallint check(dia_pago between 1 and 31), created_at timestamptz default now()
);
create table if not exists public.movimientos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 persona_id uuid references public.personas(id) on delete set null, cuenta_id uuid references public.cuentas(id) on delete restrict,
 categoria_id uuid not null references public.categorias(id) on delete restrict, tipo text not null check(tipo in ('INGRESO','GASTO')),
 tarjeta_id uuid references public.tarjetas(id) on delete restrict, monto numeric(14,2) not null check(monto>0), fecha date not null, medio_pago text default 'EFECTIVO', numero_cuotas smallint not null default 1 check(numero_cuotas between 1 and 48), descripcion text, notas text,
 created_at timestamptz default now()
);
create table if not exists public.presupuestos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 categoria_id uuid not null references public.categorias(id) on delete cascade, mes date not null, limite numeric(14,2) not null check(limite>0), created_at timestamptz default now(), unique(user_id,categoria_id,mes)
);
create table if not exists public.metas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null, monto_objetivo numeric(14,2) not null check(monto_objetivo>0), monto_actual numeric(14,2) default 0 check(monto_actual>=0), fecha_objetivo date, created_at timestamptz default now()
);
create table if not exists public.deudas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 acreedor text not null, descripcion text, monto_total numeric(14,2) not null check(monto_total>0), monto_pagado numeric(14,2) default 0 check(monto_pagado>=0), fecha_vencimiento date, estado text default 'PENDIENTE' check(estado in ('PENDIENTE','PAGADA')), created_at timestamptz default now()
);
create table if not exists public.recurrentes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null, servicio text not null, categoria_id uuid references public.categorias(id) on delete restrict,
 monto_estimado numeric(14,2) not null check(monto_estimado>0), frecuencia text default 'MENSUAL', proxima_fecha date not null, created_at timestamptz default now()
);

-- Actualización idempotente para instalaciones que ya tienen datos.
alter table public.cuentas add column if not exists propietario_id uuid references public.propietarios(id) on delete restrict;
alter table public.cuentas add column if not exists institucion_id uuid references public.instituciones(id) on delete restrict;
alter table public.cuentas add column if not exists naturaleza text not null default 'ACTIVO' check(naturaleza in ('ACTIVO','PASIVO'));
alter table public.cuentas add column if not exists fecha_saldo_inicial date not null default current_date;
alter table public.cuentas add column if not exists color text default '#315efb';
alter table public.cuentas add column if not exists icono text default 'CAJA';
alter table public.cuentas add column if not exists descripcion text;
alter table public.cuentas add column if not exists estado text not null default 'ACTIVA' check(estado in ('ACTIVA','INACTIVA','ARCHIVADA'));
alter table public.cuentas add column if not exists updated_at timestamptz default now();
update public.cuentas set tipo='BILLETERA_DIGITAL' where tipo='BILLETERA';
update public.cuentas set naturaleza=case when tipo in ('TARJETA_DE_CREDITO','PRESTAMO','CREDITO') then 'PASIVO' else 'ACTIVO' end;
insert into public.propietarios(user_id,nombre,tipo,color,icono,estado)
select distinct c.user_id,'Por asignar','PERSONA','#64748b','PERSONA','ACTIVO' from public.cuentas c
where c.propietario_id is null and not exists(select 1 from public.propietarios p where p.user_id=c.user_id and lower(trim(p.nombre))='por asignar');
update public.cuentas c set propietario_id=p.id from public.propietarios p where c.propietario_id is null and p.user_id=c.user_id and lower(trim(p.nombre))='por asignar';
alter table public.cuentas alter column propietario_id set not null;
alter table public.tarjetas add column if not exists tipo text not null default 'CREDITO' check(tipo in ('CREDITO','DEBITO'));
alter table public.tarjetas add column if not exists cuenta_id uuid references public.cuentas(id) on delete restrict;
alter table public.tarjetas alter column linea_credito drop not null;
alter table public.movimientos add column if not exists tarjeta_id uuid references public.tarjetas(id) on delete restrict;
alter table public.movimientos add column if not exists numero_cuotas smallint not null default 1 check(numero_cuotas between 1 and 48);

insert into public.instituciones(id,user_id,nombre,tipo,pais,color,estado) values
 ('10000000-0000-0000-0000-000000000001',null,'BCP','BANCO','PE','#0055a5','ACTIVO'),
 ('10000000-0000-0000-0000-000000000002',null,'BBVA','BANCO','PE','#004481','ACTIVO'),
 ('10000000-0000-0000-0000-000000000003',null,'Interbank','BANCO','PE','#009b3a','ACTIVO'),
 ('10000000-0000-0000-0000-000000000004',null,'Scotiabank','BANCO','PE','#ec111a','ACTIVO'),
 ('10000000-0000-0000-0000-000000000005',null,'Banco de la Nación','BANCO','PE','#8b1d41','ACTIVO'),
 ('10000000-0000-0000-0000-000000000006',null,'BanBif','BANCO','PE','#f58220','ACTIVO'),
 ('10000000-0000-0000-0000-000000000007',null,'Banco Pichincha','BANCO','PE','#ffdd00','ACTIVO'),
 ('10000000-0000-0000-0000-000000000008',null,'Mibanco','BANCO','PE','#f59e0b','ACTIVO'),
 ('10000000-0000-0000-0000-000000000009',null,'Caja Arequipa','CAJA','PE','#dc2626','ACTIVO'),
 ('10000000-0000-0000-0000-000000000010',null,'Caja Huancayo','CAJA','PE','#2563eb','ACTIVO'),
 ('10000000-0000-0000-0000-000000000011',null,'Caja Piura','CAJA','PE','#0f766e','ACTIVO'),
 ('10000000-0000-0000-0000-000000000012',null,'Financiera Oh!','FINANCIERA','PE','#e11d48','ACTIVO'),
 ('10000000-0000-0000-0000-000000000013',null,'Banco Falabella','BANCO','PE','#16a34a','ACTIVO'),
 ('10000000-0000-0000-0000-000000000014',null,'Banco Ripley','BANCO','PE','#7c3aed','ACTIVO'),
 ('10000000-0000-0000-0000-000000000015',null,'Yape','BILLETERA_DIGITAL','PE','#742284','ACTIVO'),
 ('10000000-0000-0000-0000-000000000016',null,'Plin','BILLETERA_DIGITAL','PE','#00a9e0','ACTIVO'),
 ('10000000-0000-0000-0000-000000000017',null,'PayPal','BILLETERA_DIGITAL','OTRO','#003087','ACTIVO'),
 ('10000000-0000-0000-0000-000000000018',null,'Mercado Pago','BILLETERA_DIGITAL','OTRO','#009ee3','ACTIVO')
on conflict do nothing;

create or replace function public.validar_cuenta_duplicada() returns trigger language plpgsql as $$
begin
 if not exists(select 1 from public.propietarios p where p.id=new.propietario_id and p.user_id=new.user_id and p.estado='ACTIVO') then raise exception 'El propietario no pertenece al espacio de trabajo o está inactivo.'; end if;
 if new.institucion_id is not null and not exists(select 1 from public.instituciones i where i.id=new.institucion_id and (i.user_id is null or i.user_id=new.user_id) and i.estado='ACTIVO') then raise exception 'La institución no está disponible para este espacio de trabajo.'; end if;
 if exists(select 1 from public.cuentas c where c.user_id=new.user_id and c.propietario_id=new.propietario_id and lower(trim(c.nombre))=lower(trim(new.nombre)) and coalesce(c.institucion_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(new.institucion_id,'00000000-0000-0000-0000-000000000000'::uuid) and c.moneda=new.moneda and c.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)) then raise exception 'Ya existe una cuenta con el mismo propietario, alias, institución y moneda.'; end if;
 return new;
end $$;
drop trigger if exists cuentas_evitar_duplicados on public.cuentas;
create trigger cuentas_evitar_duplicados before insert or update on public.cuentas for each row execute function public.validar_cuenta_duplicada();

-- RLS impide que un usuario consulte o modifique registros de otro usuario.
do $$ declare t text; begin
 foreach t in array array['personas','propietarios','instituciones','cuentas','categorias','tarjetas','movimientos','presupuestos','metas','deudas','recurrentes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists "Registros propios" on public.%I',t);
  execute format('create policy "Registros propios" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t);
 end loop;
end $$;

drop policy if exists "Catálogo de instituciones" on public.instituciones;
create policy "Catálogo de instituciones" on public.instituciones for select to authenticated using(user_id is null or auth.uid()=user_id);

create index if not exists movimientos_user_fecha_idx on public.movimientos(user_id,fecha desc);
create index if not exists movimientos_categoria_idx on public.movimientos(categoria_id);
create index if not exists movimientos_cuenta_idx on public.movimientos(cuenta_id);
create index if not exists cuentas_user_propietario_idx on public.cuentas(user_id,propietario_id);
create index if not exists cuentas_user_estado_idx on public.cuentas(user_id,estado);

-- INICIO MIGRACION SEGURA: CUENTAS, PROPIETARIOS, TIPOS E INSTITUCIONES
-- Este bloque puede copiarse de forma independiente al SQL Editor de Supabase.
begin;

create extension if not exists pgcrypto;

create table if not exists public.propietarios (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null check(char_length(trim(nombre)) between 1 and 80),
 tipo text not null default 'PERSONA' check(tipo in ('PERSONA','EMPRESA','COMPARTIDA')),
 color text default '#315efb', icono text default 'PERSONA',
 estado text not null default 'ACTIVO' check(estado in ('ACTIVO','INACTIVO')),
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists propietarios_user_nombre_uidx
 on public.propietarios(user_id,lower(trim(nombre)));

create table if not exists public.instituciones (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete cascade,
 nombre text not null,
 tipo text not null check(tipo in ('BANCO','CAJA','FINANCIERA','BILLETERA_DIGITAL','COOPERATIVA','OTRA')),
 pais text not null default 'PE', logo_url text, color text default '#315efb',
 estado text not null default 'ACTIVO' check(estado in ('ACTIVO','INACTIVO')),
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists instituciones_global_nombre_uidx
 on public.instituciones(lower(trim(nombre))) where user_id is null;

create table if not exists public.tipos_cuenta (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete cascade,
 codigo text not null, nombre text not null,
 naturaleza text not null check(naturaleza in ('ACTIVO','PASIVO')),
 icono text default 'CAJA', color text default '#315efb', orden smallint not null default 0,
 estado text not null default 'ACTIVO' check(estado in ('ACTIVO','INACTIVO')),
 created_at timestamptz default now(), updated_at timestamptz default now()
);
create unique index if not exists tipos_cuenta_global_codigo_uidx
 on public.tipos_cuenta(lower(trim(codigo))) where user_id is null;
create unique index if not exists tipos_cuenta_user_codigo_uidx
 on public.tipos_cuenta(user_id,lower(trim(codigo))) where user_id is not null;

insert into public.tipos_cuenta(id,user_id,codigo,nombre,naturaleza,icono,color,orden,estado) values
 ('20000000-0000-0000-0000-000000000001',null,'EFECTIVO','Efectivo','ACTIVO','EFECTIVO','#16a34a',10,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000002',null,'BANCO','Cuenta bancaria','ACTIVO','BANCO','#2563eb',20,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000003',null,'YAPE','Yape','ACTIVO','BILLETERA','#742284',30,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000004',null,'PLIN','Plin','ACTIVO','BILLETERA','#00a9e0',40,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000005',null,'TARJETA_DE_DEBITO','Tarjeta de débito','ACTIVO','TARJETA','#0f766e',50,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000006',null,'TARJETA_DE_CREDITO','Tarjeta de crédito','PASIVO','TARJETA','#dc2626',60,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000007',null,'AHORRO','Ahorro','ACTIVO','AHORRO','#0891b2',70,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000008',null,'BILLETERA_DIGITAL','Billetera digital','ACTIVO','BILLETERA','#7c3aed',80,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000009',null,'INVERSION','Inversión','ACTIVO','INVERSION','#ca8a04',90,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000010',null,'PRESTAMO','Préstamo','PASIVO','BANCO','#ea580c',100,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000011',null,'CREDITO','Crédito','PASIVO','BANCO','#e11d48',110,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000012',null,'CAJA','Caja','ACTIVO','CAJA','#4f46e5',120,'ACTIVO'),
 ('20000000-0000-0000-0000-000000000013',null,'OTRO','Otro','ACTIVO','CAJA','#64748b',130,'ACTIVO')
on conflict do nothing;

insert into public.instituciones(id,user_id,nombre,tipo,pais,color,estado) values
 ('10000000-0000-0000-0000-000000000001',null,'BCP','BANCO','PE','#0055a5','ACTIVO'),
 ('10000000-0000-0000-0000-000000000002',null,'BBVA','BANCO','PE','#004481','ACTIVO'),
 ('10000000-0000-0000-0000-000000000003',null,'Interbank','BANCO','PE','#009b3a','ACTIVO'),
 ('10000000-0000-0000-0000-000000000004',null,'Scotiabank','BANCO','PE','#ec111a','ACTIVO'),
 ('10000000-0000-0000-0000-000000000005',null,'Banco de la Nación','BANCO','PE','#8b1d41','ACTIVO'),
 ('10000000-0000-0000-0000-000000000006',null,'BanBif','BANCO','PE','#f58220','ACTIVO'),
 ('10000000-0000-0000-0000-000000000007',null,'Banco Pichincha','BANCO','PE','#ffdd00','ACTIVO'),
 ('10000000-0000-0000-0000-000000000008',null,'Mibanco','BANCO','PE','#f59e0b','ACTIVO'),
 ('10000000-0000-0000-0000-000000000009',null,'Caja Arequipa','CAJA','PE','#dc2626','ACTIVO'),
 ('10000000-0000-0000-0000-000000000010',null,'Caja Huancayo','CAJA','PE','#2563eb','ACTIVO'),
 ('10000000-0000-0000-0000-000000000011',null,'Caja Piura','CAJA','PE','#0f766e','ACTIVO'),
 ('10000000-0000-0000-0000-000000000012',null,'Financiera Oh!','FINANCIERA','PE','#e11d48','ACTIVO'),
 ('10000000-0000-0000-0000-000000000013',null,'Banco Falabella','BANCO','PE','#16a34a','ACTIVO'),
 ('10000000-0000-0000-0000-000000000014',null,'Banco Ripley','BANCO','PE','#7c3aed','ACTIVO'),
 ('10000000-0000-0000-0000-000000000015',null,'Yape','BILLETERA_DIGITAL','PE','#742284','ACTIVO'),
 ('10000000-0000-0000-0000-000000000016',null,'Plin','BILLETERA_DIGITAL','PE','#00a9e0','ACTIVO'),
 ('10000000-0000-0000-0000-000000000017',null,'PayPal','BILLETERA_DIGITAL','OTRO','#003087','ACTIVO'),
 ('10000000-0000-0000-0000-000000000018',null,'Mercado Pago','BILLETERA_DIGITAL','OTRO','#009ee3','ACTIVO')
on conflict do nothing;

alter table public.cuentas add column if not exists propietario_id uuid references public.propietarios(id) on delete restrict;
alter table public.cuentas add column if not exists tipo_cuenta_id uuid references public.tipos_cuenta(id) on delete restrict;
alter table public.cuentas add column if not exists institucion_id uuid references public.instituciones(id) on delete restrict;
alter table public.cuentas add column if not exists naturaleza text not null default 'ACTIVO' check(naturaleza in ('ACTIVO','PASIVO'));
alter table public.cuentas add column if not exists fecha_saldo_inicial date not null default current_date;
alter table public.cuentas add column if not exists color text default '#315efb';
alter table public.cuentas add column if not exists icono text default 'CAJA';
alter table public.cuentas add column if not exists descripcion text;
alter table public.cuentas add column if not exists estado text not null default 'ACTIVA' check(estado in ('ACTIVA','INACTIVA','ARCHIVADA'));
alter table public.cuentas add column if not exists updated_at timestamptz default now();

update public.cuentas set tipo='BILLETERA_DIGITAL' where tipo='BILLETERA';
update public.cuentas c set tipo_cuenta_id=t.id, naturaleza=t.naturaleza
from public.tipos_cuenta t
where t.user_id is null and t.codigo=c.tipo
 and (c.tipo_cuenta_id is distinct from t.id or c.naturaleza is distinct from t.naturaleza);

insert into public.propietarios(user_id,nombre,tipo,color,icono,estado)
select distinct c.user_id,'Por asignar','PERSONA','#64748b','PERSONA','ACTIVO'
from public.cuentas c
where c.propietario_id is null
 and not exists(select 1 from public.propietarios p where p.user_id=c.user_id and lower(trim(p.nombre))='por asignar');
update public.cuentas c set propietario_id=p.id
from public.propietarios p
where c.propietario_id is null and p.user_id=c.user_id and lower(trim(p.nombre))='por asignar';
alter table public.cuentas alter column propietario_id set not null;

create or replace function public.validar_cuenta_saas() returns trigger language plpgsql as $$
declare tipo_catalogo public.tipos_cuenta%rowtype;
begin
 select * into tipo_catalogo from public.tipos_cuenta t
 where upper(trim(t.codigo))=upper(trim(new.tipo))
  and (t.user_id is null or t.user_id=new.user_id) and t.estado='ACTIVO'
 order by (t.user_id=new.user_id) desc nulls last limit 1;
 if tipo_catalogo.id is null then raise exception 'El tipo de cuenta no está disponible.'; end if;
 new.tipo_cuenta_id:=tipo_catalogo.id;
 new.naturaleza:=tipo_catalogo.naturaleza;
 if not exists(select 1 from public.propietarios p where p.id=new.propietario_id and p.user_id=new.user_id and p.estado='ACTIVO') then
  raise exception 'El propietario no pertenece al usuario o está inactivo.';
 end if;
 if new.institucion_id is not null and not exists(
  select 1 from public.instituciones i where i.id=new.institucion_id
   and (i.user_id is null or i.user_id=new.user_id) and i.estado='ACTIVO'
 ) then raise exception 'La institución no está disponible para el usuario.'; end if;
 if exists(
  select 1 from public.cuentas c where c.user_id=new.user_id and c.propietario_id=new.propietario_id
   and lower(trim(c.nombre))=lower(trim(new.nombre))
   and coalesce(c.institucion_id,'00000000-0000-0000-0000-000000000000'::uuid)=coalesce(new.institucion_id,'00000000-0000-0000-0000-000000000000'::uuid)
   and c.moneda=new.moneda and c.id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)
 ) then raise exception 'Ya existe una cuenta con el mismo propietario, alias, institución y moneda.'; end if;
 return new;
end $$;

do $$ begin
 if not exists(select 1 from pg_trigger where tgname='cuentas_validar_saas' and tgrelid='public.cuentas'::regclass) then
  create trigger cuentas_validar_saas before insert or update on public.cuentas
  for each row execute function public.validar_cuenta_saas();
 end if;
end $$;

alter table public.propietarios enable row level security;
alter table public.instituciones enable row level security;
alter table public.tipos_cuenta enable row level security;
alter table public.cuentas enable row level security;

do $$ begin
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='propietarios' and policyname='Propietarios del usuario') then
  create policy "Propietarios del usuario" on public.propietarios for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='instituciones' and policyname='Instituciones visibles') then
  create policy "Instituciones visibles" on public.instituciones for select to authenticated
  using(user_id is null or auth.uid()=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='instituciones' and policyname='Instituciones propias escritura') then
  create policy "Instituciones propias escritura" on public.instituciones for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='tipos_cuenta' and policyname='Tipos de cuenta visibles') then
  create policy "Tipos de cuenta visibles" on public.tipos_cuenta for select to authenticated
  using(user_id is null or auth.uid()=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='tipos_cuenta' and policyname='Tipos de cuenta propios escritura') then
  create policy "Tipos de cuenta propios escritura" on public.tipos_cuenta for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);
 end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='cuentas' and policyname='Cuentas del usuario') then
  create policy "Cuentas del usuario" on public.cuentas for all to authenticated
  using(auth.uid()=user_id) with check(auth.uid()=user_id);
 end if;
end $$;

create index if not exists cuentas_user_propietario_idx on public.cuentas(user_id,propietario_id);
create index if not exists cuentas_user_estado_idx on public.cuentas(user_id,estado);
create index if not exists cuentas_tipo_cuenta_idx on public.cuentas(tipo_cuenta_id);

commit;

select
 to_regclass('public.propietarios') is not null as propietarios_ok,
 to_regclass('public.instituciones') is not null as instituciones_ok,
 to_regclass('public.tipos_cuenta') is not null as tipos_cuenta_ok,
 to_regclass('public.cuentas') is not null as cuentas_ok,
 (select count(*) from public.tipos_cuenta where user_id is null) as tipos_catalogo,
 (select count(*) from public.instituciones where user_id is null) as instituciones_catalogo;
-- FIN MIGRACION SEGURA: CUENTAS, PROPIETARIOS, TIPOS E INSTITUCIONES
