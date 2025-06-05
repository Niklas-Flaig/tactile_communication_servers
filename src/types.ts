
export type ActionPoint = {
    id: string;
    triggerKey: string | null;
    description?: string;
    hasNativeReaction?: boolean; // Gibt an, ob native Reaktionen vorhanden sind
}

export type HardwareComponent = {
    name: string;
    type: string;
    hardware: {
        id: string;
        state?: 'ACTIVE' | 'INACTIVE';
    };
    interactions: Interaction[];
    figma_data: {
        component_id: string; // XX:YY
        component_name: string;
        instances: string[];
        keystroke_map: Record<string, string | null>; // Optional: Tastaturbelegung für Interaktionen
    }
    props?: Record<string, unknown>;
};

export type Interaction = {
    type: string; // z.B. BUTTON_PRESS, BUTTON_RELEASE
    displayName?: string; // Optional: Anzeigename für die UI
    description?: string; // Beschreibung der Interaktion
}
