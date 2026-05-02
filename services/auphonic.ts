import { getAuphonicKey, getAuphonicPresetUuid } from './settings';

// Helper function to convert a Base64 string to a Blob
const base64ToBlob = (base64: string, mimeType: string = 'audio/mpeg'): Blob => {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ab], { type: mimeType });
};

// Helper to poll Auphonic API
const pollAuphonicStatus = async (uuid: string, token: string): Promise<string> => {
  const maxRetries = 60; // 5 minutes (5s * 60)
  let retries = 0;

  while (retries < maxRetries) {
    const response = await fetch(`https://auphonic.com/api/production/${uuid}.json`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      }
    });

    if (!response.ok) {
      throw new Error(`Fehler beim Abrufen des Auphonic Status: ${response.statusText}`);
    }

    const result = await response.json();
    const status = result?.data?.status;

    // Status 3 = Done
    if (status === 3) {
      const downloadUrl = result?.data?.output_files?.[0]?.download_url;
      if (!downloadUrl) throw new Error("Kein Download-URL in der Auphonic Antwort gefunden.");
      return downloadUrl;
    }

    // Status 2 = Error
    if (status === 2 || result?.data?.error_message) {
      throw new Error(`Auphonic Fehler: ${result?.data?.error_message || 'Unbekannter Fehler'}`);
    }

    // Wait 5 seconds before polling again
    await new Promise(r => setTimeout(r, 5000));
    retries++;
  }

  throw new Error("Auphonic Timeout: Produktion dauerte zu lange.");
};

export const processWithAuphonic = async (base64Audio: string): Promise<string> => {
  const token = getAuphonicKey();
  const presetUuid = getAuphonicPresetUuid();

  if (!token) {
    throw new Error('Auphonic API Token fehlt in den Einstellungen.');
  }

  const audioBlob = base64ToBlob(base64Audio);
  const formData = new FormData();
  
  // We need to provide the file
  formData.append('input_file', audioBlob, 'elevenlabs_raw.mp3');
  
  // Start the production immediately
  formData.append('action', 'start');

  // If a preset is defined, use it
  if (presetUuid) {
    formData.append('preset', presetUuid);
  } else {
    // Basic defaults if no preset is provided
    formData.append('algorithms', JSON.stringify({
      denoise: true,
      loudness: true,
      normloudness: -16
    }));
    formData.append('output_files', JSON.stringify([
      { format: "mp3", bitrate: 192 }
    ]));
  }

  // 1. Create and Start Production
  const createResponse = await fetch('https://auphonic.com/api/simple/productions.json', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`
    },
    body: formData
  });

  if (!createResponse.ok) {
    const errText = await createResponse.text();
    throw new Error(`Fehler beim Starten der Auphonic Produktion: ${createResponse.status} ${errText}`);
  }

  const createData = await createResponse.json();
  const productionUuid = createData?.data?.uuid;

  if (!productionUuid) {
    throw new Error('Konnte keine Auphonic Production UUID erhalten.');
  }

  // 2. Poll for completion
  const downloadUrl = await pollAuphonicStatus(productionUuid, token);

  // 3. Fetch the processed file to store it as base64 locally
  const fileResponse = await fetch(downloadUrl, {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  if (!fileResponse.ok) {
    throw new Error(`Fehler beim Herunterladen der Auphonic Datei: ${fileResponse.statusText}`);
  }

  const processedBlob = await fileResponse.blob();
  
  // Convert back to base64 for local storage
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(processedBlob);
  });
};
