# Agent Activity

A personal, mobile-friendly dashboard for following AI agent work across GitHub repositories. It reads repository, branch, pull request, check-run, and deployment data from GitHub. It never writes to a repository or merges a pull request.

## Run locally

1. Create a GitHub App and install it on the repositories you want to follow.
2. Add a callback URL of `http://localhost:3000/api/auth/callback` to the app.
3. Copy `.env.example` to `.env.local` and fill in the GitHub App client ID and client secret. Generate `SESSION_SECRET` with `openssl rand -base64 48` (at least 32 characters). `.env.local` is gitignored; never commit it or paste its values into client code.
4. Install dependencies and start Next.js:

   ```sh
   npm install
   npm run dev
   ```

5. Open `http://localhost:3000` and connect GitHub.

Next.js is pinned to `15.5.26`. Versions `15.5.27` and `15.5.28` fail the production build with `Invariant: no direct app page entry found`. Remove the pin only after a newer release builds successfully.

## Local commits

The dashboard runs on your machine, so it can read your working copies directly. It matches a GitHub repository to a local clone by the `origin` remote URL, then reads the branch, HEAD sha, ahead/behind counts, dirty path counts, and unpushed commits.

Discovery scans the folders listed in `.local-repos.json` and `LOCAL_REPO_ROOTS`, plus a set of common locations (`../` from the project, `~/projects`, `~/code`, `~/dev`, `~/repos`, `~/git`, `~/source/repos`, and `~/Documents/GitHub`). A scan stops after 3 folder levels, 2,500 folders, or 1.5 seconds, and its result is cached for 30 seconds.

```json
{
  "roots": ["F:\\work", "D:\\clients"],
  "Jayesh-2404/zex": "F:\\zex"
}
```

`roots` accepts one folder or an array of folders. `LOCAL_REPO_ROOTS` in `.env.local` accepts the same values separated by semicolons, so a shared setup can list scan roots without editing the JSON file. Explicit `owner/repo` entries win over discovery when both are present.

Any repository the scan does not find shows **Link a folder** in its History view. The dashboard validates the folder with `git rev-parse --show-toplevel`, records the repository root in `.local-repos.json`, and reloads the local state. The link endpoint requires a signed-in session.

Paths are absolute and stay on the server. The server runs read-only git commands with a 3 second timeout per command and an 8 second overall deadline. It never fetches, pulls, pushes, or changes your working tree, index, or remotes. If you deploy the dashboard elsewhere, local reads stop working and the UI falls back to GitHub-only data. `.local-repos.json` is gitignored.

## Commit and pull request history

Open **Repositories** and choose **History** on a row. The commits view draws the same lane-and-line graph as the home page. Local unpushed commits sit on an ochre lane above the remote history; merges arc across lanes, and ref chips name the local branch and `origin/<branch>` with their shas.

The pull requests view lists open, merged, and closed pull requests on a status rail, and expanding one shows its commits in the same tree language with the diff size.

History loads only when you open it, so it does not add to the 5 minute poll. Each page is 30 commits or 30 pull requests, and a pull request detail loads up to 100 commits.

## Appearance

The moon and sun button in the header switches between the paper theme and a dark "night gate" theme. The choice is stored in `localStorage` under `agent-activity-theme` and applied before first paint, so a reload does not flash the other theme. With no stored choice the dashboard follows the operating system preference.

Both palettes use the same tokens in `src/app/globals.css`. Run `npm run check:contrast` after changing a color; it parses the light and dark blocks and verifies text at 4.5:1 and graph lanes at 3:1.


## GitHub App permissions

Set these repository permissions to **Read-only**: Metadata, Contents, Pull requests, Checks, Commit statuses, and Deployments. Install the app only on the repositories this dashboard should access. Do not enable write permissions or webhook subscriptions. The app uses the GitHub App user authorization flow; enable expiring user access tokens so the dashboard can refresh them securely.

The GitHub App callback must match the deployed app origin plus `/api/auth/callback`. For local development, keep the localhost callback as an additional callback URL.

## Deploy to Vercel

Import this repository as a Next.js project in Vercel. Set `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`, `SESSION_SECRET`, and `APP_URL` in the project environment. Generate `SESSION_SECRET` with `openssl rand -base64 48`; set `APP_URL` to the public HTTPS origin without a trailing slash. Add `https://your-domain/api/auth/callback` to the GitHub App callback URLs, deploy, and install the app on the repositories you want to watch.

The browser stores the selected repository IDs locally. The server stores only an encrypted, HTTP-only session cookie; GitHub tokens are never returned to client-side JavaScript. The dashboard refreshes while open and shows a notice when a default branch moves or a deployment changes. These are indicators; use GitHub branch protection or rulesets to require reviews before merges and deployments.

## Limits

- A hosted dashboard sees commits after they have been pushed to GitHub. A deployed copy cannot see unpushed local commits. A copy running on your machine can, for repositories discovered under the configured roots or listed in `.local-repos.json`.
- Up to 12 repositories are tracked at once. The activity view compares the first 5 listed non-default branches in each selected repository.
- The activity page polls every 5 minutes while open. It does not send email or push notifications.
- Pull request check details and change size are loaded for the 2 most recently updated open pull requests per repository.
