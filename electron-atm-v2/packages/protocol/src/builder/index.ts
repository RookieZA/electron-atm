import { NDCMessage, MessageClass, TerminalCommand, SolicitedStatus, UnsolicitedStatus, WriteCommand, TransactionRequest } from '../types/messages.js';

/**
 * Serializes a typed NDCMessage object back into a raw NDC protocol string.
 */
export function buildNDCMessage(msg: NDCMessage): string {
    let payload = '';

    switch (msg.messageClass) {
        case MessageClass.TerminalCommand:
            const cmd = msg as TerminalCommand;
            payload = `${cmd.commandCode}${cmd.commandModifier}${cmd.data || ''}`;
            break;
        case MessageClass.WriteCommand:
            const write = msg as WriteCommand;
            payload = `${write.writeModifier}${write.data}`;
            break;
        case MessageClass.SolicitedStatus: {
            // SolicitedStatus and TransactionRequest share class '1'.
            // Differentiate via statusDescriptor: '1' means Transaction Request.
            const solOrTx = msg as SolicitedStatus | TransactionRequest;
            if ((solOrTx as TransactionRequest).statusDescriptor === '1' && (solOrTx as TransactionRequest).track2Data !== undefined) {
                // Transaction Request ('11' message)
                const tx = solOrTx as TransactionRequest;
                payload = `${tx.statusDescriptor}${tx.timeVariantNumber || '    '}`;
                payload += 'B'; // Transaction type: B = withdrawal
                payload += (tx.topOfReceiptTransactionData || '').padEnd(32, ' ');
                payload += (tx.amountEntered || '000000000000').padStart(12, '0');
                payload += (tx.pinBufferA || '').padEnd(16, 'F');
                payload += (tx.track2Data || '');
            } else {
                const sol = solOrTx as SolicitedStatus;
                payload = `${sol.statusDescriptor}${sol.statusInformation || ''}${sol.mac || ''}`;
            }
            break;
        }
        case MessageClass.UnsolicitedStatus:
            const unsol = msg as UnsolicitedStatus;
            payload = `${unsol.statusDescriptor}${unsol.deviceIdentifier || ''}${unsol.deviceStatus || ''}${unsol.errorSeverity || ''}${unsol.diagnosticStatus || ''}`;
            break;
    }

    return `${msg.logicalUnitNumber}${msg.messageClass}${payload}`;
}

export function buildSolicitedStatus(
    luno: string,
    descriptor: string,
    terminalData?: string
): string {
    const msg: SolicitedStatus = {
        logicalUnitNumber: luno.padEnd(9, ' '),
        messageClass: MessageClass.SolicitedStatus,
        statusDescriptor: descriptor,
        statusInformation: terminalData,
        raw: ''
    };
    return buildNDCMessage(msg);
}

/**
 * Builds the NDC Transaction Request message ('11') to send to the host.
 */
export function buildTransactionRequest(params: {
    luno: string;
    pin: string;
    pan: string;
    amount: string;
    track2: string;
    tpkHex: string;
    timeVariantNumber?: string;
}): string {
    // Import here to avoid circular dependency at module level
    const { generateClearPinBlock, encryptPinBlock } = require('../crypto/index.js');
    const clearBlock = generateClearPinBlock(params.pin, params.pan);
    const encryptedPin = encryptPinBlock(clearBlock, params.tpkHex);

    // Note: Emulating basic MCN, FDK buffers, and general buffers for the payload.
    // In a fully developed solution these would be extracted dynamically from ATM context.

    const msg: TransactionRequest = {
        logicalUnitNumber: params.luno.padEnd(9, ' '),
        messageClass: MessageClass.TransactionRequest,
        statusDescriptor: '1',
        timeVariantNumber: (params.timeVariantNumber || '0000').padEnd(4, '0'),
        amountEntered: params.amount.padStart(12, '0'),
        pinBufferA: encryptedPin,
        track2Data: params.track2,
        raw: ''
    };

    return buildNDCMessage(msg);
}
