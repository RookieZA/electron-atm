import React from 'react';
import { Button } from '@/components/ui/button.js';

export const ATMKeypad = ({ onKeyPress }: { onKeyPress: (key: string) => void }) => {
    const keys = [
        ['1', '2', '3', 'CANCEL'],
        ['4', '5', '6', 'CLEAR'],
        ['7', '8', '9', 'ENTER'],
        ['', '0', '', ''],
    ];

    return (
        <div className="grid grid-cols-4 gap-2 w-[300px] bg-slate-800 p-4 rounded-xl border border-slate-600 shadow-inner">
            {keys.flat().map((key, i) => {
                if (!key) return <div key={i} className="h-12 w-16" />;

                // Styling logic for special keys
                let colorClass = "bg-slate-300 hover:bg-slate-200 text-slate-900";
                if (key === 'CANCEL') colorClass = "bg-red-500 hover:bg-red-400 text-white font-bold text-xs";
                if (key === 'CLEAR') colorClass = "bg-yellow-500 hover:bg-yellow-400 text-white font-bold text-xs";
                if (key === 'ENTER') colorClass = "bg-green-500 hover:bg-green-400 text-white font-bold text-xs";

                return (
                    <Button
                        key={i}
                        variant="ghost"
                        className={`h-12 w-16 text-xl rounded-lg shadow-md active:translate-y-1 ${colorClass}`}
                        onClick={() => onKeyPress(key)}
                    >
                        {key}
                    </Button>
                );
            })}
        </div>
    );
};
