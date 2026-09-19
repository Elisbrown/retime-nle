# Publishing to npm

Package name: `retime-nle` (the unscoped `retime` is taken on npm). Binary commands shipped: `retime-nle` and alias `retime`.

## Pre-publish checklist

- [ ] `package.json`: name `retime-nle`, version bumped (semver), `description`, `keywords`, `license: MIT`, `LICENSE` present
- [ ] `exports` map points at `./dist/index.js` / `./dist/index.d.ts`
- [ ] `files` includes only `dist`, `README.md`, `LICENSE` (check with `npm run pack:dry`)
- [ ] `npm run typecheck` clean, `npm run build` fresh (also runs automatically via `prepublishOnly`)
- [ ] CLI smoke test: all three `--format` values write output (see `tutorials/01-first-export.md`)
- [ ] `npm login` done for the publishing account; 2FA device ready if enabled

## Version and publish

```bash
cd retime
npm run typecheck
npm run build
npm run pack:dry        # inspect tarball contents, must be dist + README + LICENSE

# commit and push to GitHub (repo: https://github.com/Elisbrown/retime-nle):
git add -A
git commit -m "Release retime-nle vX.Y.Z"
git push origin main

# bump version (pick one):
npm version patch       # 0.1.0 -> 0.1.1
# npm version minor
# npm version major

npm publish             # public (publishConfig.access = public)
```

Verify after publish (allow a few minutes for the registry index):

```bash
npm view retime-nle version
npm install retime-nle
npx -p retime-nle retime-nle --help
```

## If publish fails

- `403 / 402`: not logged in (`npm login`), no permission on the name, or unpaid scope settings — for a free public package the name must be unscoped-public (it is) and the account must have completed any registry requirements.
- `EPUBLISHCONFLICT`: version already exists — bump with `npm version patch` and retry. Never republish the same version.
- Missing `dist` in tarball: run `npm run build` first and re-check `npm run pack:dry`.
