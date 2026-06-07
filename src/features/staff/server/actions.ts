"use server";

import {
  acceptStaffInviteFormAction as acceptStaffInviteFormActionImpl,
  createDelegationStepUpProofAction as createDelegationStepUpProofActionImpl,
  grantPrivilegeDelegationFormAction as grantPrivilegeDelegationFormActionImpl,
  inviteStaffFormAction as inviteStaffFormActionImpl,
  reactivateStaffAction as reactivateStaffActionImpl,
  resendStaffInviteAction as resendStaffInviteActionImpl,
  revokePrivilegeDelegationAction as revokePrivilegeDelegationActionImpl,
  revokeStaffInviteAction as revokeStaffInviteActionImpl,
  suspendStaffAction as suspendStaffActionImpl,
} from "@/app/staff-actions";

export async function createDelegationStepUpProofAction(...args: Parameters<typeof createDelegationStepUpProofActionImpl>) {
  return createDelegationStepUpProofActionImpl(...args);
}

export async function inviteStaffFormAction(...args: Parameters<typeof inviteStaffFormActionImpl>) {
  return inviteStaffFormActionImpl(...args);
}

export async function revokeStaffInviteAction(...args: Parameters<typeof revokeStaffInviteActionImpl>) {
  return revokeStaffInviteActionImpl(...args);
}

export async function resendStaffInviteAction(...args: Parameters<typeof resendStaffInviteActionImpl>) {
  return resendStaffInviteActionImpl(...args);
}

export async function suspendStaffAction(...args: Parameters<typeof suspendStaffActionImpl>) {
  return suspendStaffActionImpl(...args);
}

export async function reactivateStaffAction(...args: Parameters<typeof reactivateStaffActionImpl>) {
  return reactivateStaffActionImpl(...args);
}

export async function grantPrivilegeDelegationFormAction(...args: Parameters<typeof grantPrivilegeDelegationFormActionImpl>) {
  return grantPrivilegeDelegationFormActionImpl(...args);
}

export async function revokePrivilegeDelegationAction(...args: Parameters<typeof revokePrivilegeDelegationActionImpl>) {
  return revokePrivilegeDelegationActionImpl(...args);
}

export async function acceptStaffInviteFormAction(...args: Parameters<typeof acceptStaffInviteFormActionImpl>) {
  return acceptStaffInviteFormActionImpl(...args);
}
