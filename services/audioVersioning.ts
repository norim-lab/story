const AUDIO_API_URL = 'https://story.zeitblytz.media/audio.php';

export interface AudioVersion {
    version: number;
    file: string;
    size: number;
    time: number;
}

export const backupSlotAudio = async (
    projectId: string,
    slot: string,
    stage: string,
    audioBase64: string
): Promise<{ success: boolean; version?: number }> => {
    if (!audioBase64 || audioBase64 === '__STRIPPED__' || !audioBase64.startsWith('data:audio')) {
        return { success: true };
    }

    try {
        const response = await fetch(AUDIO_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'save',
                projectId,
                slot,
                stage,
                audio: audioBase64,
            }),
        });
        const result = await response.json();
        return { success: result.success, version: result.version };
    } catch (e) {
        console.warn('Audio backup failed:', e);
        return { success: false };
    }
};

export const listAudioVersions = async (
    projectId: string,
    slot: string,
    stage: string
): Promise<AudioVersion[]> => {
    try {
        const response = await fetch(AUDIO_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'list',
                projectId,
                slot,
                stage,
            }),
        });
        const result = await response.json();
        return result.versions || [];
    } catch (e) {
        console.warn('List versions failed:', e);
        return [];
    }
};

export const getAudioVersionUrl = (
    projectId: string,
    slot: string,
    stage: string,
    version: number
): string => {
    return `${AUDIO_API_URL}?action=get&projectId=${encodeURIComponent(projectId)}&slot=${encodeURIComponent(slot)}&stage=${encodeURIComponent(stage)}&version=${version}`;
};

export const cleanupProjectAudio = async (projectId: string): Promise<number> => {
    try {
        const response = await fetch(AUDIO_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'cleanup_project',
                projectId,
            }),
        });
        const result = await response.json();
        return result.cleaned || 0;
    } catch (e) {
        console.warn('Cleanup failed:', e);
        return 0;
    }
};
