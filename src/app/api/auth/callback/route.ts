import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/lib/app-url";
import { consumeStateCookie, sealSession, writeSessionCookie, type UserSession } from "@/lib/session";

export const runtime = "nodejs";

type TokenResponse = { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number; error?: string };
type GitHubUser = { login: string; name: string | null; avatar_url: string };

function home(request: NextRequest, reason?: string): URL {
  const url = new URL("/", appOrigin(process.env.APP_URL, request.nextUrl.origin));
  if (reason) url.searchParams.set("auth", reason);
  return url;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const savedState = await consumeStateCookie();
  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(home(request, "invalid-state"));
  }

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(home(request, "configuration"));

  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  const token = (await tokenResponse.json()) as TokenResponse;
  if (!tokenResponse.ok || !token.access_token) return NextResponse.redirect(home(request, "token"));

  const profileResponse = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token.access_token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!profileResponse.ok) return NextResponse.redirect(home(request, "profile"));
  const profile = (await profileResponse.json()) as GitHubUser;
  const session: UserSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    accessTokenExpiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    refreshTokenExpiresAt: token.refresh_token_expires_in ? Date.now() + token.refresh_token_expires_in * 1000 : undefined,
    login: profile.login,
    name: profile.name ?? profile.login,
    avatarUrl: profile.avatar_url,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  };

  await writeSessionCookie(await sealSession(session));
  return NextResponse.redirect(home(request));
}
