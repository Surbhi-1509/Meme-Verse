class ExpressionClassifier {
    getDistance(p1, p2) {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }

    classify(multiFaceLandmarks) {
        if (!multiFaceLandmarks || multiFaceLandmarks.length === 0) {
            this.lastDebug = null;
            return "None";
        }

        const face = multiFaceLandmarks[0];

        // ---- Mouth ----
        const mouthLeft = face[61];
        const mouthRight = face[291];
        const upperLip = face[13];
        const lowerLip = face[14];

        // ---- Eyes (outer corners, used only as the distance reference) ----
        const eyeAOuter = face[33];
        const eyeBOuter = face[263];

        // ---- Eyebrows (a point roughly above each eye, for "angry") ----
        const browACenter = face[105];
        const browBCenter = face[334];
        const eyeATop = face[159];
        const eyeBTop = face[386];

        const eyeDist = this.getDistance(eyeAOuter, eyeBOuter);
        if (eyeDist === 0) {
            this.lastDebug = null;
            return "None";
        }

        // ---- Mouth ratios (smile/tongue) ----
        const mouthWidth = this.getDistance(mouthLeft, mouthRight);
        const mouthHeight = this.getDistance(upperLip, lowerLip);
        const smileRatio = mouthWidth / eyeDist;
        const openRatio = mouthHeight / eyeDist;

        // ---- Eyebrow raise, for "angry" ----
        const browRaiseA = (eyeATop.y - browACenter.y) / eyeDist;
        const browRaiseB = (eyeBTop.y - browBCenter.y) / eyeDist;
        const browRaiseRatio = (browRaiseA + browRaiseB) / 2;

        this.lastDebug = { smileRatio, openRatio, browRaiseRatio };

        // Angry: eyebrows pulled down toward the eyes.
        if (browRaiseRatio < 0.33) {
            return "angry";
        }

        if (smileRatio > 0.65 && openRatio < 0.32) {
            return "smile";
        }

        if (openRatio > 0.32) {
            return "tongue";
        }

        return "None";
    }
}
