import React, { useState, useRef, useEffect } from 'react';
import { parseNDCScreen } from '../../lib/screens/ndcScreens.js';

interface ScreenEntry {
    number: string;
    content: string;
}

interface ScreensPanelProps {
    screens: Record<string, string>;
}

export const ScreensPanel = ({ screens }: ScreensPanelProps) => {
    const [selected, setSelected] = useState<string | null>(null);
    const screenList = Object.entries(screens);

    const preview = selected ? parseNDCScreen(screens[selected] || '') : null;

    return (
        <div className="h-full flex bg-slate-900 text-slate-200">
            {/* Left: screen list */}
            <div className="w-48 border-r border-slate-700 overflow-y-auto shrink-0">
                <div className="px-3 py-2 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-700 bg-slate-800/50 sticky top-0">
                    {screenList.length} Screen{screenList.length !== 1 ? 's' : ''} Loaded
                </div>
                {screenList.length === 0 && (
                    <div className="text-slate-600 text-xs text-center pt-8 px-3">No screens downloaded from host yet.</div>
                )}
                {screenList.map(([num]) => (
                    <button
                        key={num}
                        onClick={() => setSelected(num)}
                        className={`w-full text-left px-3 py-2 font-mono text-xs border-b border-slate-800 transition-colors ${selected === num ? 'bg-blue-900/40 text-blue-300' : 'text-slate-400 hover:bg-slate-800'}`}
                    >
                        Screen {num}
                    </button>
                ))}
            </div>

            {/* Right: preview */}
            <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
                {!selected && (
                    <div className="text-slate-600 text-sm">Select a screen on the left to preview it.</div>
                )}
                {selected && preview && (
                    <div className="bg-black border border-slate-700 rounded p-4 font-mono text-[13px] text-[#00ff00] leading-snug tracking-widest shadow-xl shadow-black/50">
                        <div className="text-slate-600 text-[10px] mb-3 text-center tracking-widest">SCREEN {selected}</div>
                        {preview.map((line, i) => (
                            <div key={i} className="whitespace-pre">{line}</div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
