# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-07-06

### Added

- **`--json` machine-readable output** — all four commands (`cleanup`, `dry-run`, `list`, `validate-config`) can now emit JSON instead of human-readable text. Pass `--json` to get structured data on stdout with no decorative output, so scripts can parse the results. The `cleanup` and `dry-run` commands emit the full Report object; `list` emits `{resources, summary: {count, totalSize, byType}}`; `validate-config` emits `{valid, checks}`.
- **`--older-than` creation-age filter** — only remove resources that were created before now minus a specified duration (e.g. `7d`, `12h`, `30m`). Accepted units: `s` (seconds), `m` (minutes), `h` (hours), `d` (days), `w` (weeks). The filter can also be set via `minAge` in the config file. Age is how long ago the resource was *created*, not last-used.

### Changed

- **Unknown creation times are now represented explicitly** — Docker volumes and other resources whose creation time the Engine doesn't report were previously filtered with no visibility. Now they're skipped by `--older-than` and surfaced in the report as a separate count (`skippedUnknownAge`), so you can see what's been left untouched and why.

## [1.3.0] - 2026-06-15

No change to how cleanup, dry-run, or backups behave. A security update, two options removed that never did anything, and some tidying behind the scenes.

### Security

- **Updated `dockerode` to 5.x** — clears three advisories that came in through its dependencies, including a high-severity gRPC crash. `npm audit` is back to 0 vulnerabilities. The Docker API this tool uses is unchanged, so nothing about how it talks to your daemon differs.

### Removed

- **Dropped the `--sort-by-size` flag on `list`** — it defaulted to on with no way to turn it off, so it never did anything you could observe. `list` still sorts largest-first, exactly as before.
- **Dropped the `nodeId` config field and `--proxmox-node` flag** — nothing in the tool ever read them, so setting a node had no effect. You can remove `nodeId` from your `config.json`; if you leave it, it's ignored. If a future release adds node-specific operations, the setting comes back wired to a real feature.

### Under the hood

- **Less duplicated code, same behaviour** — error handling, the `list` and `cleanup` scan paths, and disk-size formatting now run through shared code instead of separate copies, so `list` always reflects exactly what a cleanup would act on. Around 350 fewer lines overall, with the full test suite still green.

## [1.2.1] - 2026-05-12

### Bug Fixes

- **Fixed `npm install -g` producing a CLI that won't start** — the published package was missing its compiled output, so running `proxmox-cleanup` after a global install failed with "Cannot find module". The build now runs automatically on publish.
- **Fixed reports claiming 0 B freed after a successful cleanup** — the tool compared two identical disk snapshots to measure freed space, so the total was always zero. The report now sums the actual sizes of the resources it removed.
- **Fixed every container size showing as 0 B** — the tool asked Docker for the container list without requesting sizes, so size was missing for every row. Sizes now come back populated, and `list` / `cleanup` output reflects real values.
- **Fixed dry-run results changing between back-to-back runs** — running two previews on the same process kept stale scan state from the first run. Each run now starts fresh.
- **Fixed cleanup issuing far more Docker calls than needed** — the safety check for "is this still in use?" ran once per resource on both the orchestrator and the scanner, fanning out to hundreds of calls on larger hosts. Runs now make one pass per cleanup cycle.
- **Fixed bind-mount paths being counted as Docker volumes** — host paths mounted into containers were mixed up with named volume identifiers in the scanner. Only named volumes are tracked now.
- **Fixed Proxmox auth failing when the password contained `!`** — the tool guessed a legacy password was an API token because of one `!` and sent it down the wrong code path. Auth now checks for the full `user@realm!tokenid:secret` shape before treating input as an API token.
- **Fixed `--backup` flag always overriding `backupEnabled: false` in config** — running the CLI without specifying `--backup` / `--no-backup` silently re-enabled backups even when the config file disabled them. The flag only takes effect now when you actually pass it.

### Improvements

- **Removed unused scheduling and notification code** — earlier releases shipped a built-in scheduler and webhook notifier that were never wired into the CLI, plus `scheduling` / `notifications` blocks in `config.example.json` that did nothing. They've been dropped. For scheduled runs, drive `proxmox-cleanup cleanup` from a systemd timer or cron — the installer registers the systemd unit for you.
- **Clearer error when the build is missing** — if `proxmox-cleanup` can't find its compiled entry point, it now tells you to run `npm run build` or reinstall, instead of printing a bare `MODULE_NOT_FOUND` stack.
- **Smaller published package** — the tarball shipped to npm dropped from about 1.4 MB to 40 kB by including only `dist/`, `bin/`, and the docs.

### Under the hood

- `node-cron` and `@types/node-cron` dropped from dependencies; `axios`, `follow-redirects`, `protobufjs` moved off vulnerable versions; ESLint bumped to 9 and `@typescript-eslint` to 8 (`npm audit` now reports 0 vulnerabilities).

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
- **Scheduled cleanup** — set a cron expression and let it run automatically. (Removed in v1.2.1: this was never wired into the CLI. Use a systemd timer or cron instead.)
- **Webhook notifications** — get notified when cleanup succeeds or fails. (Removed in v1.2.1: this was never wired into the CLI.)
- **One-line install** — `curl | bash` handles Node.js dependencies, build, global CLI setup, systemd service, config files, and log rotation.
- **Property-based testing** — fast-check covers resource identification, safe removal, backup integrity, and report consistency, alongside unit tests for every component.

[1.4.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.4.0
[1.3.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.3.0
[1.2.1]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.2.1
[1.2.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.2.0
[1.1.1]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.1.1
[1.1.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.1.0
[1.0.0]: https://github.com/hiall-fyi/proxmox-cleanup/releases/tag/v1.0.0
