import React, { useState } from 'react';
import { Button } from '../ui/button.js';
import { PlusCircle, XCircle } from 'lucide-react';

export interface TestCard {
    name: string;
    number: string;
    pin: string;
    expiryDate: string;
    serviceCode: string;
    pvki: string;
    pvv: string;
    cvv: string;
    discretionaryData?: string;
}

interface CardsPanelProps {
    cards: TestCard[];
    onAddCard: (card: TestCard) => void;
    onDeleteCard: (cardNumber: string) => void;
    onSelectCard: (card: TestCard) => void;
    selectedCardNumber?: string;
}

const EMPTY_CARD: TestCard = {
    name: '', number: '', pin: '', expiryDate: '',
    serviceCode: '101', pvki: '1', pvv: '', cvv: '', discretionaryData: ''
};

// Format card number with spaces every 4 digits
function formatCardNumber(num: string): string {
    return num.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
}

// Detect payment scheme from card number prefix
function detectScheme(number: string): { name: string; color: string; bg: string } | null {
    const n = number.replace(/\s/g, '');
    if (/^4/.test(n)) return { name: 'VISA', color: '#1a1f71', bg: '#1e3a8a' };
    if (/^5[1-5]/.test(n)) return { name: 'Mastercard', color: '#eb001b', bg: '#7f1d1d' };
    if (/^6011|^65/.test(n)) return { name: 'Discover', color: '#ff6600', bg: '#7c2d12' };
    if (/^3[47]/.test(n)) return { name: 'Amex', color: '#2e77bc', bg: '#1e3a5f' };
    if (/^50|^6[0-9]/.test(n)) return { name: 'Maestro', color: '#cc0000', bg: '#7f1d1d' };
    return null;
}

interface FormErrors {
    number?: string;
    name?: string;
    expiryDate?: string;
}

