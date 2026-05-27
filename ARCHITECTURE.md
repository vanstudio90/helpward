# Helpward — Production Build Plan

> Current state: UI-only Next.js 16 prototype at helpward.com. 11 pages, mock data. This document is the end-to-end plan to turn it into a real two-sided marketplace serving customers + providers + admins in the USA and Canada.

---

## 1. Stack decisions (committed)

| Layer | Choice | Why |
|---|---|---|
| **Frontend** | Next.js 16 (existing) | Already shipped |
| **Auth + DB + Realtime + Storage** | **Supabase** (Postgres + Auth + Realtime + Storage + Edge Functions) | Pattern matches user's other projects (RKS, Seennabis, BuyOrMeet); one vendor for 4 concerns; RLS gives strong security |
| **Payments + marketplace** | **Stripe Connect Express** | Cross-border (USA + CA), handles KYC for providers, 1099/T4A tax forms auto-generated |
| **ID verification** | **Stripe Identity** | Built into the same Stripe account as Connect; supports passports/driver's licenses in USA + CA |
| **Background checks** | **Checkr (USA)** + **Triton Canada (CA)** | Industry standard, API-driven |
| **SMS** | **Twilio Verify (OTP)** + Twilio Programmable Messaging (transactional) | USA + CA toll-free numbers |
| **Push notifications** | **OneSignal** | Free up to 10K mobile / unlimited web; works on iOS/Android/web |
| **Email** | **Resend** | Already in use on user's other sites |
| **Maps + geocoding + routing** | **Mapbox** (over Google Maps) | Cheaper per request, better styling for the brand-blue look we already use |
| **Real-time GPS + chat** | **Supabase Realtime** (Postgres LISTEN/NOTIFY + channels) | No extra vendor; tight DB integration |
| **Background jobs** | **Inngest** | Event-driven, plays nicely with Vercel functions; durable; built-in retry |
| **Cron** | **Vercel Cron** | Already on Vercel |
| **Marketplace insurance** | **Trupo / Marsh & McLennan Marketplace** (USA), **Foxquilt** (CA) | Per-task liability coverage for providers |
| **Observability** | **Sentry** + **Vercel Analytics** | Errors + perf in one place |
| **Provider mobile** | Start as **PWA** (same Next.js app, /provider route group); upgrade to **React Native Expo** in Phase 9 if push reliability becomes a problem | PWA ships in days; RN ships in months |

**Total baseline monthly cost (pre-launch / no transactions):** ~$70/mo. Stripe + per-verification fees on top of that.

---

## 2. Roles & route groups

```
app/
├── (marketing)/        — public landing, /about, /safety, /providers, /pricing
├── (auth)/             — /login, /signup, /forgot, /verify-email, /verify-phone
├── (app)/              — CUSTOMER (current pages we already built)
├── (provider)/         — PROVIDER (new; mirror of customer with worker UX)
│   ├── onboard/
│   ├── dashboard/
│   ├── inbox/          — incoming request notifications
│   ├── active/         — current task with GPS + chat
│   ├── earnings/
│   ├── schedule/
│   ├── messages/
│   └── profile/
└── (admin)/            — ADMIN (super-user only)
    ├── dashboard/
    ├── users/
    ├── providers/      — approval queue
    ├── bookings/       — live map of all active jobs
    ├── disputes/
    ├── payments/
    ├── refunds/
    ├── services/       — CMS for service catalog
    └── audit-log/
```

Role enforced at three levels:
1. **Supabase RLS** — DB-level guarantee (cannot be bypassed)
2. **Next.js middleware** (`proxy.ts`) — redirect mismatched users at the edge
3. **Component-level guards** — graceful UI when policy denies

---

## 3. Data model (Postgres / Supabase)

### Auth & profiles

```sql
-- Supabase auth.users is built-in; we extend with our own profile tables.

create type user_role as enum ('customer', 'provider', 'admin');
create type country as enum ('US', 'CA');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'customer',
  full_name text not null,
  phone text,
  phone_verified boolean default false,
  avatar_url text,
  country country not null,
  default_locale text not null default 'en',
  default_currency text not null,   -- USD or CAD
  default_timezone text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table customer_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text unique,
  default_address_id uuid,
  wallet_balance_cents int not null default 0,
  referral_code text unique
);

create table provider_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  status text not null default 'pending', -- pending/approved/suspended/banned
  bio text,
  languages text[],
  service_radius_km int default 20,
  base_location geography(Point, 4326),  -- PostGIS
  current_location geography(Point, 4326),
  is_online boolean default false,
  rating_avg numeric(2,1),
  rating_count int default 0,
  tasks_completed int default 0,
  response_time_sec int,
  stripe_connect_account_id text unique,
  stripe_identity_verification_id text,
  background_check_id text,
  background_check_status text,    -- pending/clear/consider/action
  id_verified_at timestamptz,
  background_verified_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references profiles(id),
  insurance_active_until date
);
```

