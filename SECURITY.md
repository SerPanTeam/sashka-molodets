# Security

This repository publishes a static educational PWA. The production GitHub Pages build requires no API keys, cloud credentials, child accounts, or server-side secrets.

## Reporting a security issue

Please do not open a public issue for a suspected credential leak or security vulnerability. Contact the repository owner privately through the contact method listed on the GitHub profile.

## Public-release rules

- Never commit `.env` files, API keys, service-account credentials, access tokens, cookies, private URLs, or generation logs.
- Keep production playback fully static and use pre-generated assets.
- Cloud content-generation jobs are intentionally not shipped as runnable public GitHub Actions workflows.
- Treat third-party media licenses and attribution separately from the application source code.
- Before every public release, run the production validation and GitHub Pages browser/audio smoke tests.

## Child privacy

The learning game does not require a child account. Progress and preferences are stored locally in the browser. The production game does not send a child's answers to a live AI service.
