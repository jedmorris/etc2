import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const ADMIN_USER_ID = "865a7d10-48e6-4e5d-8d96-0b2b990eab62";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== ADMIN_USER_ID) {
    redirect("/app");
  }

  return <>{children}</>;
}
