// socket.ts
import WebSocket from 'ws';


type Message =
    | { type: 'ping' }
    | { type: 'figma-message'; data: string } // z.B. JSON-String
    | { type: 'driver-message'; data: string } // z.B. JSON-String


export interface FigmaCLient {
    socket: WebSocket;
    id: string;
    ip: string;
    name: string; // z.B. "[FigmaSocket <ID>]"
}

export interface DriverClient {
    socket: WebSocket;
    id: string;
    ip: string;
    name: string; // z.B. "[DriverSocket <ID>]"
}


export class ChannelInstance {
    private figmaClients: Set<FigmaCLient> = new Set();
    private driverClient: DriverClient | null = null;
    public readonly id: string = "";

    constructor() {
        // Initialisiere den Channel
        console.log("[ChannelInstance]".padEnd(20), 'Channel-Instanz erstellt.');
    }




    addFigmaClient(client: FigmaCLient): void {
        if (this.figmaClients.has(client)) {
            console.warn("[ChannelInstance]".padEnd(20), `Figma-Client ${client.name} ist bereits verbunden.`);
            return;
        }

        // Füge den Figma-Client hinzu
        this.figmaClients.add(client);

        // add functions to WebSocket to handle messages
        client.socket.on('message', (data: WebSocket.Data) => {
            
            let rawMessageData: string;
            if (typeof data === 'string')           rawMessageData = data;
            else if (Buffer.isBuffer(data))         rawMessageData = data.toString();
            else if (data instanceof ArrayBuffer)   rawMessageData = new TextDecoder().decode(data);
            else {
                console.warn("[ChannelInstance]".padEnd(20), `Unbekannter Roh-Nachrichtentyp empfangen: ${typeof data}`);
                return;
            }

            try {
                const parsedMessage = JSON.parse(rawMessageData);

                switch (parsedMessage.type) {
                    case 'ping':
                        // Ping-Nachrichten ignorieren oder verarbeiten
                        console.log("[ChannelInstance]".padEnd(20), `Ping-Nachricht von ${client.name} empfangen.`);
                        break;

                    case 'figma-message':
                        console.log("[ChannelInstance]".padEnd(20), `Figma-Nachricht von ${client.name} empfangen:`, parsedMessage.data);
                        break;

                    default:
                        console.warn("[ChannelInstance]".padEnd(20), 'Unbekannter Nachrichtentyp empfangen:', parsedMessage.type);
                }

            } catch (e: any) {
                console.error("[ChannelInstance]".padEnd(20), 'Fehler beim Parsen der Nachricht als JSON:', rawMessageData.substring(0, 200), e.message);
            }
        });

        client.socket.on('close', (code: number, reason: Buffer) => {
            console.log("[ChannelInstance]".padEnd(20), `Figma-Client ${client.name} Verbindung geschlossen. Code: ${code}, Grund: ${reason.toString()}`);
            this.removeFigmaClient(client);
        });

        client.socket.on('error', (error: Error) => {
            console.error("[ChannelInstance]".padEnd(20), `Fehler bei Figma-Client ${client.name}:`, error.message);
        });

        console.log("[ChannelInstance]".padEnd(20), `Figma-Client hinzugefügt. Aktuelle Anzahl: ${this.figmaClients.size}`);
    }

    sendToFigmaClients(message: Message): void {
        this.figmaClients.forEach(client => {
            if (client.socket.readyState === WebSocket.OPEN) {
                client.socket.send(JSON.stringify(message));
            } else {
                console.warn("[ChannelInstance]".padEnd(20), `Figma-Client ${client.name} ist nicht verbunden, Nachricht nicht gesendet:`, message.type);
            }
        });
    }

    removeFigmaClient(client: FigmaCLient): void {
        this.figmaClients.delete(client);
        console.log("[ChannelInstance]".padEnd(20), `Figma-Client entfernt. Aktuelle Anzahl: ${this.figmaClients.size}`);
    }


    setDriverClient(client: DriverClient): void {
        if (this.driverClient) {
            console.warn("[ChannelInstance]".padEnd(20), 'Ein Treiber-Client ist bereits verbunden. Der alte Treiber-Client wird ersetzt.');
        }
        this.driverClient = client;

        client.socket.on('message', (data: WebSocket.Data) => {
            
            let rawMessageData: string;
            if (typeof data === 'string')           rawMessageData = data;
            else if (Buffer.isBuffer(data))         rawMessageData = data.toString();
            else if (data instanceof ArrayBuffer)   rawMessageData = new TextDecoder().decode(data);
            else {
                console.warn("[ChannelInstance]".padEnd(20), `Unbekannter Roh-Nachrichtentyp empfangen: ${typeof data}`);
                return;
            }


            try {
                const parsedMessage = JSON.parse(rawMessageData);
                if (parsedMessage.type === 'driver-message' && typeof parsedMessage.data === 'string') {
                    this.sendToDriverClient(parsedMessage);
                } else {
                    console.warn("[ChannelInstance]".padEnd(20), 'Ungültiges Nachrichtenformat empfangen:', rawMessageData.substring(0, 200));
                }
            } catch (e: any) {
                console.error("[ChannelInstance]".padEnd(20), 'Fehler beim Parsen der Nachricht als JSON:', rawMessageData.substring(0, 200), e.message);
            }
        });

        client.socket.on('close', (code: number, reason: Buffer) => {
            console.log("[ChannelInstance]".padEnd(20), `Treiber-Client Verbindung geschlossen. Code: ${code}, Grund: ${reason.toString()}`);
            this.removeDriverClient();
        });

        client.socket.on('error', (error: Error) => {
            console.error("[ChannelInstance]".padEnd(20), `Fehler bei Treiber-Client:`, error.message);
        });

        console.log("[ChannelInstance]".padEnd(20), 'Treiber-Client gesetzt.');
    }

    sendToDriverClient(message: Message): void {
        if (this.driverClient && this.driverClient.socket.readyState === WebSocket.OPEN) {
            this.driverClient.socket.send(JSON.stringify(message));
        } else {
            console.warn("[ChannelInstance]".padEnd(20), 'Kein verbundener Treiber-Client, Nachricht nicht gesendet:', message.type);
        }
    }

    removeDriverClient(): void {
        if (this.driverClient) {
            console.log("[ChannelInstance]".padEnd(20), 'Treiber-Client entfernt.');
            this.driverClient = null;
        } else {
            console.warn("[ChannelInstance]".padEnd(20), 'Kein Treiber-Client zum Entfernen gefunden.');
        }
    }
}
