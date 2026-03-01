import * as crypto from 'crypto';

/**
 * Decrypts a new Comms Key (or Mac Key) provided by the host.
 * The host sends the encrypted key as a decimal string.
 * @param masterKeyHex The Terminal Master Key in hex.
 * @param encryptedKeyDecimal The encrypted new key as a decimal string.
 * @param keyLengthHex Optional key length as hex string (e.g. '10' for 16 bytes/Double length).
 * @returns The decrypted new key as a hex string.
 */
export function decryptNewCommsKey(masterKeyHex: string, encryptedKeyDecimal: string, keyLengthHex?: string): string {
    // 1. Convert the encrypted decimal string into a hex block
    // Host typically sends up to 32 decimal digits (16 bytes) or 16 decimal digits (8 bytes).
    // We pad to ensure it aligns to 8 or 16 bytes depending on length.

    // Convert decimal string to BigInt, then to hex string.
    let hexStr = BigInt(encryptedKeyDecimal).toString(16);

    // Determine expected byte length (default 16 bytes for double length 3DES key)
    const expectedBytes = keyLengthHex ? parseInt(keyLengthHex, 16) : 16;
    const expectedHexChars = expectedBytes * 2;

    // Pad left with zeros to match the expected length
    hexStr = hexStr.padStart(expectedHexChars, '0');

    const encryptedBuffer = Buffer.from(hexStr, 'hex');
    const masterKeyBuffer = Buffer.from(masterKeyHex, 'hex');

    // 2. Decrypt using 3DES ECB with the Master Key
    const decipher = crypto.createDecipheriv('des-ede3-ecb', masterKeyBuffer, null);
    decipher.setAutoPadding(false); // Key blocks are exactly 8 or 16 bytes, no padding

    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('hex').toUpperCase();
}

/**
 * Calculates the Key Check Value (KCV) for a given key.
 * KCV is calculated by encrypting 8 or 16 bytes of zeros with the key using 3DES ECB,
 * and taking the first 3 bytes (6 hex characters) of the result.
 * @param keyHex The key to check in hex format.
 * @returns The first 6 hex characters of the ciphertext.
 */
export function getKeyCheckValue(keyHex: string): string {
    const keyBuffer = Buffer.from(keyHex, 'hex');
    const zeroBuffer = Buffer.alloc(8, 0); // Encrypt 8 bytes of zeroes

    const cipher = crypto.createCipheriv('des-ede3-ecb', keyBuffer, null);
    cipher.setAutoPadding(false);

    let encrypted = cipher.update(zeroBuffer);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    // Return first 3 bytes (6 hex chars)
    return encrypted.toString('hex').substring(0, 6).toUpperCase();
}
