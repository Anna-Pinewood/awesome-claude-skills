---
name: sync-remote-task
description: Sync a specific task between the local machine and a remote dev machine — both the git branch and the associated task folder. Use this whenever the user says things like "забери таску X с дипа / с deep / с сервера", "притащи X", "pull task X from <remote>", or conversely "отправь таску X на deep / на сервер", "закинь X на dev-машину", "push task X to <remote>". Typical motivation: the user needs to check out a branch locally to test it in a browser (staging, web UI), or to transfer a handoff document / bugfix code back to the remote dev host. Trigger even if the phrasing is loose — any request about moving the work for one specific task between these two machines belongs here.
---

# sync-remote-task — move a task between local and a remote dev machine

The user works across two machines: a local machine (where they have the browser / web UI for manual testing) and a remote dev machine (where heavier work happens — agents, pipelines, long jobs). A "task" is the combination of two things that need to stay in sync between the two:

1. **A git branch** — synced via the shared git remote (e.g. GitLab / GitHub).
2. **A task folder** — a per-task working directory on disk (NOT in git), transferred directly via `scp`.

This skill handles both, in either direction.

## Step 0 — Load the workplace config

Before doing anything, read `references/workplace.md` in this skill's directory. It contains the environment specifics for the user's current workplace: SSH host, remote project base path, branch prefix, task-folder candidate paths. All the generic logic below refers to values defined there.

If `workplace.md` looks empty / placeholder — the user is running this in a fresh workplace. Stop and ask them to fill it in first.

## Step 0.5 — Open a persistent SSH session via mcp-interactive-terminal

For every remote operation, use `mcp-interactive-terminal` — not one-shot `ssh <host> "<cmd>"` via Bash. Reasons:
- One SSH handshake instead of N — remote git commands run back-to-back without reconnecting.
- You can read intermediate output (e.g. `git status`, `ls -d <candidate>/<prefix><number>*`) mid-flow and decide the next step, instead of pre-composing a long chained command.
- If the remote prompts for anything (sudo, confirmation, unexpected git output), you see it and can respond.

At the start of the sync, open one session and reuse it:

```
mcp__mcp-interactive-terminal__create_session  →  session_id
mcp__mcp-interactive-terminal__send_command    (command: "ssh <host>")
mcp__mcp-interactive-terminal__read_output
```

From then on, everything shown below as `ssh <host> "<cmd>"` should instead be sent as `<cmd>` into the already-open session, and the output read via `read_output`. Close the session at the end with `close_session`.

