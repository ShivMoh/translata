// Recording button handler
document.getElementById('recordBtn').addEventListener('click', async () => {
  const recordBtn = document.getElementById('recordBtn');
  const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
  
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
    recordBtn.textContent = 'Start Recording';
    return;
  }

  // Get a MediaStream for the active tab.
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  console.log("stream id", streamId);

  // Tell service worker which tab we're recording from (for subtitle display)
  chrome.runtime.sendMessage({
    type: 'set-recording-tab',
    tabId: tab.id
  });

  // Send the stream ID to the offscreen document to start recording.
  chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
    data: streamId
  });
  
  recordBtn.textContent = 'Stop Recording';
});

// Translate button handler
document.getElementById('translateBtn').addEventListener('click', async () => {
  // Get the current active tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const { message } = await chrome.runtime.sendMessage({ message : text, code : "test" });

});
