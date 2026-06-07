import React from "react";
import { redirect } from "next/navigation";
import AuthenticatedShell from "@/shared/layout/authenticated-shell";
import { writeLog } from "@/server/logging/logger";
import { getCurrentUserResult } from "@/server/supabase/dal";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const userResult = await getCurrentUserResult();

  if (!userResult.ok && userResult.reason === "unauthenticated") {
    await writeLog("SECURITY", "SERVER_ROUTE_AUTH_DENIED", "Server-side authenticated layout denied route access", {
      errorMessage: userResult.message,
    });
    redirect("/");
  }

  if (!userResult.ok) {
    await writeLog("ERROR", "SERVER_ROUTE_AUTH_UNAVAILABLE", "Authenticated layout could not verify the current user", {
      errorMessage: userResult.message,
      reason: userResult.reason,
    });
    throw new Error("Authentication is temporarily unavailable. Please try again.");
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
