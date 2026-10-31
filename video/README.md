# DyeCast local film

Prepared as a separate Remotion project. The existing Walk-in film is untouched.

## Current deliverable

`out/DyeCast-preview.html` is a self-contained, offline **visual storyboard**, not a rendered MP4.
Use Next/Previous or Play storyboard; Phone layout previews the vertical design.
The real app captures, original music, subtitles and proposed narration are included.

The MP4 render is **pending**. This session's sandbox refuses Remotion's localhost browser connection.
Allow loopback connections in the workspace sandbox policy before using the render commands.
AI narration is also pending; no voice-service credentials are stored in this project.

## Rebuild

Requires Node.js 22+ and Chromium.

```powershell
npm ci
npm run typecheck
npm run audio
npm run preview
# Set CHROME_EXE to your existing Chromium executable if it is not auto-detected.
npm run render
npm run render -- --short
```

- `DyeCastDraft`: 105 seconds, 1920 x 1080, 30 fps.
- `DyeCastShort`: 36 seconds, 1080 x 1920, 30 fps.
- `src/beats.json`: scene timing, captions and proposed narration.
- `src/Film.tsx` and `src/style.css`: the actual Remotion composition.
- `public/footage/manifest.json`: captures, verified source, and demonstration details.

To refresh the real app captures, set `PHOTO_PATH` to the approved public-domain portrait
and `CHROME_EXE` to Chromium, then run `npm run capture`. It creates a temporary demo account,
performs real YouCam analysis/renders with explicit consent, and deletes that account afterward.
This spends approximately 24 YouCam units. Do not substitute private photos for public footage.

## Credits

Demo portrait: NASA / Bill Stafford, [Loral O'Hara official portrait](https://commons.wikimedia.org/wiki/File:Loral_O%27Hara_official_portrait.jpg),
public domain. The try-ons are illustrative; no NASA or personal endorsement is implied.
Hair texture used by the app: Kefi, Hair01.JPG, Wikimedia Commons, public domain.
Fraunces and Geist are supplied by Fontsource under their included open-font licenses.
The musical bed is generated in `scripts/audio.mjs`; it does not copy an existing soundtrack.
