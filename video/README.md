# DyeCast local film

Prepared as a separate Remotion project. The existing Walk-in film is untouched.

## Current deliverable

`out/DyeCast-demo.mp4` is the competition video: 1920 x 1080, 30 fps, about 112 seconds, with a Gemini
"Sulafat" AI voice-over, subtitles and an original generated music bed. `out/DyeCast-phone.mp4` is a
1080 x 1920 teaser of about 44 seconds. Both are generated, so they are not committed.
`out/DyeCast-release-preview.html` is an offline storyboard of exactly what gets rendered.

The pictures are real captures of the live app. The narration and the on-screen tags name the YouCam APIs
the app uses: AI Facial Color Tones Analyzer, Hair Length Detection, Hair Density Detection and Hair Color
Virtual Try-On. For the video only, portraits are cropped to the face and hair and retail brand names are
replaced by a short note, because the competition forbids third-party trademarks. `public/release/edits.json`
lists every crop and redaction; the app itself is unchanged. Narration disclosure: "AI voice, Gemini TTS, Sulafat."

## Rebuild

Requires Node.js 22+ and Chromium. The export never opens a localhost server (it drives a local HTML file in
headless Chromium and pipes the frames to FFmpeg), so it also runs inside strict sandboxes.

```powershell
npm ci
$env:CHROME_EXE = "C:\path\to\chrome.exe"   # if Chromium is not auto-detected
npm run audio                                # original music bed
npm run narrate                              # Sulafat voice-over, see "Narration key" below
npm run prepare-release                      # crops and trademark redactions for the submission footage
npm run preview -- --release                 # offline storyboard that the export reads
npm run export -- --review                   # checks every scene for missing media and overlaps
npm run export -- --picture-only             # picture track
npm run export -- --reuse-picture            # re-times scenes to the narration, mixes audio, writes the MP4
npm run export -- --short --picture-only     # the same two steps for the phone teaser
npm run export -- --short --reuse-picture
```

Narration key: `npm run narrate` asks for a Gemini API key with hidden input. Alternatively put
`GEMINI_API_KEY=...` in the git-ignored `video/.env.local`; the script reads it once and blanks the value.
The key is never printed or stored anywhere else. Clips are cached by text, and requests are paced to stay
inside Gemini's rate limit. Rotate the key afterwards if it was ever typed anywhere else.

- `src/beats.json`: scene timing, captions, on-screen API tags and narration.
- `src/style.css`: the look of the film, using the app's own typefaces (Fraunces and Geist).
- `scripts/preview.mjs` builds the storyboard; `scripts/export-video.mjs` renders and mixes the MP4s.
- `public/footage/manifest.json`: capture provenance and demonstration details.
- `src/Film.tsx` and `npm run render`: the earlier Remotion route, for machines that allow localhost connections.

To refresh the real app captures, set `PHOTO_PATH` to the approved public-domain portrait
and `CHROME_EXE` to Chromium, then run `npm run capture`. It creates a temporary demo account,
performs real YouCam analysis/renders with explicit consent, and deletes that account afterward.
This spends approximately 24 YouCam units. Do not substitute private photos for public footage.
`npm run capture-plan` re-captures only the safety plan panel (no YouCam units) the same way.

## Credits

Demo portrait: NASA / Bill Stafford, [Loral O'Hara official portrait](https://commons.wikimedia.org/wiki/File:Loral_O%27Hara_official_portrait.jpg),
public domain. The try-ons are illustrative; no NASA or personal endorsement is implied.
Hair texture used by the app: Kefi, Hair01.JPG, Wikimedia Commons, public domain.
Fraunces and Geist are supplied by Fontsource under their included open-font licenses.
The musical bed is generated in `scripts/audio.mjs`; it does not copy an existing soundtrack.
