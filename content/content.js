console.log("The content script is loaded");

// Create and inject subtitle overlay into the web page
function createSubtitleOverlay() {
  // Check if already exists
  if (document.getElementById('chrome-extension-subtitle-overlay')) {
    return document.getElementById('chrome-extension-subtitle-overlay');
  }

  // Create container
  const container = document.createElement('div');
  container.id = 'chrome-extension-subtitle-overlay';
  container.style.cssText = `
    position: fixed !important;
    bottom: 20px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background-color: rgba(0, 0, 0, 0.85) !important;
    color: white !important;
    padding: 15px 25px !important;
    border-radius: 8px !important;
    max-width: 90vw !important;
    text-align: center !important;
    font-size: 18px !important;
    line-height: 1.5 !important;
    z-index: 2147483647 !important;
    cursor: move !important;
    user-select: none !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5) !important;
    border: 2px solid rgba(255, 255, 255, 0.2) !important;
    touch-action: none !important;
    font-family: Arial, sans-serif !important;
    display: block !important;
  `;

  const textDiv = document.createElement('div');
  textDiv.id = 'chrome-extension-subtitle-text';
  textDiv.style.cssText = `
    word-wrap: break-word !important;
    white-space: normal !important;
  `;
  textDiv.textContent = 'Testing to see if this works...';

  container.appendChild(textDiv);
  document.body.appendChild(container);

  // Drag functionality
  let isDragging = false;
  let currentX = 0;
  let currentY = 0;
  let initialX = 0;
  let initialY = 0;

  container.addEventListener('mousedown', (e) => {
    isDragging = true;
    initialX = e.clientX - currentX;
    initialY = e.clientY - currentY;
    container.style.border = '2px solid rgba(255, 255, 255, 0.8) !important';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    e.preventDefault();
    
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    container.style.transform = `translate(${currentX}px, ${currentY}px) !important`;
    container.style.bottom = 'auto !important';
    container.style.left = '0 !important';
    container.style.top = (window.innerHeight - container.offsetHeight - 20) + 'px';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    container.style.border = '2px solid rgba(255, 255, 255, 0.2) !important';
  });

  console.log('Subtitle overlay created');
  return container;
}

// Initialize subtitle overlay when DOM is ready
let subtitleOverlay = null;

function initOverlay() {
  if (document.body) {
    subtitleOverlay = createSubtitleOverlay();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      subtitleOverlay = createSubtitleOverlay();
    });
  }
}

initOverlay();

// Listen for messages from the extension
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);
  
  if (message.type === 'display-subtitle') {
    if (!subtitleOverlay) {
      subtitleOverlay = createSubtitleOverlay();
    }
    
    const textDiv = document.getElementById('chrome-extension-subtitle-text');
    if (textDiv) {
      textDiv.textContent = message.text.slice(-50);
      console.log('Updated subtitle text:', message.text);
    }
    sendResponse({ success: true });
  }
  return true;
});