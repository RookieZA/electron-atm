import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createActor } from 'xstate';
import { atmMachine, TcpHostConnection, SupplyCounters } from '@atm/core';
import { MessageClass, UnsolicitedStatus, WriteCommand, WriteCommandModifier, TerminalCommand, type DataCommand, parseHostTransactionReply, HostFunctionCode, decryptNewCommsKey } from '@atm/protocol';
import * as fs from 'fs';
import type { AtmConfig } from './shared/ipc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_FILE_PATH = path.join(app.getPath('userData'), 'atm-config.json');
const DOWNLOADED_STATE_PATH = path.join(app.getPath('userData'), 'atm-downloaded-state.json');

/** Persist downloaded host data (states, screens, FITs, config params) to disk */
function saveDownloadedState(context: any) {
    try {
        const data = {
            stateTables: context.stateTables || {},
            screenData: context.screenData || {},
            fitData: context.fitData || {},
            configParams: context.configParams || {},
            configId: context.configId || '0000',
            masterKey: context.masterKey,
            pinKey: context.pinKey,
            savedAt: new Date().toISOString(),
        };
        fs.writeFileSync(DOWNLOADED_STATE_PATH, JSON.stringify(data, null, 2));
        console.log('[Main] Downloaded state saved to disk.');
    } catch (e) {
        console.error('[Main] Failed to save downloaded state:', e);
    }
}

/** Restore previously downloaded host data from disk on startup */
function restoreDownloadedState() {
    try {
        if (!fs.existsSync(DOWNLOADED_STATE_PATH)) return;
        const raw = fs.readFileSync(DOWNLOADED_STATE_PATH, 'utf-8');
        const data = JSON.parse(raw);
        console.log(`[Main] Restoring downloaded state from disk (saved ${data.savedAt})`);
        if (data.stateTables && Object.keys(data.stateTables).length > 0)
            atmActor.send({ type: 'STATE_TABLES_LOADED', data: { parsed: data.stateTables } });
        if (data.screenData && Object.keys(data.screenData).length > 0)
            atmActor.send({ type: 'SCREEN_DATA_LOADED', data: { parsed: data.screenData } });
        if (data.fitData && Object.keys(data.fitData).length > 0)
            atmActor.send({ type: 'FIT_DATA_LOADED', data: { parsed: data.fitData } });

        if (data.masterKey) {
            atmActor.send({ type: 'MASTER_KEY_LOADED', masterKey: data.masterKey });
        }
        if (data.pinKey) {
            atmActor.send({ type: 'COMMS_KEY_UPDATED', pinKey: data.pinKey, kcv: '000000' } as any);
        }
        // Assuming configId event isn't built yet, we could trigger it or let the host dictate it
    } catch (e) {
        console.error('[Main] Failed to restore downloaded state:', e);
    }
}

/** Look up Financial Institution from loaded FIT tables by card number prefix */
function resolveFitFromCard(cardNumber: string, fitData: Record<string, any>): string | null {
    const digits = cardNumber.replace(/\D/g, '');
    for (const fit of Object.values(fitData)) {
        const pfiid = (fit as any).PFIID?.replace(/F+$/, '') ?? '';
        if (pfiid && digits.startsWith(pfiid)) return (fit as any).PIDDX ?? null;
    }
    return null;
}

// Initialize Counters
// Real ATMs back these to static RAM to survive reboots, we simulate this later during disk restore
const counters = new SupplyCounters();

// Initialize the ATM State Machine
const atmActor = createActor(atmMachine, { systemId: 'atm-machine' });
atmActor.start();

// Restore previously downloaded host config from disk immediately
restoreDownloadedState();

let mainWindow: BrowserWindow | null = null;
let hostConnection: TcpHostConnection | null = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1600,
        height: 1000,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    mainWindow.loadFile(path.join(__dirname, 'index.html'));

    // Open the DevTools.
    mainWindow.webContents.openDevTools();

    // Subscribe to state changes and push them to the renderer
    atmActor.subscribe((state) => {
        if (mainWindow) {
            mainWindow.webContents.send('atm:stateChange', state.value, state.context);
        }
    });

    mainWindow!.webContents.on('console-message', (_event: any, _level: any, message: any, _line: any, _sourceId: any) => {
        console.log(`[Renderer Console]: ${message}`);
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// System & Config
ipcMain.handle('system:ping', () => 'pong');

ipcMain.handle('system:selectDirectory', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

ipcMain.handle('config:load', async (): Promise<AtmConfig[]> => {
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            if (Array.isArray(parsed)) {
                return parsed as AtmConfig[];
            } else if (parsed && typeof parsed === 'object') {
                // Migration from old single config
                return [{ ...parsed, id: parsed.id || 'default' }] as AtmConfig[];
            }
        }
    } catch (error) {
        console.error('Failed to load config:', error);
    }
    return [];
});

ipcMain.handle('config:save', async (_event, config: AtmConfig) => {
    try {
        let profiles: AtmConfig[] = [];
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            const parsed = JSON.parse(data);
            profiles = Array.isArray(parsed) ? parsed : [{ ...parsed, id: parsed.id || 'default' }];
        }

        const existingIdx = profiles.findIndex(p => p.id === config.id);
        if (existingIdx >= 0) {
            profiles[existingIdx] = config;
        } else {
            profiles.push(config);
        }

        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(profiles, null, 2));
    } catch (error) {
        console.error('Failed to save config:', error);
        throw error;
    }
});

