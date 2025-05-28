// server.js
console.log("Server-Skript wird gestartet..."); // Allererste Log-Ausgabe
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors'); // NEU: CORS-Middleware importieren

// PORT wird von der Hosting-Plattform (z.B. Railway) über Umgebungsvariablen gesetzt.
// Fallback auf 3001 für lokale Entwicklung.
const PORT = process.env.PORT || 3001;

const app = express();
console.log("Express App initialisiert.");

// --- Middleware ---
// CORS-Middleware aktivieren, um Anfragen von Figma-Domains zu erlauben
app.use(cors({
    origin: ['https://www.figma.com', 'https://figma.com'], // Erlaube Anfragen von Figma
    // Du könntest hier weitere Optionen hinzufügen, falls nötig:
    // methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    // allowedHeaders: "Content-Type,Authorization"
}));

app.use(express.json()); // Für das Parsen von JSON-Request-Bodies
app.use(express.static(path.join(__dirname, '/public'))); // Stellt statische Dateien aus dem 'public'-Ordner bereit
console.log("Middleware konfiguriert.");

const server = http.createServer(app);
console.log("HTTP-Server erstellt.");
const wss = new WebSocket.Server({ server });
console.log("WebSocket-Server erstellt und an HTTP-Server gebunden.");

const figmaPluginClients = new Set();
const desktopSoftwareClients = new Set();
const webRemoteClients = new Set(); // Für Web-Fernbedienungen

let currentFigmaState = {
    activeComponent: null,
    allPageComponents: []
};

console.log("Hardware Connector Server (v3 - Hosting Ready) wird initialisiert...");

