# Nexrall Cloud Sessions

## What It Is

A Nexrall cloud session is an agent that runs on Nexrall infrastructure
rather than on your machine. When you start one, Nexrall provisions an
isolated Pod dedicated to the task, then hands the agent full ownership of
the work inside that sandbox.

## How It Works

1. **Provision** — Nexrall spins up an isolated Pod. Nothing on the pod is
   shared with other sessions or with your local environment.
2. **Clone** — the agent clones the target repository into the Pod so it
   works against the real, current codebase.
3. **Work headless** — the agent reads, edits, and runs commands with no
   interactive terminal attached. It plans, executes, and verifies the task
   on its own.
4. **Push** — when finished, it commits its changes and pushes a new branch
   back to the repository.
5. **Open a PR** — it then opens a pull request so the result is reviewable
   like any other contribution.

## Why It Matters

Because the session is isolated and remote, you can run long, autonomous
tasks without tying up your own machine or exposing your local filesystem.
Review happens through the pull request — the normal, auditable path.
