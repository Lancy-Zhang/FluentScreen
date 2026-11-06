# FluentScreen

**Learn English from videos you already enjoy.**

[中文说明](README.zh-CN.md) · [Installation](docs/INSTALL.md) · [Portfolio notes](PORTFOLIO.md)

FluentScreen is a local-first bilingual subtitle learning tool built by **Lancy Zhang**. It combines a Chrome extension with a lightweight macOS Apple Vision companion to capture Chinese subtitles from supported video pages, translate each line into English, keep a synchronized transcript, and turn sentences into learning material.

## Highlights

- Works with YouTube, Bilibili, and Kubb video pages.
- Prefers player-provided subtitles when they are available.
- Uses on-device Apple Vision OCR for hardcoded Chinese subtitles on macOS.
- Displays a persistent Chinese–English transcript in Chrome's side panel.
- Supports sentence explanations and a local vocabulary notebook.
- Stores learning history locally in the browser.

## How it works

1. The Chrome extension detects player subtitles or captures the configured subtitle region.
2. FluentScreen Vision performs Chinese OCR locally on the Mac.
3. The side panel removes repeats, aligns lines to playback time, and translates them into English.
4. Completed translations remain visible for review.

## Components

- **Chrome extension** — page integration, side panel, transcript, translation, and learning tools.
- **FluentScreen Vision** — a small macOS helper using Apple's Vision framework for local OCR.
- **DMG installer** — installs the helper and prepares the extension folder. Chrome requires one final manual “Load unpacked” step for extensions distributed outside the Chrome Web Store.

## Privacy

OCR screenshots are processed locally on the user's Mac and are not saved by FluentScreen Vision. Transcript and vocabulary data remain in Chrome local storage. Translation requests may be sent to the configured translation service; avoid using the tool with confidential video content.

## Install

Download `FluentScreen-1.5.0-macOS.dmg` from Releases and follow the [installation guide](docs/INSTALL.md). The free build is unsigned, so macOS may ask you to right-click the installer and choose **Open**.

## Current limitations

- macOS is required for Apple Vision OCR.
- Video overlays, ads, stylized subtitles, and rapid scene changes can reduce OCR accuracy.
- Off-store Chrome extensions must be loaded once through `chrome://extensions`.
- Translation availability depends on the translation service and its rate limits.

## Tech stack

Chrome Extension Manifest V3, JavaScript, HTML/CSS, Objective-C, Apple Vision, Native Messaging, AppleScript, and shell-based DMG packaging.

## Status

Portfolio release / active prototype. Source code is publicly visible for demonstration. No reuse license is granted unless a license file is added later.

