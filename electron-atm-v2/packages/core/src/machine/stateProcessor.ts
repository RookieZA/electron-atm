/**
 * NDC State Processor
 *
 * Pure, stateless engine that processes a single NDC State Table entry given
 * the current ATM context snapshot and an incoming input event.
 *
 * Design principles:
 *  - No side effects. All mutations are returned as StateProcessorResult.
 *  - Auto-advancing states (D, K, +, /, ;, ?) return a nextStateNumber
 *    immediately so the XState machine can chain them without waiting for input.
 *  - States that require user input (B, E, F, H, X, Y, W) return null for
 *    nextStateNumber until a suitable input event satisfies the condition.
 *  - State I returns a transactionRequest string to be sent to the host.
 *  - State J returns clearCard=true to signal the session is complete.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** FDK letters recognised by the NDC protocol (E is included in binary masks) */
const FDK_ORDER = ['A', 'B', 'C', 'D', 'F', 'G', 'H', 'I'] as const;
const FDK_ORDER_BIN = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'] as const;
const OPCODE_INIT = '        '; // 8 spaces
const AMOUNT_INIT = '000000000000'; // 12 zeros
const MCN_MIN = 0x31; // '1'
const MCN_MAX = 0x3f; // '?'

export type FdkKey = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export type InputEvent =
    | { type: 'CARD_INSERTED' }
    | { type: 'FDK_PRESSED'; fdk: FdkKey }
    | { type: 'KEY_PRESSED'; key: string }   // '0'–'9', 'ENTER', 'BACKSPACE', 'CANCEL'
    | { type: 'PIN_CONFIRMED' }
    | { type: 'AMOUNT_CONFIRMED' }
    | { type: 'CANCEL' };

/** Snapshot of ATM buffers passed into the processor */
export interface AtmBuffers {
    pinBuffer: string;    // Clear PIN digits (4–16)
    bufferB: string;    // General-purpose buffer B (up to 32 chars)
    bufferC: string;    // General-purpose buffer C (up to 32 chars)
    opcodeBuffer: string;   // 8-char operation code buffer (space-filled)
    amountBuffer: string;   // 12-char amount buffer (zero-filled)
    fdkBuffer: string;    // Last pressed FDK key (used by State W)
    activeFDKs: string[];  // Currently enabled FDK button labels
    messageCoordinationNumber: string; // Single char, rotates 0x31–0x3F
}

export interface StateProcessorInput {
    stateNumber: string;
    stateEntry: Record<string, any>;
    stateTables: Record<string, any>;
    fitData: Record<string, any>;
    cardNumber: string;
    track2: string;
    pinKey: string;   // Hex string — used for PIN encryption in State I
    luno: string;   // Logical Unit Number for NDC messages
    buffers: AtmBuffers;
    event: InputEvent | null;
}

/** Partial buffer mutations returned by every state handler */
export interface BufferMutations {
    pinBuffer?: string;
    bufferB?: string;
    bufferC?: string;
    opcodeBuffer?: string;
    amountBuffer?: string;
    fdkBuffer?: string;
    activeFDKs?: string[];
    messageCoordinationNumber?: string;
}

