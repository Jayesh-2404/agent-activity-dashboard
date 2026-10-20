import { NextResponse } from "next/server";
import { githubFetch, GitHubError, type GitHubRepository } from "@/lib/github";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  try {
    const repos = await githubFetch<GitHubRepository[]>("/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member");
    return NextResponse.json(repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      private: repo.private,
      url: repo.html_url,
      defaultBranch: repo.default_branch,
      pushedAt: repo.pushed_at,
      stars: repo.stargazers_count,
      owner: repo.owner.login,
      avatarUrl: repo.owner.avatar_url,
    })));
  } catch (error) {
    const status = error instanceof GitHubError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load repositories." }, { status });
  }
}
