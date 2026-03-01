import { MessageClass, NDCMessage, SolicitedStatus, UnsolicitedStatus, TerminalCommand, WriteCommand, WriteCommandModifier, DataCommand } from '../types/messages.js';

/**
 * Parses a raw NDC message string from the host into a typed object.
 * NDC messages typically begin with a 9-digit LUNO.
 */
export function parseNDCMessage(raw: string): NDCMessage {
    if (!raw || raw.length < 10) {
        throw new Error('Invalid NDC message length');
    }

    const logicalUnitNumber = raw.substring(0, 9);
    const messageClassRaw = raw.substring(9, 10);
    const messageClass = messageClassRaw as MessageClass;

    const baseMessage: NDCMessage = {
        logicalUnitNumber,
        messageClass,
        raw
    };

    switch (messageClass) {
        case MessageClass.TerminalCommand:
            return parseCommand(baseMessage, raw.substring(10));
        case MessageClass.WriteCommand:
            return parseWriteCommand(baseMessage, raw.substring(10));
        case MessageClass.SolicitedStatus:
            return parseSolicitedStatus(baseMessage, raw.substring(10));
        case MessageClass.UnsolicitedStatus:
            return parseUnsolicitedStatus(baseMessage, raw.substring(10));
        default:
            return baseMessage; // Unknown or unsupported class
    }
}

function parseWriteCommand(base: NDCMessage, payload: string): WriteCommand | DataCommand {
    const modifier = payload.substring(0, 1);

    // Check if it's actually an Interactive Transaction Response ('3' write modifier)
    if (modifier === '3') {
        const dataCmd: DataCommand = {
            ...base,
            messageClass: MessageClass.WriteCommand,
            modifier: '3',
            data: payload.substring(1) // screen data + active keys
        };
        return dataCmd;
    }

    // Check if it's Extended Encryption Key Info ('4' write modifier)
    if (modifier === '4') {
        const dataCmd: DataCommand = {
            ...base,
            messageClass: MessageClass.WriteCommand,
            modifier: '4',
            data: payload.substring(1) // key data
        };
        return dataCmd;
    }

    return {
        ...base,
        messageClass: MessageClass.WriteCommand,
        writeModifier: modifier as WriteCommandModifier,
        data: payload.substring(1)
    };
}

function parseCommand(base: NDCMessage, payload: string): TerminalCommand {
    return {
        ...base,
        messageClass: MessageClass.TerminalCommand,
        commandCode: payload.substring(0, 1),
        commandModifier: payload.substring(1, 2),
        data: payload.length > 2 ? payload.substring(2) : undefined
    };
}

function parseSolicitedStatus(base: NDCMessage, payload: string): SolicitedStatus {
    return {
        ...base,
        messageClass: MessageClass.SolicitedStatus,
        statusDescriptor: payload.substring(0, 1),
        statusInformation: payload.length > 1 ? payload.substring(1) : undefined
    };
}

function parseUnsolicitedStatus(base: NDCMessage, payload: string): UnsolicitedStatus {
    return {
        ...base,
        messageClass: MessageClass.UnsolicitedStatus,
        statusDescriptor: payload.substring(0, 1),
        deviceIdentifier: payload.length > 1 ? payload.substring(1, 2) : undefined,
        deviceStatus: payload.length > 2 ? payload.substring(2, 3) : undefined,
        errorSeverity: payload.length > 3 ? payload.substring(3, 4) : undefined,
        diagnosticStatus: payload.length > 4 ? payload.substring(4) : undefined
    };
}