export interface StateProcessorResult {
    /** Next NDC state number to advance to, or null if waiting for input */
    nextStateNumber: string | null;
    /** Screen number the ATM display should show right now */
    screenNumber: string | null;
    /** Buffer mutations to apply to XState context */
    bufferMutations: BufferMutations;
    /** Raw NDC transaction request string — set only by State I */
    transactionRequest: string | null;
    /** True when the card session ends (State J) */
    clearCard: boolean;
    /** State number that was just entered (always the input stateNumber) */
    visitedState: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FDK Active Mask
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Decode an FDK active mask into an array of enabled FDK labels.
 *
 * Two formats are supported:
 *  1. Decimal string (1–3 chars, range 0–255):
 *       bit 0 = A, bit 1 = B, bit 2 = C, bit 3 = D, bit 4 = F, bit 5 = G,
 *       bit 6 = H, bit 7 = I  (E is never included in decimal masks)
 *  2. Binary string (9+ chars):
 *       char[0] = numeric keys activator (ignored here)
 *       chars[1..] = one bit per FDK in order A B C D E F G H I
 *       '1' = active
 */
export function decodeFdkMask(mask: string): string[] {
    if (!mask || mask.length === 0) return [];

    if (mask.length <= 3) {
        // Decimal format
        const value = parseInt(mask, 10);
        if (isNaN(value) || value < 0 || value > 255) return [];
        return FDK_ORDER.filter((_, bit) => (value & (1 << bit)) !== 0);
    }

    // Binary format: first char is numeric activator, rest are FDK bits
    const bits = mask.substring(1);
    return FDK_ORDER_BIN.filter((_, i) => bits[i] === '1');
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Co-ordination Number
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Advance the Message Co-ordination Number.
 * Rotates through character codes 0x31 ('1') → 0x3F ('?') then wraps.
 */
export function nextMCN(current: string): string {
    const code = current.charCodeAt(0) + 1;
    return String.fromCharCode(code > MCN_MAX ? MCN_MIN : code);
}

// ─────────────────────────────────────────────────────────────────────────────
// Opcode Buffer helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Read the 8-char opcode buffer, initialising with spaces if needed */
function ensureOpcode(buf: string): string {
    return buf.padEnd(8, ' ').substring(0, 8);
}

/** Write a single character at the given 0-based position in the opcode buffer */
function setOpcodeAt(buf: string, index: number, value: string): string {
    const arr = ensureOpcode(buf).split('');
    if (index >= 0 && index < 8) arr[7 - index] = value[0] ?? ' ';
    return arr.join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Amount buffer helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Append a digit to a 12-char amount buffer (left-shift, right fill) */
function appendAmountDigit(buf: string, digit: string): string {
    return (buf + digit).slice(-12).padStart(12, '0');
}

/** Remove the last digit from the amount buffer */
function backspaceAmount(buf: string): string {
    return '0' + buf.slice(0, -1);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIT helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Look up the Financial Institution ID for a card number by matching
 * the card PAN prefix against FIT PFIID entries (trailing 'F' padding stripped).
 * Returns the PIDDX (institution ID digit) or null.
 */
function getInstitutionId(
    cardNumber: string,
    fitData: Record<string, any>
): string | null {
    const digits = cardNumber.replace(/\D/g, '');
    for (const fit of Object.values(fitData)) {
        const entry = fit as Record<string, string>;
        const pfiid = (entry['PFIID'] ?? '').replace(/F+$/, '');
        if (pfiid && digits.startsWith(pfiid)) {
            return entry['PIDDX'] ?? null;
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Request builder (State I)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the raw NDC '11' transaction request string.
 * PIN encryption is done here if send_pin_buffer is set and a PIN key exists.
 */
function buildTransactionRequest(
    luno: string,
    state: Record<string, any>,
    buffers: AtmBuffers,
    track2: string,
    cardNumber: string,
    pinKey: string,
    mcn: string
): string {
    // Import crypto helpers lazily to avoid circular deps at module load time
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { generateClearPinBlock, encryptPinBlock } = (() => {
        try {
            return require('../../../protocol/src/crypto/index.js');
        } catch {
            return { generateClearPinBlock: null, encryptPinBlock: null };
        }
    })();

    const lunoField = luno.padEnd(9, ' ');
    const mcnField = mcn;

    // Operation code buffer (always 8 chars, space-filled)
    const opcodeField = state['send_operation_code'] === '001'
        ? ensureOpcode(buffers.opcodeBuffer)
        : '';

    // Amount buffer (12 digits, zero-filled)
    const amountField = state['send_amount_data'] === '001'
        ? buffers.amountBuffer.padStart(12, '0')
        : '';

    // PIN buffer
    let pinField = '';
    const sendPin = state['send_pin_buffer'] ?? '000';
    if (sendPin === '001' || sendPin === '129') {
        if (generateClearPinBlock && encryptPinBlock && pinKey) {
            const clear = generateClearPinBlock(buffers.pinBuffer, cardNumber);
            pinField = encryptPinBlock(clear, pinKey);
        } else {
            // PIN encryption not available — send empty block
            pinField = 'F'.repeat(16);
        }
    }

    // Buffer B / Buffer C
    const bufferBC_param = state['send_buffer_B_buffer_C'] ?? '000';
    let bcField = '';
    if (bufferBC_param === '001') bcField = buffers.bufferB;
    else if (bufferBC_param === '002') bcField = buffers.bufferC;
    else if (bufferBC_param === '003') bcField = buffers.bufferB + buffers.bufferC;

    // Track 2
    const track2Field = state['send_track2'] === '001' ? track2 : '';

    // Build the raw NDC message string manually to avoid circular dep on @atm/protocol builder
    return [
        lunoField,     // 9 chars — LUNO
        '1',           // Message class: Solicited Status / Transaction Request
        '1',           // Status descriptor: Transaction Request
        mcnField,      // 1 char — Message Co-ordination Number
        'B',           // Transaction type: B = withdrawal (standard)
        ' '.repeat(32), // Top-of-receipt data (blank)
        amountField || '000000000000',
        pinField.padEnd(16, 'F'),
        track2Field,
        opcodeField,
        bcField,
    ].join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// State Handlers
// ─────────────────────────────────────────────────────────────────────────────

function makeResult(overrides: Partial<StateProcessorResult>, visitedState: string): StateProcessorResult {
    return {
        nextStateNumber: null,
        screenNumber: null,
        bufferMutations: {},
        transactionRequest: null,
        clearCard: false,
        visitedState,
        ...overrides,
    };
}

/** State A — Card Read State
 *  Initialises all buffers. If a card is present, auto-advances immediately. */
function processStateA(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const hasCard = Boolean(input.cardNumber);
    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        nextStateNumber: hasCard ? (s['good_read_next_state'] ?? null) : null,
        bufferMutations: {
            pinBuffer: '',
            bufferB: '',
            bufferC: '',
            opcodeBuffer: OPCODE_INIT,
            amountBuffer: AMOUNT_INIT,
            fdkBuffer: '',
            activeFDKs: [],
        },
    }, input.stateNumber);
}

/** State B — Personal Identification Number Entry State */
function processStateB(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const { buffers, event, fitData, cardNumber } = input;

    // Maximum PIN length from FIT (PMXPN field), default 6
    let maxPinLength = 6;
    const institutionId = getInstitutionId(cardNumber, fitData);
    if (institutionId !== null) {
        for (const fit of Object.values(fitData)) {
            const entry = fit as Record<string, string>;
            const pfiid = (entry['PFIID'] ?? '').replace(/F+$/, '');
            if (cardNumber.startsWith(pfiid) && entry['PMXPN']) {
                maxPinLength = parseInt(entry['PMXPN'], 10) || 6;
                break;
            }
        }
    }

    const mutations: BufferMutations = {
        activeFDKs: decodeFdkMask('001'), // Enable FDK A only
    };

    if (event?.type === 'KEY_PRESSED') {
        if (/^[0-9]$/.test(event.key) && buffers.pinBuffer.length < 16) {
            const newPin = buffers.pinBuffer + event.key;
            mutations.pinBuffer = newPin;
            // Auto-advance if PIN reached max length
            if (newPin.length >= maxPinLength) {
                return makeResult({
                    screenNumber: s['screen_number'] ?? null,
                    nextStateNumber: s['remote_pin_check_next_state'] ?? null,
                    bufferMutations: mutations,
                }, input.stateNumber);
            }
        } else if (event.key === 'BACKSPACE') {
            mutations.pinBuffer = buffers.pinBuffer.slice(0, -1);
        } else if (event.key === 'CANCEL') {
            mutations.pinBuffer = '';
        } else if ((event.key === 'ENTER' || event.key === 'PIN_CONFIRMED') && buffers.pinBuffer.length >= 4) {
            return makeResult({
                screenNumber: s['screen_number'] ?? null,
                nextStateNumber: s['remote_pin_check_next_state'] ?? null,
                bufferMutations: mutations,
            }, input.stateNumber);
        }
    } else if (event?.type === 'FDK_PRESSED' && event.fdk === 'A' && buffers.pinBuffer.length >= 4) {
        return makeResult({
            screenNumber: s['screen_number'] ?? null,
            nextStateNumber: s['remote_pin_check_next_state'] ?? null,
            bufferMutations: mutations,
        }, input.stateNumber);
    } else if (event?.type === 'PIN_CONFIRMED' && buffers.pinBuffer.length >= 4) {
        return makeResult({
            screenNumber: s['screen_number'] ?? null,
            nextStateNumber: s['remote_pin_check_next_state'] ?? null,
            bufferMutations: mutations,
        }, input.stateNumber);
    }

    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        bufferMutations: mutations,
    }, input.stateNumber);
}

/** State D — Operation Code Buffer State
 *  Sets fields of the opcode buffer from state table entries, then auto-advances. */
function processStateD(
    s: Record<string, any>,
    input: StateProcessorInput,
    extensionState: Record<string, any> | null
): StateProcessorResult {
    let opcode = ensureOpcode(input.buffers.opcodeBuffer);

    // The state defines which opcode buffer positions to fill
    // The extension state (if present) provides the actual values
    if (extensionState) {
        // Extension state entries array maps FDK positions to buffer values
        const entries: string[] = extensionState['entries'] ?? [];
        // State D with extension: write values at their positional indices
        entries.forEach((value, idx) => {
            if (value && value !== '0' && value !== ' ') {
                opcode = setOpcodeAt(opcode, idx, value);
            }
        });
    } else {
        // Without extension state, apply the built-in buffer assignments
        ['buffer_B', 'buffer_C', 'buffer_D', 'buffer_E', 'buffer_F', 'buffer_G', 'buffer_H', 'buffer_I'].forEach((field, i) => {
            if (s[field] && s[field] !== ' ') {
                opcode = setOpcodeAt(opcode, i, s[field]);
            }
        });
    }

    return makeResult({
        screenNumber: null,
        nextStateNumber: s['next_state'] ?? null,
        bufferMutations: { opcodeBuffer: opcode },
    }, input.stateNumber);
}

/** State E — Four FDK Selection State
 *  Shows a screen with A/B/C/D active. On FDK press, writes to opcode buffer. */
function processStateE(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const { buffers, event } = input;

    // Determine which FDKs are active (those whose next state is not '255')
    const activeFDKs: string[] = ['A', 'B', 'C', 'D'].filter(
        fdk => (s[`FDK_${fdk}_next_state`] ?? '255') !== '255'
    );
    const bufferLocation = parseInt(s['buffer_location'] ?? '0', 10);

    if (event?.type === 'FDK_PRESSED' && activeFDKs.includes(event.fdk)) {
        const opcode = setOpcodeAt(buffers.opcodeBuffer, bufferLocation, event.fdk);
        return makeResult({
            screenNumber: s['screen_number'] ?? null,
            nextStateNumber: s[`FDK_${event.fdk}_next_state`] ?? null,
            bufferMutations: { opcodeBuffer: opcode, activeFDKs },
        }, input.stateNumber);
    }

    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        bufferMutations: { activeFDKs },
    }, input.stateNumber);
}

/** State F — Amount Entry State
 *  Numeric keys scroll the 12-digit amount buffer. FDK A / Enter confirms. */
function processStateF(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const { buffers, event } = input;
    const activeFDKs = decodeFdkMask('015'); // A, B, C, D

    const mutations: BufferMutations = { activeFDKs };

    if (event?.type === 'KEY_PRESSED') {
        if (/^[0-9]$/.test(event.key)) {
            mutations.amountBuffer = appendAmountDigit(buffers.amountBuffer, event.key);
        } else if (event.key === 'BACKSPACE') {
            mutations.amountBuffer = backspaceAmount(buffers.amountBuffer);
        } else if (event.key === 'ENTER') {
            return makeResult({
                screenNumber: s['screen_number'] ?? null,
                nextStateNumber: s['FDK_A_next_state'] ?? null,
                bufferMutations: mutations,
            }, input.stateNumber);
        }
    } else if (event?.type === 'FDK_PRESSED') {
        const nextKey = `FDK_${event.fdk}_next_state`;
        if (s[nextKey] && s[nextKey] !== '255') {
            return makeResult({
                screenNumber: s['screen_number'] ?? null,
                nextStateNumber: s[nextKey],
                bufferMutations: mutations,
            }, input.stateNumber);
        }
    } else if (event?.type === 'AMOUNT_CONFIRMED') {
        return makeResult({
            screenNumber: s['screen_number'] ?? null,
            nextStateNumber: s['FDK_A_next_state'] ?? null,
            bufferMutations: mutations,
        }, input.stateNumber);
    }

    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        bufferMutations: mutations,
    }, input.stateNumber);
}