ipcMain.handle('config:delete', async (_event, id: string) => {
    try {
        if (!fs.existsSync(CONFIG_FILE_PATH)) return;
        const data = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(data);
        const profiles: AtmConfig[] = Array.isArray(parsed) ? parsed : [{ ...parsed, id: parsed.id || 'default' }];

        const updated = profiles.filter(p => p.id !== id);
        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updated, null, 2));
    } catch (error) {
        console.error('Failed to delete config:', error);
        throw error;
    }
});

// Host Connection Lifecycle
ipcMain.handle('host:connect', async (_event, config: AtmConfig) => {
    try {
        if (!config || !config.hostAddress) {
            throw new Error('Valid configuration required to connect.');
        }

        if (!hostConnection) {
            hostConnection = new TcpHostConnection();

            const sendNdcLog = (dir: 'IN' | 'OUT' | 'SYS', raw: string, parsed?: string) => {
                if (mainWindow) {
                    mainWindow.webContents.send('atm:ndcLog', {
                        ts: new Date().toLocaleTimeString(),
                        dir, raw, parsed
                    });
                }
            };

            hostConnection.onMessage((msg) => {
                sendNdcLog('IN', msg.raw, `Class=${msg.messageClass}`);
                console.log(`[Main] Received from Host: Class=${msg.messageClass}`);

                if (msg.messageClass === MessageClass.WriteCommand) {
                    const writeCmd = msg as WriteCommand;
                    switch (writeCmd.writeModifier) {
                        case WriteCommandModifier.StateTableLoad:
                            atmActor.send({ type: 'STATE_TABLES_LOADED', data: { raw: writeCmd.data } });
                            break;
                        case WriteCommandModifier.ScreenDataLoad:
                            atmActor.send({ type: 'SCREEN_DATA_LOADED', data: { raw: writeCmd.data } });
                            break;
                        case WriteCommandModifier.FITLoad:
                            atmActor.send({ type: 'FIT_DATA_LOADED', data: { raw: writeCmd.data } });
                            break;
                        case WriteCommandModifier.ConfigurationLoad:
                            atmActor.send({ type: 'CONFIG_PARAMS_LOADED', data: { raw: writeCmd.data } });
                            break;
                        default:
                            console.log('[Main] Unhandled Write Modifier:', writeCmd.writeModifier);
                    }
                } else if (msg.messageClass === MessageClass.TerminalCommand) {
                    const termCmd = msg as TerminalCommand;
                    const context = atmActor.getSnapshot().context as any;

                    if (termCmd.commandCode === '1') {
                        // Go In-Service command (e.g., '1' and modifier '2')
                        atmActor.send({ type: 'DOWNLOAD_COMPLETE' });
                        // Gap 3: Persist the downloaded data to disk now that download is complete
                        saveDownloadedState(atmActor.getSnapshot().context);
                    } else if (termCmd.commandCode === '8') {
                        // Send Configuration Information
                        console.log(`[Main] Host requested Configuration Info`);
                        const fwId = 'EMULATOR01';
                        const hwConfig = '000000000000000000'; // mocked hardware config string
                        const suppl = counters.getSuppliesStatus();
                        const configInfoPayload = `${fwId} ${hwConfig}${suppl}`;

                        hostConnection?.send({
                            logicalUnitNumber: config.luno.padEnd(9, ' '),
                            messageClass: MessageClass.SolicitedStatus,
                            statusDescriptor: 'b', // Configuration Information Reply
                            statusInformation: configInfoPayload
                        } as any);
                    } else if (termCmd.commandCode === '3') {
                        // Send Configuration ID
                        console.log(`[Main] Host requested Configuration ID`);
                        hostConnection?.send({
                            logicalUnitNumber: config.luno.padEnd(9, ' '),
                            messageClass: MessageClass.SolicitedStatus,
                            statusDescriptor: 'f', // Config ID Reply
                            statusInformation: context.configId || '0000'
                        } as any);
                    } else if (termCmd.commandCode === '7') {
                        // Send Supply Counters
                        console.log(`[Main] Host requested Supply Counters`);
                        hostConnection?.send({
                            logicalUnitNumber: config.luno.padEnd(9, ' '),
                            messageClass: MessageClass.SolicitedStatus,
                            statusDescriptor: 'e', // Supply Counters Reply
                            statusInformation: counters.getCountersPayload()
                        } as any);
                    }
                } else if ((msg.messageClass as any) === 'DataCommand' || (msg as any).modifier) {
                    // Data Commands (these are handled under WriteCommand by the parser, but identified by their modifiers)
                    const dataCmd = msg as DataCommand;
                    const context = atmActor.getSnapshot().context as any;

                    if (dataCmd.modifier === '3') {
                        // Interactive Transaction Response
                        console.log(`[Main] Host sent Interactive Transaction Response`);
                        // Simplified payload processing: Assume data contains screen string and possibly active FDK/Keys fields
                        atmActor.send({ type: 'INTERACTIVE_TXN_RESPONSE', data: dataCmd.data || '' } as any);
                    } else if (dataCmd.modifier === '4') {
                        // Extended Encryption Key Information
                        console.log(`[Main] Host sent Extended Encryption Key Information`);
                        if (!context.masterKey) {
                            console.error('[Main] Cannot decrypt new comms key: No master key loaded');
                        } else {
                            try {
                                const newKeyRawDecimal = dataCmd.data || '';
                                const newKeyHex = decryptNewCommsKey(context.masterKey, newKeyRawDecimal, '10');
                                const kcv = '000000'; // Would calculate getKeyCheckValue(newKeyHex) here once imported
                                atmActor.send({ type: 'COMMS_KEY_UPDATED', pinKey: newKeyHex, kcv } as any);
                                console.log('[Main] New Comms Key derived and applied.');
                                saveDownloadedState(atmActor.getSnapshot().context);
                            } catch (e) {
                                console.error('[Main] Key decryption failed:', e);
                            }
                        }
                    }
                } else if (msg.messageClass === MessageClass.TransactionReply) {
                    // Host responded to a transaction request ('8' message)
                    const reply = parseHostTransactionReply(msg.raw.substring(10));
                    console.log('[Main] Transaction Reply:', reply);

                    if (reply.functionCode === HostFunctionCode.ApprovedDispense || reply.functionCode === HostFunctionCode.PrintReceipt) {
                        atmActor.send({ type: 'AUTHORIZATION_APPROVED' });
                        // Notify renderer of dispense details
                        if (mainWindow) {
                            mainWindow.webContents.send('atm:dispense', {
                                cassette: reply.dispenseCassette,
                                count: reply.billCount,
                                authCode: reply.authCode
                            });
                        }
                    } else if (reply.functionCode === HostFunctionCode.Denied) {
                        atmActor.send({ type: 'AUTHORIZATION_DENIED', reason: 'Transaction declined by host' });
                    } else if (reply.functionCode === HostFunctionCode.RetainCard) {
                        atmActor.send({ type: 'AUTHORIZATION_DENIED', reason: 'Card retained by host' });
                    }
                }
            });
            hostConnection.onDisconnect(() => {
                atmActor.send({ type: 'HOST_DISCONNECTED' });
            });
        }

        if (hostConnection && !hostConnection.isConnected()) {
            await hostConnection.connect(config.hostAddress, config.tcpPort);

            // Send Application Power-Up Message (Unsolicited Status)
            await hostConnection.send({
                logicalUnitNumber: config.luno.padEnd(9, ' '),
                messageClass: MessageClass.UnsolicitedStatus,
                statusDescriptor: '1',
                deviceIdentifier: '2',
                deviceStatus: '0',
                errorSeverity: '0',
                diagnosticStatus: '0'
            } as UnsolicitedStatus);
        }

        // Let the state machine know we have connected physically
        atmActor.send({ type: 'HOST_CONNECTED' });
    } catch (e) {
        console.error('[Main] Failed to connect to Host:', e);
    }
});

