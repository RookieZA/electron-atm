export enum MessageClass {
    TransactionRequest = '1',
    SolicitedStatus = '1',
    UnsolicitedStatus = '2',
    WriteCommand = '3',
    TerminalCommand = '4',
    TransactionReply = '8',
}

export enum MessageType {
    HostToTerminal = 'HostToTerminal',
    TerminalToHost = 'TerminalToHost'
}

export interface NDCMessage {
    logicalUnitNumber: string; // LUNO
    messageClass: MessageClass;
    raw: string;
}

export interface TerminalCommand extends NDCMessage {
    messageClass: MessageClass.TerminalCommand;
    commandCode: string;
    commandModifier: string;
    data?: string;
}

export interface DataCommand extends NDCMessage {
    messageClass: MessageClass.WriteCommand | MessageClass.TransactionReply;
    modifier?: string;
    data?: string;
}

export enum WriteCommandModifier {
    StateTableLoad = '1',
    ScreenDataLoad = '2',
    ConfigurationLoad = '3',
    FITLoad = '4',
    MacKeyLoad = '5',
    DateAndTimeLoad = 'A',
}

export interface WriteCommand extends NDCMessage {
    messageClass: MessageClass.WriteCommand;
    writeModifier: WriteCommandModifier;
    data: string;
}

export interface SolicitedStatus extends NDCMessage {
    messageClass: MessageClass.SolicitedStatus;
    statusDescriptor: string;
    statusInformation?: string;
    mac?: string;
}

export interface UnsolicitedStatus extends NDCMessage {
    messageClass: MessageClass.UnsolicitedStatus;
    statusDescriptor: string;
    deviceIdentifier?: string;
    deviceStatus?: string;
    errorSeverity?: string;
    diagnosticStatus?: string;
    suppliesStatus?: string;
}

export interface TransactionRequest extends NDCMessage {
    messageClass: MessageClass.TransactionRequest;
    statusDescriptor: '1'; // Always 1 for Transaction Request
    timeVariantNumber?: string;
    mcn?: string;
    topOfReceiptTransactionData?: string;
    amountEntered?: string;
    pinBufferA?: string;
    generalBufferB?: string;
    generalBufferC?: string;
    track2Data?: string;
}
