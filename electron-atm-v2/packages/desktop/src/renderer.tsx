import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { IAtmBridge } from './shared/ipc.js';
import './index.css';

import { ATMLayout } from './components/atm/ATMLayout.js';
import { ATMKeypad } from './components/atm/ATMKeypad.js';
import { SetupScreen } from './components/setup/SetupScreen.js';
import { Button } from './components/ui/button.js';
import { Card, CardContent } from './components/ui/card.js';
import { Switch } from './components/ui/switch.js';
import { Label } from './components/ui/label.js';
import { Loader2, CreditCard, Banknote, AlertCircle } from 'lucide-react';
import { getScreenContent, parseNDCScreen, executeScreenActions } from './lib/screens/ndcScreens.js';
import { StatusBar } from './components/inspector/StatusBar.js';
import { InspectorPanel } from './components/inspector/InspectorPanel.js';
import type { LogEntry } from './components/inspector/NdcLog.js';
import type { TestCard } from './components/inspector/CardsPanel.js';

declare global {
    interface Window {
        atmAPI: IAtmBridge;
    }
}

const CARDS_STORAGE_KEY = 'atm-emulator-test-cards';

function loadCardsFromStorage(): TestCard[] {
    try {
        const raw = localStorage.getItem(CARDS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveCardsToStorage(cards: TestCard[]) {
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
}

const App = () => {
    const [atmState, setAtmState] = useState<string>('unknown');
    const [atmContext, setAtmContext] = useState<any>({});
    const [rawNdcMode, setRawNdcMode] = useState(false);
    const [dispenseInfo, setDispenseInfo] = useState<{ cassette?: string; count?: number; authCode?: string } | null>(null);

    // Configuration State — always false on startup so Setup Screen always shows
    const [isConfigured, setIsConfigured] = useState<boolean>(false);
    const [atmConfig, setAtmConfig] = useState<any>(null);

    // Inspector Panel State
    const [ndcLog, setNdcLog] = useState<LogEntry[]>([]);
    const [testCards, setTestCards] = useState<TestCard[]>(loadCardsFromStorage);
    const [selectedCard, setSelectedCard] = useState<TestCard | undefined>(undefined);

    const appendLog = useCallback((entry: LogEntry) => {
        setNdcLog(prev => [...prev.slice(-200), entry]);
    }, []);

    useEffect(() => {
        // Load saved config to pre-fill the Setup Screen fields, but don't skip the screen
        window.atmAPI.loadConfig().then((config) => {
            if (config) {
                setAtmConfig(config);
                // NOTE: We intentionally do NOT call setIsConfigured(true) here.
                // The Setup Screen always shows so the user can verify/update their host config
                // before each session. Clicking "Continue" applies the settings and proceeds.
            }
        });

        window.atmAPI.onStateChange((state, context) => {
            setAtmState(state);
            setAtmContext(context);

            // Play sound effect when dispensing cash
            if (state === 'dispensingCash') {
                const audio = new Audio('./src/assets/sounds/dispense.mp3');
                audio.play().catch(e => console.log('Audio playback failed', e));
            }
        });

        window.atmAPI.onDispense((info) => {
            setDispenseInfo(info);
        });

        // NDC Log listener
        (window.atmAPI as any).onNdcLog?.((entry: LogEntry) => {
            appendLog(entry);
        });

        // ── Gap 1: Global keyboard shortcuts ───────────────────────
        const handleKeyDown = (e: KeyboardEvent) => {
            // Skip if user is typing inside an input/textarea
            const tag = (e.target as HTMLElement)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            // FDK keys A–H (matching old build: A, B, C, D on right = FDK1-4, E–H on left)
            const fdkMap: Record<string, string> = {
                a: 'A', b: 'B', c: 'C', d: 'D',
                e: 'E', f: 'F', g: 'G', h: 'H', i: 'I',
            };
            if (fdkMap[e.key.toLowerCase()]) {
                e.preventDefault();
                window.atmAPI.pressFdk(fdkMap[e.key.toLowerCase()]);
                return;
            }
            // Numeric keys 0–9
            if (/^[0-9]$/.test(e.key)) {
                e.preventDefault();
                window.atmAPI.pressKey(e.key);
                return;
            }
            // Enter
            if (e.key === 'Enter') {
                e.preventDefault();
                window.atmAPI.pressKey('ENTER');
                return;
            }
            // Backspace
            if (e.key === 'Backspace') {
                e.preventDefault();
                window.atmAPI.pressKey('BACKSPACE');
                return;
            }
            // Escape — cancel / clear
            if (e.key === 'Escape') {
                e.preventDefault();
                window.atmAPI.pressKey('CANCEL');
                return;
            }
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.atmAPI.removeStateChangeListener(() => { });
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, []);


    const handleConfigComplete = async (config: any) => {
        await window.atmAPI.saveConfig(config);
        setAtmConfig(config);
        setIsConfigured(true);
    };

    const handleFdkPress = (key: string) => {
        console.log(`FDK Pressed: ${key}`);
        if (atmState === 'amountEntry') {
            switch (key) {
                case 'A': window.atmAPI.pressKey('2'); window.atmAPI.pressKey('0'); window.atmAPI.confirmAmount(); break;
                case 'B': window.atmAPI.pressKey('4'); window.atmAPI.pressKey('0'); window.atmAPI.confirmAmount(); break;
                case 'C': window.atmAPI.pressKey('6'); window.atmAPI.pressKey('0'); window.atmAPI.confirmAmount(); break;
                case 'D': window.atmAPI.pressKey('1'); window.atmAPI.pressKey('0'); window.atmAPI.pressKey('0'); window.atmAPI.confirmAmount(); break;
            }
        }
    };

    // Card management
    const handleAddCard = useCallback((card: TestCard) => {
        setTestCards(prev => { const next = [...prev, card]; saveCardsToStorage(next); return next; });
    }, []);
    const handleDeleteCard = useCallback((cardNumber: string) => {
        setTestCards(prev => { const next = prev.filter(c => c.number !== cardNumber); saveCardsToStorage(next); return next; });
    }, []);
    const handleSelectCard = useCallback((card: TestCard) => {
        setSelectedCard(card);
        // Build a Track 2 string from the card and insert it into the ATM
        const track2 = `${card.number}=${card.expiryDate}${card.serviceCode}${card.pvki}${card.pvv}${card.cvv}${card.discretionaryData || ''}`;
        if (atmState === 'idle') window.atmAPI.insertCard(track2);
    }, [atmState]);

    const handleKeypadPress = (key: string) => {
        if (key === 'ENTER') {
            if (atmState === 'pinEntry') window.atmAPI.confirmPin();
            if (atmState === 'amountEntry') window.atmAPI.confirmAmount();
        } else if (key === 'CANCEL') {
            window.atmAPI.cancel();
        } else if (key === 'CLEAR') {
            // Not implemented in state machine yet
        } else {
            window.atmAPI.pressKey(key);
        }
    };

    const handleInsertCard = () => {
        if (atmState === 'idle') {
            if (selectedCard) {
                const card = selectedCard;
                const track2 = `${card.number}=${card.expiryDate}${card.serviceCode}${card.pvki}${card.pvv}${card.cvv}${card.discretionaryData || ''}`;
                window.atmAPI.insertCard(track2);
            } else {
                window.atmAPI.insertCard('4111111111111111=2512101000000000');
            }
        }
    };

    const renderScreen = () => {
        let currentScreenContent = getScreenContent(atmContext.currentScreenNumber || '000', atmContext.screenData);
        let screenLayout = executeScreenActions([{ type: 'insert_screen', screenNumber: atmContext.currentScreenNumber || '000' }], atmContext.screenData);

        // Map ATM States to overrides if we don't have a reliable mapped screen yet
        if (atmState === 'offline') {
            screenLayout = executeScreenActions([{ type: 'clear_screen' }, { type: 'add_text', text: 'OUT OF SERVICE\n\n\n                           SYSTEM OFFLINE' }], {});
        } else if (atmState === 'downloading') {
            screenLayout = executeScreenActions([{ type: 'clear_screen' }, { type: 'add_text', text: 'SYSTEM INITIALISING\n\n\n                  DOWNLOADING CONFIGURATION' }], {});
        }

        if (rawNdcMode) {
            const lines = parseNDCScreen(currentScreenContent);
            return {
                imageFile: null,
                textRows: lines
            };
        }

        switch (atmState) {
            case 'offline':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-950 flex flex-col items-center justify-center text-red-500 gap-6 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
                            <AlertCircle className="w-24 h-24 animate-pulse opacity-50" />
                            <h1 className="text-5xl font-black tracking-[0.2em] opacity-80 animate-pulse">OUT OF SERVICE</h1>
                            <p className="text-xl text-slate-500 tracking-widest uppercase">System Offline</p>
                        </div>
                    )
                };
            case 'downloading':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-950 flex flex-col items-center justify-center text-blue-400 gap-8 shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
                            <Loader2 className="w-24 h-24 animate-spin opacity-80" />
                            <h1 className="text-4xl font-black tracking-[0.2em] opacity-80 animate-pulse">SYSTEM INITIALISING</h1>
                            <p className="text-xl text-slate-500 tracking-widest uppercase">Downloading Configuration...</p>
                        </div>
                    )
                };
            case 'idle':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-gradient-to-b from-blue-900 to-slate-950 flex flex-col items-center justify-between py-24 text-white shadow-[inset_0_0_100px_rgba(0,0,0,0.8)]">
                            <div className="text-center space-y-6">
                                <h1 className="text-6xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-emerald-400">ROXCO DIGITAL</h1>
                                <div className="h-1 w-32 bg-gradient-to-r from-blue-500 to-emerald-500 mx-auto rounded-full opacity-50"></div>
                                <h2 className="text-2xl font-light tracking-widest text-slate-300">PREMIER BANKING</h2>
                            </div>

                            <div className="flex flex-col items-center gap-8 animate-pulse">
                                <CreditCard className="w-20 h-20 text-blue-400 opacity-80 mt-12" />
                                <span className="text-3xl font-medium tracking-wider text-blue-300">PLEASE INSERT YOUR CARD</span>
                            </div>
                        </div>
                    )
                };
            case 'readingCard':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-blue-400 gap-8">
                            <Loader2 className="w-24 h-24 animate-spin opacity-80" />
                            <h2 className="text-3xl font-light tracking-widest">READING CHIP...</h2>
                        </div>
                    )
                };
            case 'pinEntry':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-900 flex flex-col items-center pt-32 text-white">
                            <h2 className="text-4xl font-light tracking-[0.1em] mb-16 text-blue-200">ENTER YOUR PIN</h2>
                            <div className="flex gap-6 p-8 bg-slate-950/50 rounded-2xl border border-slate-800 shadow-2xl">
                                {Array.from({ length: 4 }).map((_, i) => (
                                    <div key={i} className={`w-8 h-8 rounded-full transition-all duration-300 ${(atmContext.enteredPin || '').length > i
                                        ? 'bg-blue-400 shadow-[0_0_15px_rgba(96,165,250,0.5)] scale-110'
                                        : 'bg-slate-800 border-2 border-slate-700'
                                        }`}></div>
                                ))}
                            </div>
                            <p className="mt-16 text-slate-500 tracking-widest text-sm uppercase">Press ENTER when finished</p>
                        </div>
                    )
                };
            case 'amountEntry':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-900 flex flex-col items-center pt-32 text-white">
                            <h2 className="text-3xl font-light tracking-[0.1em] mb-12 text-blue-200">ENTER WITHDRAWAL AMOUNT</h2>
                            <div className="bg-slate-950/80 p-12 rounded-3xl border border-slate-800 shadow-2xl min-w-[400px] flex justify-center items-center">
                                <span className="text-5xl font-mono text-emerald-400 mr-2">$</span>
                                <span className="text-7xl font-mono font-bold tracking-widest text-emerald-400">
                                    {atmContext.enteredAmount || '0'}
                                </span>
                            </div>
                            <div className="mt-16 text-slate-500 tracking-widest text-sm uppercase flex gap-4 items-center">
                                <div className="px-3 py-1 bg-green-500/20 text-green-400 rounded border border-green-500/30">ENTER</div>
                                <span>To Confirm</span>
                                <div className="px-3 py-1 bg-red-500/20 text-red-400 rounded border border-red-500/30 ml-4">CANCEL</div>
                                <span>To Abort</span>
                            </div>
                        </div>
                    )
                };
            case 'authorizing':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-blue-400 gap-8">
                            <Loader2 className="w-24 h-24 animate-spin opacity-80" />
                            <h2 className="text-3xl font-light tracking-widest">AUTHORIZING TRANSACTION</h2>
                            <p className="text-slate-500 animate-pulse">Contacting Host System...</p>
                        </div>
                    )
                };
            case 'dispensingCash':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-900 flex flex-col items-center justify-center text-emerald-400 gap-8">
                            <Banknote className="w-32 h-32 animate-bounce opacity-80" />
                            <h2 className="text-4xl font-light tracking-widest">DISPENSING CASH</h2>
                        </div>
                    )
                };
            case 'presentingCash':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-gradient-to-b from-slate-900 to-emerald-950/30 flex flex-col items-center justify-center gap-8 text-white">
                            <Banknote className="w-40 h-40 text-emerald-400 opacity-100 drop-shadow-[0_0_30px_rgba(52,211,153,0.3)] animate-pulse" />
                            <h2 className="text-5xl font-light tracking-widest text-emerald-300">PLEASE TAKE YOUR CASH</h2>
                            {dispenseInfo?.authCode && (
                                <div className="bg-emerald-950/50 border border-emerald-800 rounded-xl px-10 py-4 font-mono text-center">
                                    <p className="text-slate-400 text-xs tracking-widest uppercase mb-1">Authorisation Code</p>
                                    <p className="text-emerald-300 text-3xl font-bold tracking-[0.3em]">{dispenseInfo.authCode}</p>
                                    {dispenseInfo.count && <p className="text-slate-500 text-sm mt-1">Cassette {dispenseInfo.cassette} — {dispenseInfo.count} note(s)</p>}
                                </div>
                            )}
                            <Button size="lg" variant="outline" className="mt-4 border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300" onClick={() => window.atmAPI.takeCash()}>
                                [SIMULATION: USER TAKES CASH]
                            </Button>
                        </div>
                    )
                };
            case 'ejectingCard':
                return {
                    imageFile: null,
                    textRows: [],
                    overrideJsx: (
                        <div className="h-full bg-slate-900 flex flex-col items-center justify-center gap-12 text-white">
                            <CreditCard className="w-32 h-32 text-blue-400 animate-bounce" />
                            <h2 className="text-4xl font-light tracking-widest text-blue-300">PLEASE TAKE YOUR CARD</h2>
                            <Button size="lg" variant="outline" className="mt-8 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300" onClick={() => window.atmAPI.takeCard()}>
                                [SIMULATION: USER TAKES CARD]
                            </Button>
                        </div>
                    )
                };
            case 'error':
                return {
                    imageFile: null,
                    textRows: ['TRANSACTION DECLINED', '', atmContext.errorMessage || 'Unknown Error'],
                    overrideJsx: (
                        <div className="h-full bg-slate-900 flex flex-col items-center justify-center gap-8 text-white">
                            <AlertCircle className="w-32 h-32 text-red-500 mb-4" />
                            <h2 className="text-5xl font-black tracking-[0.1em] text-red-500">TRANSACTION DECLINED</h2>
                            <Card className="bg-red-950/30 border-red-900 mt-8 w-1/2">
                                <CardContent className="pt-6 pb-6 text-center text-red-200 font-mono text-xl">
                                    {atmContext.errorMessage || 'Unknown Error'}
                                </CardContent>
                            </Card>
                        </div>
                    )
                };
            default:
                return {
                    imageFile: screenLayout.imageFile || '000.png',
                    textRows: screenLayout.textRows
                };
        }
    }; // Ends renderScreen()

    const screenProps = renderScreen();

    if (!isConfigured) {
        return <SetupScreen initialConfig={atmConfig} onComplete={handleConfigComplete} />;
    }

    return (
        <div className="h-screen w-screen bg-slate-950 flex flex-col overflow-hidden">
            <StatusBar state={atmState} context={atmContext} />
            <div className="flex flex-1 overflow-hidden">
                <div className="flex flex-col items-center justify-center gap-6 p-6 shrink-0 bg-slate-950">
                    <div className="transform scale-75 origin-top">
                        <div className="flex gap-6 items-start">
                            <ATMLayout
                                imageFile={screenProps.imageFile}
                                textRows={screenProps.textRows}
                                overrideJsx={screenProps.overrideJsx}
                                imagePath={atmConfig?.imagePath || ''}
                                activeFDKs={atmContext.activeFDKs || []}
                                onFdkPress={handleFdkPress}
                                onKeypadPress={handleKeypadPress}
                                onInsertCard={handleInsertCard}
                            />
                            <div className="pt-8 flex flex-col gap-6">
                                <ATMKeypad onKeyPress={handleKeypadPress} />
                                <div className="flex flex-col items-center space-y-3 bg-slate-800 p-4 rounded-2xl border border-slate-700 shadow-xl">
                                    <Label htmlFor="ndc-mode" className="text-white text-sm tracking-wider">Raw NDC Mode</Label>
                                    <Switch className="scale-110" id="ndc-mode" checked={rawNdcMode} onCheckedChange={setRawNdcMode} />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="flex-1 overflow-hidden p-4 pl-0">
                    <InspectorPanel
                        ndcLog={ndcLog}
                        atmContext={atmContext}
                        currentState={atmState}
                        cards={testCards}
                        onAddCard={handleAddCard}
                        onDeleteCard={handleDeleteCard}
                        onSelectCard={handleSelectCard}
                        selectedCardNumber={selectedCard?.number}
                    />
                </div>
            </div>
        </div>
    );
}; // Ends App()

const rootDiv = document.getElementById('root');
if (rootDiv) {
    const root = createRoot(rootDiv);
    root.render(<App />);
}
