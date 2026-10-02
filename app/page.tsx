import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Workspace from "./Workspace";
import SignInForm from "./login/sign-in-form";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return <SignInForm />;
  const { data: staff } = await supabase.from("users").select("id").eq("user_id", user.id).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    redirect("/login?error=not_registered");
  }
  return <Workspace currentUserId={staff.id} />;
}
