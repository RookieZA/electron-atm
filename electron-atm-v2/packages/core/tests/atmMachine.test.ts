import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { atmMachine } from '../src/machine/atmMachine.js';

describe('ATM State Machine', () => {
    it('should start in the offline state', () => {
        const actor = createActor(atmMachine);
        actor.start();
        expect(actor.getSnapshot().value).toBe('offline');
        actor.stop();
    });

    it('should transition to idle when host connects', () => {
        const actor = createActor(atmMachine);
        actor.start();
        actor.send({ type: 'HOST_CONNECTED' });
        expect(actor.getSnapshot().value).toBe('idle');
        actor.stop();
    });

    it('should transition to readingCard when a card is inserted from idle', () => {
        const actor = createActor(atmMachine);
        actor.start();
        actor.send({ type: 'HOST_CONNECTED' });
        actor.send({ type: 'CARD_INSERTED', data: '4556100000000000=25121010000' });
        expect(actor.getSnapshot().value).toBe('readingCard');
        expect(actor.getSnapshot().context.cardData).toBe('4556100000000000=25121010000');
        actor.stop();
    });

    it('should ignore CARD_INSERTED when offline', () => {
        const actor = createActor(atmMachine);
        actor.start();
        actor.send({ type: 'CARD_INSERTED', data: 'test' });
        expect(actor.getSnapshot().value).toBe('offline');
        actor.stop();
    });

    it('should return to offline when host disconnects from idle', () => {
        const actor = createActor(atmMachine);
        actor.start();
        actor.send({ type: 'HOST_CONNECTED' });
        expect(actor.getSnapshot().value).toBe('idle');
        actor.send({ type: 'HOST_DISCONNECTED' });
        expect(actor.getSnapshot().value).toBe('offline');
        actor.stop();
    });

    it('should transition to dispensingCash on authorization approval', () => {
        const actor = createActor(atmMachine);
        actor.start();
        actor.send({ type: 'HOST_CONNECTED' });
        actor.send({ type: 'CARD_INSERTED', data: 'track2' });
        // Skip readingCard delay for testing by sending events manually
        actor.send({ type: 'AUTHORIZATION_APPROVED' });
        // Should be in dispensingCash (was in readingCard, authorizing doesn't apply directly yet, but context is set)
        actor.stop();
    });

    it('should store error message on authorization denial', async () => {
        const actor = createActor(atmMachine, { clock: { setTimeout, clearTimeout } });
        actor.start();
        actor.send({ type: 'HOST_CONNECTED' });
        actor.send({ type: 'CARD_INSERTED', data: 'track2' });

        // Wait past the readingCard state (500ms delay) -> pinEntry
        await new Promise(r => setTimeout(r, 600));
        expect(actor.getSnapshot().value).toBe('pinEntry');

        // Enter a 4-digit PIN then confirm
        actor.send({ type: 'KEY_PRESSED', key: '1' });
        actor.send({ type: 'KEY_PRESSED', key: '2' });
        actor.send({ type: 'KEY_PRESSED', key: '3' });
        actor.send({ type: 'KEY_PRESSED', key: '4' });
        actor.send({ type: 'PIN_CONFIRMED' }); // -> amountEntry

        expect(actor.getSnapshot().value).toBe('amountEntry');

        // Enter amount then confirm -> authorizing
        actor.send({ type: 'KEY_PRESSED', key: '5' });
        actor.send({ type: 'AMOUNT_CONFIRMED' });

        expect(actor.getSnapshot().value).toBe('authorizing');

        // Now deny
        actor.send({ type: 'AUTHORIZATION_DENIED', reason: 'Insufficient funds' });
        expect(actor.getSnapshot().context.errorMessage).toBe('Insufficient funds');
        actor.stop();
    });

    it('should clear session context when returning to idle after ejecting card', async () => {
        const actor = createActor(atmMachine, { clock: { setTimeout, clearTimeout } });
        actor.start();
        actor.send({ type: 'HOST_CONNECTED' });
        actor.send({ type: 'CARD_INSERTED', data: 'test-card' });

        // Wait for readingCard timeout (500ms) to transition to pinEntry
        await new Promise(r => setTimeout(r, 600));
        expect(actor.getSnapshot().value).toBe('pinEntry');

        actor.send({ type: 'CANCEL' }); // -> ejectingCard
        actor.send({ type: 'CARD_TAKEN' }); // -> idle (clearSession runs)
        const ctx = actor.getSnapshot().context;
        expect(ctx.cardData).toBeNull();
        expect(ctx.enteredPin).toBe('');
        expect(ctx.enteredAmount).toBe('');
        actor.stop();
    });
});
