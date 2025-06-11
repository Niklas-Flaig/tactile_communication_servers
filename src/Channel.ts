// socket.ts
import WebSocket from 'ws';
import { PluginToServer, ServerToPlugin, ServerToDriver } from './messages';

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
    public readonly id: string;

    log(message?: any, ...optionalParams: any[]): void {
        console.log(`[Channel ${this.id}]`.padEnd(30), message, ...optionalParams);
    }
    warn(message?: any, ...optionalParams: any[]): void {
        console.warn(`[Channel ${this.id}]`.padEnd(30), message, ...optionalParams);
    }
    error(message?: any, ...optionalParams: any[]): void {
        console.error(`[Channel ${this.id}]`.padEnd(30), message, ...optionalParams);
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
            if (typeof data === 'string') rawMessageData = data;
            else if (Buffer.isBuffer(data)) rawMessageData = data.toString();
            else if (data instanceof ArrayBuffer) rawMessageData = new TextDecoder().decode(data);
            else {
                this.warn(`Unbekannter Roh-Nachrichtentyp empfangen: ${typeof data}`);
                return;
            }

            try {
                const parsedMessage = JSON.parse(rawMessageData) as PluginToServer;

                switch (parsedMessage.type) {

                    case 'get-connected-components':
                        this.log(`Anfrage nach allen Komponenten von ${client.name} empfangen.`);
                        this.log('forward get-connected-components to driverClient');
                        // Hier kannst du die Logik hinzufügen, um alle Komponenten zu senden
                        this.sendToDriverClient({ type: 'get-connected-components' });
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

    sendToFigmaClients(message: ServerToPlugin): void {
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
            if (typeof data === 'string') rawMessageData = data;
            else if (Buffer.isBuffer(data)) rawMessageData = data.toString();
            else if (data instanceof ArrayBuffer) rawMessageData = new TextDecoder().decode(data);
            else {
                this.warn(`Unbekannter Roh-Nachrichtentyp empfangen: ${typeof data}`);
                return;
            }


            try {
                const parsedMessage = JSON.parse(rawMessageData);

                switch (parsedMessage.type) {
                    case 'connected-components':
                        this.log(`Verbundene Komponenten von Treiber-Client empfangen:`, parsedMessage.components);
                        // Hier kannst du die Logik hinzufügen, um die Komponenten zu verarbeiten
                        this.sendToFigmaClients({ type: 'connected-components', components: parsedMessage.components });
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

    sendToDriverClient(message: ServerToDriver): void {
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
