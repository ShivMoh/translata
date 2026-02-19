import "./api.js";

import { test, fetchTranslation } from "./api.js";

// Store the active tab ID for subtitle display
let recordingTabId = null;

// Send tip to content script via messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.code === 'test') {
    fetchTranslation(message.message, "es").then(translatedText => {
      sendResponse({ message: translatedText });
    }).catch(error => {
      sendResponse({ message: "Error occurred during translation." });
    });
    return true;
  }
  
  // Store the tab ID when recording starts from popup
  if (message.type === 'set-recording-tab') {
    recordingTabId = message.tabId;
    console.log('Recording tab ID set to:', recordingTabId);
  }
  
  // Handle transcription from offscreen document - relay to content script
  if (message.type === 'transcription' && message.target === 'service-worker') {
    console.log('Service worker received transcription:', message.text);
    
    // Use stored recording tab ID, or query for active tab
    const sendSubtitle = async (tabId) => {
      try {
        await chrome.tabs.sendMessage(tabId, {
          type: 'display-subtitle',
          text: message.text
        });
        console.log('Subtitle sent to tab:', tabId);
      } catch (err) {
        console.log('Could not send to tab, trying to inject content script:', err.message);
        // Try to inject the content script first, then send the message
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['./content/content.js']
          });
          // Wait a moment for the script to initialize
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tabId, {
                type: 'display-subtitle',
                text: message.text
              });
              console.log('Subtitle sent after injecting content script');
            } catch (e) {
              console.error('Still could not send:', e.message);
            }
          }, 100);
        } catch (injectErr) {
          console.error('Could not inject content script:', injectErr.message);
        }
      }
    };
    
    if (recordingTabId) {
      sendSubtitle(recordingTabId);
    } else {
      // Fallback: query all tabs and find an active one
      chrome.tabs.query({}, (tabs) => {
        const activeTab = tabs.find(t => t.active);
        if (activeTab) {
          sendSubtitle(activeTab.id);
        } else {
          console.log('No active tab found');
        }
      });
    }
  }
});

// This is where the handle click event happens
// Moved to popup.js - recording is now triggered by the popup button
/*
chrome.action.onClicked.addListener(async (tab) => {

  const existingContexts = await chrome.runtime.getContexts({});
  let recording = false;

  const offscreenDocument = existingContexts.find(
    (c) => c.contextType === 'OFFSCREEN_DOCUMENT'
  );

  // If an offscreen document is not already open, create one.
  if (!offscreenDocument) {
    // Create an offscreen document.
    await chrome.offscreen.createDocument({
      url: './content/offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording from chrome.tabCapture API'
    });
  } else {
    recording = offscreenDocument.documentUrl.endsWith('#recording');
  }

  if (recording) {
    chrome.runtime.sendMessage({
      type: 'stop-recording',
      target: 'offscreen'
    });
    // chrome.action.setIcon({ path: 'icons/not-recording.png' });
    return;
  }

  // Get a MediaStream for the active tab.
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  console.log("stream id", streamId);

  // Send the stream ID to the offscreen document to start recording.
  chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
    data: streamId
  });

//   chrome.action.setIcon({ path: '/icons/recording.png' });
  
});
*/