### Service catalog

```sql
create table service_categories (
  id text primary key,             -- 'transportation', 'home-help', etc.
  label text not null,
  icon text not null,
  sort int default 0,
  active boolean default true
);

create table services (
  id text primary key,             -- 'designated-driver'
  category_id text references service_categories(id) not null,
  title text not null,
  blurb text not null,
  base_price_cents int not null,
  countries country[] not null default array['US','CA']::country[],
  popular boolean default false,
  image_url text,
  active boolean default true
);

create table provider_services (
  provider_id uuid references provider_profiles(user_id) on delete cascade,
  service_id text references services(id) on delete cascade,
  custom_price_cents int,          -- if provider overrides base price
  primary key (provider_id, service_id)
);
```

### Requests & bookings

```sql
create type request_status as enum (
  'draft', 'matching', 'matched', 'cancelled', 'expired'
);

create type booking_status as enum (
  'scheduled', 'in_progress', 'completed', 'cancelled', 'disputed'
);

create table addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  label text,
  formatted text not null,
  location geography(Point, 4326) not null,
  city text, region text, country country, postal_code text,
  created_at timestamptz default now()
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) not null,
  service_id text references services(id) not null,
  pickup_address_id uuid references addresses(id),
  dropoff_address_id uuid references addresses(id),
  scheduled_for timestamptz,       -- null = ASAP
  notes text,
  estimated_price_cents int,
  estimated_duration_min int,
  status request_status not null default 'draft',
  created_at timestamptz default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) unique,
  customer_id uuid references profiles(id) not null,
  provider_id uuid references provider_profiles(user_id) not null,
  service_id text references services(id) not null,
  status booking_status not null default 'scheduled',
  scheduled_for timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  -- pricing snapshot
  base_price_cents int not null,
  distance_cents int default 0,
  service_fee_cents int default 0,
  tip_cents int default 0,
  total_cents int not null,
  platform_fee_cents int not null, -- 15-25% goes to us
  payout_cents int not null,        -- goes to provider
  currency text not null,
  -- payment
  stripe_payment_intent_id text,
  payment_status text not null default 'pending', -- pending/authorized/captured/refunded/failed
  created_at timestamptz default now()
);
```

### Matching log (for analytics + dispute resolution)

```sql
create table match_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references requests(id) on delete cascade,
  provider_id uuid references provider_profiles(user_id),
  notified_at timestamptz default now(),
  responded_at timestamptz,
  response text,                   -- 'accept' / 'decline' / 'timeout'
  distance_km numeric,
  rank_score numeric
);
```

### Messaging

```sql
create table conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) unique,
  customer_id uuid references profiles(id) not null,
  provider_id uuid references provider_profiles(user_id) not null,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade,
  sender_id uuid references profiles(id) not null,
  body text,
  attachment_url text,
  read_by_recipient_at timestamptz,
  created_at timestamptz default now()
);

-- Index for fast unread counts
create index on messages (conversation_id, created_at desc);
```

### Real-time location

```sql
create table provider_locations (
  provider_id uuid primary key references provider_profiles(user_id) on delete cascade,
  location geography(Point, 4326) not null,
  heading numeric,
  speed_kph numeric,
  updated_at timestamptz default now()
);

-- Append-only log for active bookings only (kept 30 days for dispute history)
create table booking_location_pings (
  id bigserial primary key,
  booking_id uuid references bookings(id) on delete cascade,
  location geography(Point, 4326) not null,
  recorded_at timestamptz default now()
);
```

### Payments

```sql
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references profiles(id) on delete cascade,
  stripe_payment_method_id text not null,
  type text not null,              -- card / paypal / wallet
  brand text, last4 text, exp_month int, exp_year int,
  is_default boolean default false,
  created_at timestamptz default now()
);

create table payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references provider_profiles(user_id),
  stripe_transfer_id text unique,
  amount_cents int not null,
  currency text not null,
  status text not null,            -- pending/paid/failed
  arrival_date date,
  booking_ids uuid[],              -- which bookings this payout covers
  created_at timestamptz default now()
);

create table refunds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  amount_cents int not null,
  reason text,
  initiated_by uuid references profiles(id),
  stripe_refund_id text,
  status text not null,
  created_at timestamptz default now()
);
```

