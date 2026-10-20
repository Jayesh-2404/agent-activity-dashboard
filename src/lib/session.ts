import { cookies } from "next/headers";

export type UserSession = {
  accessToken: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
  login: string;
  name: string;
  avatarUrl: string;
  expiresAt: number;
};

const SESSION_COOKIE = "agent_activity_session";
const STATE_COOKIE = "github_oauth_state";

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32) {
    throw new Error("SESSION_SECRET must contain at least 32 characters.");
  }
  return value;
}

async function encryptionKey(): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret()));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function encodeBytes(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBytes(value: string): Uint8Array<ArrayBuffer> {
  const decoded = Buffer.from(value, "base64url");
  const bytes = new Uint8Array(decoded.byteLength);
  bytes.set(decoded);
  return bytes;
}

export async function sealSession(session: UserSession): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(JSON.stringify(session)),
  );
  return `${encodeBytes(iv)}.${encodeBytes(new Uint8Array(encrypted))}`;
}

export async function getSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SESSION_COOKIE)?.value;
  if (!value) return null;

  try {
    const [encodedIv, encodedPayload] = value.split(".");
    if (!encodedIv || !encodedPayload) return null;
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: decodeBytes(encodedIv) },
      await encryptionKey(),
      decodeBytes(encodedPayload),
    );
    const session = JSON.parse(new TextDecoder().decode(decrypted)) as UserSession;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

export async function saveSession(session: UserSession): Promise<void> {
  await writeSessionCookie(await sealSession(session));
}

export async function writeSessionCookie(value: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function writeStateCookie(value: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function consumeStateCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(STATE_COOKIE)?.value ?? null;
  cookieStore.delete(STATE_COOKIE);
  return value;
}
