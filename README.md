# Poteto.cc

[Poteto.cc](https://poteto.cc) is a potato-sized browser version of Bouncy Relay.

**You jump. I catch.**

Every leap deserves a soft landing.

## Play

The potato bounces automatically. Move the rear platform ahead of the front one to catch it:

- Tap left, press **←**, or press **A** to move one space.
- Tap right, press **→**, or press **D** to move two spaces.
- Match the number on the potato's takeoff platform. A three-space jump needs two quick moves, one of each size.
- A **?** reveals its number as the potato bounces in place. Keep that platform underneath it; the reveal bounce adds no points.
- Press **Space** to pause. Every fifth landing earns a bonus point.

Plays at the original Bouncy Relay pace, with immediate touch controls and a lively 120 BPM soundtrack. Works in desktop, tablet, and mobile browsers, with gentle motion, local best scores, and score sharing.

[Bouncy Relay for iOS](https://apps.apple.com/app/id6764088294)

## Run locally

Requires Node.js 22.13 or newer. No dependencies or build step.

```sh
npm start
npm test
```

Open `http://127.0.0.1:4173`.

For interactive input checks, run `npm run test:browser` and open `http://127.0.0.1:4173/checks/`. The check page is local-only and is excluded from the published site.

## Deploy

The `poteto-cc-git` Cloudflare Pages project uses its native GitHub integration:

- Repository: `sssw/poteto.cc`
- Production branch: `main`
- Framework preset: None
- Build command: `npm test`
- Build output directory: `site`
- Root directory: repository root
- Environment variable: `SKIP_DEPENDENCY_INSTALL=true`
- Custom domain: `poteto.cc`

Node.js 22 is selected by `.node-version`. Each push runs the test suite before publishing the site and its statistics endpoints. A failed test prevents that deployment from replacing the live site. No dependency installation or asset compilation is required.

## Languages and pictures

English is the default. Choose English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, French, German, Portuguese, or the browser's language from the language menu. The choice is remembered, and language-specific links can be shared.

Use **Create & share**, **Save this moment**, or **Share my score** to make a postcard, game moment, or score card. Export a square (1080 × 1080), story (1080 × 1920), or wide (1200 × 630) PNG. Pictures are rendered on your device. Supported browsers can share the PNG through the system share sheet; downloading and copying a link remain available.

## Privacy

Your personal best and preferences stay in your browser. No account is needed. Optional anonymous statistics count completed games and group scores into ranges. A random browser ID estimates player counts; it is not a count of unique people. Turn off **Share anonymous game stats** in About to stop submissions. Global Privacy Control disables submissions by default.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Noncommercial use, modification, and redistribution are permitted under its terms.

Required Notice: Copyright 2026 sssw.

## Community statistics

The home page and About show estimated players, completed games and score distribution. Statistics begin when this feature launches; earlier games cannot be recovered. Totals include only accepted submissions and may be lower than actual play.

The game remains a static Pages site. Only `/api/stats` and `/api/stats/*` invoke Functions. D1 stores aggregate counts and anonymous deduplication/abuse controls. Turnstile verifies submissions on the server; its secret exists only in the production Pages environment.

- Display data is cached for 15 minutes in the browser and at each edge location. There is no gameplay polling. Opening About can refresh an expired snapshot.
- Completed games are combined in memory, up to 20 per submission, at most once per minute. A failed submission is not retried; further attempts pause for an hour. Closing a page can leave recent games uncounted.
- Each anonymous browser can contribute up to 240 games / 60 submissions per UTC day. Each rotating source hash is limited to 120 submissions per day. A global atomic cap accepts at most 4,000 submissions per day.
- Public responses expose only totals, score ranges, update time and the public verification site key. Application code does not log or return exact scores, tokens, source addresses or internal errors. Source addresses are converted into a daily keyed hash; old hashes are removed gradually as new submissions arrive.
- A browser's anonymous hash is retained to avoid repeatedly counting that browser. Clearing browser storage or using another device can count again. No fingerprinting, account or cross-site identifier is used. Cloudflare processes requests and verification under its [privacy policy](https://www.cloudflare.com/privacypolicy/).

See [statistics operations](server/README.md) for deployment and quota controls.
