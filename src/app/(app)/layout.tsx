import { redirect } from "next/navigation";
import ServerGate from "@/components/ServerGate";
import AppFooter from "@/components/AppFooter";
import AppNavbar from "@/components/AppNavbar";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <ServerGate>
      <div className="shell">
        <Sidebar email={user.email ?? ""} />
        <div className="content">
          <AppNavbar />
          <main className="main">{children}</main>
          <AppFooter />
        </div>
      </div>
    </ServerGate>
  );
}
