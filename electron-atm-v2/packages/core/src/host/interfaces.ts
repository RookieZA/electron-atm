import { NDCMessage } from '@atm/protocol';

export interface IHostConnection {
    connect(ip: string, port: number): Promise<void>;
    disconnect(): Promise<void>;
    send(message: NDCMessage): Promise<void>;
    onMessage(callback: (message: NDCMessage) => void): void;
    onDisconnect(callback: () => void): void;
    isConnected(): boolean;
}
