import * as crypto from 'crypto';

/**
 * Generates an ISO-0 (Format 0) PIN block given a clear text PIN and the PAN.
 * @param pin The clear text PIN (4 to 12 digits)
 * @param pan The Primary Account Number (usually 16 to 19 digits)
 * @returns The hex representation of the clear PIN block before encryption
 */
export function generateClearPinBlock(pin: string, pan: string): Buffer {
    // 1. PIN Block construction
    // Format: 0, Length of PIN, PIN digits, padded with F
    let pinBlockStr = `0${pin.length}${pin}`.padEnd(16, 'F');
    const pinBlock = Buffer.from(pinBlockStr, 'hex');

    // 2. PAN Block construction
    // Format: four zeros, then the 12 right-most digits of the PAN excluding the check digit
    const panDigits = pan.substring(pan.length - 13, pan.length - 1);
    const panBlockStr = `0000${panDigits}`;
    const panBlock = Buffer.from(panBlockStr, 'hex');

    // 3. XOR the two blocks
    const resultBlock = Buffer.alloc(8);
    for (let i = 0; i < 8; i++) {
        resultBlock[i] = pinBlock[i] ^ panBlock[i];
    }

    return resultBlock;
}

/**
 * Encrypts a clear PIN block using Triple DES (3DES) with the given Terminal PIN Key (TPK).
 * @param clearPinBlock The 8-byte clear PIN block buffer
 * @param tpk The 16-byte (double length) or 24-byte (triple length) TPK hex string
 * @returns The encrypted PIN block as a hex string
 */
export function encryptPinBlock(clearPinBlock: Buffer, tpkHex: string): string {
    const tpkBuffer = Buffer.from(tpkHex, 'hex');

    // Ensure key is 24 bytes for Node's des-ede3-ecb 
    // If it's a 16-byte key (double-length 3DES), we need to append the first 8 bytes to the end
    let key = tpkBuffer;
    if (tpkBuffer.length === 16) {
        key = Buffer.concat([tpkBuffer, tpkBuffer.subarray(0, 8)]);
    }

    const cipher = crypto.createCipheriv('des-ede3-ecb', key, null);
    cipher.setAutoPadding(false);

    let encrypted = cipher.update(clearPinBlock);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    return encrypted.toString('hex').toUpperCase();
}
