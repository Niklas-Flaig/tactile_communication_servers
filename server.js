// server.js
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors'); // NEU: CORS-Middleware importieren

// PORT wird von der Hosting-Plattform (z.B. Railway) über Umgebungsvariablen gesetzt.
// Fallback auf 3001 für lokale Entwicklung.
const PORT = process.env.PORT || 3001;
// HOST auf '0.0.0.0' setzen, damit der Server auf allen Netzwerkschnittstellen lauscht,
// was für die meisten Hosting-Plattformen notwendig ist.
const HOST = '0.0.0.0'; 

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
app.use(express.static(path.join(__dirname, 'public'))); // Stellt statische Dateien aus dem 'public'-Ordner bereit

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const figmaPluginClients = new Set(); 
const webRemoteClients = new Set();   

let currentFigmaActiveComponentState = null; 

console.log("Hardware Connector Server (v3 - Hosting Ready) wird initialisiert...");

// --- WebSocket Server Logik ---
wss.on('connection', (ws, req) => {
  // req.socket.remoteAddress kann bei Proxies die Proxy-IP sein.
  // Besser ist es, x-forwarded-for zu verwenden, falls von der Plattform gesetzt.
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.log(`Neuer WebSocket-Client verbunden von IP: ${clientIp}`);

  // Sende initiale Daten (falls vorhanden) an den neu verbundenen Client,
  // besonders wichtig für Web Remotes, die den aktuellen Figma-Status brauchen.
  if (currentFigmaActiveComponentState) {
    ws.send(JSON.stringify({ type: 'figma-selection-update', payload: { activeComponent: currentFigmaActiveComponentState } }));
  }

  ws.on('message', (messageAsString) => {
    try {
      const message = JSON.parse(messageAsString);
      console.log('Nachricht vom WebSocket-Client empfangen:', message.type, message.payload || '');

      switch (message.type) {
        case 'ui-state-to-server': 
          if (message.payload && typeof message.payload.activeComponent !== 'undefined') {
            // console.log('Figma UI State vom Plugin empfangen:', message.payload.activeComponent?.name || 'Keine aktive Komponente');
            currentFigmaActiveComponentState = message.payload.activeComponent;
            figmaPluginClients.add(ws); 
            webRemoteClients.delete(ws); 
            broadcastToWebRemotes({ type: 'figma-selection-update', payload: { activeComponent: currentFigmaActiveComponentState } });
          }
          break;
        
        case 'web-remote-connected':
            console.log('Web Remote UI hat sich identifiziert.');
            webRemoteClients.add(ws);
            figmaPluginClients.delete(ws);
            if (currentFigmaActiveComponentState) {
                ws.send(JSON.stringify({ type: 'figma-selection-update', payload: { activeComponent: currentFigmaActiveComponentState } }));
            }
            break;
        
        // trigger-prototype-action bleibt hier, falls du es auch per WebSocket direkt vom Plugin auslösen willst
        case 'trigger-prototype-action': 
          console.log('WebSocket: Aktion für Prototyp empfangen:', message.payload);
          broadcastToFigmaPlugins({ type: 'prototype-action-triggered', payload: message.payload }); // Nachricht an Plugin UI
          break;
          
        default:
          console.log('Unbekannter WebSocket-Nachrichtentyp vom Client:', message.type);
      }
    } catch (error) {
      console.error('Fehler beim Verarbeiten der WebSocket-Nachricht:', error, messageAsString);
    }
  });

  ws.on('close', () => {
    console.log(`WebSocket-Client von IP ${clientIp} hat Verbindung getrennt`);
    figmaPluginClients.delete(ws);
    webRemoteClients.delete(ws);
  });
  ws.on('error', (error) => console.error(`WebSocket Fehler von IP ${clientIp}:`, error));
});

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

  if (!componentId || !endpointId || !buttonId) {
    return res.status(400).json({ error: 'componentId, endpointId und buttonId sind erforderlich.' });
  }

  console.log(`HTTP: Trigger für Endpunkt empfangen: CompID='${componentId}', EpID='${endpointId}', BtnID='${buttonId}'`);

  // Die Nachricht, die an die Figma Plugin UI gesendet wird.
  const websocketMessageToFigmaPlugin = { // Typ-Annotation, falls RemoteEndpointTriggerToPluginUI serverseitig bekannt ist
    type: 'remote-endpoint-trigger', 
    payload: {
      componentId,
      endpointId,
      buttonId,
      timestamp: new Date().toISOString(),
    }
  };
  broadcastToFigmaPlugins(websocketMessageToFigmaPlugin);
  res.status(200).json({ success: true, message: `Trigger für Endpunkt '${buttonId}' an Figma weitergeleitet.` });
});


// --- Server starten ---
server.listen(PORT, HOST, () => {
  console.log(`Server läuft auf Port ${PORT} und lauscht auf allen Interfaces (${HOST}).`);
  console.log(`Stelle sicher, dass deine Clients (Figma Plugin UI, Web Remote) jetzt auf die korrekte gehostete URL zugreifen.`);
  console.log(`Für lokale Tests ist die Web-Oberfläche weiterhin erreichbar unter http://localhost:${PORT} oder http://DEINE_LOKALE_IP:${PORT}`);
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
