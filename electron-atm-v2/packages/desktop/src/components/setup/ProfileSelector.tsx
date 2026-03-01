import React from 'react';
import { Card, CardContent } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { Plus, Settings, Play, Trash2 } from 'lucide-react';
import type { AtmConfig } from '@/shared/ipc.js';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog.js';

interface ProfileSelectorProps {
    profiles: AtmConfig[];
    onConnect: (config: AtmConfig) => void;
    onEdit: (config: AtmConfig) => void;
    onNewProfile: () => void;
    onDelete: (id: string) => void;
}

export const ProfileSelector: React.FC<ProfileSelectorProps> = ({ profiles, onConnect, onEdit, onNewProfile, onDelete }) => {
    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center pt-8 text-white relative">
            <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-slate-950/80 to-slate-950 -z-10"></div>

            <div className="w-full max-w-4xl px-8">
                <div className="text-center mb-16">
                    <h1 className="text-4xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-sky-400 mb-4">
                        ATM EMULATOR
                    </h1>
                    <p className="text-slate-400 tracking-[0.2em] font-light uppercase text-sm">Select Configuration Profile</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {profiles.map(profile => (
                        <Card key={profile.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all duration-300 group overflow-hidden relative">
                            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>

                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-xl font-bold text-slate-200 truncate pr-4">{profile.profileName || 'Unnamed Profile'}</h3>

                                    <Dialog>
                                        <DialogTrigger asChild>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
                                            <DialogHeader>
                                                <DialogTitle>Delete Profile?</DialogTitle>
                                                <DialogDescription className="text-slate-400">
                                                    Are you sure you want to delete the profile "{profile.profileName}"? This action cannot be undone.
                                                </DialogDescription>
                                            </DialogHeader>
                                            <DialogFooter className="mt-6 flex justify-end gap-3">
                                                <Button variant="outline" className="border-slate-700 hover:bg-slate-800 text-white">Cancel</Button>
                                                <Button variant="destructive" onClick={() => onDelete(profile.id)}>Delete</Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>

                                <div className="space-y-2 mb-8">
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 font-mono">HOST</span>
                                        <span className="text-blue-200 font-mono">{profile.hostAddress}:{profile.tcpPort}</span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span className="text-slate-500 font-mono">LUNO</span>
                                        <span className="text-blue-200 font-mono">{profile.luno}</span>
                                    </div>
                                </div>

                                <div className="flex gap-3">
                                    <Button
                                        className="flex-1 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white border border-blue-500/30 transition-colors"
                                        onClick={() => onConnect(profile)}
                                    >
                                        <Play className="w-4 h-4 mr-2" /> Connect
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        className="border-slate-700 bg-slate-800/50 text-slate-300 hover:bg-slate-700 hover:text-white"
                                        onClick={() => onEdit(profile)}
                                    >
                                        <Settings className="w-4 h-4" />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ))}

                    {/* Add New Profile Card */}
                    <Card
                        className="bg-slate-900/20 border-slate-800 border-dashed hover:border-slate-600 hover:bg-slate-900/40 cursor-pointer transition-all duration-300 group flex flex-col items-center justify-center min-h-[220px]"
                        onClick={onNewProfile}
                    >
                        <div className="w-12 h-12 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 group-hover:scale-110 group-hover:bg-slate-800 transition-all text-slate-400 group-hover:text-blue-400">
                            <Plus className="w-6 h-6" />
                        </div>
                        <span className="text-slate-400 font-medium tracking-wide">Create New Profile</span>
                    </Card>
                </div>
            </div>
        </div>
    );
};