/** State H — Information Entry State
 *  Collects digits into Buffer B or C depending on buffer_and_display_params[2].
 *  FDK keys route to exit states. */
function processStateH(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const { buffers, event } = input;

    const displayParam = (s['buffer_and_display_params'] ?? '   ')[2] ?? '0';
    const useBufferB = displayParam === '2' || displayParam === '3';
    const maskChars = displayParam === '0' || displayParam === '2'; // display X instead of digit

    // Build active mask from state FDK next states
    let activeMask = '0';
    ['A', 'B', 'C', 'D'].forEach(fdk => {
        activeMask += (s[`FDK_${fdk}_next_state`] ?? '255') !== '255' ? '1' : '0';
    });
    const activeFDKs = decodeFdkMask(activeMask);
    const mutations: BufferMutations = { activeFDKs };

    if (event?.type === 'KEY_PRESSED') {
        if (/^[0-9]$/.test(event.key)) {
            if (useBufferB) {
                if ((buffers.bufferB ?? '').length < 32)
                    mutations.bufferB = buffers.bufferB + event.key;
            } else {
                if ((buffers.bufferC ?? '').length < 32)
                    mutations.bufferC = buffers.bufferC + event.key;
            }
        } else if (event.key === 'BACKSPACE') {
            if (useBufferB) mutations.bufferB = (buffers.bufferB ?? '').slice(0, -1);
            else mutations.bufferC = (buffers.bufferC ?? '').slice(0, -1);
        }
    } else if (event?.type === 'FDK_PRESSED' && activeFDKs.includes(event.fdk)) {
        const nextKey = `FDK_${event.fdk}_next_state`;
        return makeResult({
            screenNumber: s['screen_number'] ?? null,
            nextStateNumber: s[nextKey] ?? null,
            bufferMutations: mutations,
        }, input.stateNumber);
    }

    // Report maskChars so display knows whether to show `*` or digits
    void maskChars; // used by renderer

    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        bufferMutations: mutations,
    }, input.stateNumber);
}

