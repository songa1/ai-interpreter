import { initDeepgramConnection } from "./deepgram-client.js";
import { base64ToArrayBuffer } from "./utils.js"; // Import utility functions

// Object to hold active Deepgram connections by tabId
const activeDeepgramConnections = {}; // { tabId: { socket: WebSocket, tabId: number } }

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.command === "start-deepgram-session") {
    const tabId = msg.tabId;
    const targetLanguage = msg.targetLanguage;

    // Close any existing connection for this tab
    if (activeDeepgramConnections[tabId]) {
      console.log(
        `[Background] Closing existing Deepgram connection for tab ${tabId}`
      );
      activeDeepgramConnections[tabId].socket.close(); // This will trigger onclose in deepgram-client
      delete activeDeepgramConnections[tabId];
    }

    try {
      // Initialize Deepgram connection
      // Pass a callback for when the socket closes/errors unexpectedly
      const deepgramSocket = initDeepgramConnection(
        tabId,
        targetLanguage,
        (event) => {
          console.warn(
            `[Background] Deepgram socket for tab ${tabId} closed unexpectedly. Code: ${event.code}, Reason: ${event.reason}`
          );
          if (activeDeepgramConnections[tabId]) {
            // Only if still active
            delete activeDeepgramConnections[tabId]; // Clean up reference
            // Optionally, notify the popup/content script about the unexpected closure
            chrome.tabs
              .sendMessage(tabId, {
                type: "error",
                message: `Deepgram connection closed unexpectedly: ${
                  event.reason || "No audio"
                }`,
              })
              .catch(() => {});
          }
        }
      );
      activeDeepgramConnections[tabId] = {
        socket: deepgramSocket,
        tabId: tabId,
      };
      console.log(
        `[Background] Deepgram session initialization requested for tab ${tabId}`
      );
      sendResponse({ success: true });
    } catch (error) {
      console.error(
        "[Background] Failed to initialize Deepgram connection:",
        error
      );
      sendResponse({ success: false, error: error.message });
    }
    return true; // Asynchronous sendResponse
  } else if (msg.command === "audio-chunk") {
    const base64String = msg.chunk; // This is the Base64 string from popup.js
    const tabId = msg.tabId;

    // Convert Base64 string back to ArrayBuffer
    const arrayBuffer = base64ToArrayBuffer(base64String);

    // console.log(`[Background] Received Base64 chunk. Decoded ArrayBuffer size: ${arrayBuffer.byteLength} for tab ${tabId}`);

    const connection = activeDeepgramConnections[tabId];
    if (connection && connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(arrayBuffer); // Send the ArrayBuffer as binary data to Deepgram
      sendResponse({ success: true });
    } else {
      console.warn(
        `[Background] Deepgram socket not OPEN for tab ${tabId}. ReadyState: ${
          connection?.socket.readyState || "N/A"
        }. Dropping audio chunk.`
      );
      sendResponse({
        success: false,
        error: "Deepgram socket not ready or connection closed.",
      });
    }
    return true; // Asynchronous sendResponse
  } else if (msg.command === "stop-deepgram-session") {
    const tabId = msg.tabId;
    if (activeDeepgramConnections[tabId]) {
      console.log(
        `[Background] Stopping Deepgram connection for tab ${tabId}.`
      );
      activeDeepgramConnections[tabId].socket.close();
      delete activeDeepgramConnections[tabId]; // Clean up
      sendResponse({ success: true });
    } else {
      sendResponse({
        success: false,
        error: "No active interpretation for this tab.",
      });
    }
    return true;
  }
});
