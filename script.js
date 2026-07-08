const videoElement = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const debugReadout = document.getElementById('debug_readout');

// ---- Light / Dark theme toggle ----
// The actual attribute is already set (if needed) by the inline script in
// <head>, before first paint — this just wires up the button and keeps it
// in sync, plus persists the choice. Dark is the default whenever nothing
// is saved yet.
const THEME_KEY = 'gestureMemeTheme';
const themeToggleBtn = document.getElementById('theme_toggle');
const themeToggleIcon = themeToggleBtn.querySelector('.theme-toggle-icon');

function reflectTheme(theme) {
    themeToggleIcon.textContent = theme === 'light' ? '☀️' : '🌙';
    themeToggleBtn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
}

reflectTheme(document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark');

themeToggleBtn.addEventListener('click', () => {
    const isCurrentlyLight = document.documentElement.getAttribute('data-theme') === 'light';
    const next = isCurrentlyLight ? 'dark' : 'light';

    if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
    reflectTheme(next);

    try {
        localStorage.setItem(THEME_KEY, next);
    } catch (e) {
        // Ignore storage errors (e.g. private browsing) — the theme still
        // applies for the rest of this session either way.
    }
});

const gestureClassifier = new GestureClassifier();
const expressionClassifier = new ExpressionClassifier();
const memeManager = new MemeManager();

// All the pill buttons, grouped by the category they represent, so we can
// toggle an "active" class on whichever one matches the current pose.
const pills = document.querySelectorAll('.pill[data-category]');

let stableGesture = "None";
let gestureHistory = [];
let stableExpression = "None";
let expressionHistory = [];
const GESTURE_HISTORY_LENGTH = 10;   // hand gestures: fast, plain majority vote
const EXPRESSION_HISTORY_LENGTH = 6; // facial expressions: shorter window so "sticky" voting doesn't feel laggy

// ---- Live statistics ----
// Total/most-used counts persist forever (localStorage) until manually
// cleared with the Reset Statistics button below. A detection is counted
// once per *new* stable reading (i.e. when the smoothed gesture/expression
// actually changes to something new) — not once per frame, which would
// just count how long you held a pose.
const CATEGORY_LABELS = {
    thumbs_up: '💪 Thumbs Up', fist: '✊ Fist', ok: '👌 OK Sign', shh: '🤫 Shh',
    peace: '✌️ Peace', rock: '🤟 Rock', call_me: '🤙 Call Me',
    smile: '😊 Smile', tongue: '😝 Tongue Out', angry: '😠 Angry'
};
function labelFor(category) {
    return CATEGORY_LABELS[category] || category;
}

const STATS_KEY = 'gestureMemeStats';
function defaultStats() {
    return { totalGestures: 0, totalExpressions: 0, gestureCounts: {}, expressionCounts: {} };
}
let stats = defaultStats();
try {
    const saved = JSON.parse(localStorage.getItem(STATS_KEY));
    if (saved && typeof saved === 'object') {
        // Merge onto the defaults rather than trusting the saved shape
        // outright — this survives old data saved under a previous
        // version of this stats format (or anything else unexpected).
        stats = {
            totalGestures: typeof saved.totalGestures === 'number' ? saved.totalGestures : 0,
            totalExpressions: typeof saved.totalExpressions === 'number' ? saved.totalExpressions : 0,
            gestureCounts: (saved.gestureCounts && typeof saved.gestureCounts === 'object') ? saved.gestureCounts : {},
            expressionCounts: (saved.expressionCounts && typeof saved.expressionCounts === 'object') ? saved.expressionCounts : {}
        };
    }
} catch (e) {
    // Ignore corrupt/missing storage — defaults above are fine.
}

const statTotalGestures = document.getElementById('stat_total_gestures');
const statTotalExpressions = document.getElementById('stat_total_expressions');
const statTopGesture = document.getElementById('stat_top_gesture');
const statTopExpression = document.getElementById('stat_top_expression');
const statAvgFps = document.getElementById('stat_avg_fps');
const resetStatsBtn = document.getElementById('reset_stats_btn');

function topCategory(counts) {
    let best = null, bestCount = 0;
    for (const [category, count] of Object.entries(counts)) {
        if (count > bestCount) { best = category; bestCount = count; }
    }
    return best ? `${labelFor(best)} (${bestCount})` : '—';
}

function renderStats() {
    statTotalGestures.textContent = stats.totalGestures;
    statTotalExpressions.textContent = stats.totalExpressions;
    statTopGesture.textContent = topCategory(stats.gestureCounts);
    statTopExpression.textContent = topCategory(stats.expressionCounts);
}

function saveStats() {
    try {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (e) {
        // Ignore storage errors (e.g. private browsing) — counts still
        // update live for the rest of this session either way.
    }
}

function recordDetection(kind, category) {
    if (kind === 'gesture') {
        stats.totalGestures += 1;
        stats.gestureCounts[category] = (stats.gestureCounts[category] || 0) + 1;
    } else {
        stats.totalExpressions += 1;
        stats.expressionCounts[category] = (stats.expressionCounts[category] || 0) + 1;
    }
    saveStats();
    renderStats();
}

renderStats(); // show whatever was loaded (or zeros) immediately on page load

resetStatsBtn.addEventListener('click', () => {
    const confirmed = confirm('Reset all statistics? This clears total gestures/expressions and most-used counts — it cannot be undone.');
    if (!confirmed) return;
    stats = defaultStats();
    saveStats();
    renderStats();
});

// ---- Average FPS ----
// frameCount is a plain integer increment, added once per actually-
// processed video frame in processVideo() below — negligible cost, no
// different from any other counter already in the pipeline. A separate
// 1-second interval (fully decoupled from the per-frame detection loop)
// turns that count into a live readout, so the DOM update itself also
// never runs more than once per second, keeping the detection loop's
// performance completely unaffected.
const sessionStartTime = Date.now(); // still needed as the FPS calc's time reference
let frameCount = 0;

function updateLiveMetrics() {
    const elapsedSeconds = (Date.now() - sessionStartTime) / 1000;
    const avgFps = elapsedSeconds > 0 ? frameCount / elapsedSeconds : 0;
    statAvgFps.textContent = avgFps.toFixed(1);
}
updateLiveMetrics();
setInterval(updateLiveMetrics, 1000);

// Returns the most common item in an array, used to debounce noisy
// per-frame classifications into a single "stable" reading.
function getMostFrequent(arr) {
    if (arr.length === 0) return "None";
    const counts = {};
    let maxCount = 0;
    let maxItem = arr[0];
    for (const item of arr) {
        counts[item] = (counts[item] || 0) + 1;
        if (counts[item] > maxCount) {
            maxCount = counts[item];
            maxItem = item;
        }
    }
    return { maxItem, maxCount, total: arr.length };
}

// Like getMostFrequent, but "sticky": won't switch away from whatever is
// currently stable unless the new leading category clearly dominates the
// window. This stops borderline expressions from flickering back and forth
// when a per-frame reading occasionally tips across a close threshold.
function getStableCategory(arr, currentStable, minShare = 0.6) {
    const result = getMostFrequent(arr);
    if (result.total === 0) return currentStable;
    const share = result.maxCount / result.total;
    if (result.maxItem === currentStable) return currentStable;
    return share >= minShare ? result.maxItem : currentStable;
}

// Small bottom-left debug readout showing per-finger curl state, e.g.
// "I:E M:C R:C P:C T:UP" (Index/Middle/Ring/Pinky Extended/Curled, Thumb Up/Down).
function updateDebugReadout(landmarks) {
    if (!landmarks) {
        debugReadout.textContent = '';
        return;
    }
    const wrist = landmarks[0];
    const state = (extended) => (extended ? 'E' : 'C');
    const index = gestureClassifier.isFingerExtended(landmarks, 8, 6, wrist);
    const middle = gestureClassifier.isFingerExtended(landmarks, 12, 10, wrist);
    const ring = gestureClassifier.isFingerExtended(landmarks, 16, 14, wrist);
    const pinky = gestureClassifier.isFingerExtended(landmarks, 20, 18, wrist);
    const thumbUp = landmarks[4].y < landmarks[3].y;

    debugReadout.textContent =
        `I:${state(index)} M:${state(middle)} R:${state(ring)} P:${state(pinky)} T:${thumbUp ? 'UP' : 'DOWN'}`;
}

// Appends live smile/tongue ratio numbers to the debug readout so you can
// see exactly how close your expression is to crossing the thresholds
// (smile needs smileRatio above its bar and openRatio below its bar).
function appendExpressionDebug() {
    const debug = expressionClassifier.lastDebug;
    if (!debug) return;
    const fmt = (n) => n.toFixed(2);
    debugReadout.textContent +=
        ` | smile:${fmt(debug.smileRatio)} open:${fmt(debug.openRatio)}` +
        ` | brow↑:${fmt(debug.browRaiseRatio)}`;
}

// Highlights whichever pill button matches the currently active gesture/expression.
function updateActivePill(category) {
    pills.forEach((pill) => {
        const isActive = pill.dataset.category === category;
        pill.classList.toggle('active', isActive);
        pill.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });
}

function onResults(results) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    let rawGesture = "None";
    let firstHandLandmarks = null;
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (const landmarks of results.multiHandLandmarks) {
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF88', lineWidth: 2 });
            drawLandmarks(canvasCtx, landmarks, { color: '#FF5DA2', lineWidth: 1, radius: 2 });
        }
        firstHandLandmarks = results.multiHandLandmarks[0];
        rawGesture = gestureClassifier.classify(results.multiHandLandmarks);
    }
    updateDebugReadout(firstHandLandmarks);

    let rawExpression = "None";
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        // Note: face mesh landmarks are still detected and classified here,
        // we just no longer draw the wireframe overlay on the canvas.
        rawExpression = expressionClassifier.classify(results.multiFaceLandmarks);
    }
    appendExpressionDebug();

    // Hand gestures: fast plain-majority voting. These were reliable
    // before, so no stickiness needed here — it would only slow down
    // switching between gestures like shh/rock without fixing anything.
    gestureHistory.push(rawGesture);
    if (gestureHistory.length > GESTURE_HISTORY_LENGTH) gestureHistory.shift();
    const prevStableGesture = stableGesture;
    stableGesture = getMostFrequent(gestureHistory).maxItem;
    if (stableGesture !== prevStableGesture && stableGesture !== "None") {
        recordDetection('gesture', stableGesture);
    }

    // Facial expressions: sticky voting (resists flicker on close calls),
    // but with a shorter window and a lower majority bar (50%, not a
    // supermajority) so it doesn't feel laggy switching between expressions.
    expressionHistory.push(rawExpression);
    if (expressionHistory.length > EXPRESSION_HISTORY_LENGTH) expressionHistory.shift();
    const prevStableExpression = stableExpression;
    stableExpression = getStableCategory(expressionHistory, stableExpression, 0.5);
    if (stableExpression !== prevStableExpression && stableExpression !== "None") {
        recordDetection('expression', stableExpression);
    }

    // Hand gestures take priority over facial expressions when both are present.
    const activeCategory = stableGesture !== "None"
        ? stableGesture
        : (stableExpression !== "None" ? stableExpression : "default");

    memeManager.show(activeCategory);
    updateActivePill(activeCategory);

    canvasCtx.restore();
}

