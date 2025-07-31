import { DEEPGRAM_API_KEY } from "./env";

export const initDeepgramConnection = (
  tabId,
  targetLanguage,
  onCloseOrErrorCallback
) => {
  const deepgramSocket = new WebSocket(
    // *** IMPORTANT CHANGE HERE ***
    // We are now sending raw linear16 PCM at 16000 Hz, mono (1 channel)
    `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=false`,
    ["token", DEEPGRAM_API_KEY]
  );

  deepgramSocket.onopen = () => {
    console.log(`[DeepgramClient] Socket opened for tab ${tabId}`);
  };

  deepgramSocket.onmessage = (message) => {
    const data = JSON.parse(message.data);

    // Log full message data for debugging
    // console.log("[DeepgramClient] Raw message:", data);

    if (data.type === "Metadata") {
      console.log(`[DeepgramClient] Received Metadata for tab ${tabId}:`, data);
      return; // Don't process metadata as a transcript
    }

    if (data.type === "UtteranceEnd") {
      console.log("[DeepgramClient] UtteranceEnd received.");
      return;
    }

    // Check for error messages from Deepgram itself
    if (data.type === "Error") {
      console.error(
        `[DeepgramClient] Deepgram API Error for tab ${tabId}: ${data.message} (Code: ${data.code})`
      );
      // Send this error back to the content script and/or popup
      chrome.tabs
        .sendMessage(tabId, {
          type: "error",
          message: `Deepgram API Error: ${data.message}`,
        })
        .catch(() => {});
      return;
    }

    const transcript = data.channel?.alternatives?.[0]?.transcript;
    const isFinal = data.is_final; // Deepgram indicates if this is a final transcript

    if (transcript && transcript.length > 0) {
      console.log(
        `[DeepgramClient] Transcript (final: ${isFinal}) for tab ${tabId}:`,
        transcript
      );

      // Send the transcript to the content script of the original tab
      chrome.tabs.sendMessage(
        tabId,
        {
          type: "transcript",
          text: transcript,
          targetLanguage: targetLanguage,
          isFinal: isFinal,
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error(
              "[DeepgramClient] Send message failed to content script:",
              chrome.runtime.lastError.message
            );
          }
        }
      );
    }
  };

  deepgramSocket.onclose = (event) => {
    console.log(
      `[DeepgramClient] Socket closed for tab ${tabId}. Code: ${event.code}, Reason: ${event.reason}`
    );
    if (event.code === 1011) {
      console.error(
        "[DeepgramClient] Deepgram closed due to no audio data. Confirm audio is playing and being sent from popup.js."
      );
    }
    if (onCloseOrErrorCallback) {
      onCloseOrErrorCallback(event); // Notify background script about the closure
    }
  };

  deepgramSocket.onerror = (error) => {
    console.error(`[DeepgramClient] Socket error for tab ${tabId}:`, error);
    if (onCloseOrErrorCallback) {
      onCloseOrErrorCallback(error); // Notify background script about the error
    }
  };

  return deepgramSocket; // Return the socket instance
};
