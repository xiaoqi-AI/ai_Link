# Release Process

AI Link v0.1 release work is intentionally split into local checks, manual GitHub UI checks, and explicit publish actions. Local checks never publish to npm, create tags, or call live providers.

## Local Release Gate

Run this sequence before creating a release tag or publishing any package:

```powershell
npm run check
npm test
npm run package:check
npm run package:install-smoke
npm run github:safety
npm run release:plan
npm run release:readiness
npm run security:scan
npm run verify:fresh
```

Machine-readable reports:

```powershell
npm run package:check:json
npm run package:install-smoke:json
npm run github:safety:json
npm run release:plan:json
npm run release:readiness:json
```

## Manual Gates

Before publishing v0.1, confirm:

- `main` has branch protection or a ruleset.
- `Verify` is a required status check.
- Secret scanning and push protection are enabled for the public repo and internal companion repo.
- Provider-live credentials are configured through Bitwarden Secrets Manager and model cost boundaries are approved.
- The npm publish decision is explicit: publish `@xiaoqi-ai/ai-link` or keep repository-local usage.
- The GitHub Release draft in `docs/releases/v0.1.0.md` matches the final public scope.

## Tag And GitHub Release

Only after local and manual gates are accepted:

```powershell
git status --short --branch
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Use `docs/releases/v0.1.0.md` as the GitHub Release body. If any manual gate remains open, keep the release as a draft or postpone tagging.

## npm Package

`package:check` proves the package surface with `npm pack --dry-run`; it is not a publish command. `package:install-smoke` creates a local tarball, installs it into a temporary empty project, and verifies the installed CLI can report its version and validate default config.

If npm publishing is approved, run a final dry-run first:

```powershell
npm publish --dry-run --access public
```

Then publish only after confirming the account, package owner, version, package contents, and GitHub release notes:

```powershell
npm publish --access public
```

Publishing must not be automated until the project has a confirmed release owner and rollback policy.
