import { NextRequest, NextResponse } from "next/server";
import { isRepositoryName } from "@/lib/github";
import { setLocalMapping } from "@/lib/local-git";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

async function readBody(
  request: NextRequest,
): Promise<{ fullName: string; path: string | null } | null> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return null;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const value = body as { fullName?: unknown; path?: unknown };
  if (typeof value.fullName !== "string" || !isRepositoryName(value.fullName)) return null;
  if (value.path !== null && typeof value.path !== "string") return null;
  const localPath = typeof value.path === "string" ? value.path.trim() : null;
  if (localPath === "") return null;
  return { fullName: value.fullName, path: localPath };
}

async function authorized(): Promise<boolean> {
  return (await getSession().catch(() => null)) !== null;
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  if (!(await authorized())) {
    return NextResponse.json({ error: "Sign in with GitHub to continue." }, { status: 401 });
  }

  const body = await readBody(request);
  if (!body) {
    return NextResponse.json({ error: "Choose a repository and a folder path." }, { status: 400 });
  }

  const result = await setLocalMapping(body.fullName, body.path);
  if (result.error) {
    return NextResponse.json(result, { status: 400 });
  }
  return NextResponse.json(result);
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  if (!(await authorized())) {
    return NextResponse.json({ error: "Sign in with GitHub to continue." }, { status: 401 });
  }

  const body = await readBody(request);
  if (!body || body.path !== null) {
    return NextResponse.json({ error: "Choose a repository to unlink." }, { status: 400 });
  }

  const result = await setLocalMapping(body.fullName, null);
  return NextResponse.json(result);
}
