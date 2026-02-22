
import { EnrichmentMode } from "../types";

const PPLX_KEY = "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";

export const getPerplexityResearch = async (dossier: string, mode: EnrichmentMode = EnrichmentMode.DEEP): Promise<string> => {
  if (mode === EnrichmentMode.NONE) return "";

  const systemPrompt = `Du bist ein investigativer Faktenchecker für eine anspruchsvolle Polit-Show. 
Deine Aufgabe ist eine Tiefenrecherche des vorliegenden Dossiers. 

RECHERCHE-FOKUS:
1. IDENTIFIZIERUNG: Finde die zugrunde liegende Original-Nachricht oder das Ereignis in seriösen Nachrichtenquellen.
2. KONTEXT & HINTERGRUND: Recherchiere die Vorgeschichte, politische/gesellschaftliche Zusammenhänge und die Motive der Beteiligten.
3. FAKTEN-CHECK: Prüfe ALLE Aussagen auf Richtigkeit (nicht nur Zahlen, sondern auch Kausalzusammenhänge und Zitate).
4. QUELLEN: Liefere zu jeder wichtigen Erkenntnis den direkten Link zur seriösen Quelle (Zeitungen, offizielle Dokumente).

Antworte strukturiert, detailliert und mit Fokus auf "Was bisher nicht im Dossier stand, aber wichtig ist".`;

  try {
      const response = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: {
              'Authorization': `Bearer ${PPLX_KEY}`,
              'Content-Type': 'application/json'
          },
          body: JSON.stringify({
              model: 'sonar-pro',
              messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: `Analysiere und recherchiere Hintergründe zu diesem Dossier:\n\n${dossier}` }
              ],
              temperature: 0.1,
              max_tokens: 4000,
              return_citations: true
          })
      });

      if (!response.ok) throw new Error(`Perplexity Error: ${response.status}`);

      const data = await response.json();
      let content = data.choices?.[0]?.message?.content || "";
      const citations = data.citations || [];

      if (citations.length > 0) {
          content += "\n\n--- VERIFIZIERTE QUELLEN ---\n" + citations.map((url: string, i: number) => `[${i + 1}] ${url}`).join('\n');
      }
      return content;
  } catch (error: any) {
      console.error("Research failed:", error);
      throw error;
  }
};
