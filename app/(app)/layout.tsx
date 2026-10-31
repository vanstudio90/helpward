import { Sidebar } from "@/components/Sidebar";
import { MobileShell } from "@/components/MobileNav";
import { getMe, getUnreadCount } from "@/lib/data/customer";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  const unread = me ? await getUnreadCount() : 0;
  const sidebarUser = me
    ? {
        full_name: me.profile.full_name,
        avatar_url: me.profile.avatar_url,
      }
    : null;

  /* Same ground as the helper shell. This had been inheriting the body's
     slate, which is faintly blue — beside an indigo brand that reads as a
     second hue rather than as neutral, and it put the two halves of the
     product on visibly different whites. */
  return (
    <div className="min-h-screen lg:flex bg-app">
      <Sidebar user={sidebarUser} />
      <MobileShell
        avatarUrl={me?.profile.avatar_url}
        fullName={me?.profile.full_name}
        userId={me?.profile.id}
        initialUnread={unread}
      >
        <main className="flex-1 min-w-0 pb-24 lg:pb-0">{children}</main>
      </MobileShell>
    </div>
  );
}