/** State I — Transaction Request State
 *  Builds the NDC '11' message and fires it to the host. Waits for host reply. */
function processStateI(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const { buffers, cardNumber, track2, pinKey, luno } = input;

    const mcn = buffers.messageCoordinationNumber || String.fromCharCode(MCN_MIN);
    const newMcn = nextMCN(mcn);

    const txRequest = buildTransactionRequest(luno, s, buffers, track2, cardNumber, pinKey, mcn);

    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        nextStateNumber: null, // wait for AUTHORIZATION_APPROVED / DENIED from host
        transactionRequest: txRequest,
        bufferMutations: {
            messageCoordinationNumber: newMcn,
            activeFDKs: [],
        },
    }, input.stateNumber);
}

/** State J — Close State (Card Eject)
 *  Shows receipt screen, clears session. */
function processStateJ(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    return makeResult({
        screenNumber: s['receipt_delivered_screen'] ?? s['screen_number'] ?? null,
        nextStateNumber: null, // card is now ejected — machine goes idle after card taken
        clearCard: true,
        bufferMutations: {
            pinBuffer: '',
            bufferB: '',
            bufferC: '',
            opcodeBuffer: OPCODE_INIT,
            amountBuffer: AMOUNT_INIT,
            fdkBuffer: '',
            activeFDKs: [],
        },
    }, input.stateNumber);
}

