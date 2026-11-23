import { redirect } from "next/navigation";
import ServerGate from "@/components/ServerGate";
import { AppFooterWhenReady } from "@/components/AppFooter";
import AppNavbar from "@/components/AppNavbar";
import Sidebar from "@/components/Sidebar";
import SyncBanner from "@/components/SyncBanner";
import AppLock from "@/components/AppLock";
import AlertsWatcher from "@/components/AlertsWatcher";
import ProfileGate from "@/components/ProfileGate";
import PrefsSync from "@/components/PrefsSync";
import QuickAdd from "@/components/QuickAdd";
import { SpaceBoundary, SpaceProvider } from "@/lib/space";
import { needsSecondStep } from "@/lib/mfa";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Two-step sign-in is on and this session has not given its code yet.
  if (await needsSecondStep(supabase.auth)) redirect("/verify");

  return (
    <ServerGate>
      <SpaceProvider>
        <ProfileGate>
          <div className="shell">
            <Sidebar email={user.email ?? ""} />
            <div className="content">
              <SyncBanner />
              <AppNavbar />
              <main className="main">
                <SpaceBoundary>{children}</SpaceBoundary>
              </main>
            </div>
          </div>
          <AppFooterWhenReady />
          <QuickAdd />
          <AlertsWatcher />
          <AppLock userId={user.id} />
          <PrefsSync />
        </ProfileGate>
      </SpaceProvider>
    </ServerGate>
  );
}
