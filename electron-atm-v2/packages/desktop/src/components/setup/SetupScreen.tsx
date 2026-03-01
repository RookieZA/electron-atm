import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card.js';
import { Input } from '@/components/ui/input.js';
import { Button } from '@/components/ui/button.js';
import { Label } from '@/components/ui/label.js';
import { FolderOpen } from 'lucide-react';
import type { AtmConfig } from '@/shared/ipc.js';

import { v4 as uuidv4 } from 'uuid';

interface SetupScreenProps {
    onComplete: (config: AtmConfig) => void;
    onCancel?: () => void;
    initialConfig?: AtmConfig | null;
}

export const SetupScreen: React.FC<SetupScreenProps> = ({ onComplete, onCancel, initialConfig }) => {
    const [config, setConfig] = useState<AtmConfig>({
        id: initialConfig?.id || uuidv4(),
        hostAddress: initialConfig?.hostAddress || '127.0.0.1',
        tcpPort: initialConfig?.tcpPort || 11032,
        luno: initialConfig?.luno || '714',
        terminalMasterKey: initialConfig?.terminalMasterKey || 'B6D55EABAD23BC4FD558F8D619A21C34',
        communicationsKey: initialConfig?.communicationsKey || '48C0C91833DEDB9F03CC114DF927091B',
        imagePath: initialConfig?.imagePath || '/home/tim/share/screens',
        profileName: initialConfig?.profileName || 'Test ATM 714',
        ndcMessageHeader: initialConfig?.ndcMessageHeader || '\\x00\\x16\\x00\\x00\\x02\\x00'
    });

    const handleBrowse = async () => {
        const selectedPath = await window.atmAPI.selectDirectory();
        if (selectedPath) {
            setConfig({ ...config, imagePath: selectedPath });
        }
    };

    const handleContinue = () => {
        onComplete(config);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center pt-8">
            <div className="w-full max-w-3xl">
                <h1 className="text-2xl font-bold text-slate-700 mb-6 border-b pb-2">ATM Connection Details</h1>

                <div className="grid grid-cols-12 gap-4 mb-8">
                    <div className="col-span-6 space-y-2">
                        <Label htmlFor="hostAddress" className="font-bold text-slate-700">ATM Host address</Label>
                        <Input
                            id="hostAddress"
                            value={config.hostAddress}
                            onChange={e => setConfig({ ...config, hostAddress: e.target.value })}
                        />
                    </div>
                    <div className="col-span-3 space-y-2">
                        <Label htmlFor="tcpPort" className="font-bold text-slate-700">TCP Port</Label>
                        <Input
                            id="tcpPort"
                            type="number"
                            value={config.tcpPort}
                            onChange={e => setConfig({ ...config, tcpPort: parseInt(e.target.value) || 0 })}
                        />
                    </div>
                    <div className="col-span-3 space-y-2">
                        <Label htmlFor="luno" className="font-bold text-slate-700">LUNO</Label>
                        <Input
                            id="luno"
                            value={config.luno}
                            onChange={e => setConfig({ ...config, luno: e.target.value })}
                        />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-slate-700 mb-6 border-b pb-2">Keys</h1>

                <div className="grid grid-cols-12 gap-4 mb-4">
                    <div className="col-span-9 space-y-2">
                        <Label htmlFor="tmk" className="font-bold text-slate-700">Terminal Master Key</Label>
                        <Input
                            id="tmk"
                            value={config.terminalMasterKey}
                            onChange={e => setConfig({ ...config, terminalMasterKey: e.target.value })}
                        />
                    </div>
                    <div className="col-span-3 space-y-2">
                        <Label htmlFor="tmkcv" className="font-bold text-slate-700">Check Value</Label>
                        <Input id="tmkcv" value="55531F" disabled className="bg-slate-100" />
                    </div>
                </div>

                <div className="grid grid-cols-12 gap-4 mb-8">
                    <div className="col-span-9 space-y-2">
                        <Label htmlFor="tpk" className="font-bold text-slate-700">Communications Key (Terminal PIN Key)</Label>
                        <Input
                            id="tpk"
                            value={config.communicationsKey}
                            onChange={e => setConfig({ ...config, communicationsKey: e.target.value })}
                        />
                    </div>
                    <div className="col-span-3 space-y-2">
                        <Label htmlFor="tpkcv" className="font-bold text-slate-700">Check Value</Label>
                        <Input id="tpkcv" value="F0F08F" disabled className="bg-slate-100" />
                    </div>
                </div>

                <h1 className="text-2xl font-bold text-slate-700 mb-6 border-b pb-2">Image Path</h1>

                <div className="flex gap-4 mb-8">
                    <Input
                        className="flex-1"
                        value={config.imagePath}
                        onChange={e => setConfig({ ...config, imagePath: e.target.value })}
                    />
                    <Button variant="outline" className="px-3" onClick={handleBrowse}>
                        <FolderOpen className="h-5 w-5" />
                    </Button>
                </div>

                <h1 className="text-2xl font-bold text-slate-700 mb-6 border-b pb-2">Profile Name</h1>

                <div className="mb-4">
                    <Input
                        value={config.profileName}
                        onChange={e => setConfig({ ...config, profileName: e.target.value })}
                    />
                </div>

                <h1 className="text-2xl font-bold text-slate-700 mt-8 mb-6 border-b pb-2">NDC Message Headers</h1>

                <div className="mb-8 space-y-2">
                    <Label htmlFor="ndcHeader" className="font-bold text-slate-700">Raw Hex Header (Prefix)</Label>
                    <Input
                        id="ndcHeader"
                        className="font-mono text-sm"
                        value={config.ndcMessageHeader}
                        onChange={e => setConfig({ ...config, ndcMessageHeader: e.target.value })}
                        placeholder="\x00\x16\x00\x00\x02\x00"
                    />
                    <p className="text-xs text-slate-500">
                        This sequence is prepended to all NDC messages sent by the ATM (often required by TCP routers/switches).
                    </p>
                </div>

                <div className="flex gap-4">
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white px-8" onClick={handleContinue}>
                        Save & Continue
                    </Button>
                    {onCancel && (
                        <Button variant="outline" className="px-8" onClick={onCancel}>
                            Cancel
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
