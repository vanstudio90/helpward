import { getMe } from "@/lib/data/customer";
import { logoutAction } from "@/app/(auth)/auth/actions";
import { SettingsForm } from "./form";
import { Shield, Lock, Smartphone, Download, Trash2, LogOut, Headphones, ChevronRight, ChevronDown } from "lucide-react";
import Link from "next/link";

export default async function SettingsPage() {
  const me = await getMe();
  if (!me) return null;

  return (
    <div className="px-4 lg:px-8 py-5 lg:py-8 max-w-3xl mx-auto pb-12">
      <div className="mb-5 lg:mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account, preferences and app settings.</p>
      </div>

      <div className="space-y-5">
        <SettingsForm initial={{
          full_name: me.profile.full_name,
          phone: me.profile.phone ?? "",
          country: me.profile.country,
          email: "",
          avatar_url: me.profile.avatar_url,
          email_verified: true,
        }} />

        <Card>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900 inline-flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-500" /> Account Overview
            </h2>
            <span className="text-[10px] font-bold text-brand-700 bg-brand-50 px-2 py-1 rounded-full">Standard Plan</span>
          </div>
          <Row label="Account Balance" value={`$${((me.customer?.wallet_balance_cents ?? 0) / 100).toFixed(2)}`} />
          <Row label="Country" value={me.profile.country} />
          <Row label="Default Currency" value={me.profile.default_currency} />
          <Row label="Time Zone" value={me.profile.default_timezone} />
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-brand-600" />
            <h2 className="text-base font-bold text-slate-900">Security</h2>
          </div>
          <SecRow icon={<Lock className="w-4 h-4 text-slate-500" />} label="Password" sub="Set on signup" action="Change" disabled tooltip="Use 'Forgot password' on /login for now — in-app change ships in Phase 6.2" />
          <SecRow icon={<Shield className="w-4 h-4 text-slate-500" />} label="Two-Factor Authentication" sub="Disabled" action="Enable" disabled tooltip="Coming in Phase 6.2 (Supabase TOTP)" />
          <SecRow icon={<Smartphone className="w-4 h-4 text-slate-500" />} label="Login Devices" sub="1 active session" action="View" disabled last tooltip="Coming in Phase 6.2" />
          <p className="text-[11px] text-slate-400 mt-3">Security actions land in Phase 6.</p>
        </Card>

        <Card>
          <h2 className="text-base font-bold text-slate-900 mb-3">Quick Actions</h2>
          <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Quick icon={<Download className="w-4 h-4 text-slate-500" />} label="Download My Data" sub="Export your data" disabled tooltip="Coming in Phase 6.2 (CCPA / PIPEDA compliance export)" />
            <Quick icon={<Trash2 className="w-4 h-4 text-rose-500" />} label="Delete Account" sub="Permanent" tone="text-rose-600" disabled tooltip="Coming in Phase 6.2. Email privacy@helpward.com to delete in the meantime." />
            <li>
              <form action={logoutAction}>
                <button className="w-full text-left flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50">
                  <span className="w-8 h-8 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">
                    <LogOut className="w-4 h-4 text-rose-500" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-rose-600">Log Out</div>
                    <div className="text-[11px] text-slate-500">Sign out from this device</div>
                  </div>
                </button>
              </form>
            </li>
          </ul>
        </Card>

        <Card className="bg-brand-50/50 border-brand-100">
          <div className="flex items-start gap-3 sm:items-center">
            <span className="w-9 h-9 inline-flex items-center justify-center rounded-xl bg-white shrink-0">
              <Headphones className="w-4 h-4 text-brand-600" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900">Need Help?</div>
              <div className="text-xs text-slate-600 mt-0.5">Visit our Help Center or contact support if you need assistance.</div>
            </div>
            <Link href="/help" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 bg-white border border-brand-200 px-3 py-2 rounded-lg shrink-0">
              Visit Help Center <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </Card>

        <footer className="text-center text-xs text-slate-400 pt-2 pb-4">
          Helpward v1.0.0 · <a className="hover:text-slate-600">Terms</a> · <a className="hover:text-slate-600">Privacy</a>
        </footer>
      </div>
    </div>
  );
}

function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white border border-slate-100 p-4 sm:p-5 ${className ?? ""}`}>{children}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 text-sm">
      <div className="text-slate-500">{label}</div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SecRow({ icon, label, sub, action, disabled, last, tooltip, subTone }: { icon: React.ReactNode; label: string; sub: string; action: string; disabled?: boolean; last?: boolean; tooltip?: string; subTone?: string }) {
  return (
    <div className={`flex items-center gap-3 py-3 ${!last ? "border-b border-slate-100" : ""}`}>
      <span className="w-9 h-9 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        <div className={`text-[11px] ${subTone ?? "text-slate-500"}`}>{sub}</div>
      </div>
      <button disabled={disabled} title={tooltip} className={`text-xs font-semibold text-brand-700 shrink-0 disabled:opacity-50 ${disabled ? "cursor-not-allowed" : ""}`}>{action}</button>
    </div>
  );
}

function Quick({ icon, label, sub, tone, disabled, tooltip }: { icon: React.ReactNode; label: string; sub: string; tone?: string; disabled?: boolean; tooltip?: string }) {
  return (
    <li>
      <button disabled={disabled} title={tooltip} className={`w-full text-left flex items-start gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 disabled:opacity-50 ${disabled ? "cursor-not-allowed" : ""}`}>
        <span className="w-8 h-8 rounded-lg bg-slate-50 inline-flex items-center justify-center shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${tone ?? "text-slate-900"}`}>{label}</div>
          <div className="text-[11px] text-slate-500">{sub}</div>
        </div>
      </button>
    </li>
  );
}
