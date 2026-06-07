import { describe, expect, test } from "vitest";
import {
  getAuthRedirectErrorFromHash,
  getAuthRedirectSessionFromHash,
  getInvitationIdFromStaffAcceptPath,
  getInviteRedirectSessionFromHash,
  getStaffAcceptReturnPath,
  staffAcceptLoginPath,
  staffAcceptPath,
} from "../invite-redirect";

function base64UrlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value))
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("invite redirect helpers", () => {
  test("extracts staff invitation session details from Supabase invite hash", () => {
    const invitationId = "88f5d394-70e5-4950-ad5d-10e8dae0c7e8";
    const token = [
      base64UrlJson({ alg: "none" }),
      base64UrlJson({ user_metadata: { invitation_id: invitationId } }),
      "signature",
    ].join(".");
    const hash = `#access_token=${token}&refresh_token=refresh-token&type=invite`;

    expect(getInviteRedirectSessionFromHash(hash)).toEqual({
      invitationId,
      accessToken: token,
      refreshToken: "refresh-token",
    });

    expect(getAuthRedirectSessionFromHash(hash)).toEqual({
      type: "invite",
      invitationId,
      accessToken: token,
      refreshToken: "refresh-token",
    });
  });

  test("ignores non-invite or malformed hashes", () => {
    expect(getInviteRedirectSessionFromHash("")).toBeNull();
    expect(getInviteRedirectSessionFromHash("#type=recovery")).toBeNull();
    expect(getInviteRedirectSessionFromHash("#type=invite&access_token=bad&refresh_token=refresh")).toBeNull();
  });

  test("extracts generic Supabase hash sessions for recovery fallback handling", () => {
    const hash = "#access_token=access-token&refresh_token=refresh-token&type=recovery";

    expect(getAuthRedirectSessionFromHash(hash)).toEqual({
      type: "recovery",
      invitationId: null,
      accessToken: "access-token",
      refreshToken: "refresh-token",
    });
  });

  test("extracts Supabase auth errors from redirect fragments", () => {
    const hash = "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired";

    expect(getAuthRedirectErrorFromHash(hash)).toEqual({
      error: "access_denied",
      errorCode: "otp_expired",
      errorDescription: "Email link is invalid or has expired",
    });
  });

  test("extracts invitation ids from staff accept redirect paths", () => {
    const invitationId = "88f5d394-70e5-4950-ad5d-10e8dae0c7e8";

    expect(getInvitationIdFromStaffAcceptPath(`/staff/accept?invitationId=${invitationId}`)).toBe(invitationId);
    expect(getInvitationIdFromStaffAcceptPath("/staff/accept?invitationId=not-a-uuid")).toBeNull();
    expect(getInvitationIdFromStaffAcceptPath("//evil.test/staff/accept?invitationId=88f5d394-70e5-4950-ad5d-10e8dae0c7e8")).toBeNull();
    expect(getInvitationIdFromStaffAcceptPath("/dashboard")).toBeNull();
  });

  test("formats the staff accept path without exposing auth tokens", () => {
    expect(staffAcceptPath("88f5d394-70e5-4950-ad5d-10e8dae0c7e8")).toBe(
      "/staff/accept?invitationId=88f5d394-70e5-4950-ad5d-10e8dae0c7e8",
    );
  });

  test("formats safe login return paths for staff invite acceptance", () => {
    const invitationId = "88f5d394-70e5-4950-ad5d-10e8dae0c7e8";
    const acceptPath = `/staff/accept?invitationId=${invitationId}`;

    expect(getStaffAcceptReturnPath(acceptPath)).toBe(acceptPath);
    expect(staffAcceptLoginPath(invitationId)).toBe(`/?next=${encodeURIComponent(acceptPath)}`);
    expect(getStaffAcceptReturnPath("//evil.test/staff/accept?invitationId=88f5d394-70e5-4950-ad5d-10e8dae0c7e8")).toBeNull();
    expect(getStaffAcceptReturnPath("/staff/accept?invitationId=not-a-uuid")).toBeNull();
  });
});