/** State K — FIT Identification State
 *  Routes to one of the exit states based on card's institution ID. */
function processStateK(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const institutionId = getInstitutionId(input.cardNumber, input.fitData);
    if (institutionId !== null) {
        const exits: string[] = s['state_exits'] ?? [];
        const idx = parseInt(institutionId, 10);
        const next = exits[idx] ?? null;
        return makeResult({ nextStateNumber: next }, input.stateNumber);
    }
    return makeResult({ nextStateNumber: null }, input.stateNumber);
}

/** State W — FDK Buffer Routing State
 *  Routes to exit state based on the value currently in fdkBuffer. */
function processStateW(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    const states: Record<string, string> = s['states'] ?? {};
    const next = states[input.buffers.fdkBuffer] ?? null;
    return makeResult({ nextStateNumber: next }, input.stateNumber);
}

/** State X — FDK Information Entry State (with optional Extension State)
 *  The FDK pressed determines a value from the extension state table, which is
 *  stored in Buffer B, C, or Amount based on buffer_id. */
function processStateX(
    s: Record<string, any>,
    input: StateProcessorInput,
    extensionState: Record<string, any> | null
): StateProcessorResult {
    const { buffers, event } = input;
    const activeFDKs = decodeFdkMask(s['FDK_active_mask'] ?? '000');
    const mutations: BufferMutations = { activeFDKs };

    if (event?.type === 'FDK_PRESSED' && activeFDKs.includes(event.fdk)) {
        mutations.fdkBuffer = event.fdk;

        if (extensionState) {
            // Map FDK → index in extension entries
            const fdkIndex = [null, null, 'A', 'B', 'C', 'D', 'F', 'G', 'H', 'I'].indexOf(event.fdk);
            const rawValue = (extensionState['entries'] ?? [])[fdkIndex] ?? '';

            const bufferId = s['buffer_id'] ?? '000';
            const bufferTarget = bufferId[1] ?? '1';
            const numZeroes = parseInt(bufferId[2] ?? '0', 10);
            const value = rawValue + '0'.repeat(numZeroes);

            if (bufferTarget === '1') mutations.bufferB = value;
            else if (bufferTarget === '2') mutations.bufferC = value;
            else if (bufferTarget === '3') mutations.amountBuffer = value.padStart(12, '0').slice(-12);
        }

        return makeResult({
            screenNumber: s['screen_number'] ?? null,
            nextStateNumber: s['FDK_next_state'] ?? null,
            bufferMutations: mutations,
        }, input.stateNumber);
    }

    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        bufferMutations: mutations,
    }, input.stateNumber);
}

