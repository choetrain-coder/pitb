import SignInForm from "./sign-in-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return <SignInForm initialError={params.error} />;
}
