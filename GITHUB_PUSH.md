# Push this project to GitHub

This folder is prepared from the latest complete local project and targets the branch `front-end+back-end`.
The clean archive intentionally does not contain `.git`. Copy its contents into an existing clone of the repository,
or clone the target branch first and then copy the prepared files into that checkout without replacing its `.git` folder.

```bash
git clone --branch 'front-end+back-end' \
  https://github.com/SkillerTop/c_job_sparks_front_end_back_end.git \
  c-job-sparks-push
cd c-job-sparks-push
```

After copying the prepared project contents into `c-job-sparks-push`, continue with the checks below.

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
git commit -m "Finalize full-stack application and production deployment"
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
