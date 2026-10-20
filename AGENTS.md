# Shared workspace rules

Several OpenCode sessions work in this directory at the same time. These rules
exist because parallel writers have already overwritten each other's work once.

## Git

- This directory is a git repository. The baseline commit is the restore point.
- Never run `git checkout -- .`, `git reset --hard`, `git clean`, or `git stash`
  on paths you did not write.
- Before editing, run `git status --short`. If a file is modified and you did
  not modify it, another session owns it. Do not edit it.
- Commit your own files when a unit works: `git add <paths> && git commit -m "..."`.
  Use explicit paths, never `git add -A`.
- Never commit `.env.local` or `.local-repos.json`.

## Build and server

- Run only one `next build` or `next dev` at a time. Concurrent runs share
  `.next` and corrupt it. That is what broke the dev server on 2026-10-21.
- Do not delete `.next` while a server or build is running.
- Do not kill a node process you did not start. Check the command line first.
- The dev server owns port 3000. Check `Get-NetTCPConnection -LocalPort 3000`
  before starting another.

## Verification before "done"

- `npx tsc --noEmit` and `npm run test:unit` must pass.
- `npm run build` must pass with no dev server running.
- A feature is shipped only when it is visible in the running app. Unit tests
  alone do not count.

## Current feature backlog

- History view uses the same tree/line visual language as the home main line.
- Local git support for every repository the user has added.
- Dark mode.
- Truthful counts from GitHub: open pull request totals and truncation notes.
