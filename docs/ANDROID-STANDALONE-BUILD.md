# Android standalone build

The distributable APK must be a **Release** variant so React Native packages `assets/index.android.bundle` inside the APK. A Debug APK is not an acceptable fallback because it attempts to connect to Metro on port 8081.

CI rules:
- Build `assembleRelease` in every case.
- If a production keystore is available, use it.
- Otherwise keep the Release variant and sign it with the generated Android project's debug signing config for installable test builds.
- Verify `assets/index.android.bundle` exists inside the final APK.
- Verify the APK signature before upload.
- Never publish an `assembleDebug` APK as the distributable artifact.
