import { arrayBufferToBase64 } from "./utils.js"; // Import utility functions

// Global variables for audio processing
let audioStream; // The captured MediaStream
let audioContext; // Web Audio API Context
let sourceNode; // Connects audioStream to AudioContext
let gainNode; // For local playback volume control (optional)
let scriptProcessor; // Node to process raw audio data

let deepgramReady = false;
let currentTabId;

const startButton = document.getElementById("startButton");
const statusMessage = document.getElementById("statusMessage");

// Function to update status messages in the popup UI
function updateStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = isError
    ? "status-message error-message"
    : "status-message";
}

// Function to stop all audio processing and connections gracefully
function stopInterpretation() {
  updateStatus("Stopping interpretation...");

  // Disconnect and close ScriptProcessorNode
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }

  // Stop the MediaStream tracks
  if (audioStream) {
    audioStream.getTracks().forEach((track) => track.stop());
    audioStream = null;
  }

  // Close the AudioContext
  if (audioContext && audioContext.state !== "closed") {
    audioContext
      .close()
      .then(() => console.log("[popup.js] AudioContext closed."))
      .catch((error) =>
        console.error("[popup.js] Error closing AudioContext:", error)
      );
    audioContext = null;
  }

  // Inform background script to stop its Deepgram connection
  if (currentTabId) {
    chrome.runtime
      .sendMessage({ command: "stop-deepgram-session", tabId: currentTabId })
      .catch((error) =>
        console.error(
          "[popup.js] Error sending stop command to background:",
          error
        )
      );
  }

  // Reset UI immediately
  resetUI();
}

// Function to reset popup UI elements
function resetUI() {
  startButton.textContent = "Start Interpretation";
  startButton.disabled = false;
  deepgramReady = false;
  currentTabId = null;
  updateStatus(""); // Clear status message
}

