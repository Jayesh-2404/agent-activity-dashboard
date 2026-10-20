import { NextRequest, NextResponse } from "next/server";
import { githubFetch, githubFetchPage, GitHubError, isRepositoryName } from "@/lib/github";
import {
  HISTORY_PAGE_SIZE,
  PULL_COMMIT_LIMIT,
  toCommit,
  toHistoryItem,
  toPullDetail,
  type GitHubCommit,
  type GitHubPull,
  type GitHubPullDetail,
} from "@/lib/history-model";

export const runtime = "nodejs";

function positiveInt(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const repo = request.nextUrl.searchParams.get("repo") ?? "";
  if (!isRepositoryName(repo)) {
    return NextResponse.json({ error: "Choose a valid repository." }, { status: 400 });
  }

  const view = request.nextUrl.searchParams.get("view") ?? "commits";

  try {
    if (view === "commits") {
      const page = positiveInt(request.nextUrl.searchParams.get("page"), 1);
      let commits: GitHubCommit[] = [];
      let hasMore = false;
      try {
        const result = await githubFetchPage<GitHubCommit[]>(
          `/repos/${repo}/commits?per_page=${HISTORY_PAGE_SIZE}&page=${page}`,
        );
        commits = result.items;
        hasMore = result.hasNext;
      } catch (error) {
        // GitHub returns 409 for a repository with no commits yet.
        if (!(error instanceof GitHubError) || error.status !== 409) throw error;
      }
      return NextResponse.json({
        view,
        commits: commits.map(toCommit),
        page,
        hasMore,
      });
    }

    if (view === "pulls") {
      const page = positiveInt(request.nextUrl.searchParams.get("page"), 1);
      const result = await githubFetchPage<GitHubPull[]>(
        `/repos/${repo}/pulls?state=all&sort=updated&direction=desc&per_page=${HISTORY_PAGE_SIZE}&page=${page}`,
      );
      return NextResponse.json({
        view,
        pullRequests: result.items.map(toHistoryItem),
        page,
        hasMore: result.hasNext,
      });
    }

    if (view === "pull") {
      const number = positiveInt(request.nextUrl.searchParams.get("number"), 0);
      if (!number) {
        return NextResponse.json({ error: "Choose a pull request number." }, { status: 400 });
      }
      const [detail, commits] = await Promise.all([
        githubFetch<GitHubPullDetail>(`/repos/${repo}/pulls/${number}`),
        githubFetch<GitHubCommit[]>(
          `/repos/${repo}/pulls/${number}/commits?per_page=${PULL_COMMIT_LIMIT}`,
        ),
      ]);
      return NextResponse.json({
        view,
        pullRequest: toPullDetail(detail),
        commits: commits.map(toCommit),
        truncated: detail.commits > commits.length,
      });
    }

    return NextResponse.json({ error: "Unknown history view." }, { status: 400 });
  } catch (error) {
    const status = error instanceof GitHubError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load history." },
      { status },
    );
  }
}