const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});
hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});
faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: true,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7
});

let handResults = null;

hands.onResults((results) => {
    handResults = results;
});

faceMesh.onResults((results) => {
    onResults({
        multiHandLandmarks: handResults ? handResults.multiHandLandmarks : null,
        multiFaceLandmarks: results.multiFaceLandmarks
    });
});

// A single processing loop driven by the video's own frame delivery.
// (Previously this duplicated Camera's internal animation loop with a
// separate, disconnected requestAnimationFrame chain.)
let isProcessingFrame = false;
async function processVideo() {
    if (videoElement.readyState >= 2 && !isProcessingFrame) {
        isProcessingFrame = true;
        frameCount++;
        await hands.send({ image: videoElement });
        await faceMesh.send({ image: videoElement });
        isProcessingFrame = false;
    }
}

const camera = new Camera(videoElement, {
    onFrame: processVideo,
    width: 1280,
    height: 720
});

// ---- Loading screen orchestration ----
// Runs through the requested step sequence, doing genuine async work where
// one exists (hands.initialize() / faceMesh.initialize() actually load the
// MediaPipe models here, rather than just being a timed placeholder), and
// only calls camera.start() — which is what actually turns the webcam on —
// once every step has finished and the "Ready!" step has been shown.
const loadingScreen = document.getElementById('loading_screen');
const loadingStepText = document.getElementById('loading_step_text');
const loadingBarFill = document.getElementById('loading_bar_fill');
const loadingPercent = document.getElementById('loading_percent');
const appContainer = document.querySelector('.container');

