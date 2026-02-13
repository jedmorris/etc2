import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { DashboardShell } from "@/components/layout/DashboardShell";
import type { PlanId } from "@/lib/stripe/plans";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user profile for sidebar and header
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .single();

  const plan = (profile?.plan ?? "free") as PlanId;
  const userEmail = user.email ?? "";
  const userAvatarUrl = profile?.avatar_url ?? undefined;

  return (
    <DashboardShell
      plan={plan}
      userEmail={userEmail}
      userAvatarUrl={userAvatarUrl}
    >
      {children}
    </DashboardShell>
  );
}
