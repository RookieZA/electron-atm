import { contextBridge, ipcRenderer } from 'electron';
import type { IAtmBridge, IpcChannel, AtmConfig } from './shared/ipc.js';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
const api: IAtmBridge = {
    ping: () => ipcRenderer.invoke('system:ping'),
    selectDirectory: () => ipcRenderer.invoke('system:selectDirectory'),

    // Configuration
    loadConfig: () => ipcRenderer.invoke('config:load'),
    saveConfig: (config: AtmConfig) => ipcRenderer.invoke('config:save', config),

    // ATM Hardware Actions
    insertCard: (cardData: string) => ipcRenderer.invoke('atm:insertCard', cardData),
    pressKey: (key: string) => ipcRenderer.invoke('atm:pressKey', key),
    pressFdk: (fdk: string) => ipcRenderer.invoke('atm:pressFdk', fdk),
    confirmPin: () => ipcRenderer.invoke('atm:confirmPin'),
    confirmAmount: () => ipcRenderer.invoke('atm:confirmAmount'),
    cancel: () => ipcRenderer.invoke('atm:cancel'),
    takeCash: () => ipcRenderer.invoke('atm:takeCash'),
    takeCard: () => ipcRenderer.invoke('atm:takeCard'),
    resetCounters: () => ipcRenderer.invoke('atm:resetCounters'),

    // Host Actions
    connectToHost: () => ipcRenderer.invoke('host:connect'),
    disconnectFromHost: () => ipcRenderer.invoke('host:disconnect'),

    // Subscriptions
    onStateChange: (callback) => {
        ipcRenderer.on('atm:stateChange', (_event, state, context) => callback(state, context));
    },
    removeStateChangeListener: (callback) => {
        ipcRenderer.removeAllListeners('atm:stateChange');
    },
    onDispense: (callback) => {
        ipcRenderer.on('atm:dispense', (_event, info) => callback(info));
    },
    onNdcLog: (callback: (entry: any) => void) => {
        ipcRenderer.on('atm:ndcLog', (_event, entry) => callback(entry));
    }
};

contextBridge.exposeInMainWorld('atmAPI', api);
