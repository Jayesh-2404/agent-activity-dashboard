"use client";

import { useCallback, useMemo, useState } from "react";
import { AppShell, type AppView } from "@/components/app-shell";
import { Brand } from "@/components/brand";
import { QueueView } from "@/components/queue-view";
import { RepoHistory } from "@/components/repo-history";
import { RepoList } from "@/components/repo-list";
import { RepoPicker } from "@/components/repo-picker";
import { Welcome } from "@/components/welcome";
import { useActivity } from "@/hooks/use-activity";
import { buildWorkItems, summarize } from "@/lib/activity-model";
import type { RepositoryView } from "@/lib/activity-types";

export default function Home() {
  const activity = useActivity();
  const [view, setView] = useState<AppView>("queue");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [historyRepo, setHistoryRepo] = useState<RepositoryView | null>(null);

  const workItems = useMemo(() => buildWorkItems(activity.results), [activity.results]);
  const summary = useMemo(() => summarize(workItems), [workItems]);
  const loadedRepositories = useMemo(
    () =>
      activity.results.flatMap((result) =>
        result.repository
          ? [{ ...result.repository, local: result.local, localError: result.localError }]
          : [],
      ),
    [activity.results],
  );
  const errors = useMemo(
    () => activity.results.filter((result) => result.error),
    [activity.results],
  );
  const selectedRepos = useMemo(
    () => activity.availableRepos.filter((repo) => activity.selectedIds.includes(repo.id)),
    [activity.availableRepos, activity.selectedIds],
  );

  const openPicker = useCallback(() => setPickerOpen(true), []);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const savePicker = useCallback(
    (ids: number[]) => {
      activity.commitSelection(ids);
      setPickerOpen(false);
    },
    [activity.commitSelection],
  );
  const openHistory = useCallback((repo: RepositoryView) => setHistoryRepo(repo), []);
  const closeHistory = useCallback(() => setHistoryRepo(null), []);

  if (activity.status === "loading") {
    return (
      <main className="loadingScreen" aria-busy="true">
        <Brand />
        <div className="loadingLine" aria-hidden="true" />
        <p className="loadingText">Reading your repositories...</p>
        <span className="srOnly">Loading your GitHub activity</span>
      </main>
    );
  }

  if (activity.status === "signed-out") {
    return <Welcome authMessage={activity.authMessage} />;
  }

  return (
    <>
      <AppShell
        view={view}
        onView={setView}
        user={activity.session?.user}
        selectedRepos={selectedRepos}
        queueCount={summary.needsYou}
        lastUpdated={activity.lastUpdated}
        syncing={activity.sync === "syncing"}
        syncError={activity.sync === "error"}
        onRefresh={activity.refresh}
        onAddRepos={openPicker}
        onSignOut={activity.signOut}
      >
        {view === "queue" ? (
          <QueueView
            items={workItems}
            summary={summary}
            repositories={loadedRepositories}
            selectedCount={selectedRepos.length}
            errors={errors}
            lastUpdated={activity.lastUpdated}
            newRepos={activity.newRepos}
            refreshing={activity.sync === "syncing"}
            error={activity.error}
            onRefresh={activity.refresh}
            onRetry={activity.retry}
            onAddRepos={openPicker}
            onMarkSeen={activity.markSeen}
          />
        ) : (
          <RepoList
            selectedRepos={selectedRepos}
            repositories={loadedRepositories}
            results={activity.results}
            onManage={openPicker}
            onHistory={openHistory}
          />
        )}
      </AppShell>

      <RepoPicker
        open={pickerOpen}
        repositories={activity.availableRepos}
        selectedIds={activity.selectedIds}
        onClose={closePicker}
        onSave={savePicker}
      />

      <RepoHistory
        key={historyRepo?.fullName ?? "closed"}
        repo={historyRepo}
        onClose={closeHistory}
      />
    </>
  );
}
