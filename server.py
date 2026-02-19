import os
import io
import tempfile
import torch
import numpy as np
from dotenv import load_dotenv

load_dotenv()
from flask import Flask, jsonify, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from google.cloud import translate_v2 as translate
from transformers import AutoProcessor, AutoModelForSpeechSeq2Seq, pipeline
from pydub import AudioSegment
import time



# app = Flask(__name__)


def create_app():
    app = Flask(__name__)
    CORS(app)
    app.config['SECRET_KEY'] = 'secret!'
    socketio.init_app(app, cors_allowed_origins="*")
    return app

socketio = SocketIO()
app = create_app()

os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = "*insert google credentials*"
client = translate.Client()

MODEL_ID = "openai/whisper-large-v3-turbo"
HF_TOKEN = os.environ.get("HF_TOKEN")

device = "cuda" if torch.cuda.is_available() else "cpu"
dtype = torch.float16 if device == "cuda" else torch.float32

print(f"Loading Whisper model on {device} with dtype {dtype}...")
processor = AutoProcessor.from_pretrained(MODEL_ID)
model = AutoModelForSpeechSeq2Seq.from_pretrained(
    MODEL_ID,
    use_auth_token=HF_TOKEN,
    torch_dtype=dtype,
    low_cpu_mem_usage=True
).to(device)
print("Whisper model loaded successfully!")

# Store audio buffers per client session
audio_buffers = {}


def transcribe_audio(audio_bytes):
    """Transcribe audio bytes using Whisper"""
    try:
        # Save audio to temporary file
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp_file:
            tmp_file.write(audio_bytes)
            tmp_path = tmp_file.name
        
        try:
            # Load audio using pydub
            audio = AudioSegment.from_file(tmp_path, format='webm')
            
            # Convert to mono and 16kHz sample rate for Whisper
            audio = audio.set_channels(1)
            audio = audio.set_frame_rate(16000)
            
            # Convert to numpy array
            samples = np.array(audio.get_array_of_samples(), dtype=np.float32)
            samples = samples / 32768.0  # Normalize to [-1, 1]
            
            # Need at least some audio to transcribe
            if len(samples) < 1600:  # Less than 0.1 seconds
                return None
            
            # Prepare inputs for Whisper
            inputs = processor(
                samples,
                sampling_rate=16000,
                return_tensors="pt"
            )
            
            # Move to device and convert to correct dtype
            input_features = inputs.input_features.to(device, dtype=dtype)
            
            # Generate transcription
            with torch.no_grad():
                generated_ids = model.generate(
                    input_features=input_features,
                    max_new_tokens=128
                )
            
            # Decode output
            transcription = processor.batch_decode(
                generated_ids,
                skip_special_tokens=True
            )[0]
            
            return transcription.strip()
        finally:
            os.unlink(tmp_path)
            
    except Exception as e:
        print(f"Transcription error: {str(e)}")
        return None
    
def transcribe_audio_v2(audio_bytes):
    pipe = pipeline(
        "automatic-speech-recognition",
        model=model,
        tokenizer=processor.tokenizer,
        feature_extractor=processor.feature_extractor,
        chunk_length_s=30,
        batch_size=1,  # batch size for inference - set based on your device
        torch_dtype=dtype,
        device=device,
        model_kwargs={"attn_implementation": "flash_attention_2"}  # ADD if available
    )

    bytes_translation_time_start = time.perf_counter()
    with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as tmp_file:
        tmp_file.write(audio_bytes)
        tmp_path = tmp_file.name
    print(f"Bytes conversion time: {time.perf_counter() - bytes_translation_time_start:.2f} seconds")

    try:
        # Transcribe using the pipeline
        
        pipe_start_time = time.perf_counter()

        result = pipe(
            tmp_path
        )
        print(f"Pipeline transcription time: {time.perf_counter() - pipe_start_time:.2f} seconds")
        transcription = result['text'].strip()
        return transcription
    except Exception as e:
        print(f"Transcription error: {str(e)}")
        return None
    finally:
        os.unlink(tmp_path)

def translate_text(text, target_language, source_language=None):
    result = client.translate(
        text,
        target_language=target_language,
        source_language=source_language
    )
    return result["translatedText"]

@app.route("/test", methods=["GET"])
def test_endpoint():
    print("I am the storm that is approaching")
    return jsonify({"message": "Server is running!"})

