import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { appOrigin } from "@/lib/app-url";
import { writeStateCookie } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const appUrl = appOrigin(process.env.APP_URL, request.nextUrl.origin);
  if (!clientId || !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return NextResponse.redirect(new URL("/?auth=configuration", appUrl));
  }

  const state = randomBytes(24).toString("hex");
  await writeStateCookie(state);
  const callback = new URL("/api/auth/callback", appUrl).toString();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", clientId);
  authorize.searchParams.set("redirect_uri", callback);
  authorize.searchParams.set("state", state);
  return NextResponse.redirect(authorize);
}
