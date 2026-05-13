import { ProjectSession } from '../types';

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocalhost ? 'https://story.zeitblytz.media/track.php' : './track.php';

const fetchOptions = (overrides: RequestInit = {}): RequestInit => ({
    ...overrides,
    ...(isLocalhost ? { mode: 'cors' as RequestMode } : {})
});

export const initStorage = async (): Promise<boolean> => {
    try {
        const response = await fetch(API_URL, fetchOptions({
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }));
        const data = await response.json();
        return data.status === 'online' || data.status === 'ready' || Array.isArray(data);
    } catch (e) {
        console.warn("Storage API (track.php) nicht erreichbar. App läuft offline.", e);
        return false;
    }
};

export const checkConnection = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_URL}?action=status`, fetchOptions({
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }));
        if (!response.ok) return false;
        const data = await response.json();
        return data.status === 'online' || data.status === 'ready';
    } catch (e) {
        return false;
    }
};

export const listProjects = async (): Promise<ProjectSession[]> => {
    try {
        const response = await fetch(`${API_URL}?action=list`, fetchOptions({
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }));
        if (!response.ok) throw new Error("Netzwerk Fehler beim Laden");
        const data = await response.json();
        return Array.isArray(data) ? data : [];
    } catch (e) {
        console.error("Fehler beim Laden der Projekte:", e);
        throw e;
    }
};

export const getProject = async (id: string): Promise<ProjectSession | null> => {
    try {
        const response = await fetch(`${API_URL}?action=get&id=${id}`, fetchOptions({
            method: 'GET',
            headers: { 'Accept': 'application/json' }
        }));
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`Fehler beim Laden des Projekts: ${response.status}`);
        }
        return await response.json();
    } catch (e) {
        console.error("Fehler beim Laden des Projekts:", e);
        return null;
    }
};

export const saveProject = async (project: ProjectSession): Promise<void> => {
    try {
        const response = await fetch(API_URL, fetchOptions({
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                action: 'save',
                project: project
            })
        }));

        if (!response.ok) throw new Error("Speichern fehlgeschlagen");
        const result = await response.json();
        if (result.error) throw new Error(result.error);
    } catch (e) {
        console.error("Fehler beim Speichern:", e);
        throw e;
    }
};

export const deleteProject = async (id: string): Promise<void> => {
    try {
        const response = await fetch(`${API_URL}?action=delete&id=${id}`, fetchOptions({
            method: 'POST',
            headers: { 'Accept': 'application/json' }
        }));

        if (!response.ok) {
            throw new Error(`HTTP Fehler: ${response.status}`);
        }

        const result = await response.json();
        if (!result.success && !result.status) {
            throw new Error(result.error || "Server meldete Fehler beim Löschen");
        }
    } catch (e) {
        console.error("Fehler beim Löschen:", e);
        throw e;
    }
};