@app.route("/test_blob", methods=["POST"])
def test_blob():
    """Receive a blob and print out its details"""
    try:
        blob_data = request.files.get('blob')
        
        if blob_data is None:
            return jsonify({
                'success': False,
                'error': 'No blob provided'
            }), 400
        
        # Print blob details
        print(f"\n{'='*50}")
        print(f"BLOB DETAILS:")
        print(f"{'='*50}")
        print(f"Filename: {blob_data.filename}")
        print(f"Content Type: {blob_data.content_type}")
        print(f"Content Length: {len(blob_data.read())} bytes")
        blob_data.seek(0)  # Reset file pointer
        print(f"{'='*50}\n")
        
        return jsonify({
            'success': True,
            'filename': blob_data.filename,
            'content_type': blob_data.content_type,
            'size': len(blob_data.read())
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500

# WebSocket event handlers
@socketio.on('connect')
def handle_connect():
    print(f"\n{'='*50}")
    print(f"Client connected: {request.sid}")
    print(f"{'='*50}\n")
    audio_buffers[request.sid] = b''

@socketio.on('disconnect')
def handle_disconnect():
    print(f"\n{'='*50}")
    print(f"Client disconnected: {request.sid}")
    print(f"{'='*50}\n")
    if request.sid in audio_buffers:
        del audio_buffers[request.sid]

@socketio.on('start-stream')
def handle_start_stream():
    print(f"\n[{request.sid}] Started audio stream")
    audio_buffers[request.sid] = b''
    emit('stream-started', {'status': 'ok'})

@socketio.on('audio-chunk')
def handle_audio_chunk(data):
    """Handle incoming audio chunk for real-time transcription"""
    print("socket data is being received")
    sid = request.sid
    chunk_index = data.get('chunkIndex', 0)
    audio_data = data.get('audio')  # Array of bytes
    
    if audio_data:
        if isinstance(audio_data, list):
            print("Audio is a list, must be converted")

            list_translation_time = time.perf_counter()
            audio_bytes = bytes(audio_data)
            print(f"List Translation Time: {time.perf_counter() - list_translation_time:.2f} seconds")

        elif isinstance(audio_data, bytes):
            print("Audio is not a list, will not be converted")
            audio_bytes = audio_data
        else:
            print("Whatever this is is happening")
            # Assume base64 encoded
            import base64
            audio_bytes = base64.b64decode(audio_data)
        
        # Accumulate audio in buffer
        audio_buffers[sid] += audio_bytes
        
        print(f"[{sid}] Received chunk {chunk_index}, size: {len(audio_bytes)} bytes, buffer total: {len(audio_buffers[sid])} bytes")
        
        # Transcribe the accumulated audio

        transcription_time_start = time.perf_counter()
        transcription = transcribe_audio_v2(audio_buffers[sid])

        print(f"Transcription time: {time.perf_counter() - transcription_time_start:.2f} seconds")

        slicing_time_start = time.perf_counter()
        transcription = transcription[-50:]

        print(f"Slice time: {time.perf_counter() - slicing_time_start}")

        translation_time_start = time.perf_counter()
        translation = translate_text(transcription, target_language='en')

        print(f"Translation time: {time.perf_counter() - translation_time_start:.2f} seconds")
        
        if transcription and translation:
            print(f"transcribed text count: {len(translation)}")
            
            # Send transcription back to client
            emit('transcription', {
                'text': translation,
                'chunkIndex': chunk_index,
                'isFinal': False
            })

@socketio.on('stop-stream')
def handle_stop_stream():
    """Handle end of audio stream"""
    sid = request.sid
    print(f"\n[{sid}] Stopped audio stream")
    
    # Final transcription of accumulated audio
    if sid in audio_buffers and len(audio_buffers[sid]) > 0:
        transcription = transcribe_audio(audio_buffers[sid])
        
        if transcription:
            print(f"\n{'='*50}")
            print(f"FINAL TRANSCRIPTION:")
            print(f"{'='*50}")
            print(f"{transcription}")
            print(f"{'='*50}\n")
            
            emit('transcription', {
                'text': transcription,
                'isFinal': True
            })
    
    # Clear buffer
    audio_buffers[sid] = b''
    emit('stream-stopped', {'status': 'ok'})

@app.route('/translate', methods=['POST'])
def translate_endpoint():
    try:
        data = request.get_json()
        text = data.get('text', 'Dialogue trees are difficult.')
        target_language = data.get('target_language', 'es')
        source_language = data.get('source_language', 'en')
        
        translated = translate_text(text, target_language, source_language)
        
        return jsonify({
            'success': True,
            'original': text,
            'translated': translated,
            'target_language': target_language
        })
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000, host='0.0.0.0')
