// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0'; // Lausche auf allen Netzwerkschnittstellen

const app = express();

// Middleware
app.use(express.json()); // Für das Parsen von JSON-Request-Bodies
app.use(express.static(path.join(__dirname, 'public'))); // Stellt statische Dateien aus dem 'public'-Ordner bereit

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Set(); // Speichert alle verbundenen WebSocket-Clients (Figma Plugin UIs)

// Globale Zustände (Beispiele, in einer echten App besser in DB)
let hardwareConfiguration = {};
let hardwareStatus = {};

console.log("Hardware Connector Server wird initialisiert...");

// --- WebSocket Server Logik ---
wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`Neuer Client verbunden von IP: ${ip}`);
    clients.add(ws);

    // Sende initiale Daten an den neu verbundenen Client
    ws.send(JSON.stringify({ type: 'initial-config', payload: hardwareConfiguration }));
    ws.send(JSON.stringify({ type: 'initial-status', payload: hardwareStatus }));

    ws.on('message', (messageAsString) => {
        try {
            const message = JSON.parse(messageAsString);
            console.log('Nachricht vom Client empfangen:', message);

            switch (message.type) {
                case 'update-config':
                    hardwareConfiguration = message.payload;
                    console.log('Hardware-Konfiguration aktualisiert:', hardwareConfiguration);
                    broadcastMessage({ type: 'config-updated', payload: hardwareConfiguration });
                    break;
                case 'update-hardware-status':
                    hardwareStatus = { ...hardwareStatus, ...message.payload };
                    console.log('Hardware-Status aktualisiert:', hardwareStatus);
                    broadcastMessage({ type: 'status-updated', payload: hardwareStatus });
                    break;
                // trigger-prototype-action wird jetzt über HTTP ausgelöst, kann aber hier bleiben, falls auch WS-Trigger gewünscht sind
                case 'trigger-prototype-action':
                    console.log('WebSocket: Aktion für Prototyp empfangen:', message.payload);
                    broadcastMessage({ type: 'prototype-action-triggered', payload: message.payload });
                    break;
                default:
                    console.log('Unbekannter WebSocket-Nachrichtentyp:', message.type);
            }
        } catch (error) {
            console.error('Fehler beim Verarbeiten der WebSocket-Nachricht:', error, messageAsString);
        }
    });

    ws.on('close', () => {
        console.log(`Client von IP ${ip} hat Verbindung getrennt`);
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error(`WebSocket Fehler von IP ${ip}:`, error);
        clients.delete(ws);
    });
});

function broadcastMessage(messageObject) {
    const messageString = JSON.stringify(messageObject);
    if (clients.size > 0) {
        console.log(`Sende an ${clients.size} Client(s):`, messageString);
        clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(messageString, (err) => {
                    if (err) {
                        console.error("Fehler beim Senden der Broadcast-Nachricht:", err);
                    }
                });
            }
        });
    } else {
        console.log("Keine Clients verbunden, um Nachricht zu senden:", messageString);
    }
}



// --- HTTP API Endpunkte ---

// Endpunkt, um Button-Klicks von der Web-UI zu empfangen
app.post('/api/trigger-figma-action', (req, res) => {
    const { actionId, customMessage } = req.body; // Erwarte eine actionId und optional eine customMessage

    if (!actionId) {
        return res.status(400).json({ error: 'actionId fehlt im Request Body' });
    }

    console.log(`HTTP: Figma-Aktion empfangen: ID='${actionId}', Eigene Nachricht:`, customMessage);

    // Hier definierst du, welche WebSocket-Nachricht an das Figma-Plugin gesendet werden soll.
    // Diese Nachricht ist jetzt anpassbar!
    const websocketMessageToFigma = {
        type: 'remote-trigger', // Ein neuer Nachrichtentyp für das Figma-Plugin
        payload: {
            triggeredBy: actionId, // Welcher Button auf der Webseite wurde geklickt
            timestamp: new Date().toISOString(),
            // Du kannst hier die 'customMessage' oder andere spezifische Daten einfügen
            data: customMessage || `Aktion ${actionId} ausgelöst`,
        }
    };

    broadcastMessage(websocketMessageToFigma);

    res.status(200).json({ success: true, message: `Aktion '${actionId}' an Figma-Plugin(s) weitergeleitet.` });
});


// Bestehende Endpunkte (optional, falls du sie noch brauchst)
app.get('/api/config', (req, res) => res.json(hardwareConfiguration));
app.post('/api/config', (req, res) => {
    hardwareConfiguration = req.body;
    broadcastMessage({ type: 'config-updated', payload: hardwareConfiguration });
    res.status(200).json({ message: 'Konfiguration aktualisiert.', config: hardwareConfiguration });
});
app.get('/api/status', (req, res) => res.json(hardwareStatus));
app.post('/api/status', (req, res) => {
    hardwareStatus = { ...hardwareStatus, ...req.body };
    broadcastMessage({ type: 'status-updated', payload: hardwareStatus });
    res.status(200).json({ message: 'Status aktualisiert.', status: hardwareStatus });
});

// --- Server starten ---
server.listen(PORT, HOST, () => {
    console.log(`Server läuft auf http://${HOST}:${PORT} und ist im lokalen Netzwerk erreichbar.`);
    console.log(`WebSocket Server lauscht auf Port ${PORT}`);
    console.log(`Die Web-Oberfläche ist erreichbar unter http://DEINE_LOKALE_IP:${PORT}`);
    console.log("Finde deine lokale IP-Adresse mit 'ipconfig' (Windows) oder 'ifconfig'/'ip addr' (macOS/Linux).");
});