### Reviews

```sql
create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id) unique,
  customer_id uuid references profiles(id) not null,
  provider_id uuid references provider_profiles(user_id) not null,
  rating int not null check (rating between 1 and 5),
  comment text,
  customer_visible boolean default true,
  created_at timestamptz default now()
);
```

### Notifications

```sql
create table notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  push_booking boolean default true,
  push_messages boolean default true,
  email_receipts boolean default true,
  email_digest boolean default false,
  sms_critical boolean default true
);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  type text not null,
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz default now()
);
```

### Favorites & saved

```sql
create table favorites (
  user_id uuid references profiles(id) on delete cascade,
  kind text not null,              -- 'provider' / 'service' / 'address'
  target_id text not null,         -- provider uuid OR service slug OR address uuid
  pinned boolean default false,
  notes text,
  created_at timestamptz default now(),
  primary key (user_id, kind, target_id)
);
```

### Disputes

```sql
create table disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  opened_by uuid references profiles(id),
  category text not null,          -- no-show / quality / damage / billing / safety
  description text not null,
  status text not null default 'open',  -- open / investigating / resolved / escalated
  resolution text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz default now()
);
```

### Audit log

```sql
create table audit_log (
  id bigserial primary key,
  actor_id uuid references profiles(id),
  action text not null,
  target_table text,
  target_id text,
  payload jsonb,
  ip text,
  user_agent text,
  created_at timestamptz default now()
);
```

---

## 4. Row-Level Security (RLS)

**The most important security mechanism.** Every table gets RLS enabled. The rules below assume a JWT custom claim `role` set on signup.

### Examples (full set lives in `supabase/migrations/`)

```sql
-- profiles: read your own, admin sees all
alter table profiles enable row level security;
create policy profiles_self_read on profiles
  for select using (id = auth.uid() or auth.jwt()->>'role' = 'admin');
create policy profiles_self_update on profiles
  for update using (id = auth.uid());

-- bookings: customer + provider see their own; admin all
alter table bookings enable row level security;
create policy bookings_self on bookings
  for select using (
    customer_id = auth.uid()
    or provider_id = auth.uid()
    or auth.jwt()->>'role' = 'admin'
  );
create policy bookings_create_customer on bookings
  for insert with check (customer_id = auth.uid());
create policy bookings_update_provider on bookings
  for update using (provider_id = auth.uid() or auth.jwt()->>'role' = 'admin');

-- messages: only conversation participants
alter table messages enable row level security;
create policy messages_self on messages
  for all using (
    exists (
      select 1 from conversations c
      where c.id = conversation_id
        and (c.customer_id = auth.uid() or c.provider_id = auth.uid())
    )
    or auth.jwt()->>'role' = 'admin'
  );
```

Provider locations are **read-only for the assigned booking's customer**:

```sql
alter table provider_locations enable row level security;
create policy locations_for_active_customer on provider_locations
  for select using (
    exists (
      select 1 from bookings b
      where b.provider_id = provider_locations.provider_id
        and b.status = 'in_progress'
        and b.customer_id = auth.uid()
    )
    or auth.jwt()->>'role' = 'admin'
  );
```

---

## 5. Auth flows

| Flow | Mechanism |
|---|---|
| Signup (customer or provider) | Supabase Auth — email/password OR Google OR Apple |
| Email verification | Supabase magic link (built in) |
| Phone verification | Twilio Verify OTP via Supabase Edge Function |
| Login | Same channels |
| Forgot password | Supabase built-in |
| 2FA | Supabase TOTP (built in) |
| Role assignment | First-class field on `profiles.role`; mirrored to JWT custom claim via Supabase trigger so RLS can read it |
| Admin promotion | Manual `update profiles set role='admin' where id=…` (no self-serve) |

Middleware (`proxy.ts`) redirect rules:
- Unauth user hitting `/(app)`, `/(provider)`, `/(admin)` → `/login?next=…`
- Customer hitting `/(provider)` or `/(admin)` → `/dashboard`
- Provider hitting `/(app)` or `/(admin)` → `/provider/dashboard`
- Admin can hit any route (super-user)

