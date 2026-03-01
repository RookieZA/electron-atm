/**
 * Parses a Transaction Reply ('8') command from the host into a structured object.
 *
 * NDC Host Reply format (simplified):
 *   LUNO(9) + '8' + Function Code(1) + Dispense Code(2) + Screen Num(3) + Message(variable)
 *
 * Common Function Codes:
 *   'Z' = Authorisation Approved (Dispense Cash)
 *   'N' = Authorisation Denied
 *   'F' = Retain Card
 */

export enum HostFunctionCode {
    ApprovedDispense = 'Z',    // Dispense cash and end transaction
    Denied = 'N',              // Decline transaction
    RetainCard = 'F',          // Capture the card
    PrintReceipt = 'J',        // Print receipt and eject card
}

export interface HostTransactionReply {
    functionCode: HostFunctionCode | string;
    dispenseCassette?: string; // Which cassette to dispense from
    billCount?: number;        // How many bills to dispense
    screenNumber?: string;     // Screen to show after reply
    authCode?: string;         // Optional authorisation code
    receiptData?: string;      // Optional receipt text
}

/**
 * Parses the payload of a host Transaction Reply ('8') message.
 */
export function parseHostTransactionReply(payload: string): HostTransactionReply {
    const functionCode = payload.substring(0, 1) as HostFunctionCode;

    const result: HostTransactionReply = { functionCode };

    switch (functionCode) {
        case HostFunctionCode.ApprovedDispense:
            result.dispenseCassette = payload.substring(1, 2);
            result.billCount = parseInt(payload.substring(2, 5), 10) || 0;
            result.screenNumber = payload.substring(5, 8);
            result.authCode = payload.substring(8, 14).trim();
            break;
        case HostFunctionCode.Denied:
            result.screenNumber = payload.substring(1, 4);
            break;
        case HostFunctionCode.RetainCard:
            result.screenNumber = payload.substring(1, 4);
            break;
        case HostFunctionCode.PrintReceipt:
            result.screenNumber = payload.substring(1, 4);
            result.receiptData = payload.substring(4);
            break;
        default:
            // Unknown function code — keep raw data
            break;
    }

    return result;
}
