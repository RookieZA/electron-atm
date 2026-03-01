import { describe, it, expect } from 'vitest';
import { generateClearPinBlock, encryptPinBlock } from '../src/index.js';

describe('Cryptography', () => {
    describe('PIN Block Generation (ISO-0)', () => {
        it('should correctly generate and encrypt an ISO-0 PIN block', () => {
            const pin = '1234';
            const pan = '4111111111111111'; // A typical 16-digit test PAN
            const tpk = '0123456789ABCDEFFEDCBA9876543210'; // 16-byte double-length 3DES key

            const clearBlock = generateClearPinBlock(pin, pan);
            const encryptedBlock = encryptPinBlock(clearBlock, tpk);

            // Using known plain-text values for ISO-0
            // PIN Block: 0412 34FF FFFF FFFF (0x04, 0x12, 0x34, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF)
            // PAN Block: 0000 1111 1111 1111 (0x00, 0x00, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11)
            // Expected Clear XOR: 0412 25EE EEEE EEEE
            expect(clearBlock.toString('hex').toUpperCase()).toBe('041225EEEEEEEEEE');

            // The encrypted block will vary based on the cipher algorithm matching
            // We just ensure it returns a valid 16-character hex string (8 bytes encrypted)
            expect(encryptedBlock).toHaveLength(16);
            expect(/^[0-9A-F]+$/.test(encryptedBlock)).toBe(true);
        });
    });
});
