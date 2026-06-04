# Git Hooks

This folder contains the repo-tracked Git hooks used to keep the docs workflow enforced.

## Setup

Run this once from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\config\setup-git-hooks.ps1
```

That sets `core.hooksPath` to `config/git-hooks` for the local clone.

It also registers the `git ccommit` alias, which runs `config/sync-commit.ps1` to update
the changelog and create the commit in one step.

## Hooks

- `pre-commit` blocks commits that change code, layout, or workflow files unless `docs/CHANGELOG.md` is staged too.
- `post-commit` prints a reminder to keep the changelog and testing log in sync.

## Notes

- The hooks are repo-tracked, so they can be shared and reviewed.
- The pre-commit hook is intentionally conservative: it protects the docs workflow rather than trying to auto-write content.
- Use `git ccommit "message"` for the automatic commit path when you want the changelog updated automatically.
