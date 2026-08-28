# Deployment

## GitHub Pages

The repository includes `.github/workflows/pages.yml`.

The workflow publishes a static build made from:

- `public/` — application shell;
- `content/` — learning content.

Expected public URL:

`https://serpanteam.github.io/sashka-molodets/`

One-time repository setup may be required:

1. Open **Settings → Pages**.
2. Under **Build and deployment**, choose **Source: GitHub Actions**.
3. Re-run the `Deploy GitHub Pages` workflow if the first run happened before Pages was enabled.

The hosted Pages build is the child-facing static/PWA version. Server-only AI authoring endpoints remain local/server-side and are intentionally not exposed from GitHub Pages.
