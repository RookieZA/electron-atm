const { contextBridge, ipcRenderer } = require('electron');
const settings = require('electron-settings');

// We expose the minimum required IPC and Node features to the renderer.
contextBridge.exposeInMainWorld('electronAPI', {
    // Pass regular IPC events
    send: (channel, data) => {
        let validChannels = [
            'settings-entered-network-connect',
            'fdk-pressed',
            'pinpad-button-pressed',
            'connect-button-pressed',
            'ui-read-card'
        ];
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    sendMultiple: (channel, data1, data2) => {
        if (channel === 'ui-read-card') {
            ipcRenderer.send(channel, data1, data2);
        }
    },
    on: (channel, func) => {
        let validChannels = [
            'network-connect',
            'atm-process-fdk-pressed',
            'atm-process-pinpad-button-pressed',
            'atm-network-connection-established',
            'atm-network-disconnected',
            'parse-host-message',
            'atm-process-host-message',
            'build-message-to-host',
            'network-send',
            'atm-read-card',
            'ui-change-screen-image',
            'ui-change-current-state-on-states-page'
        ];
        if (validChannels.includes(channel)) {
            // Deliberately strip event as it includes `sender` 
            ipcRenderer.on(channel, (event, ...args) => func(...args));
        }
    },

    // Expose electron-settings directly since it's widely used in the renderer
    settings: {
        get: (key) => settings.getSync(key),
        set: (key, value) => settings.setSync(key, value)
    },

    // Minimal dialog exposure to replace `remote.dialog` for file select
    showOpenDialog: async (options) => {
        return await ipcRenderer.invoke('dialog:showOpenDialog', options);
    }
});