ipcMain.handle('host:disconnect', async () => {
    if (hostConnection) {
        await hostConnection.disconnect();
    }
});

// ATM Hardware
ipcMain.handle('atm:insertCard', (_event, cardData: string) => {
    // Gap 4: Resolve FIT from card number and include it in the event
    const context = atmActor.getSnapshot().context as any;
    const fitId = resolveFitFromCard(cardData.split('=')[0] || '', context.fitData || {});
    if (fitId) console.log(`[Main] Card ${cardData.split('=')[0]} → FIT ID: ${fitId}`);
    atmActor.send({ type: 'CARD_INSERTED', data: cardData, fitId });
});
ipcMain.handle('atm:pressKey', (_event, key: string) => {
    atmActor.send({ type: 'KEY_PRESSED', key });
});
ipcMain.handle('atm:pressFdk', (_event, fdk: string) => {
    atmActor.send({ type: 'FDK_PRESSED', fdk });
});
ipcMain.handle('atm:confirmPin', () => {
    atmActor.send({ type: 'PIN_CONFIRMED' });
});
ipcMain.handle('atm:confirmAmount', () => {
    atmActor.send({ type: 'AMOUNT_CONFIRMED' });
});
ipcMain.handle('atm:cancel', () => {
    atmActor.send({ type: 'CANCEL' });
});
ipcMain.handle('atm:takeCash', () => {
    atmActor.send({ type: 'CASH_TAKEN' });
});
ipcMain.handle('atm:takeCard', () => {
    atmActor.send({ type: 'CARD_TAKEN' });
});
ipcMain.handle('atm:resetCounters', () => {
    counters.reset();
    console.log('[Main] Supply counters reset via Inspector');
    // We don't necessarily need a state machine event unless it affects transitions
});
