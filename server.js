// server.js
console.log("Server-Skript wird gestartet..."); // Allererste Log-Ausgabe
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors'); // NEU: CORS-Middleware importieren

const Socket = require('./socket'); // Importiere die Socket-Klasse aus socket.js

// PORT wird von der Hosting-Plattform (z.B. Railway) über Umgebungsvariablen gesetzt.
// Fallback auf 3001 für lokale Entwicklung.
const PORT = process.env.PORT || 3001;


/*  START EXPRESS SERVER */
const app = express();
// CORS-Middleware aktivieren, um Anfragen von Figma-Domains zu erlauben
app.use(cors({
    origin: ['https://www.figma.com', 'https://figma.com'], // Erlaube Figma-Domains
}));
app.use(express.json()); // Für das Parsen von JSON-Request-Bodies
app.use(express.static(path.join(__dirname, '/public'))); // Stellt statische Dateien aus dem 'public'-Ordner bereit
console.log("Express App initialisiert.");


/* START WEBSOCKET SERVER */
const server = http.createServer(app);
console.log("HTTP-Server erstellt.");
const WebSocketServer = new WebSocket.Server({ server });
console.log("WebSocket-Server erstellt und an HTTP-Server gebunden.");

const figmaPluginClients = new Set();
let driverSoftwareClient;

let data = {};

console.log("Hardware Connector Server wird initialisiert...");


// --- WebSocket Server Logik ---
WebSocketServer.on('connection', (client, req) => {

    const clientIp = req.socket.remoteAddress || 'Unbekannt';

    const newSocket = new Socket(client, clientIp, (message) => {
        console.log(`Nachricht von Figma Plugin Client (${clientIp}):`, message);
        // Hier kannst du weitere Logik für Nachrichten vom Figma Plugin Client hinzufügen
    });
    
    console.log(`Neue WebSocket-Verbindung von IP: ${clientIp}`);


    // --- Client-Typen identifizieren ---
    if (req.headers['role'].includes('Figma')) {
        console.log("Client Registriert als Figma Plugin.");
        figmaPluginClients.add(socketConnection); // Figma Plugin UI Client
        
    } else if (req.headers['role'].includes('Driver')) {
        if (driverSoftwareClient) {
            console.warn("Ein Driver-Client ist bereits verbunden. Ignoriere neue Verbindung.");
            client.close(1008, "Ein Driver-Client ist bereits verbunden.");
            return; // Beende die Verarbeitung dieser Verbindung
        }
        
        console.log("Neue Driver Software Verbindung hergestellt.");
        driverSoftwareClient = socketConnection; // Driver Software Client (z.B. Electron App)

    } else {
        console.log("Unbekannter Client-Typ. Verbindung wird geschlossen.");
        client.close(1008, "Unbekannter Client-Typ. Verbindung wird geschlossen.");
        return;
    }

});

function sendToDriver(messageObject) {
    const messageString = JSON.stringify(messageObject);
    if (driverSoftwareClient.size > 0) {
        console.log(`Sende an ${driverSoftwareClient.size} Driver-Software Client(s) (Typ: ${messageObject.type})`);
        driverSoftwareClient.forEach((client) => {
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





console.log(`Versuche Server auf Port ${PORT} zu starten...`);
server.listen(PORT, () => {
    console.log(`✅ Plugin Communication Server läuft erfolgreich auf Port ${PORT}`);
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
