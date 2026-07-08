class MemeManager {
    constructor() {
        // Elements for the right-hand "meme card" panel.
        this.panel = document.getElementById('meme_panel');
        this.imgElement = document.getElementById('meme_img');
        this.flashElement = this.panel.querySelector('.meme-tv-power-flash');

        // Each category maps to an array of image paths. Flat categories
        // point at a single file. Folder categories start with the files we
        // know exist, then autoDiscoverMore() probes for additional
        // sequentially-numbered images (3.jpg, 4.jpg, ...) so dropping extra
        // files into a folder works without touching this code.
        this.memes = {
            'thumbs_up': ['assets/memes/thumbs_up.jpg'],
            'fist': ['assets/memes/fist.jpg'],
            'ok': ['assets/memes/ok.jpg'],
            'shh': ['assets/memes/shh.jpg'],
            'smile': ['assets/memes/smile.jpg'],
            'tongue': ['assets/memes/tongue.jpg'],
            'angry': ['assets/memes/angry.jpg'],
            'default': ['assets/memes/default.jpg'],

            'peace': ['assets/memes/peace/1.jpg'],
            'rock': ['assets/memes/rock/1.jpg'],
            'call_me': ['assets/memes/call_me/1.jpg']
        };

        // Folder-based categories (as opposed to the single flat-file ones
        // above) — this list drives autoDiscoverMore().
        this.folderCategories = ['peace', 'rock', 'call_me'];

        // Tracks the last image shown per category so we never repeat the
        // same meme twice in a row for that gesture.
        this.lastShown = {};

        this.currentCategory = null;

        this.autoDiscoverMore();
    }

    // Tries to load a single image and resolves true/false based on whether
    // it actually exists, without throwing or logging console errors.
    probeImage(src) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => resolve(true);
            img.onerror = () => resolve(false);
            img.src = src;
        });
    }

    // For each folder category, keeps checking for the next sequentially
    // numbered file (3.jpg, 4.jpg, 5.jpg, ...) across a few common
    // extensions, and stops at the first gap. Anything found is appended to
    // the existing pool, so this only ever adds to what's already there —
    // it never removes or changes currently working images.
    async autoDiscoverMore(maxProbe = 20) {
        const extensions = ['jpg', 'jpeg', 'png', 'webp'];
        for (const category of this.folderCategories) {
            const folder = `assets/memes/${category}`;
            let nextIndex = this.memes[category].length + 1;
            for (let i = nextIndex; i <= maxProbe; i++) {
                let found = null;
                for (const ext of extensions) {
                    const candidate = `${folder}/${i}.${ext}`;
                    if (await this.probeImage(candidate)) {
                        found = candidate;
                        break;
                    }
                }
                if (!found) break; // stop at the first gap in numbering
                this.memes[category].push(found);
            }
        }
    }

    // Picks a random image from the category's pool, avoiding whichever
    // image was shown last time this category was active.
    pickMeme(category) {
        const pool = this.memes[category];
        if (pool.length === 1) {
            this.lastShown[category] = pool[0];
            return pool[0];
        }
        let choice;
        do {
            choice = pool[Math.floor(Math.random() * pool.length)];
        } while (choice === this.lastShown[category]);
        this.lastShown[category] = choice;
        return choice;
    }

    // Continuously reflects whichever gesture/expression is currently held —
    // no more "flash the meme for 2.5s then lock out new triggers" behavior.
    // Calling this every frame is cheap because it's a no-op unless the
    // category actually changed (this alone prevents flicker/animation
    // replay while a single gesture is held steady across many frames).
    show(category) {
        if (!this.memes[category]) category = 'default';
        if (category === this.currentCategory) return;

        const isFirstShow = this.currentCategory === null;
        this.currentCategory = category;

        const src = this.pickMeme(category);

        // If the picked image is literally already what's on screen (e.g.
        // switching briefly to another category and back to a single-image
        // one), don't replay the animation for no visible change.
        if (src === this.imgElement.dataset.currentSrc) return;

        const imgEl = this.imgElement;

        const flashEl = this.flashElement;

        const playEnter = () => {
            imgEl.onerror = () => {
                console.warn(`Meme image failed to load: ${src} — falling back to default.`);
                imgEl.onerror = null;
                imgEl.src = this.memes['default'][0];
            };
            imgEl.src = src;
            imgEl.dataset.currentSrc = src;

            imgEl.classList.remove('meme-exit', 'meme-enter');
            void imgEl.offsetWidth; // force reflow so the animation reliably restarts
            imgEl.classList.add('meme-enter');

            // Small TV "power-on" flash, playing alongside the meme's own
            // fade/zoom/bounce entrance — same reflow trick so it replays
            // cleanly every time, but only reaches here in the first place
            // when the category/image genuinely changed (the checks above).
            if (flashEl) {
                flashEl.classList.remove('playing');
                void flashEl.offsetWidth;
                flashEl.classList.add('playing');
            }
        };

        if (isFirstShow) {
            // Nothing on screen to fade out from yet — just play the entrance.
            playEnter();
        } else {
            imgEl.classList.remove('meme-enter');
            imgEl.classList.add('meme-exit');
            const onExitEnd = () => {
                imgEl.removeEventListener('animationend', onExitEnd);
                playEnter();
            };
            imgEl.addEventListener('animationend', onExitEnd, { once: true });
        }
    }
}
