
import { WorkflowStatus, TextModel, ScriptResult, ProjectState, EnrichmentMode } from '../types';
import { getPerplexityResearch } from './perplexity';
import { generateZeitblitzScript, enrichScriptWithDeep, mapResearchToSegments } from './gemini';

export class ZeitblitzOrchestrator {
  private onStatus: (status: WorkflowStatus, message: string) => void;
  private onLog: (msg: string, type: 'info' | 'success' | 'error' | 'workflow') => void;

  constructor(
    onStatus: (status: WorkflowStatus, message: string) => void,
    onLog: (msg: string, type: 'info' | 'success' | 'error' | 'workflow') => void
  ) {
    this.onStatus = onStatus;
    this.onLog = onLog;
  }

  async generateStandardShow(rawText: string, model: TextModel): Promise<ScriptResult> {
    this.onLog("Importiere Rohskript...", 'workflow');
    try {
      this.onStatus(WorkflowStatus.SCRIPTING, "TEXT WIRD ÜBERNOMMEN...");
      
      // Hier rufen wir Gemini nicht mehr auf, um zu strukturieren, sondern nutzen den Text direkt.
      const script = await generateZeitblitzScript(rawText, model);
      
      this.onLog(`Skript erfolgreich importiert.`, 'success');
      this.onStatus(WorkflowStatus.COMPLETED, "Editor bereit.");
      return script;
    } catch (e: any) {
      this.onLog(`Fehler beim Import: ${e.message}`, 'error');
      this.onStatus(WorkflowStatus.FAILED, "Fehler: " + e.message);
      throw e;
    }
  }

  async upgradeToDeep(dossier: string, currentScript: ScriptResult): Promise<ScriptResult> {
    this.onLog("Research Engine gestartet", 'workflow');
    try {
      this.onStatus(WorkflowStatus.RESEARCHING, "PERPLEXITY SCAN...");
      
      // Wir nutzen das aktuelle Skript als Basis für die Recherche, falls kein separates Dossier da ist
      const researchContext = dossier || currentScript.sections[0].versions['standard'];
      const research = await getPerplexityResearch(researchContext, EnrichmentMode.DEEP);
      
      this.onLog(`Fakten-Check abgeschlossen.`, 'success');

      this.onStatus(WorkflowStatus.SCRIPTING, "INJEKTION IN SKRIPT...");
      const snippets = await mapResearchToSegments(currentScript, research);
      
      const updatedSections = await enrichScriptWithDeep(currentScript, research);
      
      // Snippets in die Sections mergen
      const finalSections = updatedSections.map(s => ({
        ...s,
        researchSnippet: snippets[s.id] || ""
      }));

      this.onLog("Deep Dive Update erfolgreich.", 'success');
      this.onStatus(WorkflowStatus.COMPLETED, "Upgrade fertig.");
      return { ...currentScript, sections: finalSections, isEnriched: true, researchData: research };
    } catch (e: any) {
      this.onLog(`Deep Dive Fehler: ${e.message}`, 'error');
      this.onStatus(WorkflowStatus.FAILED, "Upgrade fehlgeschlagen: " + e.message);
      throw e;
    }
  }
}
