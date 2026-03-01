import { IHostConnection } from './interfaces.js';
import { NDCMessage, MessageClass, MessageType } from '@atm/protocol';

export class MockHostConnection implements IHostConnection {
    private connected = false;
    private messageCallback?: (msg: NDCMessage) => void;
    private disconnectCallback?: () => void;

    async connect(ip: string, port: number) {
        this.connected = true;
        console.log(`[MockHost] Connected to ${ip}:${port}`);
    }

    async disconnect() {
        this.connected = false;
        console.log('[MockHost] Disconnected');
        if (this.disconnectCallback) this.disconnectCallback();
    }

    async send(message: NDCMessage) {
        if (!this.connected) throw new Error('Not connected to host');
        console.log(`[MockHost] Received Terminal Message: ${message.messageClass}`);

        // Simulate an Authorisation response after 1 second
        if (message.messageClass === MessageClass.UnsolicitedStatus) {
            setTimeout(() => {
                if (this.messageCallback) {
                    this.messageCallback({
                        logicalUnitNumber: message.logicalUnitNumber,
                        messageClass: MessageClass.TerminalCommand, // Host sends Command to dispense
                        raw: `${message.logicalUnitNumber}42` // Dummy Command
                    });
                }
            }, 1000);
        }
    }

    onMessage(callback: (message: NDCMessage) => void) {
        this.messageCallback = callback;
    }

    onDisconnect(callback: () => void) {
        this.disconnectCallback = callback;
    }

    isConnected() {
        return this.connected;
    }
}
