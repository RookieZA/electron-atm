/**
 * ATM XState Machine — v2 Dynamic Engine
 *
 * This machine models the high-level operational lifecycle of the ATM.
 * All NDC state table processing is delegated to `stateProcessor.ts`.
 *
 * Lifecycle:
 *   offline → downloading → idle → processingCard → running ↔ waitingForHost
 *                                                 ↘ ejectingCard → idle
 *
 * The `running` super-state is the heart of the emulator: it delegates every
 * incoming input event to processStateChain() and applies the resulting buffer
 * mutations back into context.
 */

import { setup, assign, createMachine } from 'xstate';
import {
    processStateChain,
    decodeFdkMask,
    nextMCN,
    type InputEvent,
    type AtmBuffers,
} from './stateProcessor.js';

// ─────────────────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────────────────

export interface AtmContext {
    // ── Connection ───────────────────────────────────────────────────────────
    hostConnected: boolean;

    // ── NDC downloaded data ──────────────────────────────────────────────────
    stateTables: Record<string, any>;
    screenData: Record<string, string>;
    fitData: Record<string, any>;
    configParams: Record<string, string>;

    // ── Current NDC execution ────────────────────────────────────────────────
    /** Currently executing NDC state number, e.g. '000' */
    currentStateNumber: string;
    /** Last 10 visited NDC state numbers (most recent last) */
    stateHistory: string[];
    /** Screen number the ATM display should show */
    currentScreenNumber: string;

    // ── Card ─────────────────────────────────────────────────────────────────
    cardNumber: string;
    track2: string;
    serviceCode: string;
    fitId: string | null;
    cardReaderEnabled: boolean;

    // ── NDC Buffers ──────────────────────────────────────────────────────────
    /** Clear PIN digits (4–16) */
    pinBuffer: string;
    /** General-purpose buffer B (up to 32 chars) */
    bufferB: string;
    /** General-purpose buffer C (up to 32 chars) */
    bufferC: string;
    /** 8-char operation code buffer (space-filled) */
    opcodeBuffer: string;
    /** 12-digit amount buffer (zero-filled) */
    amountBuffer: string;
    /** Last FDK key pressed (used by State W dispatch) */
    fdkBuffer: string;
    /** Currently enabled FDK button labels e.g. ['A', 'B'] */
    activeFDKs: string[];

    // ── Crypto ───────────────────────────────────────────────────────────────
    masterKey: string;
    pinKey: string;
    /** Rotating counter 0x31–0x3F attached to each transaction request */
    messageCoordinationNumber: string;

    // ── Hardware / Config ────────────────────────────────────────────────────
    configId: string;
    luno: string;

    // ── State-I transaction handling ─────────────────────────────────────────
    /** Raw NDC '11' request string awaiting host reply */
    pendingTransactionRequest: string | null;
    /** After host approves: screen to display */
    authScreenNumber: string | null;
    /** Authorised dispense details */
    authCode: string | null;

    // ── Error ────────────────────────────────────────────────────────────────
    errorMessage: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Events
// ─────────────────────────────────────────────────────────────────────────────

export type AtmEvent =
    // Host connection
    | { type: 'HOST_CONNECTED' }
    | { type: 'HOST_DISCONNECTED' }

    // Host downloads (during downloading state)
    | { type: 'DOWNLOAD_COMPLETE' }
    | { type: 'STATE_TABLES_LOADED'; data: Record<string, any> }
    | { type: 'SCREEN_DATA_LOADED'; data: Record<string, string> }
    | { type: 'FIT_DATA_LOADED'; data: Record<string, any> }
    | { type: 'CONFIG_PARAMS_LOADED'; data: Record<string, string> }

    // Card
    | { type: 'CARD_INSERTED'; data: string; fitId?: string | null }
    | { type: 'CARD_TAKEN' }

    // Input (forwarded to stateProcessor)
    | { type: 'KEY_PRESSED'; key: string }
    | { type: 'FDK_PRESSED'; fdk: string }
    | { type: 'PIN_CONFIRMED' }
    | { type: 'AMOUNT_CONFIRMED' }
    | { type: 'CANCEL' }

    // Host reply to transaction request (State I)
    | { type: 'AUTHORIZATION_APPROVED'; nextStateNumber?: string; authCode?: string; screenNumber?: string }
    | { type: 'AUTHORIZATION_DENIED'; reason: string; screenNumber?: string }
    | { type: 'INTERACTIVE_TXN_RESPONSE'; data: string }

    // Crypto
    | { type: 'COMMS_KEY_UPDATED'; pinKey: string; kcv: string }
    | { type: 'MASTER_KEY_LOADED'; masterKey: string }

