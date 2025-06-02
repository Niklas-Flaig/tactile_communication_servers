const uuidv4 = require('uuid').v4;


class Socket {
    /**
     * @param {WebSocket} socket
     * @param {string} clientIP
     * @param {function} handler
     */
    constructor(socket, clientIP) {
        this.socket = socket;
        this.socketId = uuidv4();
        this.name = `[Socket ${this.socketId}]`;

        this.clientIP = clientIP || null;

        this.init();
    }

    init() {
        this.socket.onopen = () => this.log('connection opened');
        this.socket.onclose = () => this.log('WebSocket connection closed');
        this.socket.onerror = (error) => this.log('WebSocket error:', error);

        this.socket.onmessage = this.handler.bind(this);
    }

    close(message) { this.socket.close(1000, message || "Connection closed by Server!"); };

    handler(message) { this.log(message.data); };

    send(message) {
        if (typeof message !== 'string') message = JSON.stringify(message);

        this.socket.send(message, (error) => {
            error ? console.error(this.name, 'send error:', error)
                : this.log(this.name, 'message sent:', message);
        });
    };


    log(message) {
        if (typeof message !== 'string') {
            message = JSON.stringify(message, null, 2);
        }
        console.log(this.name.padEnd(40), message);
    };
}


class FigmaSocket extends Socket {
    constructor(socket, clientIP) {
        super(socket, clientIP);
        this.name = `[FigmaSocket ${this.socketId}]`;
    }

    handler(message) {
        const data = JSON.parse(message.data);
        this.log(`Received Figma message: ${data.type} - ${data.payload}`);
        // Handle Figma-specific messages here
        if (this.handler) {
            this.handler(data);
        }
    }
}


class DriverSocket extends Socket {
    constructor(socket, clientIP, handler) {
        super(socket, clientIP, handler);
        this.name = `[DriverSocket ${this.socketId}]`;
    }

    handler(message) {
        const data = JSON.parse(message.data);
        this.log(`Received hardware message: ${data.type} - ${data.payload}`);
        // Handle hardware-specific messages here
        if (this.handler) {
            this.handler(data);
        }
    }
}


exports = {
    FigmaSocket,
    DriverSocket,
};
