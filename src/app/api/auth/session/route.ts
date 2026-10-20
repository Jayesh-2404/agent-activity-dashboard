import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  return NextResponse.json(session ? {
    authenticated: true,
    user: { login: session.login, name: session.name, avatarUrl: session.avatarUrl },
  } : { authenticated: false });
}
