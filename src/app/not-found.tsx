import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-dvh bg-background flex items-center justify-center px-6">
      <div className="w-full max-w-md border border-border bg-card rounded-xl p-6 shadow-sm text-center space-y-4">
        <div className="mx-auto h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <SearchX className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <h1 className="font-outfit text-xl font-bold text-foreground">Page not found</h1>
          <p className="text-sm text-muted-foreground">This route is not available.</p>
        </div>
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-95"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
      </div>
    </main>
  );
}
