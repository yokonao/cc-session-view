# Releasing

Add the release to `CHANGELOG.md` first; it has to be in the tagged tree.

```sh
git tag -a vX.Y.Z -m vX.Y.Z
git push origin vX.Y.Z
```

Pushing the tag runs `.github/workflows/release.yml`, which compiles the binaries with `bun build --compile`, publishes them to GitHub Releases, and attests their build provenance. Releases are immutable, so fix a bad release with a new patch version.
