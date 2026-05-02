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

  if (!apiKey || !voiceId) {
    throw new Error('ElevenLabs API Key oder Voice ID fehlt in den Einstellungen.');
  }

  // ElevenLabs V3 requires the v1/text-to-speech/{voice_id} endpoint
  // with model_id = "eleven_multilingual_v2" or "eleven_turbo_v2" (or v3 if available, usually v2.5 or v3 via api, let's use 'eleven_multilingual_v2' or what user prefers. User said "ElevenLabs V3", so model_id: 'eleven_multilingual_v2' is typical, or we can use whatever is standard. Actually, for V3 the model is 'eleven_turbo_v2_5' or 'eleven_multilingual_v2'. Wait, there is a new model 'eleven_multilingual_v2' or 'eleven_turbo_v2' or 'eleven_turbo_v2_5'. I will use 'eleven_turbo_v2_5' or 'eleven_multilingual_v2'. Let's use 'eleven_turbo_v2_5'.)
  // Or 'eleven_multilingual_v2' is safe.
  
  // Clean text from ElevenLabs emotion tags before sending
  // V3 uses the tags for prompting but we need to ensure the format is exact
  // If the prompt instructions don't work, ElevenLabs V3 actually supports text-to-speech prompting via text, 
  // but if it reads them aloud, the model isn't interpreting them as instructions. 
  // For V3, the model_id MUST be 'eleven_multilingual_v3' or 'eleven_v3'. 
  // We'll set it to eleven_multilingual_v3. If it fails, it means the account doesn't have access.
  const cleanText = text.replace(/\[.*?\]/g, '').trim();

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text, // Bei V3 lassen wir die Tags drin, da V3 sie als Prompt-Anweisungen verstehen sollte.
      model_id: 'eleven_v3', // Das offizielle V3 Modell (Muss eleven_v3 heißen)
      apply_text_normalization: "auto",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`ElevenLabs API Fehler: ${response.status} ${errText}`);
  }

  // Extract character count from headers
  const charCountHeader = response.headers.get("x-character-count");
  const characterCount = charCountHeader ? parseInt(charCountHeader, 10) : 0;

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve({ audioBase64: reader.result as string, characterCount }); // Returns Base64 data URL and character count
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
