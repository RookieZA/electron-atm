import { describe, it, expect } from 'vitest';
import { parseNDCMessage, buildNDCMessage, MessageClass } from '../src/index.js';

describe('NDC Protocol', () => {
    describe('Parser', () => {
        it('should parse a Solicited Status message', () => {
            const raw = '12345678919A'; // LUNO(9) + Class(1) + Descriptor(1) + Info(1)
            const parsed = parseNDCMessage(raw);

            expect(parsed.logicalUnitNumber).toBe('123456789');
            expect(parsed.messageClass).toBe(MessageClass.SolicitedStatus);
            expect((parsed as any).statusDescriptor).toBe('9');
            expect((parsed as any).statusInformation).toBe('A');
        });

        it('should parse a Terminal Command message', () => {
            const raw = '987654321412'; // LUNO(9) + Class(4) + Cmd(1) + Mod(1)
            const parsed = parseNDCMessage(raw);

            expect(parsed.messageClass).toBe(MessageClass.TerminalCommand);
            expect((parsed as any).commandCode).toBe('1');
            expect((parsed as any).commandModifier).toBe('2');
        });
    });

    describe('Builder', () => {
        it('should build a Solicited Status message', () => {
            const msg = {
                logicalUnitNumber: '111222333',
                messageClass: MessageClass.SolicitedStatus,
                statusDescriptor: '8',
                statusInformation: 'B',
                raw: ''
            };

            const raw = buildNDCMessage(msg as any);
            expect(raw).toBe('11122233318B');
        });
    });
});
