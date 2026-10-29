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

Requires Node.js 20 or newer. No dependencies or build step.

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

Node.js 22 is selected by `.node-version`. Each push runs the test suite before publishing the static files. A failed test prevents that deployment from replacing the live site. No dependency installation or asset compilation is required.

## Languages and pictures

English is the default. Choose English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, French, German, Portuguese, or the browser's language from the language menu. The choice is remembered, and language-specific links can be shared.

Use **Create & share**, **Save this moment**, or **Share my score** to make a postcard, game moment, or score card. Export a square (1080 × 1080), story (1080 × 1920), or wide (1200 × 630) PNG. Pictures are rendered on your device. Supported browsers can share the PNG through the system share sheet; downloading and copying a link remain available.

## Privacy

The game stores only your best score and preferences in your browser. No account or game server is used.

## License

[PolyForm Noncommercial 1.0.0](LICENSE). Noncommercial use, modification, and redistribution are permitted under its terms.

Required Notice: Copyright 2026 sssw.
