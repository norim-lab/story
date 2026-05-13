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

function base64ToUint8Array(base64: string): Uint8Array {
    if (!base64 || base64 === '__STRIPPED__' || base64 === 'undefined' || base64 === 'null') {
        throw new Error('Audio-Daten nicht verfügbar. Bitte zuerst Auphonic (Schritt 3) ausführen, um Audio zu generieren.');
    }
    const parts = base64.split(',');
    const raw = parts.length > 1 ? parts[1] : parts[0];
    if (!raw || raw.length < 10) {
        throw new Error('Audio-Daten sind leer oder ungültig. Bitte Auphonic (Schritt 3) erneut ausführen.');
    }
    let binaryStr: string;
    try {
        binaryStr = atob(raw);
    } catch {
        throw new Error('Audio-Daten sind beschädigt. Bitte Auphonic (Schritt 3) erneut ausführen, um neues Audio zu generieren.');
    }
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
}

function encodeWAV(samples: Float32Array, sampleRate: number, numChannels: number): Uint8Array {
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const dataLength = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    function writeString(offset: number, str: string) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        offset += 2;
    }

    return new Uint8Array(buffer);
}

function uint8ArrayToBase64(bytes: Uint8Array, mimeType: string): string {
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
    silenceThresholdDb: number,
    minSilenceDuration: number
): { start: number; end: number }[] {
    const thresholdLinear = Math.pow(10, silenceThresholdDb / 20);
    const minSilenceSamples = Math.floor(minSilenceDuration * sampleRate);
    const windowSize = Math.floor(sampleRate * 0.02);
    const regions: { start: number; end: number }[] = [];

    let silenceStart = -1;
    let silenceSampleCount = 0;

    for (let i = 0; i < channelData.length; i += windowSize) {
        let rms = 0;
        const end = Math.min(i + windowSize, channelData.length);
        for (let j = i; j < end; j++) {
            rms += channelData[j] * channelData[j];
        }
        rms = Math.sqrt(rms / (end - i));

        if (rms < thresholdLinear) {
            if (silenceStart === -1) {
                silenceStart = i;
            }
            silenceSampleCount = end - silenceStart;
        } else {
            if (silenceStart !== -1 && silenceSampleCount >= minSilenceSamples) {
                regions.push({ start: silenceStart, end: i });
            }
            silenceStart = -1;
            silenceSampleCount = 0;
        }
    }

    if (silenceStart !== -1 && silenceSampleCount >= minSilenceSamples) {
        regions.push({ start: silenceStart, end: channelData.length });
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

    const audioBytes = base64ToUint8Array(base64Audio);
    const arrayBuffer = audioBytes.buffer.slice(audioBytes.byteOffset, audioBytes.byteOffset + audioBytes.byteLength) as ArrayBuffer;
    const audioBuffer = await new AudioContext().decodeAudioData(arrayBuffer);

    const sampleRate = audioBuffer.sampleRate;
    const numChannels = audioBuffer.numberOfChannels;
    const originalDuration = audioBuffer.duration;
    const totalSamples = audioBuffer.length;

    const channelData: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
        channelData.push(audioBuffer.getChannelData(ch));
    }

    const silenceRegions = detectSilenceRegions(
        channelData[0],
        sampleRate,
        silenceThreshold,
        minSilenceDuration
    );

    if (silenceRegions.length === 0) {
        const speedupRatio = 1 / speed;
        const newLength = Math.floor(totalSamples * speedupRatio);
        const outputChannels: Float32Array[] = [];

        for (let ch = 0; ch < numChannels; ch++) {
            const output = new Float32Array(newLength);
            for (let i = 0; i < newLength; i++) {
                const srcIdx = i * speed;
                const idx0 = Math.floor(srcIdx);
                const idx1 = Math.min(idx0 + 1, totalSamples - 1);
                const frac = srcIdx - idx0;
                output[i] = channelData[ch][idx0] * (1 - frac) + channelData[ch][idx1] * frac;
            }
            outputChannels.push(output);
        }

        const interleaved = interleaveChannels(outputChannels);
        const wavBytes = encodeWAV(interleaved, sampleRate, numChannels);
        const processedDuration = newLength / sampleRate;

        return {
            audioBase64: uint8ArrayToBase64(wavBytes, 'audio/wav'),
            stats: {
                silences_detected: 0,
                silences_shortened: 0,
                speed_applied: speed,
                original_duration: Math.round(originalDuration * 100) / 100,
                processed_duration: Math.round(processedDuration * 100) / 100,
            },
        };
    }

    const targetSilenceSamples = Math.floor(targetSilenceDuration * sampleRate);
    let shortenedCount = 0;

    const segmentRanges: { start: number; end: number; isSilence: boolean }[] = [];
    let lastEnd = 0;

    for (const region of silenceRegions) {
        if (region.start > lastEnd) {
            segmentRanges.push({ start: lastEnd, end: region.start, isSilence: false });
        }

        const silenceSamples = region.end - region.start;
        if (silenceSamples > targetSilenceSamples) {
            segmentRanges.push({ start: region.start, end: region.start + targetSilenceSamples, isSilence: true });
            shortenedCount++;
        } else {
            segmentRanges.push({ start: region.start, end: region.end, isSilence: true });
        }
        lastEnd = region.end;
    }

    if (lastEnd < totalSamples) {
        segmentRanges.push({ start: lastEnd, end: totalSamples, isSilence: false });
    }

    let totalOutputSamples = 0;
    for (const seg of segmentRanges) {
        const segLength = seg.end - seg.start;
        if (!seg.isSilence) {
            totalOutputSamples += Math.floor(segLength / speed);
        } else {
            totalOutputSamples += segLength;
        }
    }

    const outputChannels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
        const output = new Float32Array(totalOutputSamples);
        let writePos = 0;

        for (const seg of segmentRanges) {
            const segLength = seg.end - seg.start;

            if (!seg.isSilence) {
                const outputSegLength = Math.floor(segLength / speed);
                for (let i = 0; i < outputSegLength; i++) {
                    const srcIdx = seg.start + i * speed;
                    const idx0 = Math.floor(srcIdx);
                    const idx1 = Math.min(idx0 + 1, seg.end - 1);
                    const frac = srcIdx - idx0;
                    output[writePos + i] = channelData[ch][idx0] * (1 - frac) + channelData[ch][idx1] * frac;
                }
                writePos += outputSegLength;
            } else {
                const copyLength = Math.min(segLength, totalOutputSamples - writePos);
                for (let i = 0; i < copyLength; i++) {
                    output[writePos + i] = channelData[ch][seg.start + i];
                }
                writePos += copyLength;
            }
        }

        outputChannels.push(output.subarray(0, writePos));
    }

    const finalLength = outputChannels[0].length;
    const interleaved = interleaveChannels(outputChannels);
    const wavBytes = encodeWAV(interleaved, sampleRate, numChannels);
    const processedDuration = finalLength / sampleRate;

    return {
        audioBase64: uint8ArrayToBase64(wavBytes, 'audio/wav'),
        stats: {
            silences_detected: silenceRegions.length,
            silences_shortened: shortenedCount,
            speed_applied: speed,
            original_duration: Math.round(originalDuration * 100) / 100,
            processed_duration: Math.round(processedDuration * 100) / 100,
        },
    };
}

function interleaveChannels(channels: Float32Array[]): Float32Array {
    if (channels.length === 1) return channels[0];
    const length = channels[0].length;
    const numChannels = channels.length;
    const result = new Float32Array(length * numChannels);
    for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
            result[i * numChannels + ch] = channels[ch][i];
        }
    }
    return result;
}

export { SPEEDUP_PRESETS };