Local commands (things that run on the user's laptop — local `git`, `scp` from/to the remote path, etc.) still go through regular Bash. Only the *remote* side uses the interactive session.

## Step 1 — Parse the user's request

Extract two things from the user's message:

**Task ID.** A number, sometimes with a prefix. Normalize to `<branch-prefix-from-workplace><number>` (e.g. `1047` → `aia-1047`). Be tolerant of variants: bare number, lowercase prefix, uppercase prefix, dash or no dash. When searching for matching branches and folders, match case-insensitively and as a glob (`<prefix><number>*`) because the full branch name usually has a description suffix.

**Direction.** Two cases, distinguished by verb + preposition:
- **Pull** (remote → local): "забери / притащи / вытащи / забрать / pull / fetch" + "с / from" + remote name.
- **Push** (local → remote): "отправь / закинь / залей / передай / push" + "на / to" + remote name.

If the direction is genuinely ambiguous, ask. Don't guess.

## Step 2 — Identify the project

The project folder name is the basename of the current working directory. The remote project path is `<remote-base-from-workplace>/<project-folder-name>`. Sanity-check that it exists on the remote before continuing:

```bash
ssh <host> "test -d '<remote-project>' && echo OK"
```

If the directory isn't there, stop and ask the user — don't try to guess the right path. Local project layouts sometimes drift from the remote's naming.

## Step 3 — Find the branch

The task number is enough to identify the branch by glob. Never hard-code the full branch name:

```bash
# Remote
ssh <host> "cd '<remote-project>' && git branch --list '<prefix><number>*' --all -i"

# Local
git branch --list '<prefix><number>*' --all -i
```

Rules:
- If exactly one match on the source side — use it.
- If multiple matches — show them to the user and ask which.
- If zero matches on the source side — stop and tell the user. Don't create a branch out of thin air.

## Step 4 — Pull direction (remote → local)

**4a. Make sure the branch is pushed to the git remote (from the dev machine).**

```bash
ssh <host> "cd '<remote-project>' && git fetch origin && \
  git rev-parse --verify 'origin/<branch>' >/dev/null 2>&1 && \
    echo 'remote-tracks' || echo 'not-on-origin'"
```

If it's not on origin, or if the remote machine has local commits ahead of origin, push from the remote:

```bash
ssh <host> "cd '<remote-project>' && git push -u origin '<branch>'"
```

**4b. Safety check on the local side.** Before touching the local branch:
- `git status --porcelain` — if the current branch has uncommitted changes, stop and show them. Ask the user whether to commit, stash, or abort. Never stash silently.
- If a branch of the same name already exists locally AND it has commits not present on origin, stop and ask — a fast-forward pull could still overwrite something the user cared about.

**4c. Fetch and check out locally.**

```bash
git fetch origin '<branch>'
git checkout '<branch>' 2>/dev/null || git checkout -b '<branch>' --track 'origin/<branch>'
git pull --ff-only
```

If `--ff-only` fails (branches have diverged) — stop and ask. Don't auto-merge or rebase.

**4d. Transfer the task folder.** Try each candidate path from `workplace.md` in order. Use the first that exists remotely:

```bash
ssh <host> "cd '<remote-project>' && ls -d <candidate>/<prefix><number>* 2>/dev/null | head -1"
```

Before `scp`, **make sure the local parent directory exists** — otherwise `scp -r remote:src ./parent/` gets misinterpreted (if `./parent/` isn't a directory, scp treats it as the *destination name* and dumps the source's contents there, with no subfolder wrapping). Create it if needed, then scp into it:

```bash
mkdir -p '<parent-dir>'   # e.g. "tasks" or "claude-tasks"
scp -r '<host>:<remote-project>/<found-task-folder>' './<parent-dir>/'
```

If the local destination `./<found-task-folder>` already exists and is non-empty, stop and ask — overwriting could clobber in-flight work.

If no task folder is found on the remote for this task number, don't treat it as an error — just report "branch synced, no task folder on remote" and finish. The branch alone is often enough.

## Step 5 — Push direction (local → remote)

Mirror of step 4.

**5a. Push the branch to origin from local.**

- Uncommitted changes? Stop and ask (commit / stash / abort). Same rule as above — never silent.
- Then:
  ```bash
  git push -u origin '<branch>'
  ```

**5b. Safety check on the remote side.**

```bash
ssh <host> "cd '<remote-project>' && git status --porcelain"
```

If the remote has uncommitted changes on the target branch (or would have to switch away from a dirty branch), stop and ask.

**5c. Pull the branch on the remote.**

```bash
ssh <host> "cd '<remote-project>' && \
  git fetch origin '<branch>' && \
  (git checkout '<branch>' 2>/dev/null || git checkout -b '<branch>' --track 'origin/<branch>') && \
  git pull --ff-only"
```

Same rule: if `--ff-only` fails, stop and ask.

**5d. Transfer the task folder local → remote.** Find it locally (same candidate paths from `workplace.md`). Before `scp`, ensure the **remote parent directory exists** — same reasoning as step 4d, but in reverse. Then scp into it:

```bash
ssh <host> "mkdir -p '<remote-project>/<parent-dir>'"
scp -r './<found-task-folder>' '<host>:<remote-project>/<parent-dir>/'
```

Same overwrite-protection rule — if the remote destination already exists and is non-empty, stop and ask.

## Step 6 — Report

Print a short summary:
- Direction + task ID + branch name.
- Last commit on the branch (`git log -1 --oneline <branch>`) on both sides to confirm they match.
- Task folder path transferred (or "none found" if skipped).
- Any warnings (stashed changes, branches with diverged history that you skipped, etc.).

## Tooling notes

- **Remote side — always use `mcp-interactive-terminal`.** One persistent SSH session per sync (see Step 0.5). The command snippets in this file written as `ssh <host> "<cmd>"` are there to show *what* to run on the remote; the *how* is `send_command` + `read_output` into the open session. Don't open a new SSH connection for every command.
- **Local side — regular Bash.** Local `git` calls and `scp` commands (which still do their own SSH under the hood, that's fine) go through Bash. Don't route local commands through the interactive terminal.
- **Never use `git push --force`, `git reset --hard`, or overwrite a non-empty `scp` destination** without explicit user confirmation. The whole skill rests on the assumption that nothing silently clobbers work.
- **Don't create branches that don't exist on the source side.** If the user asks to pull task 1047 but the branch doesn't exist on the remote, tell them — don't make one up.
- **Close the session at the end** with `close_session` — leaving sessions dangling piles up over time.
