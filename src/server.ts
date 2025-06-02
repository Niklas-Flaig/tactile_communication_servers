// server.ts
console.log("Server-Skript wird gestartet...");

import express, { Express, Request, Response } from 'express';
import http from 'http';
import WebSocket, { WebSocketServer as WSServer } from 'ws';
import path from 'path';
import cors from 'cors';
import { Socket, AppWebSocketMessage } from './socket'; // Import der vereinfachten Socket-Klasse


// -----------------------INIT EXPRESS---------------------------
const PORT: number = parseInt(process.env.PORT || "3002", 10);
const app: Express = express();

// CORS-Middleware für Figma-Plugin und lokale Entwicklung
app.use(cors({
    origin: ['https://www.figma.com', 'https://figma.com'],
    credentials: true // Wichtig, falls Figma Cookies/Header mitsendet, die relevant sind
}));
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

console.log("Express App initialisiert für statische Inhalte.");
// --------------------------------------------------------------



const httpServer: http.Server = http.createServer(app);
const webSocketServer: WSServer = new WSServer({ server: httpServer });

// Client-Verwaltung
const figmaClients = new Set<Socket>();
let driverClient: Socket | null = null;



webSocketServer.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {
    const clientIp = req.socket?.remoteAddress || req.headers['x-forwarded-for'] as string || 'Unbekannt';
    const roleHeader = req.headers['role'];
    let clientRole: string | undefined = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader;

    console.log(`[Server] Neue WebSocket-Verbindung von IP: ${clientIp}, Rolle: ${clientRole || 'Nicht spezifiziert'}`);

    let newSocket: Socket;

    if (clientRole?.toLowerCase().includes('figma')) { // init new Socket für Figma-Client
        newSocket = new Socket(ws, clientIp, 'Figma', (socketInstance: Socket, message: AppWebSocketMessage): void => {
            socketInstance.log(`Figma-Nachricht empfangen: Typ '${message.type}'`);
            // Beispiel: Leite alle Nachrichten vom Figma-Plugin an den Treiber weiter
            if (driverClient && driverClient.isOpen()) {
                driverClient.send(message);
            } else {
                socketInstance.log('Kein Treiber verbunden, um Figma-Nachricht weiterzuleiten.');
            }
            // Optional: Broadcast an andere Figma-Clients (außer dem Sender)
            // figmaClients.forEach(client => {
            //     if (client !== socketInstance && client.isOpen()) {
            //         client.send(message);
            //     }
            // });
        });

        // Füge den neuen Socket zu den Figma-Clients hinzu
        figmaClients.add(newSocket);
        newSocket.log('Als Figma-Client registriert.');
        // --------------------------------------------------------
    } else if (clientRole?.toLowerCase().includes('driver')) {
        if (driverClient && driverClient.isOpen()) {
            console.warn(`[Server] Ein Treiber ist bereits verbunden (${driverClient.name}). Schließe neue Treiber-Verbindung von ${clientIp}.`);
            ws.close(1013, "Ein Treiber-Client ist bereits verbunden. Bitte versuchen Sie es später erneut."); // 1013 Try Again Later
            return;
        }
        newSocket = new Socket(ws, clientIp, 'Driver', (socketInstance: Socket, message: AppWebSocketMessage): void => {
            socketInstance.log(`Treiber-Nachricht empfangen: Typ '${message.type}'`);
            // Leite alle Nachrichten vom Treiber an alle verbundenen Figma-Clients weiter
            let sentToCount = 0;
            figmaClients.forEach(client => {
                if (client.isOpen()) {
                    client.send(message);
                    sentToCount++;
                }
            });
            if (sentToCount > 0) {
                socketInstance.log(`Treiber-Nachricht an ${sentToCount} Figma-Client(s) weitergeleitet.`);
            } else {
                socketInstance.log('Keine Figma-Clients verbunden, um Treiber-Nachricht weiterzuleiten.');
            }
        });

        // Setze den Treiber-Client
        driverClient = newSocket;
        newSocket.log('Als Treiber-Client registriert.');
        // --------------------------------------------------------
    } else {
        console.warn(`[Server] Unbekannte Rolle oder kein 'role'-Header empfangen von IP: ${clientIp}. Schließe Verbindung.`);
        ws.close(1008, "Unbekannte Rolle oder kein 'role'-Header angegeben. Bitte überprüfen Sie Ihre Verbindung."); // 1008 Policy Violation
    }

    ws.on('close', (code: number, reason: Buffer) => {
        newSocket.log(`Verbindung geschlossen. Code: ${code}, Grund: ${reason.toString()}`);
        if (figmaClients.has(newSocket)) {
            figmaClients.delete(newSocket);
            console.log(`[Server] Figma-Client ${newSocket.name} entfernt. Verbleibende Figma-Clients: ${figmaClients.size}`);
        } else if (driverClient === newSocket) {
            driverClient = null;
            console.log(`[Server] Treiber-Client ${newSocket.name} entfernt.`);
        }
    });

    ws.on("error", (error: Error) => {
        // newSocket ist hier möglicherweise noch nicht vollständig initialisiert oder bereits entfernt
        // Daher ist es sicherer, direkt auf console.error zurückzugreifen oder eine ID zu verwenden, falls verfügbar.
        console.error(`[Server] WebSocket-Fehler für Verbindung von ${clientIp} (Rolle: ${clientRole || 'N/A'}):`, error.message);
        // Die 'close'-Veranstaltung wird normalerweise nach 'error' ausgelöst, was das Cleanup übernimmt.
    });
});

console.log("WebSocket Server initialisiert.");




// Produktionsrelevante Listener für den HTTP-Server
httpServer.listen(PORT, () => {
    console.log(`[Server] ✅ Server läuft erfolgreich auf Port ${PORT}`);
    console.log(`   Status-Seite erreichbar unter http://localhost:${PORT}`);
    console.log("[Server] Warte auf WebSocket-Verbindungen...");
});

httpServer.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[Server] 🚨 HTTP Server Fehler:', error);
    if (error.syscall !== 'listen') throw error;
    switch (error.code) {
        case 'EACCES':
            console.error(`[Server] Port ${PORT} erfordert erhöhte Rechte.`); process.exit(1); break;
        case 'EADDRINUSE':
            console.error(`[Server] Port ${PORT} wird bereits verwendet.`); process.exit(1); break;
        default: throw error;
    }
});

// Globale Fehler-Handler für mehr Stabilität in Produktion
process.on('uncaughtException', (error: Error, origin: string) => {
    console.error(`[Server] 🚨 Uncaught Exception: ${error.message}`, `Origin: ${origin}`, error.stack);
    // In Produktion könnte hier ein Neustartmechanismus (z.B. mit PM2) greifen
    // oder zumindest ein Logging an einen externen Dienst erfolgen.
    process.exit(1); // Erzwingt sauberen Neustart durch Orchestrierungstools
});

process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('[Server] 🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

console.log("[Server] Globale Fehler-Handler registriert.");
