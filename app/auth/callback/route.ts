import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: staff } = await supabase.from("users").select("id").eq("user_id", user.id).maybeSingle();
        if (staff) return NextResponse.redirect(new URL("/", request.url));
      }
      await supabase.auth.signOut();
      return NextResponse.redirect(new URL("/login?error=not_registered", request.url));
    }
  }
  return NextResponse.redirect(new URL("/login?error=link", request.url));
}
