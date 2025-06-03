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
    public readonly id: string = "unset";

    log(message?: any, ...optionalParams: any[]): void {
        console.log(`[Channel ${this.id}]`.padEnd(20), message, ...optionalParams);
    }
    warn(message?: any, ...optionalParams: any[]): void {
        console.warn(`[Channel ${this.id}]`.padEnd(20), message, ...optionalParams);
    }
    error(message?: any, ...optionalParams: any[]): void {
        console.error(`[Channel ${this.id}]`.padEnd(20), message, ...optionalParams);
    }

    constructor(id: string) {
        this.id = id;
        this.log('Channel-Instanz erstellt.');
    }



    addFigmaClient(client: FigmaCLient): void {
        if (this.figmaClients.has(client)) {
            this.warn(`Figma-Client ${client.name} ist bereits verbunden.`);
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
                this.warn(`Unbekannter Roh-Nachrichtentyp empfangen: ${typeof data}`);
                return;
            }

            try {
                const parsedMessage = JSON.parse(rawMessageData);

                switch (parsedMessage.type) {
                    case 'ping':
                        // Ping-Nachrichten ignorieren oder verarbeiten
                        this.log(`Ping-Nachricht von ${client.name} empfangen.`);
                        break;

                    case 'figma-message':
                        this.log(`Figma-Nachricht von ${client.name} empfangen:`, parsedMessage.data);
                        break;

                    default:
                        this.warn('Unbekannter Nachrichtentyp empfangen:', parsedMessage.type);
                }

            } catch (e: any) {
                this.error('Fehler beim Parsen der Nachricht als JSON:', rawMessageData.substring(0, 200), e.message);
            }
        });

        client.socket.on('close', (code: number, reason: Buffer) => {
            if (code === 1000) {
                this.log(`Figma-Client ${client.name} Verbindung geschlossen. Code: ${code}, Grund: ${reason.toString()}`);
            } else {
                this.warn(`Figma-Client ${client.name} Verbindung unerwartet geschlossen. Code: ${code}, Grund: ${reason.toString() || 'Kein Grund angegeben'}`);
            }
            this.removeFigmaClient(client);
        });

        client.socket.on('error', (error: Error) => {
            this.error(`Fehler bei Figma-Client ${client.name}:`, error.message);
        });

        this.log(`Figma-Client hinzugefügt. Aktuelle Anzahl: ${this.figmaClients.size}`);
    }

    sendToFigmaClients(message: Message): void {
        this.figmaClients.forEach(client => {
            if (client.socket.readyState === WebSocket.OPEN) {
                client.socket.send(JSON.stringify(message));
            } else {
                this.warn(`Figma-Client ${client.name} ist nicht verbunden, Nachricht nicht gesendet:`, message.type);
            }
        });
    }

    removeFigmaClient(client: FigmaCLient): void {
        this.figmaClients.delete(client);
        this.log(`Figma-Client entfernt. Aktuelle Anzahl: ${this.figmaClients.size}`);
    }


    setDriverClient(client: DriverClient): void {
        if (this.driverClient) {
            this.warn('Ein Treiber-Client ist bereits verbunden. Der alte Treiber-Client wird ersetzt.');
        }
        this.driverClient = client;

        client.socket.on('message', (data: WebSocket.Data) => {
            
            let rawMessageData: string;
            if (typeof data === 'string')           rawMessageData = data;
            else if (Buffer.isBuffer(data))         rawMessageData = data.toString();
            else if (data instanceof ArrayBuffer)   rawMessageData = new TextDecoder().decode(data);
            else {
                this.warn(`Unbekannter Roh-Nachrichtentyp empfangen: ${typeof data}`);
                return;
            }


            try {
                const parsedMessage = JSON.parse(rawMessageData);
                if (parsedMessage.type === 'driver-message' && typeof parsedMessage.data === 'string') {
                    this.sendToDriverClient(parsedMessage);
                } else {
                    this.warn('Ungültiges Nachrichtenformat empfangen:', rawMessageData.substring(0, 200));
                }
            } catch (e: any) {
                this.error('Fehler beim Parsen der Nachricht als JSON:', rawMessageData.substring(0, 200), e.message);
            }
        });

        client.socket.on('close', (code: number, reason: Buffer) => {
            if (code === 1000) {
                this.log(`Treiber-Client Verbindung geschlossen. Code: ${code}, Grund: ${reason.toString()}`);
            } else {
                this.warn(`Treiber-Client Verbindung unerwartet geschlossen. Code: ${code}, Grund: ${reason.toString() || 'Kein Grund angegeben'}`);
            }
            this.removeDriverClient();
        });

        client.socket.on('error', (error: Error) => {
            this.error(`Fehler bei Treiber-Client:`, error.message);
        });

        this.log('Treiber-Client gesetzt.');
    }

    sendToDriverClient(message: Message): void {
        if (this.driverClient && this.driverClient.socket.readyState === WebSocket.OPEN) {
            this.driverClient.socket.send(JSON.stringify(message));
        } else {
            this.warn('Kein verbundener Treiber-Client, Nachricht nicht gesendet:', message.type);
        }
    }

    removeDriverClient(): void {
        if (this.driverClient) {
            this.log('Treiber-Client entfernt.');
            this.driverClient = null;
        } else {
            this.warn('Kein Treiber-Client zum Entfernen gefunden.');
        }
    }
}
