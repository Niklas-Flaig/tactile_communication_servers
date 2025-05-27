// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors'); // NEU: CORS-Middleware importieren

// PORT wird von der Hosting-Plattform (z.B. Railway) über Umgebungsvariablen gesetzt.
// Fallback auf 3001 für lokale Entwicklung.
const PORT = process.env.PORT || 3001;

const app = express();

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

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const figmaPluginClients = new Set();
const electronAppClients = new Set();

let currentFigmaState = {
    activeComponent: null,
    allPageComponents: []
};

console.log("Hardware Connector Server (v3 - Hosting Ready) wird initialisiert...");

// --- WebSocket Server Logik ---
wss.on('connection', (ws, req) => {
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(`Neuer WebSocket-Client verbunden von IP: ${clientIp}`);

    // Client muss sich identifizieren oder wir versuchen es zu erraten
    // Hier senden wir erstmal den allgemeinen Figma-Status an jeden neuen Client
    ws.send(JSON.stringify({ type: 'figma-state-update-for-electron', payload: currentFigmaState }));


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
                        figmaPluginClients.add(ws);
                        electronAppClients.delete(ws);

                        // Informiere alle Electron-App-Clients über die Änderung
                        broadcastToElectronApps({ type: 'figma-state-update-for-electron', payload: currentFigmaState });
                    }
                    break;

                // Nachricht von der Electron App, um sich zu identifizieren
                case 'electron-app-connected':
                    console.log('Electron App hat sich identifiziert.');
                    electronAppClients.add(ws);
                    figmaPluginClients.delete(ws);
                    // Sende den aktuellen Figma-Status an die neu verbundene Electron-App
                    ws.send(JSON.stringify({ type: 'figma-state-update-for-electron', payload: currentFigmaState }));
                    break;

                // Nachricht von der Electron App, um eine Aktion im Figma Plugin auszulösen
                case 'trigger-endpoint-from-electron':
                    if (message.payload) {
                        console.log('Trigger von Electron App für Figma empfangen:', message.payload);
                        const triggerMessageToFigma = {
                            type: 'remote-endpoint-trigger-from-electron', // Dieser Typ wird vom Figma Plugin erwartet
                            payload: {
                                ...message.payload, // Enthält componentId, endpointId, buttonId
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

    ws.on('close', () => { /* ... */ figmaPluginClients.delete(ws); electronAppClients.delete(ws); });
    ws.on('error', (error) => { /* ... */ figmaPluginClients.delete(ws); electronAppClients.delete(ws); });
});

function broadcastToElectronApps(messageObject) {
    const messageString = JSON.stringify(messageObject);
    if (electronAppClients.size > 0) {
        console.log(`Sende an ${electronAppClients.size} Electron App(s):`, messageString);
        electronAppClients.forEach((client) => {
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
        // console.log(`Sende an ${figmaPluginClients.size} Figma Plugin(s):`, messageString);
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
        // console.log(`Sende an ${webRemoteClients.size} Web Remote(s):`, messageString);
        webRemoteClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageString, (err) => {
                    if (err) console.error("Fehler beim Senden an Web Remote:", err);
                });
            }
        });
    }
}

// --- HTTP API Endpunkte ---
app.post('/api/trigger-endpoint', (req, res) => {
    const { componentId, endpointId, buttonId } = req.body;
    // ... (Logik bleibt ähnlich, sendet 'remote-endpoint-trigger-from-electron' an Figma Plugins) ...
    const messageToFigma = {
        type: 'remote-endpoint-trigger-from-electron',
        payload: { componentId, endpointId, buttonId, timestamp: new Date().toISOString() }
    };
    broadcastToFigmaPlugins(messageToFigma);
    res.status(200).json({ success: true, message: `Trigger für Endpunkt '${buttonId}' weitergeleitet.` });
});

// --- Server starten ---
server.listen(PORT, () => {
    console.log(`Server läuft auf Port ${PORT}`);
});

// Typ-Definition für die Nachricht an das Plugin (kann auch in einer .d.ts Datei sein)
/**
 * @typedef {object} RemoteEndpointTriggerPayload
 * @property {string} componentId
 * @property {string} endpointId
 * @property {string} buttonId
 * @property {string} timestamp
 */

/**
 * @typedef {object} RemoteEndpointTriggerToPluginUI
 * @property {'remote-endpoint-trigger'} type
 * @property {RemoteEndpointTriggerPayload} payload
 */
