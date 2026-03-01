import React from 'react';

interface EmvPanelProps {
    emvData: Record<string, any>;
}

export const EmvPanel = ({ emvData }: EmvPanelProps) => {
    const entries = Object.entries(emvData);

    return (
        <div className="h-full bg-slate-900 text-slate-200 p-4 overflow-y-auto">
            {entries.length === 0 ? (
                <div className="text-slate-600 text-sm text-center pt-12">
                    No EMV data available. EMV data will appear here when received from the host or a chip card.
                </div>
            ) : (
                <table className="w-full text-xs font-mono">
                    <thead>
                        <tr className="text-slate-500 uppercase text-[10px] border-b border-slate-700 bg-slate-800/50">
                            <th className="px-3 py-2 text-left font-normal tracking-widest">Tag</th>
                            <th className="px-3 py-2 text-left font-normal tracking-widest">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map(([tag, value]) => (
                            <tr key={tag} className="border-b border-slate-800 hover:bg-slate-800/50">
                                <td className="px-3 py-2 text-amber-400">{tag}</td>
                                <td className="px-3 py-2 text-slate-300 break-all">{JSON.stringify(value)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
};
