# EZOffer

> **Languages:** [English](README.md) · [Русский](README.ru.md)

Job-search automation for hh.ru and other vacancy sources: resume matching,
personalized cover letters, application tracking and Telegram notifications.
The full Russian documentation is in [README.ru.md](README.ru.md).

**Site:** https://ssrjkk.github.io/ezzoffer/  
**Bot:** https://t.me/ezzoffer_bot  
**Source:** https://github.com/ssrjkk/ezzoffer

## Screenshot

![EZOffer](docs/screenshots/home.png)

## Features

- Landing, pricing, FAQ, blog, jobs and resume-example pages.
- Dashboard with funnel statistics, daily limits and activity charts.
- Resume CRUD and AI-assisted improvement.
- Vacancy catalog with search, filters, autosearch and external-source leads.
- Application status tracking and cover-letter templates.
- Interview preparation, saved vacancies, skill-gap analysis and learning plans.
- Telegram bot for service access and candidate workflows.
- Metadata, canonical URLs, Open Graph, sitemap and robots.

Real application submission through an API is available for hh.ru after OAuth
configuration. Other sources provide manual leads unless their own API is connected.
Payments are disabled in demo mode.

## Quick start

```bash
npm install
npm run dev
npm run build
npm run start:prod
```

The development server runs at http://localhost:3000.

## Seed and checks

```bash
npm run seed
npm test
npm run lint
npm run check:links
npm run bot:poll
npm run bot:menu
```

`npm run seed` creates the documented demo account and dashboard data. Change demo
credentials before a shared deployment.

## Configuration

Copy `.env.example` and configure the database, auth secret, application URLs and
Telegram bot token. SMTP variables are required for password-reset and verification
email; without them the site runs but email is not sent.

Windows prebuilt binaries are pinned for `better-sqlite3`. Do not upgrade it without
a matching C++ toolchain or compatible prebuild.

## Stack

Next.js 16, React, TypeScript, Tailwind CSS v4, SQLite, `better-sqlite3`, aiogram and
Node's built-in test runner.

## Security

- Password hashing with scrypt and httpOnly sessions.
- CSRF origin checks, rate limits and SSRF-safe outbound requests.
- Production-safe session handling and protected dashboard routes.
- No live payment credentials in the repository.

## Documentation

- [Russian README](README.ru.md)
- [About](https://ssrjkk.github.io/ezzoffer/about)
- [FAQ](https://ssrjkk.github.io/ezzoffer/faq)
- [Security policy](SECURITY.md)

## License

MIT — see [LICENSE](LICENSE).
