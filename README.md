# Onsective Careers

A Workday-style careers portal for Onsective Inc — public job listings, candidate applications (with resume upload), employee referrals, and an HR/Admin pipeline for triage. Sends transactional email through the Hostinger SMTP mailboxes.

## Tech

- **Node.js 18+** / Express + EJS (server-rendered)
- **SQLite** via `better-sqlite3` (single file, zero setup)
- **Tailwind** via CDN (no build step)
- **Nodemailer** through Hostinger SMTP (`smtp.hostinger.com:465`)
- Sessions: `express-session` + `connect-sqlite3`, bcrypt password hashes, CSRF on every form, auth-gated resume downloads, 8 MB resume cap with type whitelist.

## Run it locally

```bash
npm install
npm start         # boots at http://localhost:3100
```

On first boot the app seeds a default admin, HR, employee, and sample jobs. The seeded credentials print to the console — **change them all immediately after first login**.

## Default logins (change immediately)

| Role | Email | Password |
|---|---|---|
| Admin | admin@onsective.com | `ChangeMe!Admin2026` |
| HR | hr@onsective.com | `ChangeMe!Hr2026` |
| Employee | employee@onsective.com | `ChangeMe!Emp2026` |

Leadership accounts (`rishabh@`, `shabir@`, `kavya@`, `kumakshi@`, `riyan@`) are seeded with `ChangeMe!Leader2026`.

## What's in the box

**Public (`/`)**
- `/` — Hero + featured roles + leadership
- `/careers` — Search / filter open roles
- `/careers/:id` — Job detail
- `/careers/:id/apply` — Resume upload + cover letter
- `/leadership`, `/life`, `/contact`

**Candidate (`/candidate`)**
- Register, sign in, track applications, withdraw, edit profile, reset password.

**Employee (`/employee`)**
- Refer anyone for any open role. System emails a direct apply link that credits the referrer. Referral status auto-advances with the candidate's application status.

**HR / Admin (`/admin`)**
- Dashboard with pipeline counters
- Jobs CRUD (admin can delete; HR can create/edit)
- Applications list + detail — status transitions notify the candidate by email
- Referrals list
- Users management (admin only) — invite, role, password reset, delete

## Email

Three mailboxes are configured via `.env`:

- `donotreply@onsective.com` — SMTP login; used as `From` on all automated mail
- `career@onsective.com` — set as `Reply-To` so candidates reply to a monitored inbox
- `info@onsective.com` — reserved for general contact

Emails the app sends:
- Application received (to candidate)
- Application status change (to candidate, with an optional note from HR)
- Referral invite (to the referred candidate)
- Referral confirmation (to the referring employee)
- New application notification (to HR/admin)
- Password reset (to user)

## ⚠️ Rotate the mailbox passwords

The `.env` includes the three Hostinger mailbox passwords you provided. Because they were transmitted over chat, **rotate them in Hostinger before going live**, then update `.env` with the new values. Do not commit `.env` to git — `.gitignore` already excludes it.

A stronger pattern for production: put `.env` (or just the secret values) in a secrets manager (AWS SSM, 1Password, etc.) and inject them at runtime.

## Environment (`.env`)

```
PORT=3100
APP_URL=http://localhost:3100
SESSION_SECRET=<long random string>

ADMIN_EMAIL=admin@onsective.com
ADMIN_PASSWORD=ChangeMe!Admin2026

SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true

MAIL_FROM_NAME=Onsective Careers
MAIL_FROM_ADDRESS=donotreply@onsective.com
MAIL_FROM_PASSWORD=<hostinger password>
MAIL_CAREERS_ADDRESS=career@onsective.com
MAIL_INFO_ADDRESS=info@onsective.com
```

## File layout

```
src/
  server.js             # Express app bootstrap
  lib/
    db.js               # SQLite schema (idempotent)
    seed.js             # Default users + sample jobs
    mailer.js           # Nodemailer transport + HTML templates
    upload.js           # Multer (resume uploads)
  middleware/
    auth.js             # attachUser, requireAuth(roles...)
    csrf.js             # Session-backed CSRF
  routes/
    public.js           # Home, careers, apply
    auth.js             # Register, login, reset
    candidate.js        # Dashboard, profile
    employee.js         # Referral portal
    admin.js            # HR/Admin pipeline
  views/                # EJS templates
public/                 # Static assets (logo, favicon, team photos, CSS/JS)
uploads/                # Resume files (auth-gated, gitignored)
data/                   # SQLite DB files (gitignored)
```

## Deploying

Because everything is a single Node process + SQLite file, deployment is simple:
1. Point a Node host (Hostinger VPS, Render, Fly.io, etc.) at this repo.
2. Copy `.env` to the server (keep out of git). Set `NODE_ENV=production`, set `APP_URL` to your real URL, and use a long random `SESSION_SECRET`.
3. Reverse-proxy through nginx/Caddy with TLS.
4. `npm install --production && npm start` (or process-manage with `pm2` / `systemd`).
5. Take regular backups of `data/careers.db` and the `uploads/` folder.

## Next steps you might want

- SSO for staff (Google Workspace via OIDC)
- Search index across applications (FTS5 on the SQLite table)
- Interview scheduling (calendar integration)
- Reporting: time-to-fill, source of hire, referral payout tracking
- Scanning resumes for PII redaction
- 2FA for admin accounts
