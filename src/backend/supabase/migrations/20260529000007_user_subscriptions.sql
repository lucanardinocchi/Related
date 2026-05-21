-- Stripe billing — one subscription row per User. Writes come from the
-- stripe-webhook Edge Function (service role); clients may only read.
create table public.user_subscriptions (
  owner_id uuid primary key references auth.users (id) on delete cascade,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  price_id text,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_subscriptions enable row level security;

create policy user_subscriptions_select_own
  on public.user_subscriptions for select using (owner_id = auth.uid());

create trigger user_subscriptions_touch_updated_at
  before update on public.user_subscriptions
  for each row execute function public.touch_updated_at();

-- Idempotency for Stripe webhook retries.
create table public.stripe_webhook_events (
  event_id text primary key,
  processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;
-- No client policies — service role only.
