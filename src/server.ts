// server.ts
console.log("Server-Skript wird gestartet...");

import express, { Express, Request, Response } from 'express';
import http from 'http';
import WebSocket, { WebSocketServer as WSServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import cors from 'cors';
import { ChannelInstance, FigmaCLient, DriverClient } from './Channel';



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



// -----------------------INIT WEBSOCKET SERVER---------------------------
const httpServer: http.Server = http.createServer(app);
const webSocketServer: WSServer = new WSServer({ server: httpServer });

const channels: Map<string, ChannelInstance> = new Map();


webSocketServer.on('connection', (ws: WebSocket, req: http.IncomingMessage) => {



    // ------------------------INIT CLIENT-----------------------
    const clientIp = req.socket?.remoteAddress || req.headers['x-forwarded-for'] as string || 'Unbekannt';

    const clientTypeHeader = req.headers['x-client-id'];
    console.log(clientTypeHeader);
    const clientType: string | undefined = Array.isArray(clientTypeHeader) ? clientTypeHeader[0] : clientTypeHeader;

    if (!clientType) {
        console.warn(`[Server] Kein 'x-client-id'-Header angegeben von IP: ${clientIp}. Verbindung wird geschlossen.`);
        ws.close(1008, "Kein 'x-client-id'-Header angegeben"); // 1008 Policy Violation
        return;
    }
    // -----------------------------------------------------------



    // ------------------------INIT CHANNEL-----------------------
    const channelID = req.headers['x-channel-id'] as string | undefined;
    if (!channelID) {
        console.warn(`[Server] Kein 'x-channel-id'-Header angegeben von IP: ${clientIp}. Verbindung wird geschlossen.`);
        ws.close(1008, "Kein 'x-channel-id'-Header angegeben"); // 1008 Policy Violation
        return;
    }

    let channel = channelID ? channels.get(channelID) : undefined;

    if (!channel) {
        console.log(`[Server] Neuer Channel wird erstellt für ID: ${channelID}`);
        const newChannel = new ChannelInstance();
        channels.set(channelID, newChannel);
        channel = newChannel;
    }
    // ------------------------------------------------------------



    console.log(`[Server] Neue WebSocket-Verbindung von IP: ${clientIp}, Client Typ: ${clientType}, Channel ID: ${channelID}`);


    if (clientType?.toLowerCase().includes('figma')) {
        // Figma-Client hinzufügen
        const figmaClient: FigmaCLient = {
            socket: ws,
            id: uuidv4(),
            ip: clientIp,
            name: `[FigmaSocket ${uuidv4()}]`
        };

        channel.addFigmaClient(figmaClient);

    } else if (clientType?.toLowerCase().includes('driver')) {
        // Driver-Client setzen
        const driverClient: DriverClient = {
            socket: ws,
            id: uuidv4(),
            ip: clientIp,
            name: "[DriverSocket]"
        };

        channel.setDriverClient(driverClient);

    } else {
        console.warn(`[Server] Unbekannter Client Typ oder kein 'x-client-id'-Header empfangen von IP: ${clientIp}. Schließe Verbindung.`);
        ws.close(1008, clientType ? `Der ClientType: ${clientType} ist unbekannt.` : "Kein 'x-client-id'-Header angegeben"); // 1008 Policy Violation

    }

    ws.on("error", (error: Error) => {
        console.error(`[Server] WebSocket-Fehler für Verbindung von ${clientIp} (Client Typ: ${clientType || 'N/A'}, Channel ID: ${channelID || 'N/A'}):`, error.message);
    });

});


console.log("WebSocket Server initialisiert.");



// Produktionsrelevante Listener für den HTTP-Server
httpServer.listen(PORT, () => console.log(`[Server] Server läuft erfolgreich auf Port ${PORT}`));

httpServer.on('error', (error: NodeJS.ErrnoException) => {
    console.error('[Server] HTTP Server Fehler:', error);
    if (error.syscall !== 'listen') throw error;

    switch (error.code) {
        case 'EACCES':
            console.error(`[Server] Port ${PORT} erfordert erhöhte Rechte.`); process.exit(1); break;
        case 'EADDRINUSE':
            console.error(`[Server] Port ${PORT} wird bereits verwendet.`); process.exit(1); break;
        default: throw error;
    }
});



// -----------------------GLOBAL ERROR HANDLER---------------------------
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
// -----------------------------------------------------------------------

console.log("[Server] Globale Fehler-Handler registriert.");