/** State Y — FDK Selection + Opcode Buffer State
 *  FDK press writes the pressed FDK label into a specified opcode buffer position. */
function processStateY(
    s: Record<string, any>,
    input: StateProcessorInput,
    extensionState: Record<string, any> | null
): StateProcessorResult {
    const { buffers, event } = input;
    const activeFDKs = decodeFdkMask(s['FDK_active_mask'] ?? '000');
    const mutations: BufferMutations = { activeFDKs };

    if (event?.type === 'FDK_PRESSED' && activeFDKs.includes(event.fdk)) {
        mutations.fdkBuffer = event.fdk;

        if (extensionState) {
            // Extension state not yet fully specified in NDC docs — log and skip
            console.warn('[StateProcessor] State Y extension state encountered but not fully supported');
        } else {
            const position = parseInt(s['buffer_positions'] ?? '0', 10);
            mutations.opcodeBuffer = setOpcodeAt(buffers.opcodeBuffer, position, event.fdk);
        }

        return makeResult({
            screenNumber: s['screen_number'] ?? null,
            nextStateNumber: s['FDK_next_state'] ?? null,
            bufferMutations: mutations,
        }, input.stateNumber);
    }

    return makeResult({
        screenNumber: s['screen_number'] ?? null,
        bufferMutations: mutations,
    }, input.stateNumber);
}

/** State + — Begin ICC Initialisation
 *  ICC cards are passed-through; advance to the "not started" exit. */
function processStateBeginICCInit(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    return makeResult({
        nextStateNumber: s['icc_init_not_started_next_state'] ?? null,
    }, input.stateNumber);
}

/** State / — Complete ICC Application Initialisation
 *  Display a please-wait screen; advance via extension state entry [8] (Processing not performed). */
function processStateCompleteICCAppInit(
    s: Record<string, any>,
    input: StateProcessorInput,
    extensionState: Record<string, any> | null
): StateProcessorResult {
    const next = extensionState
        ? ((extensionState['entries'] ?? [])[8] ?? null)
        : null;
    return makeResult({
        screenNumber: s['please_wait_screen_number'] ?? null,
        nextStateNumber: next,
    }, input.stateNumber);
}

/** State ; — ICC Reinitialisation
 *  Pass-through: advance to processing_not_performed_next_state. */
function processStateICCReinit(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    return makeResult({
        nextStateNumber: s['processing_not_performed_next_state'] ?? null,
    }, input.stateNumber);
}

/** State ? — Set ICC Transaction Data
 *  Pass-through: advance to next_state (ICC data already set). */
