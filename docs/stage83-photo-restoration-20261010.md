# Stage83 — Advanced old-photo repair inside image compression
Requested proposal #11 is **dust/scratch repair** from the photo section, placed only within `web/image-compressor.html`.

New entirely offline, local optional restoration panel. Conservative 8-neighbor luminance median detects and repairs tiny isolated bright/dark dust defects while skipping edges, preserving source pixels. Manual on-canvas stroke healing with strength and brush radius addresses localized scratches. Original/before preview, bounded undo/redo, reset, JPEG/PNG output, and results integration are functional. Original upload is never overwritten.

The editor caps processing to four megapixels to prevent mobile crashes; downscaling of extremely large inputs is disclosed. The algorithm does not claim AI, automatic long-scratch detection, reliable face reconstruction or recovery of lost detail. On-device WebView, touch and printer tests remain necessary. No GitHub Actions, APK build, `main` merge or live server changes.
