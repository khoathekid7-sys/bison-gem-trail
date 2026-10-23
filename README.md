# Bison Quest

A two-stop, mobile-first photo scavenger hunt on Bucknell's campus. Players visit the ELC uphill patio, then Carnegie Building; each gem requires a fresh location fix and a landmark photo. The off-campus demo is clearly labeled and keeps separate progress.

## Play and install

Open the published HTTPS URL in Safari on iPhone or Chrome on Android. No app-store download or player account is needed. On iPhone, use **Share → Add to Home Screen**. On Android, use **Menu → Install app** or **Add to Home screen**. The web manifest and service worker cache the shell after an online visit. Live GPS and photo checking still require internet.

Use **Try demo (off campus)** to walk through both gems with simulated GPS and sample photos. **Walk here** moves the demo GPS into range; **GPS error case** and **Sample: wrong photo** exercise failures. The album saves accepted photos in this browser's IndexedDB and can download individual JPEGs or a ZIP. A browser's private mode, storage clearing, or a different device will not retain that local album.

## Organizer setup

The welcome screen links to `/organizer`. Sign in or create a Supabase email/password account, then claim organizer access. The first authenticated claimant becomes the organizer; claim it **before sharing the published URL**. The server checks the organizer role for every setup and review action.

1. Visit the real ELC uphill patio, use **Use my GPS**, wait for good accuracy, and save the capture point. The first point must be within 152.4 m (500 ft) of Taylor Hall. The server rejects a farther point.
2. Set the Carnegie exterior capture point on site.
3. Upload clear on-site reference photos for both landmarks (up to three each).
4. Review any pending photos with a written reason. This path is available only when the AI checker failed after the player's location passed.

The seeded ELC coordinate (40.956486, -76.884524) and Carnegie coordinate (40.956180, -76.881780) are **published building pins**, not surveyed patio or entrance points. Taylor Hall's published pin is 40.957160, -76.883100. The app remains playable before calibration but labels this limit. Source URLs used in the clues and facts: [Bucknell map](https://www1.bucknell.edu/script/communication/map/buildings_xml.aspx), [ELC patio](https://www.bucknell.edu/news/class-2026-leaves-its-mark-new-elc-patio-gathering-space), [Carnegie history](https://www.departments.bucknell.edu/history/carnegie/index.html).

## Verification and data

TanStack Start server functions create an anonymous player session with a random bearer token; only its SHA-256 hash is stored. The server checks active-step order, GPS age (up to 30 seconds), accuracy (up to 40 m), and distance (45 m default arrival radius). It validates photo type and size, uploads to a private Supabase bucket, and asks the Lovable AI gateway's vision model to compare the landmark description and any organizer reference photos. An atomic database function advances only an accepted capture; the attempt ID and database constraints prevent duplicate awards. The demo uses deterministic local checks and never calls the live checker.

The backend uses Supabase tables and private storage buckets defined in `drizzle/migrations/0000_bison_quest_schema.sql`. Organizer authentication uses Supabase Auth and a server-side role check. The live server needs `SUPABASE_SERVICE_ROLE_KEY` and `LOVABLE_API_KEY`, both server-side only. Public Supabase settings are shown in `.env.example`; never add private keys to `VITE_*` variables or commit `.env`.

GPS can be spoofed and visual matching can be mistaken, so this is practical scavenger-hunt validation, not identity or anti-cheat proof. Missing reference photos make the model's match less certain. Submitted photos are sent to the AI service for checking; no facial recognition is used. Captures stay in private server storage, while the player's album is saved on the device.

## Develop and verify

Use Node.js 22+ and pnpm. The project also includes its original `bun.lock`.

```sh
pnpm install
pnpm dev
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

Tests cover route matching, the 500 ft rule, GPS limits, sequential progression, demo failures, and ZIP structure. The production build and these tests passed on 2026-10-23. The demo was exercised in a browser at 390 px, 360 px, and desktop viewport settings, including rejection, both discoveries, album, and refresh restoration. MapLibre rendered the full campus map in Chrome after fixing its CSS color and sizing issues; the schematic fallback was also exercised in the in-app browser. Physical iPhone/Android camera, GPS, and on-campus AI validation have **not** been tested.
