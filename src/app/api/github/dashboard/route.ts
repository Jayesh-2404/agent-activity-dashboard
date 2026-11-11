import { NextRequest, NextResponse } from "next/server";
import { githubFetch, GitHubError, isRepositoryName, type GitHubRepository } from "@/lib/github";
import { readLocalState, type LocalRead } from "@/lib/local-git";

export const runtime = "nodejs";

type Branch = { name: string; commit: { sha: string } };
type PullRequest = {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  additions: number;
  deletions: number;
  changed_files: number;
  user: { login: string; avatar_url: string } | null;
  head: { ref: string; sha: string };
  base: { ref: string };
  requested_reviewers: Array<{ login: string }>;
  merged_at: string | null;
};
type PullRequestDetails = PullRequest & { additions: number; deletions: number; changed_files: number };
type Review = { user: { login: string } | null; state: string; submitted_at: string | null };
type CheckRun = { status: string; conclusion: string | null };
type CheckRuns = { total_count: number; check_runs: CheckRun[] };
type Commit = { sha: string; commit: { message: string; author: { name: string; date: string } | null } };
type Comparison = { ahead_by: number; behind_by: number; commits: Commit[] };
type Deployment = { id: number; environment: string; created_at: string; sha: string; statuses_url: string };
type DeploymentStatus = { state: string };

async function optional<T>(path: string): Promise<T | null> {
  try { return await githubFetch<T>(path); } catch { return null; }
}