// --- WebSocket Server Logik ---
wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`Neuer WebSocket-Client verbunden von IP: ${clientIp}`);

    // Sende den aktuellen Figma-Status an jeden neuen Client (Web-Remotes und Desktop-Software erwarten diesen Typ)
    ws.send(JSON.stringify({ type: 'figma-state-update-for-external', payload: currentFigmaState }));


    ws.on('message', (messageAsString) => {
        try {
            const message = JSON.parse(messageAsString);
            console.log('Nachricht vom WebSocket-Client empfangen:', message.type);

            switch (message.type) {
                // Nachricht von der Figma Plugin UI
                case 'figma-state-to-server':
                    if (message.payload) {
                        console.log('Figma State vom Plugin empfangen.');
                        currentFigmaState = message.payload; // Speichere activeComponent und allPageComponents

                        // Identifiziere als Figma Plugin Client
                        console.log(`Client ${clientIp} als Figma Plugin identifiziert.`);
                        figmaPluginClients.add(ws);
                        desktopSoftwareClients.delete(ws);
                        webRemoteClients.delete(ws);

                        // Informiere alle externen Clients (Desktop-Software, Web Remotes) über die Änderung
                        const stateUpdateForExternal = { type: 'figma-state-update-for-external', payload: currentFigmaState };
                        broadcastToDesktopSoftware(stateUpdateForExternal);
                        broadcastToWebRemotes(stateUpdateForExternal);
                    }
                    break;

                // Nachricht von der Desktop-Software (z.B. Electron), um sich zu identifizieren
                case 'desktop-software-connected': // Angepasst an deine Benennung
                    console.log(`Client ${clientIp} als Desktop-Software identifiziert.`);
                    desktopSoftwareClients.add(ws);
                    figmaPluginClients.delete(ws);
                    webRemoteClients.delete(ws);
                    // Sende den aktuellen Figma-Status an die neu verbundene Desktop-Software
                    ws.send(JSON.stringify({ type: 'figma-state-update-for-external', payload: currentFigmaState }));
                    break;

                // Nachricht von der Web Remote, um sich zu identifizieren
                case 'web-remote-connected':
                    console.log(`Client ${clientIp} als Web Remote identifiziert.`);
                    webRemoteClients.add(ws);
                    figmaPluginClients.delete(ws);
                    desktopSoftwareClients.delete(ws);
                    // Sende den aktuellen Figma-Status an die neu verbundene Web Remote
                    ws.send(JSON.stringify({ type: 'figma-state-update-for-external', payload: currentFigmaState }));
                    break;

                // Nachricht von der Desktop-Software oder Web Remote (via HTTP), um eine Aktion im Figma Plugin auszulösen
                // Der Server leitet dies als 'remote-actionpoint-trigger' an Figma weiter.
                case 'trigger-actionpoint-from-external': // Generischer Typ für externe Trigger
                    if (message.payload) {
                        console.log('Trigger von externem Client für Figma empfangen:', message.payload);
                        const triggerMessageToFigma = {
                            type: 'remote-actionpoint-trigger', // Konsistent mit types.ts (ExternalEndpointTriggerToPluginUI -> RemoteActionPointTriggerToPluginMessage)
                            payload: {
                                ...message.payload, // Sollte componentId, actionPointId, buttonId enthalten
                                timestamp: new Date().toISOString()
                            }
                        };
                        broadcastToFigmaPlugins(triggerMessageToFigma);
                    }
                    break;
                default:
                    console.log('Unbekannter WebSocket-Nachrichtentyp vom Client:', message.type);
            }
        } catch (error) {
            console.error('Fehler beim Verarbeiten der WebSocket-Nachricht:', error, messageAsString);
        }
    });

    ws.on('close', (code, reason) => {
        const reasonString = reason ? reason.toString() : 'Kein Grund angegeben';
        console.log(`WebSocket-Client von IP ${clientIp} getrennt. Code: ${code}, Grund: ${reasonString}`);
        figmaPluginClients.delete(ws);
        desktopSoftwareClients.delete(ws);
        webRemoteClients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket-Fehler für Client von IP ${clientIp}:`, error);
        // Clients werden bei Fehler oft auch geschlossen, aber zur Sicherheit hier entfernen
        figmaPluginClients.delete(ws);
        desktopSoftwareClients.delete(ws);
        webRemoteClients.delete(ws);
    });
});

function broadcastToDesktopSoftware(messageObject) {
    const messageString = JSON.stringify(messageObject);
    if (desktopSoftwareClients.size > 0) {
        console.log(`Sende an ${desktopSoftwareClients.size} Desktop-Software Client(s) (Typ: ${messageObject.type})`);
        desktopSoftwareClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageString, (err) => {
                    if (err) console.error("Fehler beim Senden an Electron App:", err);
                });
            }
        });
    }
}

function broadcastToFigmaPlugins(messageObject) {
    const messageString = JSON.stringify(messageObject);
    if (figmaPluginClients.size > 0) {
        console.log(`Sende an ${figmaPluginClients.size} Figma Plugin(s) (Typ: ${messageObject.type})`);
        figmaPluginClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageString, (err) => {
                    if (err) console.error("Fehler beim Senden an Figma Plugin:", err);
                });
            }
        });
    }
}

function broadcastToWebRemotes(messageObject) {
    const messageString = JSON.stringify(messageObject);
    if (webRemoteClients.size > 0) {
        console.log(`Sende an ${webRemoteClients.size} Web Remote(s) (Typ: ${messageObject.type})`);
        webRemoteClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageString, (err) => {
                    if (err) console.error("Fehler beim Senden an Figma Plugin:", err);
                });
            }
        });
    }
}

// --- HTTP API Endpunkte ---
app.post('/api/trigger-actionpoint', (req, res) => { // Umbenannt für Konsistenz
    const { componentId, actionPointId, buttonId } = req.body;
    console.log(`HTTP /api/trigger-actionpoint aufgerufen mit: componentId=${componentId}, actionPointId=${actionPointId}, buttonId=${buttonId}`);

    if (!componentId || !actionPointId || !buttonId) {
        console.warn('Ungültige Anfrage an /api/trigger-actionpoint: Fehlende Parameter.');
        return res.status(400).json({ success: false, message: 'Fehlende Parameter: componentId, actionPointId und buttonId sind erforderlich.' });
    }

    const messageToFigma = {
        type: 'remote-actionpoint-trigger', // Konsistent mit dem, was das Plugin erwartet
        payload: { componentId, actionPointId, buttonId, timestamp: new Date().toISOString() }
    };
    broadcastToFigmaPlugins(messageToFigma);
    res.status(200).json({ success: true, message: `Trigger für ActionPoint '${buttonId}' (ID: ${actionPointId}) der Komponente '${componentId}' weitergeleitet.` });
});

console.log("HTTP Endpunkte definiert.");

// --- Server starten ---
console.log(`Versuche Server auf Port ${PORT} zu starten...`);
server.listen(PORT, () => {
    console.log(`✅ Hardware Connector Server läuft erfolgreich auf Port ${PORT}`);
    console.log(`   Erreichbar unter http://localhost:${PORT} (lokal) oder der zugewiesenen Railway-URL.`);
    console.log("Warte auf WebSocket-Verbindungen...");
});

server.on('error', (error) => {
    console.error('🚨 HTTP Server Fehler:', error);
    if (error.syscall !== 'listen') {
        throw error;
    }
    // Spezifische Fehlerbehandlung für listen-Fehler
    switch (error.code) {
        case 'EACCES':
            console.error(`Port ${PORT} erfordert erhöhte Rechte.`);
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(`Port ${PORT} wird bereits verwendet.`);
            process.exit(1);
            break;
        default:
            throw error;
    }
});

// JSDoc Typ-Definitionen für Klarheit (entsprechend types.ts)
/**
 * @typedef {object} ActionPointTriggerPayload
 * @property {string} componentId
 * @property {string} actionPointId
 * @property {string} buttonId
 * @property {string} timestamp
 */

/**
 * @typedef {object} RemoteActionPointTriggerToPluginMessage
 * @property {'remote-actionpoint-trigger'} type
 * @property {ActionPointTriggerPayload} payload
 */

// Globale Fehler-Handler, um Abstürze zu loggen
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // Es ist oft ratsam, den Prozess nach einer uncaughtException neu zu starten,
  // da der Anwendungszustand inkonsistent sein könnte.
  // process.exit(1); // Für Produktionsumgebungen ggf. aktivieren
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // process.exit(1); // Für Produktionsumgebungen ggf. aktivieren
});

console.log("Globale Fehler-Handler registriert.");
console.log("Server-Skript Initialisierung abgeschlossen. Warte auf 'listen' Event.");
