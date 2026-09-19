-- TradeMart — Phase 1: core database schema
-- Project: nygydondwrifdrdnwiqs (eu-west-1)
-- Run this in: Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Safe to run more than once (idempotent).

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  safka_product_id text not null unique,
  name             text not null,
  description      text,
  price            numeric(12, 2) not null default 0 check (price >= 0),
  image_url        text,
  stock            integer not null default 0 check (stock >= 0),
  status           text not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists products_status_idx on public.products (status);
create index if not exists products_updated_at_idx on public.products (updated_at desc);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  safka_order_id text unique,
  customer_name  text not null,
  phone          text not null,
  country        text not null,
  city           text not null,
  address        text not null,
  total          numeric(12, 2) not null default 0 check (total >= 0),
  status         text not null default 'pending',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists orders_phone_idx on public.orders (phone);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_created_at_idx on public.orders (created_at desc);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- order_items
-- ---------------------------------------------------------------------------
create table if not exists public.order_items (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  quantity   integer not null check (quantity > 0),
  price      numeric(12, 2) not null check (price >= 0)
);

create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- settings (single configuration row)
-- ---------------------------------------------------------------------------
create table if not exists public.settings (
  id                uuid primary key default gen_random_uuid(),
  store_name        text not null default 'TradeMart',
  facebook_pixel_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists settings_set_updated_at on public.settings;
create trigger settings_set_updated_at
  before update on public.settings
  for each row execute function public.set_updated_at();

-- Seed the single settings row (stable id so the app can address it).
insert into public.settings (id, store_name)
values ('00000000-0000-0000-0000-000000000001', 'TradeMart')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- The service_role bypasses RLS entirely, so all server-side writes (product
-- sync, order creation, webhooks) go through the service-role client only.
alter table public.products    enable row level security;
alter table public.orders      enable row level security;
alter table public.order_items enable row level security;
alter table public.settings    enable row level security;

-- Products: the storefront may read only active products with the anon key.
drop policy if exists "products_public_read_active" on public.products;
create policy "products_public_read_active"
  on public.products
  for select
  to anon, authenticated
  using (status = 'active');

-- orders, order_items, settings: intentionally no policies for anon or
-- authenticated. With RLS enabled and no policy, these tables deny all
-- access to browser clients. Only the server-side service_role can use them.

-- Ask PostgREST to reload its schema cache so the Data API sees the new
-- tables immediately after this migration runs.
notify pgrst, 'reload schema';