function setLoadingProgress(percent, label) {
    loadingBarFill.style.width = `${percent}%`;
    loadingPercent.textContent = `${Math.round(percent)}%`;
    if (label) loadingStepText.textContent = label;
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initializeApp() {
    setLoadingProgress(5, '📷 Initializing Camera...');
    await wait(400);

    setLoadingProgress(20, '🧠 Loading AI Models...');
    await wait(350);

    setLoadingProgress(35, '✋ Loading Gesture Detection...');
    await hands.initialize(); // real: loads the hand-tracking model
    setLoadingProgress(60, '✋ Loading Gesture Detection...');

    setLoadingProgress(65, '😊 Loading Facial Expression Detection...');
    await faceMesh.initialize(); // real: loads the face-mesh model
    setLoadingProgress(85, '😊 Loading Facial Expression Detection...');

    setLoadingProgress(90, '🖼 Loading Meme Assets...');
    await wait(350);

    setLoadingProgress(100, '✅ Ready!');
    await wait(500);

    // Fade the loading screen out and the app in together, then start the
    // webcam only now that loading has fully completed.
    loadingScreen.classList.add('loading-hidden');
    appContainer.classList.add('app-visible');
    camera.start();
    document.querySelector('.video-wrapper').classList.add('camera-active'); // visual only — powers the glow effect

    setTimeout(() => loadingScreen.remove(), 700);
}

initializeApp();
