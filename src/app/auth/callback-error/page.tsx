import type { Metadata } from "next";
import AuthCallbackErrorContent from "@/features/auth/components/auth-callback-error-content";

export const metadata: Metadata = {
  title: "Sign-in Link Issue | PaisaPOS",
};

type CallbackErrorPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CallbackErrorPage({ searchParams }: CallbackErrorPageProps) {
  const params = await searchParams;
  const reason = firstParam(params.reason);

  return (
    <main className="min-h-dvh bg-background flex items-center justify-center px-6">
      <AuthCallbackErrorContent reason={reason} />
    </main>
  );
}
