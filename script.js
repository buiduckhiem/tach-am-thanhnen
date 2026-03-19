let originalAudioBuffer = null;
let processedAudioBuffer = null;
let vocalAudioBuffer = null;
let audioContext = null;

const fileInput = document.getElementById('audio-upload');
const dropZone = document.getElementById('drop-zone');
const statusContainer = document.getElementById('status-container');
const statusText = document.getElementById('status-text');
const originalPlayer = document.getElementById('original-player');
const processedPlayer = document.getElementById('processed-player');
const vocalPlayer = document.getElementById('vocal-player');
const downloadBtn = document.getElementById('download-btn');
const downloadVocalBtn = document.getElementById('download-vocal-btn');
const resultSection = document.getElementById('result-section');

// Event Listeners for Drag and Drop
dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        handleFile(fileInput.files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

async function handleFile(file) {
    if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
        alert('Vui lòng chọn một tệp âm thanh hợp lệ.');
        return;
    }
    
    // Hide dropzone, show status
    dropZone.classList.add('hidden');
    statusContainer.classList.remove('hidden');
    resultSection.classList.add('hidden');

    try {
        // Initialize audio context dynamically upon user interaction
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        statusText.innerText = `Đang tải tệp: ${file.name}...`;
        const arrayBuffer = await file.arrayBuffer();
        
        statusText.innerText = 'Đang giải mã dữ liệu âm thanh...';
        originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        statusText.innerText = 'Đang xử lý tách lời hát (Phase Cancellation)...';
        // Add a slight delay so UI can update the text
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await processAudio();
        
        statusText.innerText = 'Đang tạo tệp âm thanh đầu ra...';
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Setup players
        // We reuse the original blob for the original player
        const originalBlob = new Blob([arrayBuffer], { type: file.type });
        originalPlayer.src = URL.createObjectURL(originalBlob);
        
        // Create wave blob for processed player
        const wavBlob = bufferToWave(processedAudioBuffer, processedAudioBuffer.length);
        const processedUrl = URL.createObjectURL(wavBlob);
        processedPlayer.src = processedUrl;
        
        // Setup download button
        downloadBtn.href = processedUrl;
        downloadBtn.download = `xong nhé.beat.${file.name.replace(/\.[^/.]+$/, "")}.wav`;

        // Create wave blob for vocal player
        const vocalWavBlob = bufferToWave(vocalAudioBuffer, vocalAudioBuffer.length);
        const vocalUrl = URL.createObjectURL(vocalWavBlob);
        vocalPlayer.src = vocalUrl;
        
        // Setup download button for vocal
        downloadVocalBtn.href = vocalUrl;
        downloadVocalBtn.download = `xong nhé.vocal.${file.name.replace(/\.[^/.]+$/, "")}.wav`;
        
        // Hide status, show results
        statusContainer.classList.add('hidden');
        resultSection.classList.remove('hidden');
        
    } catch (e) {
        console.error(e);
        statusText.innerText = 'Đã xảy ra lỗi trong quá trình xử lý.';
        statusText.style.color = '#ef4444';
        
        // Add a button to try again
        setTimeout(() => {
            location.reload();
        }, 3000);
    }
}

async function processAudio() {
    const { numberOfChannels, sampleRate, length } = originalAudioBuffer;
    
    if (numberOfChannels < 2) {
        // Pseudo-handling for mono files (can't phase easily without stereo)
        alert('Tệp âm thanh của bạn là Mono (1 kênh). Tính năng này yêu cầu tệp Stereo (2 kênh) để tách lời hiệu quả. Kết quả có thể không như mong đợi.');
        processedAudioBuffer = originalAudioBuffer; 
        return;
    }

    // Create a new empty buffer for the processed result
    processedAudioBuffer = audioContext.createBuffer(2, length, sampleRate);
    vocalAudioBuffer = audioContext.createBuffer(2, length, sampleRate);
    
    const leftChannel = originalAudioBuffer.getChannelData(0);
    const rightChannel = originalAudioBuffer.getChannelData(1);
    
    const outLeft = processedAudioBuffer.getChannelData(0);
    const outRight = processedAudioBuffer.getChannelData(1);

    const vLeft = vocalAudioBuffer.getChannelData(0);
    const vRight = vocalAudioBuffer.getChannelData(1);

    // Apply Out Of Phase Stereo (OOPS) effect for beat
    // Apply Center Extraction (Mid) for vocals
    for (let i = 0; i < length; i++) {
        const l = leftChannel[i];
        const r = rightChannel[i];

        // Beat: (L - R) / 2 (removes center pan)
        const diff = (l - r) / 2;
        outLeft[i] = diff;
        outRight[i] = diff;

        // Vocals: (L + R) / 2 (extracts center pan, though retains some side frequencies)
        const mid = (l + r) / 2;
        vLeft[i] = mid;
        vRight[i] = mid;
    }
    
    return Promise.resolve();
}

// Convert AudioBuffer to WAV Blob efficiently
function bufferToWave(abuffer, len) {
    let numOfChan = abuffer.numberOfChannels,
        length = len * numOfChan * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = [], i, sample,
        offset = 0,
        pos = 0;

    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"

    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit 

    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++) {
        channels.push(abuffer.getChannelData(i));
    }

    while (pos < length) {
        for (i = 0; i < numOfChan; i++) {
            // clamp
            sample = Math.max(-1, Math.min(1, channels[i][offset])); 
            // scale to 16-bit signed int
            sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; 
            // write 16-bit sample
            view.setInt16(pos, sample, true); 
            pos += 2;
        }
        offset++;
    }

    return new Blob([buffer], {type: "audio/wav"});

    function setUint16(data) {
        view.setUint16(pos, data, true);
        pos += 2;
    }

    function setUint32(data) {
        view.setUint32(pos, data, true);
        pos += 4;
    }
}
