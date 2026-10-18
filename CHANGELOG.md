# Changelog

## v0.7.1 - 2026-10-18

### Fixed

- Parse the `session_cron_carry` attachment that Claude Code 2.1.302 writes on `claude --resume`, instead of showing it as a parse error.

## v0.7.0 - 2026-10-18

### Changed

- **Breaking:** clauspect is renamed to cc-session-view. The repository is `yokonao/cc-session-view`, the command is `cc-session-view`, and release assets are named `cc-session-view-<os>-<arch>`. Reinstall with `mise use -g github:yokonao/cc-session-view` and update scripts that run `clauspect`.

Earlier releases are listed on [GitHub Releases](https://github.com/yokonao/cc-session-view/releases).
