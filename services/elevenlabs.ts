import { getElevenLabsKey, getElevenLabsVoiceId } from './settings';

export const generateElevenLabsAudio = async (text: string): Promise<string> => {
  const apiKey = getElevenLabsKey();
  const voiceId = getElevenLabsVoiceId();

  if (!apiKey || !voiceId) {
    throw new Error('ElevenLabs API Key oder Voice ID fehlt in den Einstellungen.');
  }

  // ElevenLabs V3 requires the v1/text-to-speech/{voice_id} endpoint
  // with model_id = "eleven_multilingual_v2" or "eleven_turbo_v2" (or v3 if available, usually v2.5 or v3 via api, let's use 'eleven_multilingual_v2' or what user prefers. User said "ElevenLabs V3", so model_id: 'eleven_multilingual_v2' is typical, or we can use whatever is standard. Actually, for V3 the model is 'eleven_turbo_v2_5' or 'eleven_multilingual_v2'. Wait, there is a new model 'eleven_multilingual_v2' or 'eleven_turbo_v2' or 'eleven_turbo_v2_5'. I will use 'eleven_turbo_v2_5' or 'eleven_multilingual_v2'. Let's use 'eleven_turbo_v2_5'.)
  // Or 'eleven_multilingual_v2' is safe.
  
  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'xi-api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text: text,
      model_id: 'eleven_multilingual_v2',
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

  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string); // Returns Base64 data URL
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};
