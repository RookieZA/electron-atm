import React from 'react';

interface FitEntry {
    PIDDX: string;
    PFIID: string;
    PSTDX: string;
    PAGDX: string;
    PMXPN: string;
    PCKLN: string;
    PINPD: string;
    PANDX: string;
    PANLN: string;
    PANPD: string;
    PRCNT: string;
    POFDX: string;
    PDCTB: string;
    PEKEY: string;
    PINDX: string;
    PLNDX: string;
    PMMSR: string;
    PBFMT: string;
}

interface FitsPanelProps {
    fits: FitEntry[];
}

const SCHEME_PREFIXES: Record<string, string> = {
    '4': 'Visa',
    '51': 'Mastercard', '52': 'Mastercard', '53': 'Mastercard', '54': 'Mastercard', '55': 'Mastercard',
    '34': 'Amex', '37': 'Amex',
};

function detectScheme(pfiid: string): string | null {
    for (const [prefix, scheme] of Object.entries(SCHEME_PREFIXES)) {
        if (pfiid.startsWith(prefix)) return scheme;
    }
    return null;
}

const COLS: { key: keyof FitEntry; title: string }[] = [
    { key: 'PIDDX', title: 'PIDDX' }, { key: 'PFIID', title: 'PFIID (Institution ID)' },
    { key: 'PSTDX', title: 'PSTDX' }, { key: 'PAGDX', title: 'PAGDX' },
    { key: 'PMXPN', title: 'PMXPN' }, { key: 'PCKLN', title: 'PCKLN' },
    { key: 'PINPD', title: 'PINPD' }, { key: 'PANDX', title: 'PANDX' },
    { key: 'PANLN', title: 'PANLN' }, { key: 'PANPD', title: 'PANPD' },
    { key: 'PRCNT', title: 'PRCNT' }, { key: 'POFDX', title: 'POFDX' },
    { key: 'PDCTB', title: 'PDCTB' }, { key: 'PEKEY', title: 'PEKEY' },
    { key: 'PINDX', title: 'PINDX' }, { key: 'PLNDX', title: 'PLNDX' },
    { key: 'PMMSR', title: 'PMMSR' }, { key: 'PBFMT', title: 'PBFMT' },
];

export const FitsPanel = ({ fits }: FitsPanelProps) => {
    return (
        <div className="h-full overflow-auto bg-slate-900 text-slate-200">
            {fits.length === 0 ? (
                <div className="text-slate-600 text-sm text-center pt-12">
                    No FIT data loaded. Connect to a host to download Financial Institution Tables.
                </div>
            ) : (
                <table className="w-full text-[10px] font-mono border-collapse">
                    <thead className="sticky top-0 z-10">
                        <tr className="bg-slate-800 text-slate-400 uppercase tracking-widest">
                            <th className="px-2 py-2 text-left border-b border-slate-700">Scheme</th>
                            {COLS.map(c => (
                                <th key={c.key} title={c.title} className="px-2 py-2 text-left font-normal border-b border-slate-700 whitespace-nowrap">
                                    {c.key}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {fits.map((fit, i) => {
                            const scheme = detectScheme(fit.PFIID);
                            return (
                                <tr key={i} className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors">
                                    <td className="px-2 py-1.5">
                                        {scheme && (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${scheme === 'Visa' ? 'bg-blue-900 text-blue-300' : scheme === 'Mastercard' ? 'bg-orange-900 text-orange-300' : 'bg-slate-700 text-slate-300'}`}>
                                                {scheme}
                                            </span>
                                        )}
                                    </td>
                                    {COLS.map(c => (
                                        <td key={c.key} className="px-2 py-1.5 text-slate-300">{fit[c.key]}</td>
                                    ))}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );
};
