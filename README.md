# 🎭 Meme Verse

Pull a face or throw a hand sign at your webcam, and it hands you back the perfect cat meme for it. No uploads, no backend, no installs — it all runs right there in your browser tab.

I built this to see how far I could push MediaPipe's hand and face tracking for something silly and fun, instead of yet another "detect a face" demo. Turned out gesture + expression recognition running live at a decent frame rate, with zero server involved, was a genuinely fun problem to chase.

**🔴 [Try it live](https://surbhi-1509.github.io/Meme-Verse/)** — just needs camera permission, that's it.

---

## What it actually does

Point your webcam at yourself, hold up a gesture or make a face, and Meme Verse:

1. Tracks your hand and face landmarks in real time (MediaPipe Hands + Face Mesh)
2. Figures out what gesture or expression you're doing, using the actual landmark geometry — not a trained classifier, just careful math on joint positions
3. Smooths that reading out over a few frames so it doesn't flicker between guesses
4. Picks a matching meme (at random, never repeating the same one twice in a row) and swaps it in with a little animation

Everything — the camera feed, the detection, the meme swap — happens client-side. Nothing you do ever leaves your browser.

## Gestures & expressions it recognizes

| Hand gestures | Face expressions |
|---|---|
| 👍 Thumbs Up | 😊 Smile |
| ✊ Fist | 😝 Tongue Out |
| 👌 OK Sign | 😠 Angry |
| ✌️ Peace | |
| 🤘 Rock | |
| 🤙 Call Me | |
| 🤫 Shh | |

## Under the hood

No frameworks, no build step, no `npm install` — just plain HTML/CSS/JS talking to MediaPipe over a CDN.

- **`gestures.js`** — classifies hand shape from 21 hand landmarks (which fingers are curled vs. extended, thumb position, etc.)
- **`expressions.js`** — classifies facial expression from face mesh landmarks (mouth width/height ratios against eye distance, brow position)
- **`memeManager.js`** — owns the meme panel: picks a random image for the detected category from `assets/memes/`, avoids immediate repeats, and handles the swap animation
- **`script.js`** — the glue: runs the MediaPipe pipeline every frame, debounces noisy per-frame readings into a stable result, and updates the UI
- **`style.css`** — the whole retro-TV-meets-meme-culture look, including a light/dark theme

Adding a new gesture's meme is just dropping images into a folder under `assets/memes/<category>/` — nothing to register or hardcode, the app finds them on its own.

## Running it locally

You can't just double-click `index.html` — camera access needs a real origin, not `file://`. Any static server works:

```bash
git clone https://github.com/Surbhi-1509/Meme-Verse.git
cd Meme-Verse
python3 -m http.server 5500
```

Then open `http://127.0.0.1:5500` and allow camera access when your browser asks. (VS Code's Live Server extension works just as well, if that's more your speed.)

## A few honest limitations

- Detection is heuristic, not ML-trained — it's tuned against normal front-facing webcam use, so unusual angles, low light, or a hand partly out of frame can throw it off.
- It's built and tested against a single hand and a single face at a time.
- Some gestures (like Rock 🤘 and the ASL "I love you" sign) are visually close enough that the classifier currently treats them as the same gesture, on purpose, since separating them reliably wasn't worth the false-positive trade-off.

## Built with

- [MediaPipe](https://developers.google.com/mediapipe) (Hands + Face Mesh) for all the landmark tracking
- Vanilla JavaScript — no frameworks
- A genuine love of bad memes

---

If you build on this or fork it, I'd love to see what you make of it. And if something breaks or misfires on your face/hand — that's honestly the most useful bug report you could give me.
