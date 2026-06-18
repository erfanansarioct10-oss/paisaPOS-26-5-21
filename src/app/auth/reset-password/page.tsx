import { Suspense } from "react";
import ResetPasswordContent from "./ResetPasswordContent";

type PageProps = {
  searchParams: Promise<{ email?: string; token?: string }>;
};

export const metadata = {
  title: "Reset Password - Chlorif",
  description: "Enter a new password for your Chlorif boutique store account.",
};

export default async function ResetPasswordPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const email = searchParams.email || "";
  const token = searchParams.token || "";

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <ResetPasswordContent email={email} token={token} />
    </Suspense>
  );
}
