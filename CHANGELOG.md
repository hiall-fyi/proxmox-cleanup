# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-03

**Codebase audit & cleanup — same features, ~285 fewer lines of code.**

### Improvements

- **Smaller, cleaner codebase** — a full architecture audit identified and removed unused internal code across 18 files. Nothing you interact with has changed, but there's significantly less code to maintain behind the scenes.
- **Consistent disk space formatting** — size numbers (like "1.2 GB freed") now come from one shared function instead of three separate copies, so you'll never see inconsistent formatting between the CLI, scheduler, and reports.
- **`--version` now stays in sync** — the version shown by `proxmox-cleanup --version` is read directly from the package, so it always matches the installed version. Previously it was stuck on `1.0.0`.

### Bug Fixes

- **Fixed `--version` showing wrong number** — `proxmox-cleanup --version` was hardcoded to `1.0.0` regardless of the actual installed version. It now correctly reports the real version.
- **Fixed a duplicate log entry** — the cleanup log was writing a "starting operation" line twice at the beginning of each run. Now it logs once, with the correct resource count.

## [1.1.1] - 2026-03-15

### Improvements

- **Cleaner repository** — removed leftover files and unnecessary dependencies that were cluttering the project.

### Bug Fixes

- **Fixed broken `prepare-release` script** — the npm script was pointing to a file that didn't exist.

## [1.1.0] - 2026-01-11

### Bug Fixes

- **Fixed "Cannot find module" error after global install** — if you installed with `npm install -g`, the CLI would crash on startup because it couldn't find its own files. The path resolution is now reliable regardless of how npm sets up symlinks.
- **Fixed wrong repository URL in install script** — the one-line installer was pointing to the wrong GitHub repo, so `curl | bash` would fail. It now uses the correct URL.
- **Fixed install failures leaving a mess** — if something went wrong during installation, leftover files and partial configs could cause problems on retry. The installer now cleans up after itself on failure.

### Improvements

- **Smoother updates** — the update script now handles git conflicts automatically and shows you which version you're moving from/to.
- **Safer config handling** — configuration file updates use proper JSON parsing instead of string manipulation, so your settings won't get corrupted during upgrades.
- **Test failures don't block install** — if tests fail during installation (e.g. no Docker daemon on the build machine), you'll see a warning instead of a hard stop.

## [1.0.0] - 2026-01-02

**Initial release.**

- **Automated Docker cleanup** — finds and removes unused containers, images, volumes, and networks in one command.
- **Dry-run mode** — preview everything that would be removed before you commit. Run it as many times as you like — results are identical each time.
- **Backup before cleanup** — resource metadata (names, IDs, sizes, what depends on what) is saved to a JSON file before anything gets deleted.
- **Protection patterns** — keep important resources safe with wildcards (`production-*`), exact names, tags, or IDs.
- **Dependency checking** — images used by containers, volumes mounted by containers, and networks with active connections are never touched.
- **CLI with multiple commands** — `cleanup`, `dry-run`, `list`, and `validate-config`, all with flexible options.
- **Configuration file** — set your preferences once in `config.json`, override anything with CLI flags.
- **Scheduled cleanup** — set a cron expression and let it run automatically.
- **Webhook notifications** — get notified when cleanup succeeds or fails.
- **One-line install** — `curl | bash` handles Node.js dependencies, build, global CLI setup, systemd service, config files, and log rotation.
- **152 tests** — including property-based testing with fast-check for resource identification, safe removal, backup integrity, and report consistency.

[1.2.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.2.0
[1.1.1]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.1.1
[1.1.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.1.0
[1.0.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.0.0
