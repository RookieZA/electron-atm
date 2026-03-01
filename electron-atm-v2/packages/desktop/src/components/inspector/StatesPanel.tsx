import React, { useState } from 'react';
import { StateGraph } from './StateGraph.js';
import { parseNDCScreen, getScreenContent } from '../../lib/screens/ndcScreens.js';

interface StatesPanelProps {
    stateTables: Record<string, any>;
    currentState?: string;
    screenData?: Record<string, string>;
    stateHistory?: string[];
}

const STATE_TYPE_LABEL: Record<string, string> = {
    'I': 'Idle', 'J': 'Close Card', 'D': 'FDK Dispatch',
    'K': 'PIN Entry', 'W': 'Write', 'B': 'Buffer Fill', 'A': 'Amount Entry',
};

export const StatesPanel = ({ stateTables, currentState, screenData = {}, stateHistory = [] }: StatesPanelProps) => {
    const [selected, setSelected] = useState<string | null>(null);

    const selectedRaw = selected ? (stateTables[selected] as any) : null;
    const exits: string[] = selectedRaw?.exit_states ?? selectedRaw?.states_to ?? [];
    const type: string = selectedRaw?.type ?? selectedRaw?.raw?.[4] ?? '?';
    const screenNumber: string | undefined = selectedRaw?.screen_number;

    // Screen preview lines for the selected state's linked screen
    const screenLines = screenNumber
        ? parseNDCScreen(getScreenContent(screenNumber, screenData))
        : null;

    return (
        <div className="h-full flex overflow-hidden">
            {/* ── LEFT: State graph (main view) ─────────────────── */}
            <div className="flex-1 h-full min-w-0">
                <StateGraph
                    stateTables={stateTables}
                    currentStateNumber={currentState}
                    onSelectState={setSelected}
                />
            </div>

            {/* ── RIGHT: Detail sidebar ─────────────────────────── */}
            <div className="w-72 shrink-0 border-l border-slate-700 bg-slate-900 flex flex-col overflow-hidden">
                {/* Legend */}
                <div className="px-3 py-2 border-b border-slate-700 bg-slate-800/50">
                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Legend</p>
                    <div className="flex flex-wrap gap-1.5">
                        {[['I', '#22c55e', 'Idle'], ['J', '#ef4444', 'Close'], ['D', '#60a5fa', 'Dispatch'],
                        ['K', '#f59e0b', 'PIN'], ['W', '#a855f7', 'Write'], ['?', '#94a3b8', 'Other']].map(([t, c, l]) => (
                            <span key={t} style={{ borderColor: c as string, color: c as string }}
                                className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border bg-slate-900/60">
                                {t} {l}
                            </span>
                        ))}
                    </div>
                </div>

                {/* State detail */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                    {/* State History Breadcrumbs */}
                    {stateHistory.length > 0 && (
                        <div className="mb-4">
                            <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Recent History</p>
                            <div className="flex flex-wrap gap-1">
                                {stateHistory.map((s, i) => (
                                    <React.Fragment key={`${s}-${i}`}>
                                        <button
                                            onClick={() => setSelected(s)}
                                            className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-slate-700 bg-slate-800 text-slate-300 hover:bg-blue-900/40 hover:text-blue-300 transition-colors"
                                        >
                                            {s}
                                        </button>
                                        {i < stateHistory.length - 1 && (
                                            <span className="text-slate-600 text-[10px] mt-1">›</span>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    )}

                    {!selected && (
                        <p className="text-slate-600 text-xs text-center border-t border-slate-800 pt-8 mt-4">Click a state node to see its details.</p>
                    )}
                    {selected && (
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">State</p>
                                <p className="text-2xl font-black font-mono text-slate-200">{selected}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {STATE_TYPE_LABEL[type] ?? type} <span className="font-mono text-slate-600">({type})</span>
                                </p>
                            </div>

                            {/* ── Gap 5: Screen preview ─────── */}
                            {screenNumber && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">
                                        Screen <span className="text-blue-400 font-mono">{screenNumber}</span>
                                    </p>
                                    <div className="bg-black border border-slate-700 rounded p-2 font-mono text-[10px] text-[#00ff00] leading-snug tracking-wider overflow-x-auto">
                                        {screenLines
                                            ? screenLines.map((line, i) => <div key={i} className="whitespace-pre">{line}</div>)
                                            : <span className="text-slate-600">No screen data for {screenNumber}</span>
                                        }
                                    </div>
                                </div>
                            )}

                            {exits.length > 0 && (
                                <div>
                                    <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1.5">Exit States</p>
                                    <div className="flex flex-col gap-1">
                                        {exits.map((s: string) => (
                                            <button key={s} onClick={() => setSelected(s)}
                                                className="text-left px-2 py-1 rounded text-xs font-mono bg-slate-800 hover:bg-blue-900/40 border border-slate-700 text-slate-300 hover:text-blue-300 transition-colors">
                                                → {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div>
                                <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">Raw Data</p>
                                <pre className="text-[10px] font-mono text-slate-500 bg-slate-950 rounded p-2 border border-slate-800 overflow-x-auto">
                                    {JSON.stringify(selectedRaw, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
