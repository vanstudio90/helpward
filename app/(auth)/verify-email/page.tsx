import Link from "next/link";
import { MailCheck } from "lucide-react";

export default async function VerifyEmailPage({
  searchParams,
}: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <div className="bg-white rounded-2xl shadow-xl shadow-brand-900/5 border border-slate-100 p-6 sm:p-8 text-center">
      <span className="inline-flex w-14 h-14 rounded-2xl bg-brand-50 items-center justify-center mb-4">
        <MailCheck className="w-7 h-7 text-brand-600" />
      </span>
      <h1 className="text-2xl font-bold text-slate-900">Check your inbox</h1>
      <p className="mt-2 text-sm text-slate-600 leading-relaxed">
        We sent a confirmation link to{" "}
        <span className="font-semibold text-slate-900">{email ?? "your email"}</span>.
        Click it to activate your account.
      </p>
      <p className="mt-4 text-xs text-slate-500">
        Didn't get it? Check your spam folder, or wait a minute and refresh.
      </p>
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-brand-700">
        Back to login →
      </Link>
    </div>
  );
}
