-- profiles.onboarded_at — timestamp set by dismissOnboardingAction the
-- first time a customer sees the welcome modal on /dashboard. Null = never
-- seen, non-null = seen + dismissed. Server-side gate so the tour doesn't
-- re-appear across devices (localStorage would only suppress per-device).

alter table profiles
  add column if not exists onboarded_at timestamptz;
