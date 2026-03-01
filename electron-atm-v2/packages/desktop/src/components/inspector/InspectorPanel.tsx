import React, { useState } from 'react';
import { NdcLog } from './NdcLog.js';
import type { LogEntry } from './NdcLog.js';
import { StatesPanel } from './StatesPanel.js';
import { ScreensPanel } from './ScreensPanel.js';
import { FitsPanel } from './FitsPanel.js';
import { EmvPanel } from './EmvPanel.js';
import { CardsPanel } from './CardsPanel.js';
import type { TestCard } from './CardsPanel.js';
import { HardwarePanel } from './HardwarePanel.js';

export type InspectorTab = 'states' | 'screens' | 'fits' | 'emv' | 'cards' | 'hardware';

interface InspectorPanelProps {
    ndcLog: LogEntry[];
    atmContext: any;
    currentState: string;
    cards: TestCard[];
    onAddCard: (card: TestCard) => void;
    onDeleteCard: (cardNumber: string) => void;
    onSelectCard: (card: TestCard) => void;
    selectedCardNumber?: string;
}

const TABS: { id: InspectorTab; label: string }[] = [
    { id: 'states', label: 'States' },
    { id: 'screens', label: 'Screens' },
    { id: 'fits', label: 'FITs' },
    { id: 'emv', label: 'EMV' },
    { id: 'cards', label: 'Cards' },
    { id: 'hardware', label: 'Hardware' },
];

export const InspectorPanel = ({
    ndcLog, atmContext, currentState,
    cards, onAddCard, onDeleteCard, onSelectCard, selectedCardNumber
}: InspectorPanelProps) => {
    const [activeTab, setActiveTab] = useState<InspectorTab>('states');

    return (
        <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-2xl">

            {/* ── UPPER: Tabbed inspector (takes ~55% height) ─────────────── */}
            <div className="flex flex-col" style={{ flex: '0 0 55%', minHeight: 0 }}>
                {/* Tab bar */}
                <div className="flex border-b border-slate-700 bg-slate-800/80 shrink-0">
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2.5 text-xs font-bold tracking-widest uppercase transition-colors border-b-2 ${activeTab === tab.id
                                ? 'border-blue-500 text-blue-400 bg-slate-900/50'
                                : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                                }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-hidden">
                    {activeTab === 'states' && (
                        <StatesPanel
                            stateTables={atmContext.stateTables || {}}
                            currentState={atmContext.currentStateNumber}
                            screenData={atmContext.screenData || {}}
                        />
                    )}
                    {activeTab === 'screens' && (
                        <ScreensPanel screens={atmContext.screenData || {}} />
                    )}
                    {activeTab === 'fits' && (
                        <FitsPanel fits={Object.values(atmContext.fitData || {})} />
                    )}
                    {activeTab === 'emv' && (
                        <EmvPanel emvData={atmContext.emvData || {}} />
                    )}
                    {activeTab === 'cards' && (
                        <CardsPanel
                            cards={cards}
                            onAddCard={onAddCard}
                            onDeleteCard={onDeleteCard}
                            onSelectCard={onSelectCard}
                            selectedCardNumber={selectedCardNumber}
                        />
                    )}
                    {activeTab === 'hardware' && (
                        <HardwarePanel counters={atmContext.supplyCounters || {}} />
                    )}
                </div>
            </div>

            {/* ── DIVIDER ─────────────────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800 border-y border-slate-700 shrink-0">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-mono">NDC Trace</span>
                <span className="ml-auto text-[10px] text-slate-600 font-mono">{ndcLog.length} msgs</span>
            </div>

            {/* ── LOWER: Always-visible NDC trace log (takes ~45% height) ── */}
            <div className="flex-1 overflow-hidden min-h-0">
                <NdcLog entries={ndcLog} />
            </div>
        </div>
    );
};
