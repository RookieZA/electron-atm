import React from 'react';
import { Database, TrendingUp, Cpu, CreditCard } from 'lucide-react';

interface HardwarePanelProps {
    counters: any;
}

export const HardwarePanel = ({ counters }: HardwarePanelProps) => {
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-8 bg-slate-900 h-full">
            <div>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                    <Database className="w-3 h-3" />
                    Cash Cassettes
                </h3>
                <div className="grid grid-cols-2 gap-4">
                    {[1, 2, 3, 4].map(num => (
                        <div key={num} className="bg-slate-800 rounded p-3 border border-slate-700">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-xs font-bold text-slate-300">Type {num}</span>
                                <span className="text-xs font-mono text-emerald-400">
                                    {counters?.[`type${num}`] || 0} / 2000
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-emerald-500"
                                    style={{ width: `${Math.min(((counters?.[`type${num}`] || 0) / 2000) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex flex-col items-center justify-center gap-2">
                    <TrendingUp className="w-6 h-6 text-blue-400" />
                    <span className="text-2xl font-mono font-bold text-white">
                        {counters?.transactionSerialNumber || '0000'}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">
                        Transaction SN
                    </span>
                </div>

                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 flex flex-col items-center justify-center gap-2">
                    <CreditCard className="w-6 h-6 text-purple-400" />
                    <span className="text-2xl font-mono font-bold text-white">
                        {counters?.cardsCaptured || 0}
                    </span>
                    <span className="text-[10px] uppercase tracking-widest text-slate-500">
                        Cards Captured
                    </span>
                </div>
            </div>

            <div>
                <h3 className="text-[10px] uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
                    <Cpu className="w-3 h-3" />
                    Actions
                </h3>
                <button
                    className="w-full py-2 bg-red-950/40 hover:bg-red-900 border border-red-900/50 rounded text-red-400 text-xs font-bold tracking-widest uppercase transition-colors"
                    onClick={() => {
                        window.atmAPI.resetCounters();
                    }}
                >
                    Reset Counters
                </button>
            </div>
        </div>
    );
};