async function loadRepository(fullName: string) {
  const [repository, branches, pulls, deployments] = await Promise.all([
    githubFetch<GitHubRepository>(`/repos/${fullName}`),
    githubFetch<Branch[]>(`/repos/${fullName}/branches?per_page=100`),
    githubFetch<PullRequest[]>(`/repos/${fullName}/pulls?state=open&per_page=100&sort=updated&direction=desc`),
    optional<Deployment[]>(`/repos/${fullName}/deployments?per_page=1`),
  ]);

  const pullDetails = await Promise.all(pulls.slice(0, 2).map(async (pull) => {
    const [details, reviews, checks] = await Promise.all([
      optional<PullRequestDetails>(`/repos/${fullName}/pulls/${pull.number}`),
      optional<Review[]>(`/repos/${fullName}/pulls/${pull.number}/reviews?per_page=100`),
      optional<CheckRuns>(`/repos/${fullName}/commits/${pull.head.sha}/check-runs?per_page=100`),
    ]);
    const latestReviews = new Map<string, Review>();
    for (const review of reviews ?? []) {
      if (!review.user || !review.submitted_at || review.state === "COMMENTED") continue;
      const previous = latestReviews.get(review.user.login);
      if (!previous || (previous.submitted_at ?? "") < review.submitted_at) latestReviews.set(review.user.login, review);
    }
    const states = [...latestReviews.values()].map((review) => review.state);
    const reviewState = pull.draft ? "draft" : states.includes("CHANGES_REQUESTED") ? "changes_requested"
      : pull.requested_reviewers.length > 0 ? "in_review" : states.includes("APPROVED") ? "approved" : "ready";
    const checkRuns = checks?.check_runs ?? [];
    const checkState = checkRuns.some((check) => check.conclusion === "failure" || check.conclusion === "timed_out" || check.conclusion === "action_required")
      ? "failure" : checkRuns.some((check) => check.status !== "completed") ? "pending"
        : checkRuns.length > 0 ? "success" : "none";
    return {
      ...pull,
      additions: details?.additions ?? pull.additions ?? 0,
      deletions: details?.deletions ?? pull.deletions ?? 0,
      changed_files: details?.changed_files ?? pull.changed_files ?? 0,
      review_state: reviewState,
      check_state: checkState,
      check_count: checks?.total_count ?? 0,
    };
  }));
  const enrichedPulls = pulls.map((pull) => pullDetails.find((details) => details.number === pull.number) ?? {
    ...pull,
    additions: pull.additions ?? 0,
    deletions: pull.deletions ?? 0,
    changed_files: pull.changed_files ?? 0,
    review_state: "unknown",
    check_state: "unknown",
    check_count: 0,
  });

  const activeBranches = branches.filter((branch) => branch.name !== repository.default_branch);
  const compared = await Promise.all(activeBranches.slice(0, 5).map(async (branch) => {
    const comparison = await optional<Comparison>(`/repos/${fullName}/compare/${encodeURIComponent(repository.default_branch)}...${encodeURIComponent(branch.name)}`);
    return {
      name: branch.name,
      sha: branch.commit.sha,
      ahead: comparison?.ahead_by ?? 0,
      behind: comparison?.behind_by ?? 0,
      commits: (comparison?.commits ?? []).slice(-3).reverse().map((commit) => ({
        sha: commit.sha,
        message: commit.commit.message.split("\n")[0],
        author: commit.commit.author?.name ?? "Unknown",
        date: commit.commit.author?.date ?? "",
      })),
      pullRequest: enrichedPulls.find((pull) => pull.head.ref === branch.name) ?? null,
    };
  }));

  const latestDeployment = deployments?.[0] ?? null;
  const deploymentStatuses = latestDeployment
    ? await optional<DeploymentStatus[]>(deploymentStatusesPath(latestDeployment.statuses_url))
    : null;
  const latestSha = branches.find((branch) => branch.name === repository.default_branch)?.commit.sha ?? "";

  return {
    id: repository.id,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    private: repository.private,
    url: repository.html_url,
    defaultBranch: repository.default_branch,
    pushedAt: repository.pushed_at,
    latestSha,
    branches: compared,
    pullRequests: enrichedPulls.slice(0, 2).map((pull) => ({
      number: pull.number,
      title: pull.title,
      url: pull.html_url,
      draft: pull.draft,
      createdAt: pull.created_at,
      updatedAt: pull.updated_at,
      additions: pull.additions,
      deletions: pull.deletions,
      changedFiles: pull.changed_files,
      author: pull.user?.login ?? "ghost",
      avatarUrl: pull.user?.avatar_url ?? "",
      branch: pull.head.ref,
      base: pull.base.ref,
      headSha: pull.head.sha,
      reviewers: pull.requested_reviewers.map((reviewer) => reviewer.login),
      reviewState: pull.review_state,
      checkState: pull.check_state,
      checkCount: pull.check_count,
    })),
    deployment: latestDeployment ? {
      environment: latestDeployment.environment,
      date: latestDeployment.created_at,
      state: deploymentStatuses?.[0]?.state ?? "unknown",
      sha: latestDeployment.sha,
      matchesMain: latestDeployment.sha === latestSha,
    } : null,
    truncatedBranches: activeBranches.length > 5,
    openPullCount: pulls.length,
    pullRequestsTruncated: pulls.length > 2,
  };
}

function deploymentStatusesPath(value: string): string {
  try {
    const url = new URL(value);
    return url.hostname === "api.github.com" ? `${url.pathname}${url.search}` : "/invalid-deployment-status-url";
  } catch {
    return "/invalid-deployment-status-url";
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const values = request.nextUrl.searchParams.getAll("repo");
  const repositories = [...new Set(values)].slice(0, 12);
  if (repositories.length === 0 || repositories.some((name) => !isRepositoryName(name))) {
    return NextResponse.json({ error: "Choose between 1 and 12 valid repositories." }, { status: 400 });
  }

  try {
    const results = await Promise.all(repositories.map(async (name) => {
      try {
        const repository = await loadRepository(name);
        const local = await readLocalState(name, repository.defaultBranch).catch(
          (): LocalRead => ({ local: null, localError: "unreadable" }),
        );
        return { repository, ...local, error: null };
      } catch (error) {
        if (error instanceof GitHubError && error.status === 401) throw error;
        return {
          repository: null,
          ...(await readLocalState(name).catch(
            (): LocalRead => ({ local: null, localError: "unreadable" }),
          )),
          error: error instanceof Error ? error.message : "Could not load this repository.",
          name,
        };
      }
    }));
    return NextResponse.json({ repositories: results });
  } catch (error) {
    const status = error instanceof GitHubError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load dashboard." }, { status });
  }
}
