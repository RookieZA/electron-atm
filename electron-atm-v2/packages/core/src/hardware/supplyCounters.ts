/**
 * ATM Supply Counters
 *
 * Tracks all NDC hardware supply counters that the host can request
 * via the "Send Supply Counters" terminal command.
 *
 * Standard counters (from NCR NDC specification):
 *  - tsn                         : 4 hex digits — Transaction Sequence Number
 *  - transactionCount            : 7 digits
 *  - notesInCassettes            : 5 digits per cassette × 4 cassettes = 20 digits
 *  - notesRejected               : 5 digits per cassette × 4 cassettes = 20 digits
 *  - notesDispensed              : 5 digits per cassette × 4 cassettes = 20 digits
 *  - lastTransactionNotesDispensed: 5 digits per cassette × 4 cassettes = 20 digits
 *  - cardsCaptured               : 5 digits
 *  - envelopesDeposited          : 5 digits
 *  - cameraFilmRemaining         : 5 digits
 *  - lastEnvelopeSerial          : 5 digits
 */

export interface CassetteCounters {
    /** Bills currently in the cassette */
    notesInCassette: number;
    /** Bills rejected during the current fill */
    notesRejected: number;
    /** Bills dispensed from this cassette since last fill */
    notesDispensed: number;
    /** Bills dispensed during the last transaction */
    lastTransactionDispensed: number;
}

export interface SupplyCountersSnapshot {
    tsn: string; // 4 hex chars
    transactionCount: number;
    cassettes: CassetteCounters[]; // always 4 entries
    cardsCaptured: number;
    envelopesDeposited: number;
    cameraFilmRemaining: number;
    lastEnvelopeSerial: number;
}

const DEFAULT_CASSETTE: CassetteCounters = {
    notesInCassette: 2500,
    notesRejected: 0,
    notesDispensed: 0,
    lastTransactionDispensed: 0,
};

const NUM_CASSETTES = 4;

export class SupplyCounters {
    private tsn: number = 0;
    private transactionCount: number = 0;
    private cassettes: CassetteCounters[];
    private cardsCaptured: number = 0;
    private envelopesDeposited: number = 0;
    private cameraFilmRemaining: number = 9999;
    private lastEnvelopeSerial: number = 0;

    constructor(initial?: Partial<SupplyCountersSnapshot>) {
        this.cassettes = Array.from({ length: NUM_CASSETTES }, () => ({ ...DEFAULT_CASSETTE }));

        if (initial) {
            this.restore(initial);
        }
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    /** Increment TSN (rotates 0x0000 → 0xFFFF). Returns the new TSN string. */
    incrementTSN(): string {
        this.tsn = (this.tsn + 1) & 0xffff;
        this.transactionCount++;
        return this.getTSN();
    }

    /** Record a dispense across one or more cassettes */
    recordDispense(cassetteIndex: number, count: number): void {
        const c = this.cassettes[cassetteIndex];
        if (!c) return;
        const actual = Math.min(count, c.notesInCassette);
        c.notesDispensed += actual;
        c.notesInCassette -= actual;
        c.lastTransactionDispensed = actual;
    }

    /** Record a rejected note on a cassette */
    recordRejection(cassetteIndex: number, count = 1): void {
        const c = this.cassettes[cassetteIndex];
        if (c) c.notesRejected += count;
    }

    /** Record a captured card */
    recordCapture(): void {
        this.cardsCaptured++;
    }

    /** Replenish a cassette */
    refillCassette(cassetteIndex: number, count: number): void {
        const c = this.cassettes[cassetteIndex];
        if (c) {
            c.notesInCassette = count;
            c.notesDispensed = 0;
            c.notesRejected = 0;
            c.lastTransactionDispensed = 0;
        }
    }

    /** Reset all counters to zero (but keep cassette levels) */
    reset(): void {
        this.tsn = 0;
        this.transactionCount = 0;
        this.cardsCaptured = 0;
        this.envelopesDeposited = 0;
        this.cassettes.forEach(c => {
            c.notesDispensed = 0;
            c.notesRejected = 0;
            c.lastTransactionDispensed = 0;
        });
    }

    // ── Accessors ────────────────────────────────────────────────────────────

    getTSN(): string {
        return this.tsn.toString(16).toUpperCase().padStart(4, '0');
    }

    /** Build the 20-digit "notes in cassettes" NDC field */
    private cassettesField(getter: (c: CassetteCounters) => number): string {
        return this.cassettes
            .map(c => getter(c).toString().padStart(5, '0'))
            .join('');
    }

    /**
     * Build the raw NDC supply counters payload.
     * Format follows NCR NDC+ specification section on Supply Counters.
     */
    getCountersPayload(): string {
        return [
            this.getTSN(),
            this.transactionCount.toString().padStart(7, '0'),
            this.cassettesField(c => c.notesInCassette),
            this.cassettesField(c => c.notesRejected),
            this.cassettesField(c => c.notesDispensed),
            this.cassettesField(c => c.lastTransactionDispensed),
            this.cardsCaptured.toString().padStart(5, '0'),
            this.envelopesDeposited.toString().padStart(5, '0'),
            this.cameraFilmRemaining.toString().padStart(5, '0'),
            this.lastEnvelopeSerial.toString().padStart(5, '0'),
        ].join('');
    }

    /**
     * Build the "Supplies Status" byte for Configuration Information.
     * Each nibble represents one cassette: 0=good, 1=low, 2=empty.
     */
    getSuppliesStatus(): string {
        return this.cassettes.map(c => {
            if (c.notesInCassette === 0) return '2'; // empty
            if (c.notesInCassette < 100) return '1'; // low
            return '0';                                  // good
        }).join('');
    }

    /** Full snapshot for display in the Hardware panel */
    getSnapshot(): SupplyCountersSnapshot {
        return {
            tsn: this.getTSN(),
            transactionCount: this.transactionCount,
            cassettes: this.cassettes.map(c => ({ ...c })),
            cardsCaptured: this.cardsCaptured,
            envelopesDeposited: this.envelopesDeposited,
            cameraFilmRemaining: this.cameraFilmRemaining,
            lastEnvelopeSerial: this.lastEnvelopeSerial,
        };
    }

    /** Restore state from a saved snapshot (e.g. on app startup) */
    restore(snapshot: Partial<SupplyCountersSnapshot>): void {
        if (snapshot.tsn) this.tsn = parseInt(snapshot.tsn, 16);
        if (snapshot.transactionCount) this.transactionCount = snapshot.transactionCount;
        if (snapshot.cardsCaptured) this.cardsCaptured = snapshot.cardsCaptured;
        if (snapshot.envelopesDeposited) this.envelopesDeposited = snapshot.envelopesDeposited;
        if (snapshot.cameraFilmRemaining) this.cameraFilmRemaining = snapshot.cameraFilmRemaining;
        if (snapshot.cassettes) {
            snapshot.cassettes.forEach((c, i) => {
                if (this.cassettes[i]) this.cassettes[i] = { ...this.cassettes[i], ...c };
            });
        }
    }
}
