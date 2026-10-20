"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { formatAge, initials } from "@/lib/format";
import type { Repository, SessionData } from "@/lib/activity-types";
import styles from "./app-shell.module.css";

export type AppView = "queue" | "repositories";

function Avatar({
  user,
  size = 28,
  className = "",
}: {
  user?: SessionData["user"];
  size?: number;
  className?: string;
}) {
  if (user?.avatarUrl) {
    return (
      <img
        className={`${styles.avatar} ${className}`}
        style={{ width: size, height: size }}
        src={user.avatarUrl}
        alt=""
      />
    );
  }
  return (
    <span
      className={`${styles.avatarFallback} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {initials(user?.name || user?.login || "?")}
    </span>
  );
}

export function AppShell({
  view,
  onView,
  user,
  selectedRepos,
  queueCount,
  lastUpdated,
  syncing,
  syncError,
  onRefresh,
  onAddRepos,
  onSignOut,
  children,
}: {
  view: AppView;
  onView: (view: AppView) => void;
  user?: SessionData["user"];
  selectedRepos: Repository[];
  queueCount: number;
  lastUpdated: Date | null;
  syncing: boolean;
  syncError: boolean;
  onRefresh: () => void;
  onAddRepos: () => void;
  onSignOut: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuOrigin, setMenuOrigin] = useState<"desktop" | "mobile">("desktop");
  const desktopAccountRef = useRef<HTMLDivElement>(null);
  const mobileAccountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        !desktopAccountRef.current?.contains(target) &&
        !mobileAccountRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const container = menuOrigin === "desktop" ? desktopAccountRef.current : mobileAccountRef.current;
    const firstItem = container?.querySelector<HTMLButtonElement>("[role='menuitem']");
    firstItem?.focus();
  }, [menuOpen, menuOrigin]);

  const syncLabel = syncError
    ? "sync failed"
    : syncing
      ? "syncing"
      : lastUpdated
        ? `synced ${formatAge(lastUpdated.toISOString())}`
        : "waiting";

  const openMenu = (origin: "desktop" | "mobile") => {
    setMenuOrigin(origin);
    setMenuOpen((current) => (current && menuOrigin === origin ? false : true));
  };

  const signOut = async () => {
    setMenuOpen(false);
    await onSignOut();
  };

  const navItems = (
    <>
      <button
        className={styles.navLink}
        aria-current={view === "queue" ? "page" : undefined}
        onClick={() => onView("queue")}
      >
        <Icon name="git" size={15} />
        <span>Queue</span>
        <span className={styles.navCount}>{queueCount}</span>
      </button>
      <button
        className={styles.navLink}
        aria-current={view === "repositories" ? "page" : undefined}
        onClick={() => onView("repositories")}
      >
        <Icon name="repo" size={15} />
        <span>Repositories</span>
        <span className={styles.navCount}>{selectedRepos.length}</span>
      </button>
    </>
  );

  return (
    <div className={styles.shell}>
      <aside className={styles.rail}>
        <Brand className={styles.railBrand} />
        <nav className={styles.nav} aria-label="Primary">
          {navItems}
        </nav>

        <div className={styles.watch}>
          <p className={styles.watchLabel}>watching</p>
          <div className={styles.watchList}>
            {selectedRepos.slice(0, 7).map((repo) => (
              <span className={styles.watchItem} key={repo.id}>
                <Icon name="repo" size={12} />
                <span>{repo.name}</span>
              </span>
            ))}
            {selectedRepos.length > 7 ? (
              <span className={styles.watchMore}>+{selectedRepos.length - 7} more</span>
            ) : null}
            {selectedRepos.length === 0 ? (
              <span className={styles.watchMore}>none yet</span>
            ) : null}
          </div>
          <button className={styles.manage} onClick={onAddRepos}>
            <Icon name="plus" size={14} />
            Manage repositories
          </button>
        </div>

        <div className={styles.railBottom}>
          <p className={styles.readOnly}>
            <Icon name="lock" size={13} />
            Read-only. Nothing merges here.
          </p>
          <div className={styles.accountWrap} ref={desktopAccountRef}>
            <button
              className={styles.accountButton}
              aria-haspopup="menu"
              aria-expanded={menuOpen && menuOrigin === "desktop"}
              onClick={() => openMenu("desktop")}
            >
              <Avatar user={user} />
              <span className={styles.accountText}>
                <span className={styles.accountName}>{user?.name ?? user?.login ?? "Account"}</span>
                <span className={styles.accountLogin}>@{user?.login ?? "unknown"}</span>
              </span>
              <Icon name="chevron" size={13} className={styles.accountChevron} />
            </button>
            {menuOpen && menuOrigin === "desktop" ? (
              <div className={styles.accountMenu} role="menu" aria-label="Account">
                <p className={styles.menuIdentity}>Signed in as @{user?.login ?? "unknown"}</p>
                <button className={styles.menuItem} role="menuitem" onClick={() => void signOut()}>
                  <Icon name="logout" size={14} />
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <span className={styles.context}>
            {view === "queue" ? "queue" : "repositories"} / {selectedRepos.length} watched
          </span>
          <div className={styles.topActions}>
            <span className={styles.sync} aria-live="polite">
              <i
                className={styles.syncDot}
                data-state={syncError ? "error" : syncing ? "syncing" : "ok"}
              />
              {syncLabel}
            </span>
            <ThemeToggle />
            <button
              className={styles.refresh}
              onClick={onRefresh}
              aria-label="Refresh activity"
              title="Refresh now"
              disabled={syncing}
            >
              <Icon name="refresh" size={16} className={syncing ? "spin" : undefined} />
            </button>
          </div>
        </header>

        <header className={styles.mobileHeader}>
          <Brand />
          <div className={styles.mobileActions}>
            <span className={styles.mobileSync} aria-live="polite">
              <i
                className={styles.syncDot}
                data-state={syncError ? "error" : syncing ? "syncing" : "ok"}
              />
              {syncError ? "failed" : syncing ? "syncing" : "synced"}
            </span>
            <ThemeToggle />
            <button
              className={styles.refresh}
              onClick={onRefresh}
              aria-label="Refresh activity"
              disabled={syncing}
            >
              <Icon name="refresh" size={16} className={syncing ? "spin" : undefined} />
            </button>
            <div className={styles.mobileAccount} ref={mobileAccountRef}>
              <button
                className={styles.mobileAvatarButton}
                aria-haspopup="menu"
                aria-expanded={menuOpen && menuOrigin === "mobile"}
                aria-label="Account menu"
                onClick={() => openMenu("mobile")}
              >
                <Avatar user={user} size={28} />
              </button>
              {menuOpen && menuOrigin === "mobile" ? (
                <div className={styles.mobileMenu} role="menu" aria-label="Account">
                  <p className={styles.menuIdentity}>Signed in as @{user?.login ?? "unknown"}</p>
                  <button className={styles.menuItem} role="menuitem" onClick={() => void signOut()}>
                    <Icon name="logout" size={14} />
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className={styles.content}>{children}</div>
      </div>

      <nav className={styles.mobileNav} aria-label="Primary">
        <button
          className={styles.mobileNavButton}
          aria-current={view === "queue" ? "page" : undefined}
          onClick={() => onView("queue")}
        >
          <Icon name="git" size={17} />
          Queue
          <span className={styles.mobileCount}>{queueCount}</span>
        </button>
        <button
          className={styles.mobileNavButton}
          aria-current={view === "repositories" ? "page" : undefined}
          onClick={() => onView("repositories")}
        >
          <Icon name="repo" size={17} />
          Repositories
          <span className={styles.mobileCount}>{selectedRepos.length}</span>
        </button>
      </nav>
    </div>
  );
}
