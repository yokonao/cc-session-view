# cc-session-view

Inspect your Claude Code session histories. cc-session-view reads the JSONL logs under
`~/.claude/projects` and renders them as readable conversations in a local web
viewer.

## Install

Download a binary from [GitHub Releases](https://github.com/yokonao/cc-session-view/releases), run `mise use -g github:yokonao/cc-session-view`, or run from source with `bun install && bun run web`. See [docs/install.md](docs/install.md) for the details and how to verify a release.

## Usage

```
cc-session-view        # or `bun run web` from source
```

Then open the printed `http://localhost:<port>` URL to browse and read sessions
in the browser.

Options:

```
cc-session-view --port 4111        # fixed port (default: a random free one)
cc-session-view --root ./sessions  # read logs from elsewhere (default: ~/.claude/projects)
cc-session-view -c ~/.claude -c ~/.claude-work  # switch between several Claude config dirs in the UI
cc-session-view --unix /tmp/cc-session-view.sock  # listen on a Unix domain socket instead of TCP
cc-session-view --help             # list all options
```

## Development

```
bun test          # run tests
bun run check     # lint + format (biome)
bun run typecheck # type check
```

## License

[MIT](LICENSE)
