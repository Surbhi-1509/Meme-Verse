class GestureClassifier {
    constructor() {
        // Fingertip landmark indices (MediaPipe Hands topology).
        this.tipIds = [4, 8, 12, 16, 20];
        // The "knuckle" landmark used as a reference point per finger.
        // (thumb uses its IP joint, the other four use their PIP joint)
        this.pipIds = [3, 6, 10, 14, 18];
    }

    getDistance(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }

    // A non-thumb finger is "extended" if its tip is farther from the wrist
    // than its own pip joint is. This works regardless of hand rotation,
    // unlike a plain y-coordinate comparison.
    //
    // A small leniency margin (tip only needs to reach 90% of the pip's
    // wrist-distance) makes this count a slightly-bent finger as "extended"
    // too, since a razor-thin exact comparison was prone to misreading
    // genuinely-extended fingers as curled due to landmark noise.
    isFingerExtended(landmarks, tipId, pipId, wrist) {
        return this.getDistance(landmarks[tipId], wrist) > this.getDistance(landmarks[pipId], wrist) * 0.9;
    }

    // The thumb needs its own check because it folds sideways, not up/down.
    // Comparing distance-to-pinky-knuckle avoids relying on left/right handedness
    // or raw x-position, which previously broke depending on which hand was shown.
    isThumbExtended(landmarks) {
        const pinkyMcp = landmarks[17];
        return this.getDistance(landmarks[4], pinkyMcp) > this.getDistance(landmarks[2], pinkyMcp) * 1.05;
    }

    classify(multiHandLandmarks) {
        if (!multiHandLandmarks || multiHandLandmarks.length === 0) {
            return "None";
        }

        const landmarks = multiHandLandmarks[0];
        const wrist = landmarks[0];

        const thumbExtended = this.isThumbExtended(landmarks);
        const fingers = [thumbExtended ? 1 : 0];
        for (let i = 1; i < 5; i++) {
            fingers.push(this.isFingerExtended(landmarks, this.tipIds[i], this.pipIds[i], wrist) ? 1 : 0);
        }
        const totalFingers = fingers.reduce((a, b) => a + b, 0);

        // Fist: every finger curled.
        if (totalFingers === 0) {
            return "fist";
        }

        // Thumbs up: only the thumb is extended, and it's pointing upward
        // (tip above the IP joint in image space).
        if (thumbExtended && totalFingers === 1 && landmarks[4].y < landmarks[3].y) {
            return "thumbs_up";
        }

        // OK sign: thumb tip and index tip pinched together, while the
        // middle/ring/pinky fingers are extended.
        //
        // The pinch distance is scaled by hand size (wrist-to-middle-MCP
        // distance) rather than a fixed number — a fixed distance has the
        // same camera-distance problem we found with heart-hands earlier:
        // move your hand closer/farther from the camera and the same
        // physical pinch reads as a different normalized number.
        const thumbIndexDist = this.getDistance(landmarks[4], landmarks[8]);
        const handSize = this.getDistance(wrist, landmarks[9]); // wrist -> middle MCP
        const pinchThreshold = handSize * 0.35;
        if (thumbIndexDist < pinchThreshold && !fingers[1] && fingers[2] && fingers[3] && fingers[4]) {
            return "ok";
        }

        // Rock / "I love you" sign (🤟): index and pinky extended, middle
        // and ring curled. (Thumb position is ignored — people commonly
        // make this sign with the thumb either tucked in or held out, and
        // requiring one specific way was making it too easy to miss.)
        if (fingers[1] && !fingers[2] && !fingers[3] && fingers[4]) {
            return "rock";
        }

        // Call me / shaka sign (🤙): only thumb and pinky extended.
        if (fingers[0] && !fingers[1] && !fingers[2] && !fingers[3] && fingers[4]) {
            return "call_me";
        }

        // Peace sign (✌️): index and middle extended, ring and pinky curled
        // (thumb position is ignored since it varies between people).
        if (fingers[1] && fingers[2] && !fingers[3] && !fingers[4]) {
            return "peace";
        }

        // Shh: only the index finger extended, everything else (including thumb) curled.
        if (fingers[1] && !fingers[2] && !fingers[3] && !fingers[4]) {
            return "shh";
        }

        return "None";
    }
}