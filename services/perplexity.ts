
import { EnrichmentMode } from "../types";
import { getPerplexityKey } from "./settings";

type PerplexityChatResult = { content: string; citations: string[] };

const perplexityChat = async (systemPrompt: string, userPrompt: string): Promise<PerplexityChatResult> => {
  const key = getPerplexityKey();
  if (!key) throw new Error("Perplexity API Key fehlt. Bitte in den Einstellungen hinterlegen.");

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          model: 'sonar-pro',
          messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 4000,
          return_citations: true
      })
  });

  if (!response.ok) throw new Error(`Perplexity Error: ${response.status}`);

  const data = await response.json();
  return {
      content: data.choices?.[0]?.message?.content || "",
      citations: data.citations || []
  };
};

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
      const { content: base, citations } = await perplexityChat(systemPrompt, `Analysiere und recherchiere Hintergründe zu diesem Dossier:\n\n${dossier}`);
      let content = base || "";

      if (citations.length > 0) {
          content += "\n\n--- VERIFIZIERTE QUELLEN ---\n" + citations.map((url: string, i: number) => `[${i + 1}] ${url}`).join('\n');
      }
      return content;
  } catch (error: any) {
      console.error("Research failed:", error);
      throw error;
  }
};

export const getPerplexityLegalCheck = async (text: string): Promise<PerplexityChatResult> => {
  const systemPrompt = [
      "Du bist ein juristischer Redakteur und Compliance-Checker für deutschsprachige Online-Publikationen.",
      "Du sollst eine Websuche nutzen, um Tatsachenbehauptungen zu plausibilisieren und potenzielle rechtliche Risiken zu erkennen.",
      "Analysiere den Text auf juristische Angreifbarkeit (u.a. falsche Tatsachenbehauptungen, üble Nachrede/Verleumdung, Persönlichkeitsrechte, Urheber/Marken, irreführende Aussagen).",
      "Gib NUR gültiges JSON zurück, ohne Markdown, ohne Backticks."
  ].join("\n");

  const schema = `JSON-SCHEMA:
{
  "verdict": "green" | "yellow" | "red",
  "summary": string,
  "issues": [
    {
      "problematicQuote": string,
      "whyRisky": string,
      "saferRewrite": string
    }
  ]
}

REGELN:
- "green": issues muss leer sein.
- "yellow": issues enthält nur Stellen, die geprüft/abgesichert werden sollten.
- "red": issues enthält nur Stellen mit klar erhöhtem Risiko.
- saferRewrite: nur den problematischen Teil umformulieren, nicht den ganzen Text neu schreiben.
- Wenn der Text keine konkreten Namen/Orte/Zahlen nennt, fokussiere auf Formulierungsrisiken (z.B. Verallgemeinerungen, Unterstellungen).`;

  const userPrompt = `${schema}\n\nZU PRÜFENDER TEXT:\n${text}`;
  return perplexityChat(systemPrompt, userPrompt);
};