---

## 6. Matching algorithm

When a customer creates a request:

```
1. SELECT providers WHERE
     provider_services contains request.service_id
     AND status = 'approved'
     AND is_online = true
     AND ST_DWithin(current_location, request.pickup, service_radius_km * 1000)
     AND rating_avg >= 4.0 (or NULL for new providers)
2. Compute rank score:
     score = (1 / distance_km) * 0.4
           + (rating_avg / 5) * 0.3
           + (acceptance_rate) * 0.2
           + (recency_bonus) * 0.1
3. Take top 5.
4. Insert one match_attempts row per provider.
5. Push notify all 5 simultaneously with a 30s window.
6. First to accept → bind to booking, decline the rest.
7. If no one accepts in 60s:
     - Expand radius by 50%
     - Repeat once
     - If still no one: mark request 'expired', refund any pre-auth, notify customer
```

Implementation: **Inngest function** triggered by `request.created` event. PostGIS gives proximity queries for free (geography type + ST_DWithin).

---

## 7. Payment flow (Stripe Connect Express)

### Provider onboarding (one-time)

1. Provider clicks "Set up payouts"
2. We create a Stripe Connect Express account in their country (US or CA)
3. Redirect to Stripe-hosted onboarding (Stripe collects SSN/SIN, bank account, business info, runs KYC)
4. Webhook `account.updated` confirms `details_submitted = true` and `charges_enabled = true`
5. Save `stripe_connect_account_id` to provider_profiles

### Customer pays for a booking

1. Customer confirms booking → server creates `PaymentIntent`:
   - `amount` = total
   - `currency` = USD or CAD (based on pickup country)
   - `application_fee_amount` = platform_fee_cents
   - `transfer_data.destination` = provider's Connect account
   - `capture_method = 'manual'`
   - `confirm = true`
2. Customer's card is **authorized** (funds held, not charged)
3. Provider completes work → status `completed`
4. Customer confirms (or auto-confirm 24h after completion)
5. Server captures the PaymentIntent → funds settle to platform → Stripe immediately transfers `payout_cents` to provider's Connect balance
6. Stripe pays out to provider's bank on the rolling schedule (daily/weekly per their setup)

### Tips
- Post-completion, customer can add a tip
- New PaymentIntent for the tip amount only, also routed via Connect
- Recorded as `bookings.tip_cents`

### Refunds
- Triggered by admin (or auto-triggered for cancelled-before-arrival)
- Stripe Refund API
- If already captured: pulls funds back from provider's pending balance (if positive) or platform's balance
- Logged in `refunds` table

### Fees
- **Platform take rate: 20%** (industry standard for marketplaces is 15-30%)
- **Stripe fee: 2.9% + 30¢** per transaction (USA), 2.9% + 30¢ (CA)
- **Connect fee: 0.25% + $0.25** per transfer to provider
- Net provider take-home on a $50 booking: ~$38

### Taxes (USA + CA)
- **Stripe Tax** automatically calculates and collects:
  - USA: state + city sales tax (where services are taxable — varies by state)
  - CA: GST/PST/HST by province
- We charge customer the all-in price; Stripe Tax remits to authorities
- **Provider 1099-K / T4A**: Stripe Connect auto-generates and sends if provider earns >$600 (USA) or >$500 (CA) in a year

---

## 8. Real-time flows

### Live GPS tracking
- Provider mobile app pings location every 15s when `is_online`
- Stored in `provider_locations` (single-row upsert) and `booking_location_pings` (append-only for active booking)
- Customer subscribes to Supabase Realtime channel `provider_location:{provider_id}` while booking is in_progress
- RLS limits read to the assigned customer + admin

### Messaging
- One conversation per booking
- Supabase Realtime channel `conversation:{conversation_id}`
- Sender INSERT triggers channel broadcast to subscribers
- Read receipts: client UPDATE `read_by_recipient_at` when message scrolls into view

### Typing indicators
- Ephemeral Supabase Realtime presence (not stored in DB)

### Booking status changes
- Trigger pushes notification on status enum change
- Channel `customer:{customer_id}` and `provider:{provider_id}` receive booking updates

---

## 9. Notifications strategy

