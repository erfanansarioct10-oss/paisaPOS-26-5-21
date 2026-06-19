import { Suspense } from "react";
import VerifyCodeContent from "./VerifyCodeContent";

type PageProps = {
  searchParams: Promise<{ email?: string }>;
};

export const metadata = {
  title: "Verify Code - Chlorif",
  description: "Enter the verification code sent to your email to reset your password.",
};

export default async function VerifyCodePage(props: PageProps) {
  const searchParams = await props.searchParams;
  const email = searchParams.email || "";

  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex flex-col justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    }>
      <VerifyCodeContent email={email} />
    </Suspense>
  );
}
