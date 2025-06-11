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
        keycodes_map: Record<string, number | null>; // Optional: Tastaturbelegung für Interaktionen
    }
    props?: Record<string, unknown>;
} | {
    name: string;
    type: string;
    hardware: {
        id: string;
        state?: 'ACTIVE' | 'INACTIVE';
    };
    interactions: Interaction[];
    props?: Record<string, unknown>;
}

export type Interaction = {
    type: string; // z.B. BUTTON_PRESS, BUTTON_RELEASE
    displayName?: string; // Optional: Anzeigename für die UI
    description?: string; // Beschreibung der Interaktion
}
