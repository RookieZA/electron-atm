/**
 * Represents the Card Reader Device
 */
export interface ICardReader {
    /** Connect or initialize the reader */
    initialize(): Promise<void>;
    /** Enables the card reader bezel to accept cards */
    enableInput(): Promise<void>;
    /** Disables the card reader */
    disableInput(): Promise<void>;
    /** Reads Track 1 and Track 2 data from an inserted card */
    readTracks(): Promise<{ track1: string; track2: string }>;
    /** Ejects the card back to the customer */
    ejectCard(): Promise<void>;
    /** Retains (swallows) the card into a secure bin */
    retainCard(): Promise<void>;
}

/**
 * Represents the Cash Dispenser Device
 */
export interface IDispenser {
    initialize(): Promise<void>;
    /** Dispenses exact amount based on notes in cassettes */
    dispense(amount: number): Promise<void>;
    /** Presents the dispensed bills through the shutter to the user */
    presentToUser(): Promise<void>;
    /** Retracts bills that the user failed to take within the timeout */
    retractBills(): Promise<void>;
}

/**
 * Represents the Encrypting PIN Pad (EPP / Crypto Module)
 */
export interface ICryptographyService {
    initialize(): Promise<void>;
    /** Loads a new Master Key */
    loadMasterKey(key: string): Promise<void>;
    /** Loads a new Communication Key (encrypted under Master Key) */
    loadCommunicationKey(encryptedKey: string): Promise<void>;
    /** Formats numeric input into an encrypted PIN Block (typically ANSI X9.8) */
    generatePinBlock(pan: string, pin: string): Promise<string>;
    /** Generates a Message Authentication Code (MAC) for a payload */
    generateMAC(data: string): Promise<string>;
    /** Validates a MAC from the host */
    validateMAC(data: string, mac: string): Promise<boolean>;
}

/**
 * The unified container holding all connected hardware
 */
export interface IHardwareServices {
    reader: ICardReader;
    dispenser: IDispenser;
    crypto: ICryptographyService;
}
