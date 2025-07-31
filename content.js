// content.js

// --- Subtitle Overlay Management ---
let subtitleDiv = document.getElementById("deepgram-subtitle-overlay");
if (!subtitleDiv) {
  subtitleDiv = document.createElement("div");
  subtitleDiv.id = "deepgram-subtitle-overlay";
  document.body.appendChild(subtitleDiv);
}

// Ensure the div is styled correctly (from styles.css, or inline)
// This code needs to run only once to create and style the div
if (!subtitleDiv.classList.contains("deepgram-styled")) {
  subtitleDiv.classList.add("deepgram-styled"); // Add a class to apply styles
  // If you don't use styles.css, you can apply basic styles here:
  subtitleDiv.style.position = "fixed";
  subtitleDiv.style.bottom = "20px";
  subtitleDiv.style.left = "50%";
  subtitleDiv.style.transform = "translateX(-50%)";
  subtitleDiv.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
  subtitleDiv.style.color = "white";
  subtitleDiv.style.padding = "10px 15px";
  subtitleDiv.style.borderRadius = "8px";
  subtitleDiv.style.fontSize = "24px";
  subtitleDiv.style.textAlign = "center";
  subtitleDiv.style.zIndex = "99999";
  subtitleDiv.style.maxWidth = "80%";
  subtitleDiv.style.pointerEvents = "none"; /* Allow clicks through */
  subtitleDiv.style.textShadow = "1px 1px 2px black";
  subtitleDiv.style.opacity = "0";
  subtitleDiv.style.transition = "opacity 0.3s ease-in-out";
}

function showSubtitle(text, duration = 2000) {
  subtitleDiv.textContent = text;
  subtitleDiv.style.opacity = "1";
  clearTimeout(subtitleDiv.hideTimeout);
  subtitleDiv.hideTimeout = setTimeout(() => {
    subtitleDiv.style.opacity = "0";
  }, duration);
}

// --- Text-to-Speech (TTS) Integration ---
let speechUtterance = null; // Store current utterance
let synth = window.speechSynthesis;

function speak(text, lang = "en") {
  if (!synth) {
    console.warn(
      "[content.js] Web Speech API (speechSynthesis) not supported in this browser."
    );
    return;
  }

  if (speechUtterance && synth.speaking) {
    synth.cancel(); // Stop current speech if any
  }

  speechUtterance = new SpeechSynthesisUtterance(text);
  speechUtterance.lang = lang;

  // Optional: Choose a voice. This can be complex due to async loading.
  // For simplicity, we'll let the browser choose, or pick a default if available.
  // let voices = synth.getVoices();
  // let selectedVoice = voices.find(voice => voice.lang === lang && voice.name.includes('Google'));
  // if (selectedVoice) {
  //     speechUtterance.voice = selectedVoice;
  // }

  speechUtterance.onend = () => {
    console.log("[content.js] Speech synthesis ended.");
  };
  speechUtterance.onerror = (event) => {
    console.error("[content.js] Speech synthesis error:", event.error);
  };

  synth.speak(speechUtterance);
}

// --- Message Listener from Background Script ---
let currentInterimTranscript = ""; // To build up interim results

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "transcript") {
    const { text, targetLanguage, isFinal } = msg;

    // Display subtitle
    if (isFinal) {
      showSubtitle(text, 5000); // Show final transcript for longer
      speak(text, targetLanguage); // Speak final transcript
      currentInterimTranscript = ""; // Reset for next utterance
      console.log(
        `[content.js] Final Transcript: "${text}" (Lang: ${targetLanguage})`
      );
    } else {
      // Display interim results dynamically
      currentInterimTranscript = text;
      showSubtitle(currentInterimTranscript, 2000); // Interim results disappear faster
      // console.log(`[content.js] Interim Transcript: "${text}"`);
    }
  } else if (msg.type === "error") {
    console.error(
      "[content.js] Received error from background/Deepgram:",
      msg.message
    );
    showSubtitle(`Error: ${msg.message}`, 5000);
    // Stop speech if an error occurs
    if (synth && synth.speaking) {
      synth.cancel();
    }
  }
});

// Listener for initial message from popup (to confirm content script is ready)
// This is more for initial handshake, can be simplified for this context.
// chrome.runtime.sendMessage({ type: "content_script_ready" }).catch(() => {});
