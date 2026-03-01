import React from 'react';
import { Button } from '@/components/ui/button.js';
import { Card } from '@/components/ui/card.js';

interface ATMProps {
    imageFile: string | null;
    textRows: string[];
    imagePath: string;
    onFdkPress: (key: string) => void;
    onKeypadPress: (key: string) => void;
    onInsertCard: () => void;
    activeFDKs?: string[];
    overrideJsx?: React.ReactNode;
}

export const ATMLayout = ({ imageFile, textRows, imagePath, onFdkPress, onKeypadPress, onInsertCard, activeFDKs = [], overrideJsx }: ATMProps) => {
    return (
        <div className="relative">
            <Card className="w-[1024px] h-[768px] bg-slate-800 border-4 border-slate-700 rounded-3xl p-8 flex shadow-2xl relative">
                {/* Left FDKs */}
                <div className="w-24 flex flex-col justify-around py-16 pr-4">
                    {['A', 'B', 'C', 'D'].map(key => (
                        <Button
                            key={key}
                            variant="secondary"
                            disabled={!activeFDKs.includes(key)}
                            className="h-16 w-16 rounded-full shadow-inner bg-slate-400 hover:bg-slate-300 active:translate-y-1 disabled:opacity-50"
                            onClick={() => onFdkPress(key)}
                        />
                    ))}
                </div>

                {/* Main Screen Area */}
                <div className="flex-1 bg-black rounded-lg overflow-hidden border-8 border-slate-900 shadow-inner relative flex justify-center items-center">
                    {overrideJsx ? (
                        overrideJsx
                    ) : (
                        <>
                            {/* Background Image */}
                            {imageFile && imagePath ? (
                                <img src={`file://${imagePath}/${imageFile}`} alt="ATM Screen" className="absolute inset-0 w-full h-full object-contain" />
                            ) : (
                                <div className="absolute inset-0 bg-emerald-950 opacity-20"></div> // Default blank bezel
                            )}

                            {/* Text Overlay Layer */}
                            <div className="absolute inset-0 z-10 flex flex-col justify-center items-center pointer-events-none p-4 font-mono font-bold text-emerald-400 text-shadow text-[1.4rem] leading-[1.2]">
                                {textRows.map((row, idx) => (
                                    <div key={idx} className="whitespace-pre">
                                        {row}
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Right FDKs */}
                <div className="w-24 flex flex-col justify-around py-16 pl-4">
                    {['F', 'G', 'H', 'I'].map(key => (
                        <Button
                            key={key}
                            variant="secondary"
                            disabled={!activeFDKs.includes(key)}
                            className="h-16 w-16 rounded-full shadow-inner bg-slate-400 hover:bg-slate-300 active:translate-y-1 disabled:opacity-50"
                            onClick={() => onFdkPress(key)}
                        />
                    ))}
                </div>

                {/* Hardware Peripherals Panel (Bottom) */}
                <div className="absolute -bottom-32 left-1/2 -translate-x-1/2 w-[800px] h-32 bg-slate-700 rounded-b-3xl border-t border-slate-600 flex justify-between px-16 items-center shadow-xl">

                    {/* Card Reader */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-24 h-4 bg-black rounded-full border-t border-slate-800 shadow-inner cursor-pointer" onClick={onInsertCard}></div>
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">Card</span>
                    </div>

                    {/* Receipt Printer */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-32 h-2 bg-black rounded-full border-t border-slate-800 shadow-inner"></div>
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">Receipt</span>
                    </div>

                    {/* Cash Dispenser */}
                    <div className="flex flex-col items-center gap-2">
                        <div className="w-48 h-6 bg-black rounded border-t border-slate-800 shadow-inner"></div>
                        <span className="text-xs text-slate-400 uppercase font-bold tracking-widest">Cash</span>
                    </div>
                </div>
            </Card>
        </div>
    );
};