    // Cash dispense
    | { type: 'CASH_TAKEN' };

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const OPCODE_INIT = '        '; // 8 spaces
const AMOUNT_INIT = '000000000000';
const HISTORY_MAX = 10;

function initialContext(): AtmContext {
    return {
        hostConnected: false,
        stateTables: {},
        screenData: {},
        fitData: {},
        configParams: {},
        currentStateNumber: '',
        stateHistory: [],
        currentScreenNumber: '',
        cardNumber: '',
        track2: '',
        serviceCode: '',
        fitId: null,
        cardReaderEnabled: true,
        pinBuffer: '',
        bufferB: '',
        bufferC: '',
        opcodeBuffer: OPCODE_INIT,
        amountBuffer: AMOUNT_INIT,
        fdkBuffer: '',
        activeFDKs: [],
        masterKey: '',
        pinKey: '',
        messageCoordinationNumber: '\x31', // '1'
        configId: '0000',
        luno: '000000000',
        pendingTransactionRequest: null,
        authScreenNumber: null,
        authCode: null,
        errorMessage: null,
    };
}

/** Extract buffers snapshot from context for passing to stateProcessor */
function buffersFromContext(ctx: AtmContext): AtmBuffers {
    return {
        pinBuffer: ctx.pinBuffer,
        bufferB: ctx.bufferB,
        bufferC: ctx.bufferC,
        opcodeBuffer: ctx.opcodeBuffer,
        amountBuffer: ctx.amountBuffer,
        fdkBuffer: ctx.fdkBuffer,
        activeFDKs: ctx.activeFDKs,
        messageCoordinationNumber: ctx.messageCoordinationNumber,
    };
}

/** Parse Track 2 string (with or without leading ';') into card fields */
function parseTrack2(raw: string): { cardNumber: string; serviceCode: string; track2: string } {
    try {
        const clean = raw.startsWith(';') ? raw.slice(1) : raw;
        const [pan, rest] = clean.split('=');
        const serviceCode = rest?.substring(4, 7) ?? '';
        return { cardNumber: pan ?? '', serviceCode, track2: raw };
    } catch {
        return { cardNumber: raw, serviceCode: '', track2: raw };
    }
}

/** Add state to history (capped at HISTORY_MAX, no duplicate consecutive entries) */
function addToHistory(history: string[], stateNum: string): string[] {
    if (history[history.length - 1] === stateNum) return history;
    const updated = [...history, stateNum];
    return updated.length > HISTORY_MAX ? updated.slice(-HISTORY_MAX) : updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// runState — core action that drives the NDC state chain
// ─────────────────────────────────────────────────────────────────────────────

function runState(
    ctx: AtmContext,
    stateNumber: string,
    event: InputEvent | null
): Partial<AtmContext> {
    if (!ctx.stateTables || Object.keys(ctx.stateTables).length === 0) return {};

    const result = processStateChain(
        stateNumber,
        ctx.stateTables,
        ctx.fitData,
        buffersFromContext(ctx),
        ctx.cardNumber,
        ctx.track2,
        ctx.pinKey,
        ctx.luno,
        event
    );

    const mutations = result.bufferMutations ?? {};
    const nextNum = result.nextStateNumber;
    const history = addToHistory(ctx.stateHistory, result.visitedState);

    return {
        currentStateNumber: nextNum ?? stateNumber, // stay on current if waiting for input
        currentScreenNumber: result.screenNumber ?? ctx.currentScreenNumber,
        stateHistory: history,
        cardReaderEnabled: result.clearCard ? false : ctx.cardReaderEnabled,
        pendingTransactionRequest: result.transactionRequest ?? null,

        // Buffer mutations from processor
        pinBuffer: mutations.pinBuffer ?? ctx.pinBuffer,
        bufferB: mutations.bufferB ?? ctx.bufferB,
        bufferC: mutations.bufferC ?? ctx.bufferC,
        opcodeBuffer: mutations.opcodeBuffer ?? ctx.opcodeBuffer,
        amountBuffer: mutations.amountBuffer ?? ctx.amountBuffer,
        fdkBuffer: mutations.fdkBuffer ?? ctx.fdkBuffer,
        activeFDKs: mutations.activeFDKs ?? ctx.activeFDKs,
        messageCoordinationNumber: mutations.messageCoordinationNumber ?? ctx.messageCoordinationNumber,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// XState Machine
// ─────────────────────────────────────────────────────────────────────────────

export const atmMachine = setup({
    types: {
        context: {} as AtmContext,
        events: {} as AtmEvent,
    },
    actions: {
        // ── Data storage ─────────────────────────────────────────────────────
        storeStateTables: assign({
            stateTables: ({ context, event }) => {
                if (event.type !== 'STATE_TABLES_LOADED') return context.stateTables;
                return { ...context.stateTables, ...event.data };
            },
        }),
        storeScreenData: assign({
            screenData: ({ context, event }) => {
                if (event.type !== 'SCREEN_DATA_LOADED') return context.screenData;
                return { ...context.screenData, ...event.data };
            },
        }),
        storeFitData: assign({
            fitData: ({ context, event }) => {
                if (event.type !== 'FIT_DATA_LOADED') return context.fitData;
                return { ...context.fitData, ...event.data };
            },
        }),
        storeConfigParams: assign({
            configParams: ({ context, event }) => {
                if (event.type !== 'CONFIG_PARAMS_LOADED') return context.configParams;
                return { ...context.configParams, ...event.data };
            },
        }),

        // ── Session lifecycle ─────────────────────────────────────────────────
        clearSession: assign({
            cardNumber: '',
            track2: '',
            serviceCode: '',
            fitId: null,
            cardReaderEnabled: true,
            pinBuffer: '',
            bufferB: '',
            bufferC: '',
            opcodeBuffer: OPCODE_INIT,
            amountBuffer: AMOUNT_INIT,
            fdkBuffer: '',
            activeFDKs: [],
            pendingTransactionRequest: null,
            authScreenNumber: null,
            authCode: null,
            errorMessage: null,
        }),

        storeCardData: assign(({ context, event }) => {
            if (event.type !== 'CARD_INSERTED') return {};
            const parsed = parseTrack2(event.data);
            return {
                cardNumber: parsed.cardNumber,
                track2: parsed.track2,
                serviceCode: parsed.serviceCode,
                fitId: event.fitId ?? null,
            };
        }),

        // ── Advance through NDC states on card insert (start at '000') ───────
        processInitialState: assign(({ context }) => {
            return runState(context, '000', { type: 'CARD_INSERTED' });
        }),

        // ── Handle FDK press ─────────────────────────────────────────────────
        processFdkPress: assign(({ context, event }) => {
            if (event.type !== 'FDK_PRESSED') return {};
            return runState(context, context.currentStateNumber, {
                type: 'FDK_PRESSED',
                fdk: event.fdk as any,
            });
        }),

        // ── Handle key press ─────────────────────────────────────────────────
        processKeyPress: assign(({ context, event }) => {
            if (event.type !== 'KEY_PRESSED') return {};
            return runState(context, context.currentStateNumber, {
                type: 'KEY_PRESSED',
                key: event.key,
            });
        }),

        // ── Handle PIN confirmed ─────────────────────────────────────────────
        processPinConfirmed: assign(({ context }) => {
            return runState(context, context.currentStateNumber, { type: 'PIN_CONFIRMED' });
        }),

        // ── Handle amount confirmed ──────────────────────────────────────────
        processAmountConfirmed: assign(({ context }) => {
            return runState(context, context.currentStateNumber, { type: 'AMOUNT_CONFIRMED' });
        }),

        // ── Handle cancel ────────────────────────────────────────────────────
        processCancel: assign(({ context }) => {
            return runState(context, context.currentStateNumber, { type: 'CANCEL' });
        }),

        // ── Host auth reply ──────────────────────────────────────────────────
        applyAuthApproved: assign(({ context, event }) => {
            if (event.type !== 'AUTHORIZATION_APPROVED') return {};
            const next = event.nextStateNumber ?? context.currentStateNumber;
            return {
                ...runState(context, next, null),
                authCode: event.authCode ?? null,
                authScreenNumber: event.screenNumber ?? null,
                pendingTransactionRequest: null,
            };
        }),
        applyAuthDenied: assign(({ context, event }) => {
            if (event.type !== 'AUTHORIZATION_DENIED') return {};
            return {
                pendingTransactionRequest: null,
                errorMessage: event.reason,
                authScreenNumber: event.screenNumber ?? null,
                currentScreenNumber: event.screenNumber ?? context.currentScreenNumber,
            };
        }),

        // ── Crypto ───────────────────────────────────────────────────────────
        applyNewCommsKey: assign({
            pinKey: ({ event }) => event.type === 'COMMS_KEY_UPDATED' ? event.pinKey : '',
        }),
        applyMasterKey: assign({
            masterKey: ({ event }) => event.type === 'MASTER_KEY_LOADED' ? event.masterKey : '',
        }),
    },
    guards: {
        hasStateTables: ({ context }) => Object.keys(context.stateTables).length > 0,
        pendingTransaction: ({ context }) => Boolean(context.pendingTransactionRequest),
    },
}).createMachine({
    id: 'atm',
    initial: 'offline',
    context: initialContext(),

    states: {
        // ── Not connected to host ─────────────────────────────────────────────
        offline: {
            on: {
                HOST_CONNECTED: { target: 'downloading', actions: assign({ hostConnected: true }) },
            },
        },

        // ── Host is downloading state tables, screens, FITs, config ──────────
        downloading: {
            on: {
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
                DOWNLOAD_COMPLETE: { target: 'idle' },
                STATE_TABLES_LOADED: { actions: ['storeStateTables'] },
                SCREEN_DATA_LOADED: { actions: ['storeScreenData'] },
                FIT_DATA_LOADED: { actions: ['storeFitData'] },
                CONFIG_PARAMS_LOADED: { actions: ['storeConfigParams'] },
                COMMS_KEY_UPDATED: { actions: ['applyNewCommsKey'] },
                MASTER_KEY_LOADED: { actions: ['applyMasterKey'] },
            },
        },

        // ── Ready and waiting for a card ──────────────────────────────────────
        idle: {
            entry: ['clearSession'],
            on: {
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
                CARD_INSERTED: {
                    target: 'processingCard',
                    actions: ['storeCardData'],
                },
                // Allow data updates even while idle (host may push new tables)
                STATE_TABLES_LOADED: { actions: ['storeStateTables'] },
                SCREEN_DATA_LOADED: { actions: ['storeScreenData'] },
                FIT_DATA_LOADED: { actions: ['storeFitData'] },
                COMMS_KEY_UPDATED: { actions: ['applyNewCommsKey'] },
                MASTER_KEY_LOADED: { actions: ['applyMasterKey'] },
            },
        },

        // ── Card detected — initialise buffers and enter NDC state '000' ─────
        processingCard: {
            entry: ['processInitialState'],
            always: [
                // If state tables are loaded, go to running state
                {
                    guard: 'hasStateTables',
                    target: 'running',
                },
                // If no state tables yet, go straight to waitingForHost
                {
                    target: 'waitingForHost',
                },
            ],
            on: {
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
            },
        },

        // ── Dynamic NDC state engine — the heart of the emulator ─────────────
        running: {
            on: {
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },

                FDK_PRESSED: {
                    actions: ['processFdkPress'],
                    // After processing, if a transaction request was produced → wait for host
                    target: 'running', // self-transition to re-evaluate always rules
                },
                KEY_PRESSED: {
                    actions: ['processKeyPress'],
                    target: 'running',
                },
                PIN_CONFIRMED: {
                    actions: ['processPinConfirmed'],
                    target: 'running',
                },
                AMOUNT_CONFIRMED: {
                    actions: ['processAmountConfirmed'],
                    target: 'running',
                },
                CANCEL: {
                    actions: ['processCancel'],
                    target: 'ejectingCard',
                },

                // Host data updates mid-session
                STATE_TABLES_LOADED: { actions: ['storeStateTables'] },
                SCREEN_DATA_LOADED: { actions: ['storeScreenData'] },
                FIT_DATA_LOADED: { actions: ['storeFitData'] },
                COMMS_KEY_UPDATED: { actions: ['applyNewCommsKey'] },
            },
            always: [
                // If the state processor set a transactionRequest → go wait for host
                {
                    guard: 'pendingTransaction',
                    target: 'waitingForHost',
                },
            ],
        },

        // ── Waiting for host to reply to a transaction request ────────────────
        waitingForHost: {
            on: {
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
                AUTHORIZATION_APPROVED: {
                    target: 'dispensingCash',
                    actions: ['applyAuthApproved'],
                },
                AUTHORIZATION_DENIED: {
                    target: 'error',
                    actions: ['applyAuthDenied'],
                },
            },
        },

        // ── Cash dispense in progress ─────────────────────────────────────────
        dispensingCash: {
            after: {
                2000: { target: 'presentingCash' },
            },
            on: {
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
            },
        },

        // ── Waiting for customer to take cash ─────────────────────────────────
        presentingCash: {
            on: {
                CASH_TAKEN: { target: 'ejectingCard' },
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
            },
        },

        // ── Transaction error (declined etc.) ────────────────────────────────
        error: {
            after: {
                5000: { target: 'ejectingCard' },
            },
            on: {
                CANCEL: { target: 'ejectingCard' },
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
            },
        },

        // ── Card ejection — wait for customer to remove card ──────────────────
        ejectingCard: {
            on: {
                CARD_TAKEN: { target: 'idle' },
                HOST_DISCONNECTED: { target: 'offline', actions: assign({ hostConnected: false }) },
            },
        },
    },
});