startButton.addEventListener("click", () => {
  const languageSelect = document.getElementById("languageSelect");
  const targetLanguage = languageSelect.value;

  // Toggle stop/start
  if (startButton.textContent === "Stop Interpretation") {
    stopInterpretation();
    return;
  }

  // Disable button and show loading state
  startButton.disabled = true;
  startButton.textContent = "Starting Capture...";
  updateStatus("Requesting audio capture...");

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab || !tab.id) {
      console.error("[popup.js] Could not find active tab.");
      resetUI();
      updateStatus("Error: Could not find active tab.", true);
      return;
    }
    currentTabId = tab.id;

    // First, inject content.js into the current tab if not already present
    // This ensures subtitle overlay is ready
    chrome.scripting
      .executeScript({
        target: { tabId: currentTabId },
        files: ["content.js"],
      })
      .then(() => {
        console.log("[popup.js] Content script injected.");
        updateStatus("Content script injected. Requesting capture...");

        chrome.tabCapture.capture(
          { audio: true, video: false },
          function (stream) {
            if (chrome.runtime.lastError || !stream) {
              console.error(
                "[popup.js] Capture failed:",
                chrome.runtime.lastError?.message || "Unknown capture error"
              );
              resetUI();
              updateStatus(
                "Failed to start audio capture. Ensure audio is playing in the tab.",
                true
              );
              return;
            }

            audioStream = stream;
            console.log("[popup.js] Audio stream captured:", audioStream);
            updateStatus("Audio stream captured. Initializing Deepgram...");

            // --- Web Audio API Setup for Raw PCM ---
            // Create an AudioContext targeting 16kHz sample rate (common for speech)
            audioContext = new (window.AudioContext ||
              window.webkitAudioContext)({ sampleRate: 16000 });
            sourceNode = audioContext.createMediaStreamSource(audioStream);

            // Create a ScriptProcessorNode to process raw audio data
            // Parameters: bufferSize (e.g., 4096), input channels (1 for mono), output channels (1)
            // This node will call `onaudioprocess` periodically with audio data.
            scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

            scriptProcessor.onaudioprocess = (event) => {
              // Get the raw audio data (Float32Array) from the first (mono) channel
              const inputBuffer = event.inputBuffer.getChannelData(0);

              // Convert Float32Array to Int16Array (Deepgram's linear16 format)
              const output = new Int16Array(inputBuffer.length);
              for (let i = 0; i < inputBuffer.length; i++) {
                let s = Math.max(-1, Math.min(1, inputBuffer[i])); // Clamp to [-1, 1]
                s = s < 0 ? s * 0x8000 : s * 0x7fff; // Convert to Int16 range
                output[i] = s;
              }

              const arrayBuffer = output.buffer; // This is your linear16 ArrayBuffer
              const base64String = arrayBufferToBase64(arrayBuffer); // Convert to Base64 for sending

              // console.log(`[popup.js] Sending Linear16 chunk. ArrayBuffer size: ${arrayBuffer.byteLength}, Base64 length: ${base64String.length}`);

              if (deepgramReady) {
                chrome.runtime.sendMessage(
                  {
                    command: "audio-chunk",
                    chunk: base64String, // Send Base64 string of raw PCM
                    tabId: currentTabId,
                  },
                  (response) => {
                    if (chrome.runtime.lastError) {
                      console.error(
                        "[popup.js] Error sending audio chunk to background:",
                        chrome.runtime.lastError.message
                      );
                    } else if (!response || !response.success) {
                      // console.warn("[popup.js] Background script did not acknowledge audio chunk or reported failure.");
                    }
                  }
                );
              } else {
                // console.warn("[popup.js] Deepgram not ready, dropping audio chunk.");
              }
            };

            // Connect the audio nodes: source -> scriptProcessor -> destination
            sourceNode.connect(scriptProcessor);
            scriptProcessor.connect(audioContext.destination); // Connect to destination to ensure `onaudioprocess` fires

            // Optional: for local playback of captured audio, you can connect the source directly too
            gainNode = audioContext.createGain(); // For volume control
            sourceNode.connect(gainNode);
            gainNode.connect(audioContext.destination);
            gainNode.gain.value = 1; // 1 for full volume, 0 for mute captured audio

            // Ensure AudioContext is running
            if (audioContext.state === "suspended") {
              audioContext
                .resume()
                .then(() => {
                  console.log("[popup.js] AudioContext resumed.");
                })
                .catch((e) =>
                  console.error("[popup.js] Error resuming AudioContext:", e)
                );
            }

            // Now, tell the background script to prepare Deepgram
            chrome.runtime.sendMessage(
              {
                command: "start-deepgram-session",
                tabId: currentTabId,
                targetLanguage: targetLanguage,
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  console.error(
                    "[popup.js] Error sending start session command to background script:",
                    chrome.runtime.lastError.message
                  );
                  stopInterpretation();
                  updateStatus(
                    "Failed to communicate with background script.",
                    true
                  );
                } else if (response && response.success) {
                  console.log(
                    "[popup.js] Deepgram session prepared in background. Audio processing started."
                  );
                  updateStatus(
                    "Interpretation started. Listen for translations."
                  );
                  deepgramReady = true;
                  // No mediaRecorder.start() here, ScriptProcessorNode handles continuous processing
                  startButton.textContent = "Stop Interpretation";
                  startButton.disabled = false;
                } else {
                  console.warn(
                    "[popup.js] Background script failed to prepare Deepgram:",
                    response?.error
                  );
                  stopInterpretation();
                  updateStatus(
                    `Failed to prepare Deepgram: ${
                      response?.error || "Unknown error"
                    }`,
                    true
                  );
                }
              }
            );
          }
        );
      })
      .catch((error) => {
        console.error("[popup.js] Error injecting content script:", error);
        resetUI();
        updateStatus("Error: Could not inject content script.", true);
      });
  });
});

// Listener for messages from content script or background script (e.g., error messages)
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "error") {
    console.error("[popup.js] Received error message:", msg.message);
    updateStatus(`Error: ${msg.message}`, true);
    stopInterpretation(); // Stop interpretation on error
  }
});