| Event | In-app | Push | Email | SMS |
|---|---|---|---|---|
| Booking accepted | ✓ | ✓ | – | – |
| Provider arrived | ✓ | ✓ | – | ✓ (opt-in) |
| Task started | ✓ | ✓ | – | – |
| Task completed | ✓ | ✓ | ✓ (receipt) | – |
| Refund issued | ✓ | – | ✓ | – |
| New message | ✓ | ✓ | – | – |
| Review received (provider) | ✓ | ✓ | ✓ (weekly digest) | – |
| Account locked / suspicious login | ✓ | ✓ | ✓ | ✓ |
| Payout deposited | ✓ | ✓ | ✓ | – |

User can opt out per channel per event type in Settings → Notifications.

---

## 10. Provider mobile app

### Phase 0: PWA (ships in ~1 week)
- Same Next.js codebase, served under `/provider/*`
- `manifest.json` + service worker (next-pwa)
- Add to home screen on iOS/Android
- **GPS in background**: limited on iOS PWA (only foreground), works on Android with proper permissions
- **Push**: works on Android Chrome, Safari 16.4+ on iOS

### Phase 1: React Native Expo (ships in ~6 weeks)
- Triggered when PWA limitations bite (background GPS, native push reliability)
- Reuses Supabase backend 1:1 (no API changes)
- Expo EAS for builds + OTA updates
- Push via OneSignal SDK
- Background location via Expo Location TaskManager
- Submitted to App Store + Play Store

---

## 11. Admin dashboard

Built as a Next.js route group `/admin/*` with strict role gating.

### Pages
| Route | Purpose |
|---|---|
| `/admin` | KPIs: active providers / open bookings / today's revenue / disputes count |
| `/admin/users` | Search/filter/suspend any user |
| `/admin/providers` | Approval queue — review uploaded ID, background check status, approve / reject / request more info |
| `/admin/bookings` | Live map of all in-progress bookings (Mapbox heatmap + markers) |
| `/admin/disputes` | Open disputes queue with both parties' messages, evidence, action buttons (refund / favor provider / escalate) |
| `/admin/payments` | Stripe charges + payouts mirror; can issue refunds |
| `/admin/refunds` | Refund queue (auto for cancellations, manual for disputes) |
| `/admin/services` | CMS for service catalog (add/edit/disable services and categories) |
| `/admin/audit-log` | Searchable log of every privileged action |
| `/admin/reports` | Revenue by city / month / category, provider performance, churn cohorts |

### Tech
- Same Next.js app, same Supabase client
- Heavy use of server components + RLS-protected DB calls
- Tanstack Table for sortable/filterable data grids
- Use `recharts` for charts (already similar to what I built in /analytics)

---

## 12. Provider verification & safety

### ID verification (every provider)
- Stripe Identity session embedded in provider onboarding
- Provider uploads passport or driver's license + selfie
- Stripe runs liveness check
- Webhook updates `provider_profiles.id_verified_at`

### Background check (every provider)
- After ID is verified, trigger Checkr (USA) or Triton (CA) background check
- Costs ~$25-50 per check; charged to platform (consider charging $5 to provider as "verification fee" if margins tight)
- Webhook updates `provider_profiles.background_check_status`
- Provider can't go online until status = `clear`

### Insurance
- Per-task occurrence-based liability policy via marketplace insurer
- Cost: ~$3-7 per active provider per month
- Covers: bodily injury, property damage, third-party claims during a task
- Active providers see "Insured" badge

### Safety features
- **SOS button** on active booking page (calls 911 + alerts admin)
- **Trip share** — customer can text a tracking link to a friend
- **Identity badge** — provider shows in-app ID with photo + first name for customer to verify on arrival
- **Two-way ratings** required to complete next booking
- **Rapid response team** — admin queue for SOS triggers

---

## 13. USA + Canada specifics

### Currency & locale
| Country | Currency | Locale | Phone format | Sales tax |
|---|---|---|---|---|
| USA | USD | en-US | +1 (xxx) xxx-xxxx | Stripe Tax — state + city |
| Canada | CAD | en-CA / fr-CA | +1 (xxx) xxx-xxxx | Stripe Tax — GST + provincial (PST/HST) |

Detected from:
1. Provider's onboarding address (canonical source for their account)
2. Customer's first address (or IP fallback for landing page)
3. User can change in Settings

### Worker classification
- All providers are **1099 (USA) / T4A (Canada) independent contractors**
- Contract makes ABC test compliance airtight:
  - **A**: free from control — they set their own hours, accept/decline freely
  - **B**: outside usual course of business (we are a tech platform, not a service provider)
  - **C**: independently established — they can work elsewhere
