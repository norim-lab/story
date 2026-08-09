import { getElevenLabsKey, getElevenLabsVoiceId } from './settings';

export const getElevenLabsUserInfo = async (): Promise<{ used: number, limit: number }> => {
  const apiKey = getElevenLabsKey();
  if (!apiKey) {
    throw new Error('ElevenLabs API Key fehlt in den Einstellungen.');
  }

  const response = await fetch('https://api.elevenlabs.io/v1/user', {
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Fehler beim Abrufen der ElevenLabs Nutzerdaten: ${response.statusText}`);
  }

  const data = await response.json();
  return {
    used: data.subscription?.character_count || 0,
    limit: data.subscription?.character_limit || 0
  };
};

export const generateElevenLabsAudio = async (text: string): Promise<{ audioBase64: string, characterCount: number }> => {
  const apiKey = getElevenLabsKey();
  const voiceId = getElevenLabsVoiceId();

  if (!apiKey) {
    throw new Error('ElevenLabs API Key fehlt in den Einstellungen.');
  }
  if (!voiceId) {
    throw new Error('ElevenLabs Voice ID fehlt in den Einstellungen.');
  }

  // V3 hat ein Zeichenlimit von 5000 Zeichen pro Request
  const V3_CHAR_LIMIT = 5000;
  if (text.length > V3_CHAR_LIMIT) {
    throw new Error(`Text ist zu lang für ElevenLabs V3 (${text.length} Zeichen). Maximum: ${V3_CHAR_LIMIT}. Bitte kürze den Text.`);
  }

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_v3',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    let errDetail = response.statusText;
    let errHint = '';
    try {
      const errData = await response.json();
      errDetail = errData?.detail?.message || errData?.detail || errData?.message || JSON.stringify(errData);
      if (typeof errDetail === 'object') errDetail = JSON.stringify(errDetail);
    } catch {
      try { errDetail = await response.text(); } catch {}
    }

    if (response.status === 401) errHint = ' (API Key ungültig oder abgelaufen)';
    else if (response.status === 404) errHint = ' (Voice ID nicht gefunden - prüfe die Einstellungen)';
    else if (response.status === 422) errHint = ' (Text/Parameter ungültig für V3)';
    else if (response.status === 429) errHint = ' (Rate-Limit erreicht - warte kurz)';
    else if (response.status === 400 && /quota|limit|character/i.test(String(errDetail))) errHint = ' (Kontingent erschöpft)';

    throw new Error(`ElevenLabs ${response.status}: ${errDetail}${errHint}`);
  }

  const charCountHeader = response.headers.get("x-character-count");
  const characterCount = charCountHeader ? parseInt(charCountHeader, 10) : 0;

  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error('ElevenLabs hat leeres Audio zurückgegeben (0 Bytes).');
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({ audioBase64: reader.result as string, characterCount });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
