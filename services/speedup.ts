interface SpeedupStats {
    silences_detected: number;
    silences_shortened: number;
    speed_applied: number;
    original_duration: number;
    processed_duration: number;
}

interface SpeedupResult {
    audioBase64: string;
    stats: SpeedupStats;
}

const SPEEDUP_PRESETS: Record<string, { speed: number; silenceThreshold: number; minSilenceDuration: number; targetSilenceDuration: number }> = {
    zeitblytz_standard: { speed: 1.12, silenceThreshold: -40.0, minSilenceDuration: 0.30, targetSilenceDuration: 0.15 },
    aggressiv: { speed: 1.18, silenceThreshold: -45.0, minSilenceDuration: 0.22, targetSilenceDuration: 0.08 },
    voiceover_turbo: { speed: 1.20, silenceThreshold: -43.0, minSilenceDuration: 0.20, targetSilenceDuration: 0.10 },
};

function base64ToArrayBuffer(base64: string): ArrayBuffer {
    const parts = base64.split(',');
    const raw = parts.length > 1 ? parts[1] : parts[0];
    const binaryStr = atob(raw);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer, mimeType: string): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return `data:${mimeType};base64,${btoa(binary)}`;
}

function detectSilenceRegions(
    channelData: Float32Array,
    sampleRate: number,
    thresholdDb: number,
    minSilenceDuration: number
): { start: number; end: number }[] {
    const thresholdLinear = Math.pow(10, thresholdDb / 20);
    const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);
    const regions: { start: number; end: number }[] = [];

    let silenceStart = -1;
    for (let i = 0; i < channelData.length; i++) {
        const amplitude = Math.abs(channelData[i]);
        if (amplitude < thresholdLinear) {
            if (silenceStart === -1) silenceStart = i;
        } else {
            if (silenceStart !== -1) {
                const silenceLength = i - silenceStart;
                if (silenceLength >= minSilenceSamples) {
                    regions.push({
                        start: silenceStart / sampleRate,
                        end: i / sampleRate
                    });
                }
                silenceStart = -1;
            }
        }
    }
    if (silenceStart !== -1) {
        const silenceLength = channelData.length - silenceStart;
        if (silenceLength >= minSilenceSamples) {
            regions.push({
                start: silenceStart / sampleRate,
                end: channelData.length / sampleRate
            });
        }
    }

    return regions;
}

export async function applySpeedupClient(
    base64Audio: string,
    config: {
        preset?: string;
        speed?: number;
        silenceThreshold?: number;
        minSilenceDuration?: number;
        targetSilenceDuration?: number;
    }
): Promise<SpeedupResult> {
    const presetValues = config.preset ? SPEEDUP_PRESETS[config.preset] : null;
    const speed = presetValues?.speed ?? config.speed ?? 1.12;
    const silenceThreshold = presetValues?.silenceThreshold ?? config.silenceThreshold ?? -40.0;
    const minSilenceDuration = presetValues?.minSilenceDuration ?? config.minSilenceDuration ?? 0.30;
    const targetSilenceDuration = presetValues?.targetSilenceDuration ?? config.targetSilenceDuration ?? 0.15;

    const audioCtx = new AudioContext();
    try {
        const arrayBuffer = base64ToArrayBuffer(base64Audio);
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const originalDuration = audioBuffer.duration;
        const sampleRate = audioBuffer.sampleRate;
        const numChannels = audioBuffer.numberOfChannels;

        const silenceRegions = detectSilenceRegions(
            audioBuffer.getChannelData(0),
            sampleRate,
            silenceThreshold,
            minSilenceDuration
        );

        const segments: { start: number; end: number }[] = [];
        let lastEnd = 0;
        let shortenedCount = 0;

        for (const region of silenceRegions) {
            const silenceDuration = region.end - region.start;
            if (silenceDuration > targetSilenceDuration) {
                if (region.start > lastEnd + 0.001) {
                    segments.push({ start: lastEnd, end: region.start });
                }
                segments.push({ start: region.start, end: region.start + targetSilenceDuration });
                lastEnd = region.end;
                shortenedCount++;
            }
        }
        if (originalDuration > lastEnd + 0.001) {
            segments.push({ start: lastEnd, end: originalDuration });
        }

        let totalTrimmedDuration = 0;
        for (const seg of segments) {
            totalTrimmedDuration += seg.end - seg.start;
        }

        const trimmedSampleCount = Math.ceil(totalTrimmedDuration * sampleRate);
        const trimmedBuffer = audioCtx.createBuffer(numChannels, trimmedSampleCount, sampleRate);

        let writeOffset = 0;
        for (const seg of segments) {
            const startSample = Math.floor(seg.start * sampleRate);
            const endSample = Math.min(Math.ceil(seg.end * sampleRate), audioBuffer.length);
            const length = endSample - startSample;

            for (let ch = 0; ch < numChannels; ch++) {
                const sourceData = audioBuffer.getChannelData(ch);
                const destData = trimmedBuffer.getChannelData(ch);
                for (let i = 0; i < length; i++) {
                    destData[writeOffset + i] = sourceData[startSample + i];
                }
            }
            writeOffset += length;
        }

        const finalSampleCount = Math.ceil(trimmedBuffer.duration / speed);
        const finalBuffer = audioCtx.createBuffer(numChannels, finalSampleCount, sampleRate);

        for (let ch = 0; ch < numChannels; ch++) {
            const sourceData = trimmedBuffer.getChannelData(ch);
            const destData = finalBuffer.getChannelData(ch);
            for (let i = 0; i < finalSampleCount; i++) {
                const sourceIndex = i * speed;
                const idx1 = Math.floor(sourceIndex);
                const idx2 = Math.min(idx1 + 1, sourceData.length - 1);
                const frac = sourceIndex - idx1;
                destData[i] = sourceData[idx1] * (1 - frac) + sourceData[idx2] * frac;
            }
        }

        const processedDuration = finalBuffer.duration;

        const wavBuffer = encodeWav(finalBuffer);
        const resultBase64 = arrayBufferToBase64(wavBuffer, 'audio/wav');

        return {
            audioBase64: resultBase64,
            stats: {
                silences_detected: silenceRegions.length,
                silences_shortened: shortenedCount,
                speed_applied: speed,
                original_duration: Math.round(originalDuration * 100) / 100,
                processed_duration: Math.round(processedDuration * 100) / 100,
            },
        };
    } finally {
        await audioCtx.close();
    }
}

function encodeWav(buffer: AudioBuffer): ArrayBuffer {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const numSamples = buffer.length;
    const bytesPerSample = 2;
    const dataLength = numSamples * numChannels * bytesPerSample;
    const headerLength = 44;
    const totalLength = headerLength + dataLength;

    const arrayBuffer = new ArrayBuffer(totalLength);
    const view = new DataView(arrayBuffer);

    function writeString(offset: number, str: string) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, totalLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    const channels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channels.push(buffer.getChannelData(ch));
    }

    let offset = 44;
    for (let i = 0; i < numSamples; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            const sample = Math.max(-1, Math.min(1, channels[ch][i]));
            const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            view.setInt16(offset, intSample, true);
            offset += 2;
        }
    }

    return arrayBuffer;
}

export { SPEEDUP_PRESETS };
