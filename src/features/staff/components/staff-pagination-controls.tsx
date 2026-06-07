"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StaffManagementDTO, StaffManagementListPaginationDTO } from "@/server/supabase/dal";
import {
  buildStaffManagementHref,
  type StaffPaginationSection,
} from "@/features/staff/components/staff-management-utils";

type PaginationControlsProps = {
  staffManagement: StaffManagementDTO;
  section: StaffPaginationSection;
  pagination: StaffManagementListPaginationDTO;
};

export function StaffPaginationControls({
  staffManagement,
  section,
  pagination,
}: PaginationControlsProps) {
  if (pagination.total <= pagination.pageSize && !pagination.hasPrevious) {
    return null;
  }

  const firstShown = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const lastShown = Math.min(pagination.page * pagination.pageSize, pagination.total);
  const previousHref = pagination.previousPage
    ? buildStaffManagementHref(staffManagement, section, pagination.previousPage)
    : null;
  const nextHref = pagination.nextPage
    ? buildStaffManagementHref(staffManagement, section, pagination.nextPage)
    : null;

  return (
    <div className="flex flex-col gap-3 border-t border-border bg-muted/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {firstShown}-{lastShown} of {pagination.total}
      </p>
      <div className="flex items-center gap-2">
        {previousHref ? (
          <Link
            href={previousHref}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </Link>
        ) : (
          <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground opacity-45">
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>Previous</span>
          </span>
        )}
        {nextHref ? (
          <Link
            href={nextHref}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
          >
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        ) : (
          <span className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold text-muted-foreground opacity-45">
            <span>Next</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </span>
        )}
      </div>
    </div>
  );
}
