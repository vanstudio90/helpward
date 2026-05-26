import { Sidebar } from "@/components/Sidebar";
import { MobileShell } from "@/components/MobileNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <MobileShell>
        <main className="flex-1 min-w-0 pb-24 lg:pb-0">{children}</main>
      </MobileShell>
    </div>
  );
}
