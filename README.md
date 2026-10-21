<p align="center"><img src="src/app/icon.svg" width="72" alt="Agent Activity logo" /></p>

# Agent Activity

A personal, read-only dashboard for following AI agent work across GitHub repositories. It shows local unpushed commits beside the remote history on this machine.

Copy `.env.example` to `.env.local`, fill the GitHub App values, then run `npm install && npm run dev` and open http://localhost:3000.

It never writes to a repository, merges a pull request, or changes your working tree.
