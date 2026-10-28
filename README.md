# Poteto.cc

Inspired by [poteto.com](https://poteto.com), I made a browser version of Bouncy Relay: [Poteto.cc](https://poteto.cc).

A little rhythm. A little courage. A very bouncy potato.

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

## Deploy

Serve the `site` directory as a static website. On Cloudflare Pages, use no framework, no build command, and `site` as the output directory. Set the custom domain to `poteto.cc`.

## Privacy

The game stores only your best score and preferences in your browser. No account, analytics, or game server is used.

## License

[PolyForm Noncommercial 1.0.0](LICENSE), the same license used by [sssw/2047](https://github.com/sssw/2047). Noncommercial use, modification, and redistribution are permitted under its terms.

Required Notice: Copyright 2026 sssw.
