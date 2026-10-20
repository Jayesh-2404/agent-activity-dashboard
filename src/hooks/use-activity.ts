"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Repository, RepositoryResult, SessionData } from "@/lib/activity-types";

const REPOSITORIES_KEY = "agent-activity-repositories-v2";
const MAX_REPOSITORIES = 12;
const REFRESH_MS = 5 * 60_000;

type ActivityStatus = "loading" | "signed-out" | "ready";
type SyncState = "idle" | "syncing" | "error";
type FetchOutcome = "ok" | "signed-out" | "error";

function seenKey(login: string | undefined): string {
  return `agent-activity-seen-v2:${login ?? "anonymous"}`;
}

function readIds(): number[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(REPOSITORIES_KEY);
    if (raw === null) return null;
    const stored: unknown = JSON.parse(raw);
    return Array.isArray(stored) ? stored.filter((value): value is number => Number.isInteger(value)) : null;
  } catch {
    localStorage.removeItem(REPOSITORIES_KEY);
    return null;
  }
}

function writeIds(ids: number[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(REPOSITORIES_KEY, JSON.stringify(ids));
}

function readSeen(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(
      Object.entries(stored).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
    );
  } catch {
    localStorage.removeItem(key);
    return {};
  }
}

function writeSeen(key: string, snapshots: Record<string, string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(snapshots));
}

function authMessageFor(reason: string): string {
  const messages: Record<string, string> = {
    configuration: "Add your GitHub App credentials and a 32-character session secret to continue.",
    "invalid-state": "The sign-in link expired or could not be verified. Try again.",
    token: "GitHub could not complete sign-in. Check the app credentials and try again.",
    profile: "GitHub sign-in worked, but the profile could not be loaded. Try again.",
  };
  return messages[reason] ?? "GitHub sign-in did not complete. Try again.";
}