function processStateSetICCData(s: Record<string, any>, input: StateProcessorInput): StateProcessorResult {
    return makeResult({
        nextStateNumber: s['next_state'] ?? null,
    }, input.stateNumber);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a single NDC state table entry and return mutations + next state.
 *
 * The caller (XState machine) is responsible for:
 *  1. Applying bufferMutations to context.
 *  2. If nextStateNumber is not null, calling processState() again for the
 *     next state until a state returns null (waiting for user input).
 *  3. Sending transactionRequest to the host if set.
 *  4. Transitioning to 'ejectingCard' if clearCard is true.
 */
export function processState(input: StateProcessorInput): StateProcessorResult {
    const { stateNumber, stateEntry: s, stateTables } = input;

    // Resolve extension state if present
    const extNum = s['extension_state'] ?? '255';
    const extensionState: Record<string, any> | null =
        extNum !== '255' && extNum !== '000' && extNum !== ''
            ? (stateTables[extNum] ?? null)
            : null;

    const stateType: string = s['type'] ?? s['raw']?.[4] ?? '?';

    switch (stateType) {
        case 'A': return processStateA(s, input);
        case 'B': return processStateB(s, input);
        case 'D': return processStateD(s, input, extensionState);
        case 'E': return processStateE(s, input);
        case 'F': return processStateF(s, input);
        case 'H': return processStateH(s, input);
        case 'I': return processStateI(s, input);
        case 'J': return processStateJ(s, input);
        case 'K': return processStateK(s, input);
        case 'W': return processStateW(s, input);
        case 'X': return processStateX(s, input, extensionState);
        case 'Y': return processStateY(s, input, extensionState);
        case '+': return processStateBeginICCInit(s, input);
        case '/': return processStateCompleteICCAppInit(s, input, extensionState);
        case ';': return processStateICCReinit(s, input);
        case '?': return processStateSetICCData(s, input);
        default:
            console.warn(`[StateProcessor] Unsupported state type '${stateType}' at state ${stateNumber}`);
            return makeResult({ nextStateNumber: null }, stateNumber);
    }
}

/**
 * Chain-advance through auto-advancing states in a do-while loop,
 * matching the original ATM behaviour where states like D, K, +, / etc.
 * immediately resolve their next state without waiting for user input.
 *
 * Stops advancing when:
 *  - nextStateNumber is null (waiting for user input or end of session)
 *  - clearCard is true (session ended in State J)
 *  - The next state type requires user input (B, E, F, H, X, Y, W)
 *  - A transactionRequest is produced (State I — must wait for host reply)
 *  - A cycle is detected (safety against infinite loops)
 */
const AUTO_ADVANCE_TYPES = new Set(['A', 'D', 'K', '+', '/', ';', '?']);

export function processStateChain(
    startNumber: string,
    stateTables: Record<string, any>,
    fitData: Record<string, any>,
    initialBuffers: AtmBuffers,
    cardNumber: string,
    track2: string,
    pinKey: string,
    luno: string,
    event: InputEvent | null
): StateProcessorResult {
    let currentNumber = startNumber;
    let buffers = { ...initialBuffers };
    let lastResult: StateProcessorResult | null = null;
    const visited = new Set<string>();

    while (currentNumber) {
        if (visited.has(currentNumber)) {
            console.error(`[StateProcessor] Cycle detected at state ${currentNumber} — breaking`);
            break;
        }
        visited.add(currentNumber);

        const entry = stateTables[currentNumber];
        if (!entry) {
            console.error(`[StateProcessor] State ${currentNumber} not found in state tables`);
            break;
        }

        const result = processState({
            stateNumber: currentNumber,
            stateEntry: entry,
            stateTables,
            fitData,
            cardNumber,
            track2,
            pinKey,
            luno,
            buffers,
            event: lastResult === null ? event : null, // only pass event to first state
        });

        // Merge buffer mutations into working copy
        buffers = { ...buffers, ...result.bufferMutations };
        lastResult = { ...result, bufferMutations: { ...initialBuffers, ...buffers } };

        // Stop conditions
        if (result.clearCard) break;
        if (result.transactionRequest) break;
        if (!result.nextStateNumber) break;

        // Only auto-advance if next state type is one that doesn't wait for input
        const nextEntry = stateTables[result.nextStateNumber];
        const nextType = (nextEntry?.['type'] ?? nextEntry?.['raw']?.[4] ?? '?') as string;
        if (!AUTO_ADVANCE_TYPES.has(nextType)) break;

        currentNumber = result.nextStateNumber;
    }

    return lastResult ?? makeResult({ nextStateNumber: null }, startNumber);
}
