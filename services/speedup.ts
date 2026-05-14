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

function wsola(
    input: Float32Array,
    speed: number,
    sampleRate: number
): Float32Array {
    if (Math.abs(speed - 1.0) < 0.001) return new Float32Array(input);

    const frameSize = Math.floor(sampleRate * 0.03);
    const synthHop = Math.floor(frameSize / 2);
    const analysisHop = Math.floor(synthHop * speed);
    const halfFrame = Math.floor(frameSize / 2);
    const searchRange = Math.floor(sampleRate * 0.005);

    const inputLength = input.length;
    const outputLength = Math.floor(inputLength / speed);
    const output = new Float32Array(outputLength);
    const winSum = new Float32Array(outputLength);

    let inputPos = 0;
    let outputPos = 0;

    const hannWindow = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
        hannWindow[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (frameSize - 1)));
    }

    while (outputPos + frameSize <= outputLength && inputPos + frameSize <= inputLength) {
        for (let i = 0; i < frameSize; i++) {
            output[outputPos + i] += input[inputPos + i] * hannWindow[i];
            winSum[outputPos + i] += hannWindow[i];
        }

        const nextInputPos = inputPos + analysisHop;
        if (nextInputPos + frameSize > inputLength) break;

        const searchCenter = nextInputPos;
        const searchStart = Math.max(0, searchCenter - searchRange);
        const searchEnd = Math.min(inputLength - frameSize, searchCenter + searchRange);

        let bestOffset = searchCenter;
        let bestCorr = -Infinity;

        for (let s = searchStart; s <= searchEnd; s++) {
            let corr = 0;
            for (let i = 0; i < halfFrame; i++) {
                corr += input[inputPos + halfFrame + i] * input[s + i];
            }
            if (corr > bestCorr) {
                bestCorr = corr;
                bestOffset = s;
            }
        }

        inputPos = bestOffset;
        outputPos += synthHop;
    }

    if (outputPos < outputLength) {
        const remaining = Math.min(frameSize, outputLength - outputPos, inputLength - inputPos);
        for (let i = 0; i < remaining; i++) {
            output[outputPos + i] += input[inputPos + i] * hannWindow[i];
            winSum[outputPos + i] += hannWindow[i];
        }
    }

    for (let i = 0; i < outputLength; i++) {
        if (winSum[i] > 0.5) {
            output[i] /= winSum[i];
        } else {
            output[i] = 0;
        }
    }

    return output;
}

function speedupSegment(
    channelData: Float32Array[],
    start: number,
    end: number,
    speed: number,
    sampleRate: number
): Float32Array[] {
    const segment: Float32Array[] = [];
    for (let ch = 0; ch < channelData.length; ch++) {
        segment.push(channelData[ch].subarray(start, end));
    }

    const stretched: Float32Array[] = [];
    for (let ch = 0; ch < segment.length; ch++) {
        stretched.push(wsola(segment[ch], speed, sampleRate));
    }
    return stretched;
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

    const silencePaddingSec = 0.10;
    const paddingSamples = Math.floor(silencePaddingSec * sampleRate);
    const targetSilenceSamples = Math.floor(targetSilenceDuration * sampleRate);
    const edgeSamples = Math.min(Math.floor(0.03 * sampleRate), Math.floor(targetSilenceSamples / 3));
    let shortenedCount = 0;

    const segmentRanges: {
        start: number;
        end: number;
        isSilence: boolean;
        origStart?: number;
        origEnd?: number;
    }[] = [];
    let lastEnd = 0;

    for (const region of silenceRegions) {
        const silStart = Math.min(region.start + paddingSamples, region.end);
        const silEnd = Math.max(region.end - paddingSamples, silStart);

        if (silStart > lastEnd) {
            segmentRanges.push({ start: lastEnd, end: silStart, isSilence: false });
        }

        const silenceSamples = silEnd - silStart;
        if (silenceSamples > targetSilenceSamples) {
            segmentRanges.push({
                start: silStart,
                end: silStart + targetSilenceSamples,
                isSilence: true,
                origStart: region.start,
                origEnd: region.end,
            });
            shortenedCount++;
        } else if (silenceSamples > 0) {
            segmentRanges.push({ start: silStart, end: silEnd, isSilence: true });
        }
        lastEnd = silEnd;
    }

    if (lastEnd < totalSamples) {
        segmentRanges.push({ start: lastEnd, end: totalSamples, isSilence: false });
    }

    const processedSegments: Float32Array[][] = [];

    for (const seg of segmentRanges) {
        if (!seg.isSilence) {
            processedSegments.push(speedupSegment(channelData, seg.start, seg.end, speed, sampleRate));
        } else {
            const segLen = seg.end - seg.start;
            const hasOriginal = seg.origStart !== undefined && seg.origEnd !== undefined;
            const eLen = hasOriginal ? Math.min(edgeSamples, Math.floor(segLen / 3)) : 0;
            const bodyLen = segLen - 2 * eLen;
            const segData: Float32Array[] = [];

            for (let ch = 0; ch < numChannels; ch++) {
                const out = new Float32Array(segLen);
                let wp = 0;

                if (hasOriginal && eLen > 0) {
                    for (let i = 0; i < eLen; i++) {
                        out[wp++] = channelData[ch][seg.origStart! + i];
                    }
                }

                if (hasOriginal && bodyLen > 0) {
                    const center = Math.floor((seg.origStart! + seg.origEnd!) / 2);
                    const bodyReadStart = center - Math.floor(bodyLen / 2);
                    for (let i = 0; i < bodyLen; i++) {
                        const srcIdx = bodyReadStart + i;
                        if (srcIdx >= 0 && srcIdx < channelData[ch].length) {
                            out[wp++] = channelData[ch][srcIdx];
                        } else {
                            out[wp++] = 0;
                        }
                    }
                }

                if (hasOriginal && eLen > 0) {
                    for (let i = 0; i < eLen; i++) {
                        const srcIdx = seg.origEnd! - eLen + i;
                        if (srcIdx >= 0 && srcIdx < channelData[ch].length) {
                            out[wp++] = channelData[ch][srcIdx];
                        } else {
                            out[wp++] = 0;
                        }
                    }
                }

                if (wp < segLen) {
                    for (let i = wp; i < segLen; i++) {
                        out[i] = channelData[ch][seg.start + (i - (segLen - (seg.end - seg.start)))];
                    }
                }

                segData.push(out);
            }
            processedSegments.push(segData);
        }
    }

    const crossfadeSamples = Math.floor(sampleRate * 0.015);
    let totalOutputSamples = 0;
    for (let i = 0; i < processedSegments.length; i++) {
        totalOutputSamples += processedSegments[i][0].length;
        if (i > 0) totalOutputSamples -= crossfadeSamples;
    }

    const outputChannels: Float32Array[] = [];
    for (let ch = 0; ch < numChannels; ch++) {
        const output = new Float32Array(totalOutputSamples);
        let writePos = 0;
        for (let i = 0; i < processedSegments.length; i++) {
            const seg = processedSegments[i][ch];
            if (i === 0) {
                output.set(seg, writePos);
                writePos += seg.length;
            } else {
                const overlap = Math.min(crossfadeSamples, seg.length, writePos);
                for (let j = 0; j < overlap; j++) {
                    const t = j / overlap;
                    output[writePos - overlap + j] = output[writePos - overlap + j] * (1 - t) + seg[j] * t;
                }
                if (seg.length > overlap) {
                    output.set(seg.subarray(overlap), writePos);
                }
                writePos += seg.length - overlap;
            }
        }
        outputChannels.push(output);
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
