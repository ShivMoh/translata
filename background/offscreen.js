
let recorder;
let data = [];
let socket = null;
let chunkIndex = 0;
const socketUrl = "http://127.0.0.0:5000"

// Initialize Socket.IO connection
function initSocket() {
  socket = io(socketUrl, {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
    transports: ['websocket', 'polling']
  });

  // Add error handlers
socket.on('connect_error', (error) => {
    console.error('Socket.IO connection error:', error);
  });

  socket.on('error', (error) => {
    console.error('Socket.IO error:', error);
  });

  socket.on('connect', () => {
    console.log('Connected to server via WebSocket');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });

  socket.on('stream-started', (data) => {
    console.log('Stream started:', data);
  });

  socket.on('transcription', (data) => {
    console.log('Received transcription:', data);
    // Send to service worker to relay to content script
    if (data.text) {
      chrome.runtime.sendMessage({
        type: 'transcription',
        target: 'service-worker',
        text: data.text
      });
    }
  });

  socket.on('stream-stopped', (data) => {
    console.log('Stream stopped:', data);
  }); 

  return socket;
}

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === 'offscreen') {
    switch (message.type) {
      case 'start-recording':
        startRecording(message.data);
        break;
      case 'stop-recording':
        stopRecording();
        break;
      default:
        throw new Error('Unrecognized message:', message.type);
    }
  }
});

async function startRecording(streamId) {
  const socket = initSocket();
  if (recorder?.state === 'recording') {
    console.log("We are already recording!");
    throw new Error('Called startRecording while recording is in progress.');
  }

  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    // video: {
    //   mandatory: {
    //     chromeMediaSource: 'tab',
    //     chromeMediaSourceId: streamId
    //   }
    // }
  });

  // Continue to play the captured audio to the user.
  const output = new AudioContext();
  const source = output.createMediaStreamSource(media);
  source.connect(output.destination);

  // Start recording.
  recorder = new MediaRecorder(media, { mimeType: 'audio/webm' });
  recorder.ondataavailable = (event) => {
    console.log('this should be sending data');
    // Convert blob to array buffer and send with metadata
    event.data.arrayBuffer().then(buffer => {
      const audioData = Array.from(new Uint8Array(buffer));
      socket.emit('audio-chunk', {
        audio: audioData,
        chunkIndex: chunkIndex++
      });
      console.log(`Sent audio chunk ${chunkIndex - 1}, size: ${audioData.length} bytes`);
    });
    data.push(event.data)
  };

  recorder.onstop = () => {
    const blob = new Blob(data, { type: 'audio/webm' });

    // socket.send('blob-complete', blob);
    socket.emit('blob-complete', blob);
    // console.log('Recording complete, blob size:', blob.size);

    socket.close.bind(socket);

    // Upload the audio blob to the server
    // const formData = new FormData();
    // formData.append('blob', blob, 'recording.webm');
    
    // fetch('http://localhost:5000/test_blob', {
    //   method: 'POST',
    //   body: formData
    // })
    //   .then(response => response.json())
    //   .then(data => {
    //     console.log('Audio uploaded successfully:', data);
    //   })
    //   .catch(error => {
    //     console.error('Failed to upload audio:', error);
    //   });
  
    // window.open(URL.createObjectURL(blob), '_blank');

    // Clear state ready for next recording
    recorder = undefined;
    data = [];
  };

  console.log('recorder should be started');
  recorder.start(1000);

  // Record the current state in the URL. This provides a very low-bandwidth
  // way of communicating with the service worker (the service worker can check
  // the URL of the document and see the current recording state). We can't
  // store that directly in the service worker as it may be terminated while
  // recording is in progress. We could write it to storage but that slightly
  // increases the risk of things getting out of sync.
  window.location.hash = 'recording';
}

async function stopRecording() {
  recorder.stop();

  // Stopping the tracks makes sure the recording icon in the tab is removed.
  recorder.stream.getTracks().forEach((t) => t.stop());

  // Update current state in URL
  window.location.hash = '';

  // Note: In a real extension, you would want to write the recording to a more
  // permanent location (e.g IndexedDB) and then close the offscreen document,
  // to avoid keeping a document around unnecessarily. Here we avoid that to
  // make sure the browser keeps the Object URL we create (see above) and to
  // keep the sample fairly simple to follow.
}


