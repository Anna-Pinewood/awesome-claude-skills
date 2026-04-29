# Workplace-specific config for sync-remote-task

Concrete values for the current work setup. These are the bits that don't generalize to other jobs / environments — if the user switches workplaces, only this file needs updating, `SKILL.md` stays the same.

## Remote dev host

- **SSH host alias**: `deep2`
  - Configured in `~/.ssh/config` with key-based auth, no password prompts expected.
  - Resolves to `status.deep2.d.s`, user `o.lipina`. (Informational — always use the alias, not the raw hostname.)

## Project layout

- **Remote project base**: `/home/o.lipina/workspace/agents_team/`
  - Each project lives as a direct child: `/home/o.lipina/workspace/agents_team/<project-name>/`.
  - The remote project name matches the local folder basename. E.g. local `~/workspace/otello-ai` ↔ remote `/home/o.lipina/workspace/agents_team/otello-ai`.
  - Locally, projects live under `~/workspace/`, but the skill only needs the basename of the current working directory — it doesn't hardcode the local base.

## Branch naming

- **Task-branch prefix**: `aia-` (lowercase).
  - Task number N → branch matches glob `aia-<N>*` (e.g. `aia-1047-fix-auth`, `aia-1047-imrove-something`).
  - Uppercase variants (`AIA-1047-...`) do exist occasionally — match case-insensitively when searching.
  - The prefix is always assumed, even if the user says just "таска 1047" with no prefix.

## Task-folder candidate paths

When looking for the per-task working folder (the scp payload), try these in order and use the first that exists. These are relative to the project root:

1. `tasks/aia-<number>*`
2. `claude-tasks/aia-<number>*`

Both conventions exist in different projects in this workplace. Neither is guaranteed — if none match, that's fine, just report "no task folder found" and sync only the branch.