export const CardsPanel = ({ cards, onAddCard, onDeleteCard, onSelectCard, selectedCardNumber }: CardsPanelProps) => {
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState<TestCard>(EMPTY_CARD);
    const [errors, setErrors] = useState<FormErrors>({});

    const scheme = detectScheme(form.number);

    const validate = (): boolean => {
        const errs: FormErrors & { pin?: string; serviceCode?: string; pvv?: string; cvv?: string } = {};
        const digits = form.number.replace(/\s/g, '');
        if (!digits || digits.length < 12) errs.number = 'Please enter at least 12 digits.';
        if (!form.name.trim()) errs.name = 'Name is required.';
        if (form.expiryDate && !/^\d{4}$/.test(form.expiryDate)) errs.expiryDate = 'Format: YYMM';
        if (form.pin && !/^\d{4}$/.test(form.pin)) errs.pin = 'Must be 4 digits';
        if (form.serviceCode && !/^\d{3}$/.test(form.serviceCode)) errs.serviceCode = 'Must be 3 digits';
        if (form.pvv && !/^\d{4}$/.test(form.pvv)) errs.pvv = 'Must be 4 digits';
        if (form.cvv && !/^\d{3}$/.test(form.cvv)) errs.cvv = 'Must be 3 digits';

        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleAdd = () => {
        if (!validate()) return;
        onAddCard({ ...form, number: form.number.replace(/\s/g, '') });
        setForm(EMPTY_CARD);
        setErrors({});
        setShowForm(false);
    };

    const handleCancel = () => {
        setForm(EMPTY_CARD);
        setErrors({});
        setShowForm(false);
    };

    const FORM_FIELDS: { key: keyof TestCard; label: string; placeholder: string; width?: string; maxLength?: number }[] = [
        { key: 'number', label: 'Card Number', placeholder: '4111111111111111', width: 'w-44', maxLength: 19 },
        { key: 'pin', label: 'PIN', placeholder: '0000', width: 'w-20', maxLength: 4 },
        { key: 'expiryDate', label: 'Expiry (YYMM)', placeholder: '2512', width: 'w-24', maxLength: 4 },
        { key: 'serviceCode', label: 'Service Code', placeholder: '101', width: 'w-20', maxLength: 3 },
        { key: 'pvki', label: 'PVK Index', placeholder: '1', width: 'w-16', maxLength: 2 },
        { key: 'pvv', label: 'PVV', placeholder: '0000', width: 'w-20', maxLength: 4 },
        { key: 'cvv', label: 'CVV', placeholder: '000', width: 'w-16', maxLength: 4 },
        { key: 'discretionaryData', label: 'Discr Data', placeholder: '', width: 'w-28' },
    ];

    return (
        <div className="h-full flex flex-col bg-white text-slate-800 text-sm">

            {/* ── Add-card form (shown inline at top, matching old build) ── */}
            {showForm && (
                <div className="border-b border-slate-200 px-4 py-4 bg-slate-50">
                    <div className="flex items-start gap-4">
                        {/* Scheme preview box */}
                        <div
                            style={{ background: scheme ? scheme.bg : '#e2e8f0', minWidth: 64, minHeight: 48 }}
                            className="rounded flex items-center justify-center shrink-0 border border-slate-300"
                        >
                            {scheme && (
                                <span className="text-white text-[10px] font-black tracking-widest text-center px-1 leading-tight">{scheme.name}</span>
                            )}
                        </div>

                        {/* Fields in one horizontal row */}
                        <div className="flex flex-wrap items-end gap-3 flex-1">
                            {/* Name field (full row label) */}
                            <div className="flex flex-col gap-0.5 w-36">
                                <label className="text-[10px] text-slate-500 uppercase tracking-wide">Name / Label</label>
                                <input
                                    className={`border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 ${errors.name ? 'border-red-400 focus:ring-red-400' : 'border-slate-300'}`}
                                    placeholder="My Test Card"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                />
                                {errors.name && <p className="text-[10px] text-red-500">{errors.name}</p>}
                            </div>

                            {FORM_FIELDS.map(({ key, label, placeholder, width, maxLength }) => (
                                <div key={key} className={`flex flex-col gap-0.5 ${width ?? 'w-24'}`}>
                                    <label className="text-[10px] text-slate-500 uppercase tracking-wide">{label}</label>
                                    <input
                                        className={`border rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 ${(errors as any)[key] ? 'border-red-400 focus:ring-red-400' : 'border-slate-300'}`}
                                        placeholder={placeholder}
                                        value={(form as any)[key]}
                                        maxLength={maxLength}
                                        onChange={e => {
                                            let val = e.target.value;
                                            // Only strip non-digits for number-based fields, don't inject spaces on change
                                            if (key !== 'name' && key !== 'discretionaryData') {
                                                val = val.replace(/[^0-9]/g, '');
                                            }
                                            setForm(f => ({ ...f, [key]: val }));
                                        }}
                                    />
                                    {(errors as any)[key] && <p className="text-[10px] text-red-500">{(errors as any)[key]}</p>}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ── Top toolbar (Save/Cancel when form open, Add Card when closed) ── */}
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50 shrink-0">
                {showForm ? (
                    <>
                        <Button size="sm" onClick={handleAdd} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4">
                            Save
                        </Button>
                        <Button size="sm" variant="outline" onClick={handleCancel} className="text-xs">
                            Cancel
                        </Button>
                    </>
                ) : (
                    <Button size="sm" variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs" onClick={() => setShowForm(true)}>
                        <PlusCircle className="w-3 h-3 mr-1" /> Add Card
                    </Button>
                )}
            </div>

            {/* ── Card list ── */}
            <div className="flex-1 overflow-y-auto">
                {cards.length === 0 && (
                    <div className="text-slate-400 text-sm text-center pt-12">No test cards saved. Add one to get started.</div>
                )}
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-slate-400 text-[10px] uppercase tracking-widest border-b border-slate-200 bg-slate-50 sticky top-0">
                            <th className="px-3 py-2 text-left font-normal w-12" />
                            <th className="px-3 py-2 text-left font-normal">Card Number</th>
                            <th className="px-3 py-2 text-left font-normal">FIT</th>
                            <th className="px-3 py-2 text-left font-normal">PIN</th>
                            <th className="px-3 py-2 text-left font-normal">Expiry</th>
                            <th className="px-3 py-2 text-left font-normal">Service Code</th>
                            <th className="px-3 py-2 text-left font-normal">PVK Index</th>
                            <th className="px-3 py-2 text-left font-normal">PVV</th>
                            <th className="px-3 py-2 text-left font-normal">CVV</th>
                            <th className="px-3 py-2 text-left font-normal">Discr Data</th>
                            <th className="px-3 py-2 w-8" />
                        </tr>
                    </thead>
                    <tbody>
                        {cards.map(card => {
                            const s = detectScheme(card.number);
                            const isSelected = selectedCardNumber === card.number;
                            return (
                                <tr
                                    key={card.number}
                                    onClick={() => onSelectCard(card)}
                                    className={`border-b border-slate-100 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                                >
                                    {/* Scheme logo cell */}
                                    <td className="px-3 py-2">
                                        {s && (
                                            <div
                                                style={{ background: s.bg }}
                                                className="w-10 h-7 rounded flex items-center justify-center"
                                                title={s.name}
                                            >
                                                <span className="text-white text-[8px] font-black leading-none text-center">{s.name}</span>
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 font-mono tracking-widest text-slate-700">{formatCardNumber(card.number)}</td>
                                    <td className="px-3 py-2 text-slate-500">—</td>
                                    {/* PIN as styled badge */}
                                    <td className="px-3 py-2">
                                        {card.pin && (
                                            <span className="inline-block bg-slate-700 text-white text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                                                {card.pin}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-600">{card.expiryDate}</td>
                                    <td className="px-3 py-2 text-slate-600">{card.serviceCode}</td>
                                    <td className="px-3 py-2 text-slate-600">{card.pvki}</td>
                                    <td className="px-3 py-2 font-mono text-slate-600">{card.pvv}</td>
                                    <td className="px-3 py-2 font-mono text-slate-600">{card.cvv}</td>
                                    <td className="px-3 py-2 font-mono text-slate-500">{card.discretionaryData}</td>
                                    <td className="px-3 py-2">
                                        <button onClick={e => { e.stopPropagation(); onDeleteCard(card.number); }} className="text-slate-300 hover:text-red-400 transition-colors">
                                            <XCircle className="w-3.5 h-3.5" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
