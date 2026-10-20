"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import type { Repository } from "@/lib/activity-types";
import styles from "./repo-picker.module.css";

export function RepoPicker({
  open,
  repositories,
  selectedIds,
  onClose,
  onSave,
  max = 12,
}: {
  open: boolean;
  repositories: Repository[];
  selectedIds: number[];
  onClose: () => void;
  onSave: (ids: number[]) => void;
  max?: number;
}) {
  const [draft, setDraft] = useState<number[]>(selectedIds);
  const [query, setQuery] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;

    setDraft(selectedIds.filter((id) => repositories.some((repo) => repo.id === id)));
    setQuery("");

    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => searchRef.current?.focus(), 20);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable) return;
      const items = Array.from(focusable).filter((element) => element.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [open, selectedIds, repositories, onClose]);

  const selected = useMemo(() => new Set(draft), [draft]);
  const atLimit = draft.length >= max;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...repositories]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .filter((repo) => {
        if (!needle) return true;
        return (
          repo.fullName.toLowerCase().includes(needle) ||
          (repo.description ?? "").toLowerCase().includes(needle)
        );
      });
  }, [repositories, query]);

  if (!open) return null;

  const toggle = (id: number) => {
    setDraft((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= max) return current;
      return [...current, id];
    });
  };

  const onBackdropDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose();
  };

  return (
    <div className={styles.backdrop} onMouseDown={onBackdropDown}>
      <div
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="repo-picker-title"
        aria-describedby="repo-picker-desc"
      >
        <header className={styles.header}>
          <div>
            <h2 className={styles.title} id="repo-picker-title">
              Repositories
            </h2>
            <p className={styles.description} id="repo-picker-desc">
              Choose up to {max}. Fewer repositories mean fewer GitHub requests.
            </p>
          </div>
          <button className={styles.close} onClick={onClose} aria-label="Close repository picker">
            <Icon name="x" size={17} />
          </button>
        </header>

        <div className={styles.search}>
          <Icon name="search" size={15} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter repositories"
            aria-label="Filter repositories"
          />
          {query ? (
            <button
              className={styles.clearSearch}
              onClick={() => setQuery("")}
              aria-label="Clear filter"
              type="button"
            >
              <Icon name="x" size={14} />
            </button>
          ) : null}
        </div>

        <div className={styles.list}>
          {filtered.length === 0 ? (
            <p className={styles.noResults}>
              {repositories.length === 0
                ? "No repositories are available for this GitHub App installation."
                : "No repositories match that filter."}
            </p>
          ) : (
            filtered.map((repo) => {
              const isSelected = selected.has(repo.id);
              const disabled = !isSelected && atLimit;
              return (
                <label
                  className={styles.option}
                  key={repo.id}
                  data-selected={isSelected}
                  data-disabled={disabled}
                >
                  <input
                    className={styles.checkbox}
                    type="checkbox"
                    checked={isSelected}
                    disabled={disabled}
                    onChange={() => toggle(repo.id)}
                  />
                  <span className={styles.optionBody}>
                    <span className={styles.optionName}>
                      {repo.name}
                      {repo.private ? <span className={styles.private}>private</span> : null}
                    </span>
                    <span className={styles.optionDescription}>
                      {repo.description ?? "No description."}
                    </span>
                  </span>
                  <span className={styles.owner}>{repo.owner}</span>
                </label>
              );
            })
          )}
        </div>

        <footer className={styles.footer}>
          <span className={styles.count}>
            {draft.length} of {max} selected
          </span>
          <div className={styles.footerActions}>
            <button className="button buttonQuiet" onClick={onClose}>
              Cancel
            </button>
            <button className="button buttonPrimary" onClick={() => onSave(draft)}>
              Done
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
