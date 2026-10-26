# Install

cc-session-view is a single binary for macOS, Linux, and Windows. Install it into a directory in your `PATH` in one of these ways:
1. [GitHub Releases](#github-releases)
1. [mise](#mise)
1. [From source](#from-source)

## GitHub Releases

Download the binary for your platform from [GitHub Releases](https://github.com/yokonao/cc-session-view/releases), then install it into `PATH`:

```sh
asset=cc-session-view-darwin-arm64 # or cc-session-view-darwin-x64, cc-session-view-linux-arm64, cc-session-view-linux-x64, cc-session-view-windows-x64.exe
gh release download -R yokonao/cc-session-view -p "$asset" # the latest release; pass a tag for another
mkdir -p ~/.local/bin
install -m 755 "$asset" ~/.local/bin/cc-session-view
```

The macOS binaries are not notarized. `gh` and `curl` do not mark downloads as quarantined, but a browser does, and macOS then refuses to run the binary; remove the mark with `xattr -d com.apple.quarantine "$asset"`.

### Verify the binary

Each binary has a [build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations) from the release workflow. Verify it with the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify "$asset" \
  -R yokonao/cc-session-view \
  --signer-workflow yokonao/cc-session-view/.github/workflows/release.yml
```

## mise

With [mise](https://mise.jdx.dev/):

```sh
mise use -g github:yokonao/cc-session-view
```

mise verifies the [build provenance attestation](#verify-the-binary) automatically.

## From source

With [Bun](https://bun.sh/):

```sh
bun install
bun run web
```
