# Pi Web — folder Workspaces fork

This fork keeps Pi Web's stock session browser and adds a folder-filtered **Workspaces** view, configurable File explorer placement, and configurable keyboard shortcuts.

- Fork: [dwb-ajay/pi-web](https://github.com/dwb-ajay/pi-web), branch `fm/pi-web-p1-reconstructed`
- Upstream: [agegr/pi-web](https://github.com/agegr/pi-web), branch `main`
- Upstream documentation is preserved unchanged in [`README.upstream.md`](./README.upstream.md).

## What this fork adds

1. **Workspaces** filters the stock Sessions tree to folders you explicitly select. It reuses stock session rows and ordering; it does not create a separate chat collection.
2. **File explorer placement** lets you place the explorer on the left or right.
3. **Keyboard shortcuts** can be recorded, saved, disabled, and reset. The default right-sidebar shortcut is primary+J (Ctrl+J on Windows/Linux, Cmd+J on macOS). Browser or operating-system shortcuts can intercept key combinations.

## Install and run from this fork

Requirements: Node.js 22.19.0 or newer, Git, and an available port 8080.

```bash
git clone --branch fm/pi-web-p1-reconstructed https://github.com/dwb-ajay/pi-web.git
cd pi-web
npm ci
npm run build
node bin/pi-web.js -p 8080 -H 0.0.0.0 --no-open
```

Open `http://localhost:8080` from the same machine. The requested `-H 0.0.0.0` binds the service on all network interfaces. Pi Web can access sensitive agent data and run tools. Set `PI_WEB_PASSWORD` using a secure environment method, and use a trusted VPN or HTTPS reverse proxy for network access. Password authentication does not encrypt plain HTTP traffic. Port 8080 must be free; do not stop another service to make it available.

The upstream command `npx @agegr/pi-web@latest` installs and runs the upstream package, not this fork. A GitHub-source npx invocation is also not a supported run path for this fork: the npm package includes `.next` build output, but the repository does not commit `.next` and does not build it during install. Clone the source, install dependencies, and build it as shown above.

## Updating from upstream

Keep working on `fm/pi-web-p1-reconstructed`. Fetch upstream and merge its `main` branch; resolve conflicts, run the relevant checks, then push only to the fork's `origin`:

```bash
git remote add upstream https://github.com/agegr/pi-web.git  # once
git fetch upstream
git switch fm/pi-web-p1-reconstructed
git merge upstream/main
# Resolve conflicts, then run the relevant tests, typecheck, lint, and build.
git push origin fm/pi-web-p1-reconstructed
```

Review the upstream changes and the resulting diff before pushing. Do not push this fork's branch to upstream.

## Current publication and validation

The current fork branch is published at [`7e034b5`](https://github.com/dwb-ajay/pi-web/commit/7e034b538f65efda7d20aedfe2358383163e7df4). [PR #5](https://github.com/dwb-ajay/pi-web/pull/5) is open and unmerged. A clean clone completed `npm ci` and `npm run build`; feature tests, lint, CI, and browser diagnostics for this revision were deferred. The build reported a dynamic-dependency warning in the session export route. The README preservation and command references describe the repository source and CLI.

## Publishing a separate npm package

Publication is technically feasible, but no fork package has been published. The current package identity is `@agegr/pi-web`; publishing would require a distinct package name under an npm scope controlled by the publisher, permission to publish that name, and npm authentication. The package's `files` list includes `.next`, so a release must build before packing and verify that the compiled server assets and `bin/pi-web.js` are present. Update package metadata (name, repository, homepage, bugs, and version) only as a separately authorized release task. This fork's README does not authorize a package change or publication.
