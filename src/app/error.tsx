"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error.digest ?? error.message);
  }, [error]);

  return (
    <main className="min-h-dvh bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md border border-border bg-card rounded-xl p-6 shadow-sm text-center space-y-4">
        <div className="mx-auto h-11 w-11 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="font-outfit text-xl font-bold text-foreground">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">Refresh this workspace and try the action again.</p>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
        >
          <RotateCcw className="h-4 w-4" />
          Retry
        </button>
      </div>
    </main>
  );
}
