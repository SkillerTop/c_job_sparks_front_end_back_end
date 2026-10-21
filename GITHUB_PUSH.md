# Push this project to GitHub

This folder is prepared from the latest complete local project and targets the branch `front-end+back-end`.

Before committing, verify that no secrets are present:

```bash
git status
git diff --check
git check-ignore -v .env.production
```

The real `.env.production` file must remain untracked. Only `.env.production.example` belongs in Git.

Review and commit the prepared changes:

```bash
git add -A
git status
git commit -m "Add production Docker deployment"
git push origin 'front-end+back-end'
```

If Git rejects the push because the remote branch changed, do not force-push. First synchronize safely:

```bash
git fetch origin
git rebase 'origin/front-end+back-end'
git push origin 'front-end+back-end'
```

Files intentionally excluded from this repository:

- real `.env` files and credentials;
- `node_modules` and pnpm/npm caches;
- compiled `dist` directories;
- PostgreSQL and uploaded media data;
- test reports, Playwright browsers and verification caches;
- logs and editor-specific files.
