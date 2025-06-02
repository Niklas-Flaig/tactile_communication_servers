// socket.ts
import { v4 as uuidv4 } from 'uuid';
import WebSocket from 'ws';

// Definition der Nachrichtenstruktur
export interface AppWebSocketMessage {
    type: string;
    data: string; // Ein JSON-formatierter String
}

export class Socket {
    private ws: WebSocket; // Umbenannt von 'socket' zu 'ws' um Verwechslung mit 'Socket'-Klasse zu vermeiden
    public readonly id: string;
    public readonly name: string; // z.B. "[FigmaSocket <ID>]" oder "[DriverSocket <ID>]"
    public readonly clientIP: string | null;
    private messageHandlerCallback: (socketInstance: Socket, message: AppWebSocketMessage) => void;

    constructor(
        wsInstance: WebSocket,
        clientIP: string | undefined,
        socketTypeName: 'Figma' | 'Driver' | 'Unknown', // Für Logging und Unterscheidung
        handlerCallback: (socketInstance: Socket, message: AppWebSocketMessage) => void
    ) {
        this.ws = wsInstance;
        this.id = uuidv4();
        this.name = `[${socketTypeName} ${this.id}]`;
        this.clientIP = clientIP || null;
        this.messageHandlerCallback = handlerCallback;
        
        this.ws.onopen = () => this.log('WebSocket-Verbindung geöffnet');
        this.ws.onclose = (event: WebSocket.CloseEvent) => this.log(`WebSocket-Verbindung geschlossen. Code: ${event.code}, Grund: ${event.reason}`);
        this.ws.onerror = (error: WebSocket.ErrorEvent) => this.log('WebSocket-Fehler:', error.message);
        
        this.ws.onmessage = (event: WebSocket.MessageEvent) => {
            let rawMessageData: string;

            if (typeof event.data === 'string') {
                rawMessageData = event.data;
            } else if (Buffer.isBuffer(event.data)) {
                rawMessageData = event.data.toString();
            } else if (event.data instanceof ArrayBuffer) {
                rawMessageData = new TextDecoder().decode(event.data);
            } else {
                this.log('Unbekannter Roh-Nachrichtentyp empfangen:', typeof event.data);
                return; // Nicht verarbeitbaren Typ ignorieren
            }

            try {
                // Die gesamte Nachricht ist ein JSON-String, der 'type' und 'data' enthält
                const parsedMessage = JSON.parse(rawMessageData);

                // Validierung der erwarteten Struktur
                if (typeof parsedMessage.type === 'string' && typeof parsedMessage.data === 'string') {
                    const message: AppWebSocketMessage = {
                        type: parsedMessage.type,
                        data: parsedMessage.data // data ist bereits ein JSON-String
                    };
                    this.messageHandlerCallback(this, message);
                } else {
                    this.log('Ungültiges Nachrichtenformat empfangen:', rawMessageData.substring(0, 200));
                }
            } catch (e: any) {
                this.log('Fehler beim Parsen der Nachricht als JSON:', rawMessageData.substring(0, 200), e.message);
            }
        };
    }

    public isOpen(): boolean {
        return this.ws.readyState === WebSocket.OPEN;
    }

    public close(code: number = 1000, reason: string = "Verbindung vom Server geschlossen!"): void {
        this.ws.close(code, reason);
    }

    public send(message: AppWebSocketMessage): void {
        if (!this.isOpen()) {
            this.log('WebSocket nicht offen. Status:', this.ws.readyState, '. Nachricht nicht gesendet:', message.type);
            return;
        }

        try {
            // Die gesamte Nachricht (type + data) wird als ein JSON-String gesendet
            const messageString = JSON.stringify(message);
            this.ws.send(messageString, (error) => {
                if (error) {
                    this.log('Fehler beim Senden:', error.message);
                } else {
                    // Gekürztes Logging für 'data', da es lang sein kann
                    const dataPreview = message.data.length > 70 ? message.data.substring(0, 70) + '...' : message.data;
                    this.log(`Nachricht gesendet: Typ: ${message.type}, Data-Preview: ${dataPreview}`);
                }
            });
        } catch (e: any) {
            this.log('Fehler beim Serialisieren der Nachricht für den Versand:', e.message);
        }
    }

    public log(message: string, ...optionalParams: any[]): void {
        // Konvertiere zusätzliche Parameter sicher in Strings für das Logging
        const paramsString = optionalParams.map(p => {
            try {
                return typeof p === 'string' ? p : JSON.stringify(p);
            } catch {
                return '[nicht serialisierbar]';
            }
        }).join(' ');
        
        console.log(`${this.name.padEnd(45)} ${message} ${paramsString}`);
    }
}
