
// --- Datenstrukturen für UI und Kommunikation ---
export type ActionPoint = { // Umbenannt von EndpointUI
    id: string;
    name: string;
    buttonId?: string; // Die extrahierte Button-ID (z.B. "BTN_ROT")
    // 'connection' (für pluginData) wird entfernt.
    triggerKey?: string | null; // Optional, falls benötigt
    description?: string; // Optional, für zusätzliche Informationen
    // nativeReactions?: SimplifiedReaction[]; // Für die Anzeige nativer Figma-Interaktionen
}

export type HardwareComponent = {
    id: string; // ID der physischen Hardware-Komponente
    name: string; // Name der Hardware-Komponente für die Anzeige
    type: string; // Typ der Hardware-Komponente (z.B. "BUTTON", "LED")
    figmaComponentId: string | null; // ID der Figma-Komponente, die diese Hardware repräsentiert
    figmaInstancesIds?: string[]; // Optional, IDs aller Instanzen dieser Komponente auf der aktuellen Seite
    actionPoints: ActionPoint[];
    isActive?: boolean; // Ob der ActionPoint aktiv ist
    props?: Record<string, unknown>; // Optional, für zusätzliche Eigenschaften
};