- California-specific: AB5 caveat — if our matching is too prescriptive (auto-assign, surge pricing pressure) regulators may reclassify. Keep provider choice front and center.
- Stripe Connect generates 1099-K (USA) and T4A (CA) at year end, mailed to providers

### Regional service availability
- `services.countries` column gates which catalog items appear per market
- E.g., Motorcycle Taxi might be USA-only or Vancouver-only initially
- Admin can flip per region without code changes

### Compliance
| Regulation | Applies to | Action |
|---|---|---|
| **PCI-DSS** | All card payments | Stripe Elements handles — we never touch card numbers |
| **CCPA** (California) | Customer + provider data | "Do Not Sell" toggle in Settings; data export endpoint |
| **PIPEDA** (Canada) | All personal data | Same data-export endpoint; explicit consent on signup |
| **COPPA** | None (18+ only) | Age gate at signup |
| **TCPA** (USA SMS) | SMS notifications | Double opt-in on phone verify; STOP keyword honored via Twilio |
| **CASL** (Canada) | Marketing email | Explicit opt-in only; CAN-SPAM unsubscribe link in every email |

---

## 14. Build phases & timeline

Aggressive 14-week timeline to V1 launch in Vancouver (first city).

| Phase | Weeks | What ships |
|---|---|---|
| **0. Foundation** | 1 | Supabase project, schema, RLS, env wiring |
| **1. Customer auth + DB** | 2 | Real signup/login, mock data replaced with DB calls on all 11 customer pages |
| **2. Provider onboarding** | 2 | Sign-up flow, Stripe Identity, Stripe Connect, services they offer |
| **3. Matching** | 1 | Inngest function, request → providers → first to accept |
| **4. Payments** | 2 | Payment methods, charge on booking, capture on completion, payouts |
| **5. Real-time** | 1 | GPS pings, live chat, push notifications via OneSignal |
| **6. Admin** | 1 | All `/admin/*` pages with RLS-gated CRUD |
| **7. Polish** | 2 | Reviews, tips, disputes, refunds, email templates, help center articles |
| **8. Launch prep** | 2 | Insurance contracts signed, ToS/Privacy reviewed by lawyer, background checks live, bug bash, beta in Vancouver |
| **9. Mobile native (optional)** | 6 | React Native Expo when PWA limits become painful |

Each phase ends with a deployable increment. Vancouver beta opens at end of Phase 8.

---

## 15. Resume-here playbook (for next session)

When the user says "start Phase 0":

1. Create Supabase project (`helpward-prod` + `helpward-dev`) on user's account
2. Save URL + anon key + service role key to keychain
3. Apply migrations from `supabase/migrations/0001_init.sql` through `0008_reviews.sql`
4. Enable RLS on every table
5. Wire `@supabase/ssr` into the Next.js app
6. Update `proxy.ts` with auth-aware redirects
7. Replace `lib/mock.ts` data fetchers with real Supabase queries
8. Add `.env.local` template and Vercel env vars

After Phase 0, the user gets a green-light to start signing up real users and the rest follows the timeline above.

---

## 16. Estimated unit economics

| Item | Per booking | Per month at 1,000 bookings/mo |
|---|---|---|
| Average booking | $50 | $50,000 GMV |
| Platform take (20%) | $10 | **$10,000** |
| Stripe fees (~3.2%) | $1.60 | $1,600 |
| Connect transfer fee | $0.65 | $650 |
| Stripe Identity (amortized over 50 bookings) | $0.03 | $30 |
| Background check (amortized over 100 bookings) | $0.40 | $400 |
| OneSignal / Twilio / Resend / Mapbox | $0.50 | $500 |
| Insurance (provider-month) | $1.00 | $1,000 |
| Vercel + Supabase | $0.10 | $100 |
| **Net contribution** | **$5.72** | **$5,720/mo** |

Break-even on infrastructure at ~50 bookings/mo. Real profitability kicks in once you're past 500/mo and the fixed costs flatten.

---

## 17. What this document is NOT

- Not a sales pitch
- Not a complete legal review (engage a marketplace lawyer before launch)
- Not a guarantee that 14 weeks is achievable solo — realistic with a team of 2-3 engineers
- Not opinionated on UI changes — UI is already shipped and matches mockups

This is the engineering roadmap. Each phase has its own follow-up doc to be written when we kick that phase off.

— Generated by Claude for Helpward, 2026-05-26
