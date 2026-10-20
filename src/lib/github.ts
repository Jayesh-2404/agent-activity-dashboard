import { getSession, saveSession, type UserSession } from "@/lib/session";

const API_ROOT = "https://api.github.com";
// Keyed by refresh token so two signed-in users can never share a refresh result.
const refreshInFlight = new Map<string, Promise<UserSession>>();
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

async function acquireRequestSlot(): Promise<void> {
  if (activeRequests >= 8) await new Promise<void>((resolve) => requestQueue.push(resolve));
  activeRequests += 1;
}

function releaseRequestSlot(): void {
  activeRequests -= 1;
  requestQueue.shift()?.();
}

async function currentSession(): Promise<UserSession> {
  const session = await getSession();
  if (!session) throw new GitHubError("Sign in with GitHub to continue.", 401);
  if (!session.accessTokenExpiresAt || session.accessTokenExpiresAt > Date.now() + 60_000) return session;
  if (!session.refreshToken || (session.refreshTokenExpiresAt && session.refreshTokenExpiresAt <= Date.now())) {
    throw new GitHubError("Your GitHub session expired. Sign in again to continue.", 401);
  }
  const refreshToken = session.refreshToken;
  const pending = refreshInFlight.get(refreshToken);
  if (pending) return pending;

  const refresh = (async () => {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.GITHUB_APP_CLIENT_ID,
        client_secret: process.env.GITHUB_APP_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await response.json() as { access_token?: string; expires_in?: number; refresh_token?: string; refresh_token_expires_in?: number };
    if (!response.ok || !data.access_token) throw new GitHubError("Your GitHub session expired. Sign in again to continue.", 401);
    const refreshed: UserSession = {
      ...session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      accessTokenExpiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
      refreshTokenExpiresAt: data.refresh_token_expires_in ? Date.now() + data.refresh_token_expires_in * 1000 : session.refreshTokenExpiresAt,
    };
    await saveSession(refreshed);
    return refreshed;
  })().finally(() => { refreshInFlight.delete(refreshToken); });

  refreshInFlight.set(refreshToken, refresh);
  return refresh;
}

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  pushed_at: string | null;
  stargazers_count: number;
  owner: { login: string; avatar_url: string };
};

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export function hasNextPage(linkHeader: string | null): boolean {
  return linkHeader?.includes('rel="next"') ?? false;
}

async function githubRequest(path: string): Promise<Response> {
  const session = await currentSession();

  await acquireRequestSlot();
  let response: Response;
  try {
    response = await fetch(`${API_ROOT}${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${session.accessToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
      cache: "no-store",
    });
  } finally {
    releaseRequestSlot();
  }

  if (!response.ok) {
    const message = response.status === 403
      ? "GitHub denied this request. Check the app permissions and API rate limit."
      : response.status === 404
        ? "This repository is unavailable to the connected GitHub app."
        : `GitHub returned an error (${response.status}).`;
    throw new GitHubError(message, response.status);
  }

  return response;
}

export async function githubFetch<T>(path: string): Promise<T> {
  const response = await githubRequest(path);
  return (await response.json()) as T;
}

// A page request keeps GitHub's page size in sync with the items we show, so
// later pages start where the previous one ended. The Link header reports
// whether another page exists without fetching an extra item.
export async function githubFetchPage<T>(path: string): Promise<{ items: T; hasNext: boolean }> {
  const response = await githubRequest(path);
  const items = (await response.json()) as T;
  return { items, hasNext: hasNextPage(response.headers.get("link")) };
}

export function isRepositoryName(value: string): boolean {
  const parts = value.split("/");
  return (
    parts.length === 2 &&
    parts.every((part) => part !== "." && part !== ".." && /^[A-Za-z0-9_.-]+$/.test(part))
  );
}
