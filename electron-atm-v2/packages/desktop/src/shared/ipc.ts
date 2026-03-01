export type IpcChannel =
    | 'system:ping'
    | 'system:selectDirectory'
    | 'config:load'
    | 'config:save'
    | 'atm:insertCard'
    | 'atm:pressKey'
    | 'atm:pressFdk'
    | 'atm:confirmPin'
    | 'atm:confirmAmount'
    | 'atm:cancel'
    | 'atm:takeCash'
    | 'atm:takeCard'
    | 'atm:dispense'
    | 'atm:ndcLog'
    | 'atm:resetCounters'
    | 'host:connect'
    | 'host:disconnect';

export interface AtmConfig {
    hostAddress: string;
    tcpPort: number;
    luno: string;
    terminalMasterKey: string;
    communicationsKey: string;
    imagePath: string;
    profileName: string;
    ndcMessageHeader?: string;
}

export interface IAtmBridge {
    // System
    ping: () => Promise<string>;
    selectDirectory: () => Promise<string | null>;

    // Configuration
    loadConfig: () => Promise<AtmConfig | null>;
    saveConfig: (config: AtmConfig) => Promise<void>;

    // ATM Hardware Actions
    insertCard: (cardData: string) => Promise<void>;
    pressKey: (key: string) => Promise<void>;
    pressFdk: (fdk: string) => Promise<void>;
    confirmPin: () => Promise<void>;
    confirmAmount: () => Promise<void>;
    cancel: () => Promise<void>;
    takeCash: () => Promise<void>;
    takeCard: () => Promise<void>;
    resetCounters: () => Promise<void>;

    // Host Actions (For Simulation Purposes)
    connectToHost: () => Promise<void>;
    disconnectFromHost: () => Promise<void>;

    onStateChange: (callback: (state: string, context: any) => void) => void;
    removeStateChangeListener: (callback: (state: string, context: any) => void) => void;
    onDispense: (callback: (info: { cassette?: string; count?: number; authCode?: string }) => void) => void;
    onNdcLog: (callback: (entry: { ts: string; dir: 'IN' | 'OUT' | 'SYS'; raw: string; parsed?: string }) => void) => void;
}
