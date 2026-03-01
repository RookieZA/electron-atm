import { describe, it, expect } from 'vitest';
import { MockCardReader, MockCryptoService } from '../src/hardware/mockHardware.js';

describe('Mock Hardware Services', () => {
    describe('MockCardReader', () => {
        it('should initialize without errors', async () => {
            const reader = new MockCardReader();
            await expect(reader.initialize()).resolves.toBeUndefined();
        });

        it('should read tracks after being enabled', async () => {
            const reader = new MockCardReader();
            await reader.initialize();
            await reader.enableInput();
            const tracks = await reader.readTracks();
            expect(tracks.track1).toContain('NAME/USER');
            expect(tracks.track2).toContain('4556100000000000');
        });

        it('should throw an error if reading tracks before enabling', async () => {
            const reader = new MockCardReader();
            await reader.initialize();
            await expect(reader.readTracks()).rejects.toThrow('Card reader is disabled');
        });

        it('should disable input correctly', async () => {
            const reader = new MockCardReader();
            await reader.enableInput();
            expect(reader.enabled).toBe(true);
            await reader.disableInput();
            expect(reader.enabled).toBe(false);
        });
    });

    describe('MockCryptoService', () => {
        it('should initialize without errors', async () => {
            const crypto = new MockCryptoService();
            await expect(crypto.initialize()).resolves.toBeUndefined();
        });

        it('should generate a PIN block', async () => {
            const crypto = new MockCryptoService();
            const block = await crypto.generatePinBlock('4556100000000000', '1234');
            expect(block).toMatch(/^04/); // Should start with 04 (format indicator)
        });

        it('should generate a MAC', async () => {
            const crypto = new MockCryptoService();
            const mac = await crypto.generateMAC('some-payload');
            expect(mac).toBeTruthy();
            expect(mac).toHaveLength(8);
        });

        it('should validate a correct MAC', async () => {
            const crypto = new MockCryptoService();
            const mac = await crypto.generateMAC('some-payload');
            const valid = await crypto.validateMAC('some-payload', mac);
            expect(valid).toBe(true);
        });

        it('should reject an incorrect MAC', async () => {
            const crypto = new MockCryptoService();
            const valid = await crypto.validateMAC('some-payload', 'BADMAC00');
            expect(valid).toBe(false);
        });
    });
});
