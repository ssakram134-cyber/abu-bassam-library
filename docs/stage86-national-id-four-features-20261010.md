# Stage86 — First four national-ID selected features

National ID #1 **guided front/back capture** already exists as `Nat.maker()` and #2 **cropped/missing-edge guidance** already exists in `detectDocument`, `analyzeItem` and auto-crop. These are **reused**, not reimplemented or counted as novel lines of code. This stage makes their workflow visible in a supplementary QA panel.

National ID #3: actual local pixel-glare heuristic flags clipped white patches next to substantially darker neighboring pixels. This is only a **warning** (false positive/negative possible), never a certification of document quality or identity authenticity.

National ID #4: explicitly requested offline Arabic+English OCR uses the bundled local Tesseract.js worker, presents up to 6000 extracted characters for manual correction, and requires a separate **approve** action before opt-in TXT export through the existing Android save bridge. No automatic cloud upload or localStorage retention of extracted personal details. Worker is terminated after each job. Selecting another image during OCR is a possible race; before release, QA tests must validate the selected image remains unchanged until the result is accepted.

This change does not add card number capture to any remote database. A real Android/printed document OCR, false-glare, privacy/export and permission test remains required. All other user-selected features are still tracked as pending, including all 20 notification/report items and the 20 compression items. No build, deployment, Actions or main merge.
