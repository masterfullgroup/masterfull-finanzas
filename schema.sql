-- Masterfull Finanzas: ejecutar una sola vez en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.personas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null, relacion text not null default 'TITULAR', email text, telefono text, color text default '#315efb', created_at timestamptz default now()
);
create table if not exists public.cuentas (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 nombre text not null, tipo text not null, saldo_inicial numeric(14,2) not null default 0 check(saldo_inicial>=0), moneda text not null default 'PEN', created_at timestamptz default now()
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
alter table public.tarjetas add column if not exists tipo text not null default 'CREDITO' check(tipo in ('CREDITO','DEBITO'));
alter table public.tarjetas add column if not exists cuenta_id uuid references public.cuentas(id) on delete restrict;
alter table public.tarjetas alter column linea_credito drop not null;
alter table public.movimientos add column if not exists tarjeta_id uuid references public.tarjetas(id) on delete restrict;
alter table public.movimientos add column if not exists numero_cuotas smallint not null default 1 check(numero_cuotas between 1 and 48);

-- RLS impide que un usuario consulte o modifique registros de otro usuario.
do $$ declare t text; begin
 foreach t in array array['personas','cuentas','categorias','tarjetas','movimientos','presupuestos','metas','deudas','recurrentes'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('drop policy if exists "Registros propios" on public.%I',t);
  execute format('create policy "Registros propios" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)',t);
 end loop;
end $$;

create index if not exists movimientos_user_fecha_idx on public.movimientos(user_id,fecha desc);
create index if not exists movimientos_categoria_idx on public.movimientos(categoria_id);
create index if not exists movimientos_cuenta_idx on public.movimientos(cuenta_id);
