import { Socket } from 'net';
import { IHostConnection } from './interfaces.js';
import { NDCMessage, parseNDCMessage, buildNDCMessage } from '@atm/protocol';

export class TcpHostConnection implements IHostConnection {
    private client: Socket | null = null;
    private messageCallback?: (msg: NDCMessage) => void;
    private disconnectCallback?: () => void;
    private dataBuffer: string = '';

    async connect(ip: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.client) {
                this.client.destroy();
            }

            this.client = new Socket();

            this.client.connect(port, ip, () => {
                console.log(`[TcpHost] Connected to ${ip}:${port}`);
                resolve();
            });

            this.client.on('data', (data) => {
                // In a real implementation we would buffer and split by message framing (e.g. 2-byte length or STX/ETX)
                // For now, assuming each data chunk is a full string message or assembling them simply
                this.dataBuffer += data.toString('utf-8');

                // Very basic message extraction assuming complete messages arrive or there's no frame handling yet
                // Later we'll need protocol-specific extraction (STX...ETX...MAC)
                if (this.dataBuffer.length >= 10) {
                    try {
                        const parsed = parseNDCMessage(this.dataBuffer);
                        if (this.messageCallback) {
                            this.messageCallback(parsed);
                        }
                        this.dataBuffer = ''; // Clear after parsing
                    } catch (e) {
                        console.error('[TcpHost] Error parsing incoming data:', e);
                        // If parsing fails it might be incomplete, we keep buffering
                    }
                }
            });

            this.client.on('close', () => {
                console.log('[TcpHost] Connection closed');
                this.client = null;
                if (this.disconnectCallback) this.disconnectCallback();
            });

            this.client.on('error', (err) => {
                console.error(`[TcpHost] Connection error:`, err);
                if (!this.isConnected()) {
                    reject(err);
                }
            });
        });
    }

    async disconnect(): Promise<void> {
        return new Promise((resolve) => {
            if (this.client) {
                this.client.once('close', () => resolve());
                this.client.destroy();
            } else {
                resolve();
            }
        });
    }

    async send(message: NDCMessage): Promise<void> {
        if (!this.client || !this.isConnected()) {
            throw new Error('Not connected to host');
        }
        const rawString = buildNDCMessage(message);
        console.log(`[TcpHost] Sending: ${rawString}`);

        return new Promise((resolve, reject) => {
            this.client!.write(rawString, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    onMessage(callback: (message: NDCMessage) => void): void {
        this.messageCallback = callback;
    }

    onDisconnect(callback: () => void): void {
        this.disconnectCallback = callback;
    }

    isConnected(): boolean {
        return this.client !== null && !this.client.destroyed;
    }
}
