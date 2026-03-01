import { ICardReader, ICryptographyService } from './interfaces.js';

export class MockCardReader implements ICardReader {
    public enabled = false;

    async initialize() {
        console.log('[MockCardReader] Initialized');
    }

    async enableInput() {
        this.enabled = true;
        console.log('[MockCardReader] Bezel enabled. Waiting for card...');
    }

    async disableInput() {
        this.enabled = false;
        console.log('[MockCardReader] Bezel disabled.');
    }

    async readTracks() {
        if (!this.enabled) throw new Error('Card reader is disabled');
        return {
            track1: 'B455610000000000^NAME/USER^25121010000',
            track2: '4556100000000000=25121010000'
        };
    }

    async ejectCard() {
        console.log('[MockCardReader] Ejected card to customer.');
    }

    async retainCard() {
        console.log('[MockCardReader] Retained card into bin.');
    }
}

export class MockCryptoService implements ICryptographyService {
    async initialize() {
        console.log('[MockCrypto] Initialized');
    }

    async loadMasterKey(_key: string) {
        console.log('[MockCrypto] Master key loaded.');
    }

    async loadCommunicationKey(_encryptedKey: string) {
        console.log('[MockCrypto] Communication key loaded.');
    }

    async generatePinBlock(pan: string, pin: string) {
        // Mock X9.8 PIN block generation
        return `04${pin.padEnd(14, 'F')}`; // Simplified dummy block
    }

    async generateMAC(data: string) {
        return 'ABC123FF'; // Dummy MAC
    }

    async validateMAC(data: string, mac: string) {
        return mac === 'ABC123FF';
    }
}
