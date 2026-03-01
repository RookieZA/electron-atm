import React, { useEffect, useRef } from 'react';

export interface LogEntry {
    ts: string;
    dir: 'IN' | 'OUT' | 'SYS';
    raw: string;
    parsed?: string;
}

interface NdcLogProps {
    entries: LogEntry[];
}

export const NdcLog = ({ entries }: NdcLogProps) => {
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [entries]);

    const dirColor = (dir: LogEntry['dir']) => {
        switch (dir) {
            case 'IN': return 'text-emerald-400';
            case 'OUT': return 'text-blue-400';
            case 'SYS': return 'text-slate-500';
        }
    };

    return (
        <div className="h-full bg-slate-950 font-mono text-xs overflow-y-auto p-3 space-y-1">
            {entries.length === 0 && (
                <div className="text-slate-600 text-center pt-8">No messages yet. Connect to a host to see live NDC traffic.</div>
            )}
            {entries.map((e, i) => (
                <div key={i} className="flex gap-2 items-start">
                    <span className="text-slate-600 shrink-0 w-20">{e.ts}</span>
                    <span className={`font-bold shrink-0 w-8 ${dirColor(e.dir)}`}>{e.dir}</span>
                    <div className="flex flex-col">
                        <span className="text-slate-300 break-all">{e.raw}</span>
                        {e.parsed && <span className="text-slate-500 text-[10px] mt-0.5">{e.parsed}</span>}
                    </div>
                </div>
            ))}
            <div ref={bottomRef} />
        </div>
    );
};
