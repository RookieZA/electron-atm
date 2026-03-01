import React from 'react';

interface StatusBarProps {
    state: string;
    context: any;
}

// Map XState state names → one of the 4 NDC connection labels
function resolveConnectionStatus(state: string, context: any): {
    label: 'OFFLINE' | 'CONNECTED' | 'OUT-OF-SERVICE' | 'IN-SERVICE';
    dot: string;
    text: string;
} {
    if (!context.hostConnected && state !== 'inService' && state !== 'outOfService') {
        return { label: 'OFFLINE', dot: 'bg-slate-500', text: 'text-slate-400' };
    }
    switch (state) {
        case 'inService':
            return { label: 'IN-SERVICE', dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]', text: 'text-emerald-400' };
        case 'outOfService':
            return { label: 'OUT-OF-SERVICE', dot: 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]', text: 'text-red-400' };
        case 'downloading':
        case 'idle':
            return { label: 'CONNECTED', dot: 'bg-yellow-400 shadow-[0_0_6px_rgba(250,204,21,0.8)]', text: 'text-yellow-400' };
        default:
            return context.hostConnected
                ? { label: 'IN-SERVICE', dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]', text: 'text-emerald-400' }
                : { label: 'OFFLINE', dot: 'bg-slate-500', text: 'text-slate-400' };
    }
}

const Field = ({ label, value, kcv }: { label: string; value: string; kcv?: string }) => (
    <div className="flex flex-col items-start bg-slate-950 border border-slate-700 rounded px-3 py-1.5 h-full">
        <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold mb-1">{label}</span>
        <div className="flex items-center gap-2">
            <span className="text-emerald-400 font-mono text-xs tracking-widest">{value || '--'}</span>
            {kcv && <span className="text-blue-400 font-mono text-[10px] bg-blue-900/40 px-1 rounded ml-2">KCV: {kcv}</span>}
        </div>
    </div>
);

// Format hex strings to be readable (e.g. 1234 5678)
const formatHex = (hex?: string) => {
    if (!hex) return '--';
    return hex.match(/.{1,4}/g)?.join(' ') || hex;
};

export const StatusBar = ({ state, context }: StatusBarProps) => {
    const conn = resolveConnectionStatus(state, context);

    return (
        <div className="flex items-end gap-3 bg-slate-900 border-b border-slate-700 px-4 py-2 flex-wrap shrink-0">
            <Field label="State" value={context.currentStateNumber} />
            <Field label="Screen" value={context.currentScreenNumber} />
            <Field label="Buffer A (PIN)" value={context.enteredPin ? '*'.repeat(context.enteredPin.length) : ''} />
            <Field label="Buffer B" value={context.bufferB} />
            <Field label="Buffer C" value={context.bufferC} />
            <Field label="Opcode" value={context.opcodeBuffer} />
            <Field label="Amount" value={context.enteredAmount} />

            <div className="flex gap-2 ml-4 pl-4 border-l border-slate-700">
                <Field label="Master Key" value={formatHex(context.masterKey)} kcv={context.masterKey ? "????" : undefined} />
                <Field label="PIN Key" value={formatHex(context.pinKey)} kcv={context.pinKeyKcv} />
            </div>

            {/* Connection status (4-state indicator matching old build) */}
            <div className="ml-auto flex items-center gap-2.5 px-3 py-1 rounded-lg border border-slate-700 bg-slate-950">
                <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${conn.dot}`} />
                <span className={`text-xs font-bold font-mono tracking-widest ${conn.text}`}>
                    {conn.label}
                </span>
            </div>
        </div>
    );
};
