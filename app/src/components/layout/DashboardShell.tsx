"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import type { PlanId } from "@/lib/stripe/plans";

interface DashboardShellProps {
  plan: PlanId;
  userEmail: string;
  userAvatarUrl?: string;
  children: React.ReactNode;
}

export function DashboardShell({
  plan,
  userEmail,
  userAvatarUrl,
  children,
}: DashboardShellProps) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar plan={plan} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AppHeader
          userEmail={userEmail}
          userAvatarUrl={userAvatarUrl}
          onLogout={handleLogout}
        />
        <main className="flex-1 overflow-y-auto bg-muted/30 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
