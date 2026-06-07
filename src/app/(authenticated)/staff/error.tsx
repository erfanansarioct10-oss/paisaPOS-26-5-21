"use client";

import { useEffect } from "react";
import { RotateCcw, UsersRound } from "lucide-react";

export default function StaffError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("Staff route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="flex min-h-[420px] items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <UsersRound className="h-5 w-5" />
        </div>
        <h1 className="mt-4 font-outfit text-xl font-bold text-foreground">Staff could not load</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Staff access is temporarily unavailable. Try again before making changes.
        </p>
        <button
          type="button"
          onClick={() => unstable_retry()}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
        >
          <RotateCcw className="h-4 w-4" />
          Retry
        </button>
      </section>
    </div>
  );
}
