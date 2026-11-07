# Changelog

## v0.8.0 - 2026-11-08

### Changed

- **Breaking:** Listen on `127.0.0.1` instead of all interfaces by default, since the viewer has no authentication. Pass `--host 0.0.0.0` to accept connections from other hosts as before.

### Added

- `--host <addr>` chooses the TCP listen address.

## v0.7.4 - 2026-11-03

### Fixed

- Parse the `context_sections`, `hook_additional_context` and `language` attachments and the `session-owner`, `frame-link`, `artifact-autoreact-ledger` and `artifact-comment-monitor` entries from Claude Code 2.1.316 and 2.1.317, instead of showing them as parse errors. The conversation view shows injected context sections and additional hook context alongside other hook output.

## v0.7.3 - 2026-10-28

### Fixed

- Parse the `skill_mention` attachment from Claude Code 2.1.310 and the `tools-used` entry from Claude Code 2.1.311, instead of showing them as parse errors.

## v0.7.2 - 2026-10-23

### Fixed

- Count token usage and messages once per API response. Claude Code writes one transcript entry per content block with the same usage, so totals were overcounted (output tokens by about 2.8x on real transcripts).

## v0.7.1 - 2026-10-18

### Fixed

- Parse the `session_cron_carry` attachment that Claude Code 2.1.302 writes on `claude --resume`, instead of showing it as a parse error.

## v0.7.0 - 2026-10-18

### Changed

- **Breaking:** clauspect is renamed to cc-session-view. The repository is `yokonao/cc-session-view`, the command is `cc-session-view`, and release assets are named `cc-session-view-<os>-<arch>`. Reinstall with `mise use -g github:yokonao/cc-session-view` and update scripts that run `clauspect`.

Earlier releases are listed on [GitHub Releases](https://github.com/yokonao/cc-session-view/releases).
