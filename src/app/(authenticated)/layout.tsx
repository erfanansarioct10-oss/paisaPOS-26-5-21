import React from "react";
import { redirect } from "next/navigation";
import AuthenticatedShell from "@/components/authenticated-shell";
import { writeLog } from "@/lib/logger";
import { getCurrentUser } from "@/lib/server/dal";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    await writeLog("SECURITY", "SERVER_ROUTE_AUTH_DENIED", "Server-side authenticated layout denied route access", {
      errorMessage: "Missing or invalid user session",
    });
    redirect("/");
  }

  return <AuthenticatedShell>{children}</AuthenticatedShell>;
}
