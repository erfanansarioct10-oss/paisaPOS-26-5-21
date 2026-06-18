import Link from "next/link";
import { CheckCircle, AlertCircle, Store } from "lucide-react";
import { verifySignupTokenAction } from "@/app/auth-actions";

type PageProps = {
  searchParams: Promise<{ token?: string }>;
};

export const metadata = {
  title: "Verify Account - Chlorif",
  description: "Verify your Chlorif store owner account email to get started.",
};

export default async function VerifyPage(props: PageProps) {
  const searchParams = await props.searchParams;
  const token = searchParams.token;

  let success = false;
  let errorMsg = "";

  if (!token) {
    errorMsg = "Verification token is missing from the link.";
  } else {
    const res = await verifySignupTokenAction(token);
    if (res.error) {
      errorMsg = res.error;
    } else {
      success = true;
    }
  }

  return (
    <main className="min-h-screen bg-background flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-50 dark:opacity-20 pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 text-center">
        <div className="mx-auto h-12 w-12 rounded-xl bg-primary flex items-center justify-center shadow-lg border border-primary/20">
          <Store className="w-6 h-6 text-primary-foreground" />
        </div>
        <h1 className="mt-4 font-outfit text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
          Chlorif
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nepali Boutique Sync
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10 px-4 sm:px-0">
        <div className="bg-card border border-border rounded-2xl shadow-xl p-8 text-center space-y-6">
          {success ? (
            <div className="space-y-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 border border-emerald-500/20">
                <CheckCircle className="w-8 h-8" />
              </div>
              <h2 className="font-outfit text-2xl font-bold text-foreground">
                Account Verified!
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your email has been successfully verified. Your store profile is active, and you can now log in to the system.
              </p>
              <div className="pt-2">
                <Link
                  id="login-btn"
                  href="/"
                  className="w-full flex items-center justify-center px-4 py-2.5 bg-primary text-primary-foreground font-semibold text-sm rounded-lg hover:opacity-95 shadow transition-all focus:outline-none"
                >
                  Sign In to Store
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center text-red-500 border border-red-500/20">
                <AlertCircle className="w-8 h-8" />
              </div>
              <h2 className="font-outfit text-2xl font-bold text-foreground">
                Verification Failed
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {errorMsg || "The verification link is invalid or expired."}
              </p>
              <div className="pt-2">
                <Link
                  id="register-btn"
                  href="/"
                  className="w-full flex items-center justify-center px-4 py-2.5 bg-secondary text-foreground font-semibold text-sm rounded-lg hover:bg-secondary/80 border border-border transition-all focus:outline-none"
                >
                  Back to Registration
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
