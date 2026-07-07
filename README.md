# Carp Control Bowfishing Charters

Marketing website for **Carp Control Bowfishing Charters** — guided night bowfishing
trips. Static site hosted on **Firebase Hosting** with editable content and a
trip-request form powered by **Firebase Realtime Database (RTDB)**.

**Live:** https://carp-control.web.app

## Stack
- Static HTML / CSS / vanilla JS (no build step)
- Firebase Hosting
- Firebase Realtime Database (via the modular Web SDK, loaded from the CDN)

## Project layout
```
public/                 # deployed web root
  index.html            # the single-page site
  404.html
  css/styles.css
  js/app.js             # RTDB reads (trips, gallery, contact) + form submit
  js/firebase-config.js # public web config (safe to commit)
  img/                  # favicon + social image (SVG)
database.rules.json     # RTDB security rules
firebase.json           # hosting + database config
seed/content.json       # starter content for /content in RTDB
```

## Editing site content (no redeploy needed)
Trips, pricing, the photo gallery, and contact details live in RTDB under
`/content` and render live on the page. Edit them in the
[Firebase console](https://console.firebase.google.com/project/carp-control/database)
or re-seed from the CLI:

```bash
firebase database:set /content seed/content.json
```

**Replace these placeholders** before going public: phone, email, service area
(`/content/contact`) and the `$—` trip prices (`/content/trips`).

### Adding gallery photos
Upload images somewhere public (e.g. Firebase Storage) and set entries under
`/content/gallery`, replacing the `{ "placeholder": true }` items:
```json
{ "url": "https://.../photo.jpg", "caption": "Nice carp!" }
```

## Trip requests
The contact form writes to `/messages`. Per the security rules these are
**write-only for the public** (anyone can submit, nobody can read them back).
View submissions in the Firebase console under Realtime Database → `messages`.

## Deploy
```bash
firebase deploy --only hosting          # site
firebase deploy --only database         # security rules
firebase deploy                         # everything
```

Firebase project: `carp-control`
