const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InviteRedirectSession = {
  invitationId: string;
  accessToken: string;
  refreshToken: string;
};

export type AuthRedirectHashSession = {
  type: string | null;
  invitationId: string | null;
  accessToken: string;
  refreshToken: string;
};

export type AuthRedirectHashError = {
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    const decode = typeof window !== "undefined" ? window.atob : globalThis.atob;
    if (!decode) return null;

    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const binary = decode(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isValidInvitationId(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function getInvitationIdFromAccessToken(accessToken: string): string | null {
  const [, payload] = accessToken.split(".");
  if (!payload) return null;

  const claims = decodeBase64UrlJson(payload);
  const metadata = claims?.user_metadata;
  if (!metadata || typeof metadata !== "object") return null;

  const rawInvitationId = (metadata as { invitation_id?: unknown }).invitation_id;
  const invitationId = typeof rawInvitationId === "string" ? rawInvitationId : null;
  return isValidInvitationId(invitationId)
    ? invitationId
    : null;
}

export function getAuthRedirectSessionFromHash(hash: string): AuthRedirectHashSession | null {
  if (!hash.startsWith("#") || hash.length <= 1) return null;

  const params = new URLSearchParams(hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (!accessToken || !refreshToken) return null;

  const directInvitationId = params.get("invitation_id");
  const invitationId = isValidInvitationId(directInvitationId)
    ? directInvitationId
    : getInvitationIdFromAccessToken(accessToken);

  return {
    type: params.get("type"),
    invitationId,
    accessToken,
    refreshToken,
  };
}

export function getAuthRedirectErrorFromHash(hash: string): AuthRedirectHashError | null {
  if (!hash.startsWith("#") || hash.length <= 1) return null;

  const params = new URLSearchParams(hash.slice(1));
  const error = params.get("error");
  const errorCode = params.get("error_code");
  const errorDescription = params.get("error_description");

  if (!error && !errorCode && !errorDescription) return null;

  return {
    error,
    errorCode,
    errorDescription,
  };
}

export function getInviteRedirectSessionFromHash(hash: string): InviteRedirectSession | null {
  const session = getAuthRedirectSessionFromHash(hash);
  if (!session || session.type !== "invite") return null;
  const invitationId = session.invitationId;
  if (!invitationId) return null;

  return {
    invitationId,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
  };
}

export function getInvitationIdFromStaffAcceptPath(path: string | null | undefined): string | null {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("\\") || path.startsWith("\\\\")) {
    return null;
  }

  try {
    const url = new URL(path, "https://app.local");
    if (url.pathname !== "/staff/accept") return null;

    const invitationId = url.searchParams.get("invitationId");
    return isValidInvitationId(invitationId) ? invitationId : null;
  } catch {
    return null;
  }
}

export function staffAcceptPath(invitationId: string): string {
  return `/staff/accept?invitationId=${encodeURIComponent(invitationId)}`;
}

export function getStaffAcceptReturnPath(path: string | null | undefined): string | null {
  const invitationId = getInvitationIdFromStaffAcceptPath(path);
  return invitationId ? staffAcceptPath(invitationId) : null;
}

export function staffAcceptLoginPath(invitationId: string): string {
  return `/?next=${encodeURIComponent(staffAcceptPath(invitationId))}`;
}