export function useActivity() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [status, setStatus] = useState<ActivityStatus>("loading");
  const [availableRepos, setAvailableRepos] = useState<Repository[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [results, setResults] = useState<RepositoryResult[]>([]);
  const [error, setError] = useState("");
  const [sync, setSync] = useState<SyncState>("idle");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [newRepos, setNewRepos] = useState<string[]>([]);

  const mounted = useRef(true);
  const initialized = useRef(false);
  const dashboardRequest = useRef<AbortController | null>(null);
  const reposRef = useRef<Repository[]>([]);
  const selectedRef = useRef<number[]>([]);
  const seenRef = useRef<Record<string, string>>({});
  const loginRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      dashboardRequest.current?.abort();
    };
  }, []);

  useEffect(() => {
    selectedRef.current = selectedIds;
  }, [selectedIds]);

  const fetchDashboard = useCallback(
    async (ids: number[], repoList: Repository[], initial: boolean): Promise<FetchOutcome> => {
      // A new selection or manual refresh supersedes the request already running.
      dashboardRequest.current?.abort();
      const controller = new AbortController();
      dashboardRequest.current = controller;
      const isCurrent = () => dashboardRequest.current === controller;

      if (ids.length === 0) {
        setResults([]);
        setError("");
        setSync("idle");
        setLastUpdated(new Date());
        return "ok";
      }

      const selected = repoList.filter((repo) => ids.includes(repo.id));
      if (selected.length === 0) return "ok";

      if (!initial) setSync("syncing");
      setError("");

      try {
        const params = selected
          .map((repo) => `repo=${encodeURIComponent(repo.fullName)}`)
          .join("&");
        const response = await fetch(`/api/github/dashboard?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!isCurrent()) return "ok";
        const payload = (await response.json()) as {
          repositories?: RepositoryResult[];
          error?: string;
        };
        if (!isCurrent()) return "ok";

        if (response.status === 401) {
          setSession({ authenticated: false });
          setStatus("signed-out");
          return "signed-out";
        }
        if (!response.ok) {
          throw new Error(payload.error ?? "Could not refresh repository activity.");
        }
        if (!mounted.current) return "ok";

        const nextResults = payload.repositories ?? [];
        setResults(nextResults);
        setLastUpdated(new Date());

        const nextSnapshots: Record<string, string> = {};
        const changed: string[] = [];
        const firstVisit = Object.keys(seenRef.current).length === 0;
        for (const result of nextResults) {
          const repository = result.repository;
          if (!repository) continue;
          nextSnapshots[repository.fullName] = repository.latestSha;
          const previous = seenRef.current[repository.fullName];
          if (!firstVisit && previous && repository.latestSha && previous !== repository.latestSha) {
            changed.push(repository.fullName);
          }
        }

        if (firstVisit) {
          seenRef.current = nextSnapshots;
          writeSeen(seenKey(loginRef.current), nextSnapshots);
        }

        setNewRepos(changed);
        setStatus("ready");
        setSync("idle");
        return "ok";
      } catch (fetchError) {
        if (!isCurrent()) return "ok";
        if (mounted.current) {
          setError(fetchError instanceof Error ? fetchError.message : "Could not refresh repository activity.");
          setStatus("ready");
          setSync("error");
        }
        return "error";
      } finally {
        if (isCurrent()) dashboardRequest.current = null;
      }
    },
    [],
  );

  const loadRepositories = useCallback(
    async (login: string) => {
      setStatus("loading");
      setError("");
      try {
        const response = await fetch("/api/github/repos", { cache: "no-store" });
        if (response.status === 401) {
          setSession({ authenticated: false });
          setStatus("signed-out");
          return;
        }
        const payload = (await response.json()) as Repository[] | { error: string };
        if (!response.ok) {
          throw new Error("error" in payload ? payload.error : "Could not load your repositories.");
        }
        if (!mounted.current) return;

        const repoList = payload as Repository[];
        reposRef.current = repoList;
        setAvailableRepos(repoList);

        const stored = readIds();
        const validStored = (stored ?? [])
          .filter((id) => repoList.some((repo) => repo.id === id))
          .slice(0, MAX_REPOSITORIES);
        const noSavedSelection = stored === null;
        const savedSelectionIsStale = stored !== null && stored.length > 0 && validStored.length === 0;
        const nextIds =
          noSavedSelection || savedSelectionIsStale
            ? repoList.slice(0, 5).map((repo) => repo.id)
            : validStored;

        selectedRef.current = nextIds;
        setSelectedIds(nextIds);
        writeIds(nextIds);
        seenRef.current = readSeen(seenKey(login));

        const outcome = await fetchDashboard(nextIds, repoList, true);
        if (outcome !== "signed-out" && mounted.current) setStatus("ready");
      } catch (loadError) {
        if (!mounted.current) return;
        setError(loadError instanceof Error ? loadError.message : "Could not connect to GitHub.");
        setStatus("ready");
      }
    },
    [fetchDashboard],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const reason = new URLSearchParams(window.location.search).get("auth");
    if (reason) {
      setAuthMessage(authMessageFor(reason));
      window.history.replaceState({}, "", window.location.pathname);
    }

    let alive = true;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => (await response.json()) as SessionData)
      .then((data) => {
        if (!alive) return;
        setSession(data);
        loginRef.current = data.user?.login;
        if (data.authenticated) {
          void loadRepositories(data.user?.login ?? "anonymous");
        } else {
          setStatus("signed-out");
        }
      })
      .catch(() => {
        if (!alive) return;
        setSession({ authenticated: false });
        setStatus("signed-out");
      });

    return () => {
      alive = false;
    };
  }, [loadRepositories]);

  const commitSelection = useCallback(
    (ids: number[]) => {
      const next = [...new Set(ids)]
        .filter((id) => reposRef.current.some((repo) => repo.id === id))
        .slice(0, MAX_REPOSITORIES);
      selectedRef.current = next;
      setSelectedIds(next);
      writeIds(next);
      void fetchDashboard(next, reposRef.current, false);
    },
    [fetchDashboard],
  );

  const refresh = useCallback(() => {
    if (reposRef.current.length === 0) {
      void loadRepositories(loginRef.current ?? "anonymous");
      return;
    }
    void fetchDashboard(selectedRef.current, reposRef.current, false);
  }, [fetchDashboard, loadRepositories]);

  const retry = useCallback(() => {
    void loadRepositories(loginRef.current ?? "anonymous");
  }, [loadRepositories]);

  const markSeen = useCallback(() => {
    const next = { ...seenRef.current };
    for (const result of results) {
      const repository = result.repository;
      if (repository) next[repository.fullName] = repository.latestSha;
    }
    seenRef.current = next;
    writeSeen(seenKey(loginRef.current), next);
    setNewRepos([]);
  }, [results]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setSession({ authenticated: false });
      setStatus("signed-out");
      setResults([]);
      setAvailableRepos([]);
      setSelectedIds([]);
      setNewRepos([]);
    }
  }, []);

  useEffect(() => {
    if (status !== "ready" || selectedIds.length === 0) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchDashboard(selectedRef.current, reposRef.current, false);
      }
    }, REFRESH_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void fetchDashboard(selectedRef.current, reposRef.current, false);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [status, selectedIds, fetchDashboard]);

  return {
    status,
    session,
    authMessage,
    availableRepos,
    selectedIds,
    results,
    error,
    sync,
    lastUpdated,
    newRepos,
    refresh,
    retry,
    commitSelection,
    markSeen,
    signOut,
  };
}

export type { ActivityStatus, SyncState };
