# Real-time In-Browser Audio Translator Chrome Extension

## 🚀 Project Overview

This Chrome Extension provides real-time, on-the-fly transcription and translation of audio playing in your browser tabs. It captures the audio from any active tab, sends it to a powerful speech-to-text API for transcription, translates the resulting text into your chosen language, and then plays the translated text aloud using Text-to-Speech (TTS), all while displaying the translated subtitles as an overlay on the tab.

Imagine watching a video or listening to a podcast in one language and instantly getting spoken and visual translations in another!

## ✨ Key Features

* **Real-time Audio Capture:** Captures audio directly from the active Chrome tab.
* **Speech-to-Text Transcription:** Utilizes Deepgram's advanced speech-to-text API for highly accurate and real-time transcription of spoken content.
* **Dynamic Translation:** Integrates with the Google Cloud Translation API to instantly translate transcribed text into a user-selected target language.
* **Multilingual Text-to-Speech (TTS):** Converts the translated text back into spoken audio using the Web Speech API, allowing you to hear the content in your desired language.
* **Live Subtitle Overlay:** Displays the translated text as a transparent overlay on the tab, similar to closed captions.
* **Language Selection:** Users can choose their preferred translation language from the extension's popup.
* **Intelligent Translation Handling:** If the selected target language is the same as the source language (assumed English for transcription), no translation is performed, and the original transcript is used for display and TTS.

## ⚙️ How It Works

The extension operates through a sophisticated, multi-component architecture:

1. **`popup.html` / `popup.js` (User Interface):**
   * The user interacts with the extension via its popup, selecting the desired translation language and initiating/stopping the interpretation.
   * `popup.js` uses Chrome's `chrome.tabCapture` API to capture the audio stream from the active tab.
   * Instead of `MediaRecorder`, `popup.js` leverages the **Web Audio API (`AudioContext` and `ScriptProcessorNode`)** to precisely process the raw audio stream. It downsamples the audio to 16kHz and converts it into `linear16` (raw PCM) format.
   * These `linear16` audio chunks are then Base64-encoded and sent to the `background.js` service worker.
2. **`background.js` (Service Worker - The Brain):**
   * This script runs persistently in the background, managing the core logic and external API connections.
   * It receives the Base64-encoded `linear16` audio chunks from `popup.js`.
   * It maintains a WebSocket connection with the **Deepgram Speech-to-Text API** (via `deepgram-client.js`). It decodes the Base64 chunks back to binary `ArrayBuffer` and streams them directly to Deepgram.
   * Upon receiving `is_final` transcription results from Deepgram:
     * It determines if translation is needed (i.e., if the user's selected `targetLanguage` is different from the detected/assumed source language, typically English).
     * If translation is required, it sends the transcribed text to the **Google Cloud Translation API** (via `translation-client.js`).
     * It then sends  **both the original and translated text** , along with the `targetLanguage`, to the `content.js` script in the active tab.
3. **`deepgram-client.js` (Deepgram Integration):**
   * Manages the WebSocket connection to Deepgram.
   * Handles sending audio data and receiving transcription results.
   * Forwards raw transcription data to `background.js` for further processing (translation).
4. **`translation-client.js` (Translation API Integration - NEW):**
   * Dedicated module for making HTTP POST requests to the Google Cloud Translation API.
   * Handles the API key and request/response parsing for translation.
5. **`content.js` (In-Tab Interaction):**
   * This script is injected into the user's active tab.
   * It receives the transcribed and translated text from `background.js`.
   * It creates and manages a transparent overlay (`div`) to display the translated subtitles directly on the webpage.
   * It uses the browser's built-in **Web Speech API (`SpeechSynthesis`)** to convert the translated text into spoken audio, playing it through the user's speakers.

## 🛠️ Technology Stack

* **Chrome Extension APIs:** `chrome.tabCapture`, `chrome.runtime.sendMessage`, `chrome.scripting`.
* **Web Audio API:** For robust audio capture, resampling (`AudioContext`, `ScriptProcessorNode`).
* **Deepgram API:** Real-time Speech-to-Text transcription.
* **Google Cloud Translation API:** Machine translation.
* **Web Speech API:** Text-to-Speech (TTS) for audio output.
* **HTML, CSS, JavaScript:** Standard web technologies for the UI and logic.

## 🚀 Getting Started

To run this extension locally:

1. **Clone this Repository:**
   **Bash**

   ```
   git clone [your-repo-url]
   cd [your-repo-name]
   ```
2. **Obtain API Keys:**

   * **Deepgram API Key:** Sign up at [Deepgram](https://deepgram.com/) and get your API key.
   * **Google Cloud Translation API Key:**
     * Go to the [Google Cloud Console](https://console.cloud.google.com/).
     * Create a new project or select an existing one.
     * Navigate to "APIs & Services" > "Credentials" and create an API Key.
     * Go to "APIs & Services" > "Library" and **enable the "Cloud Translation API"** for your project.
3. **Configure API Keys:**

   * Open `deepgram-client.js` and replace `"YOUR_DEEPGRAM_API_KEY_HERE"` with your Deepgram key.
   * Open `translation-client.js` and replace `"YOUR_GOOGLE_TRANSLATE_API_KEY_HERE"` with your Google Cloud Translation API key.

   **⚠️ Security Note:** Remember the warning about embedding API keys directly in client-side code. This is for demonstration purposes.
4. **Load the Extension in Chrome:**

   * Open Chrome and go to `chrome://extensions/`.
   * Enable "Developer mode" using the toggle in the top-right corner.
   * Click "Load unpacked" and select the root directory of this project.

## 💡 Usage

1. Navigate to a Chrome tab where audio is playing (e.g., a YouTube video, a podcast).
2. Click on the extension icon in your Chrome toolbar.
3. Select your desired **Translation Language** from the dropdown menu.
4. Click the "Start Interpretation" button.
5. You should start seeing translated subtitles appear at the bottom of the tab, and the translated audio will play through your speakers.
6. To stop, click the "Stop Interpretation" button in the popup.
