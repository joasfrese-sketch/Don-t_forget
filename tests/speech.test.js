import { describe, it, expect, afterEach } from 'vitest';
import { startListening, speechErrorMessage, speechSupported } from '../src/lib/speech.js';

afterEach(() => { delete globalThis.window; });

describe('startListening', () => {
  it('wirft start() synchron, kommen Fehler und Ende sofort und nichts bleibt hängen', () => {
    globalThis.window = { SpeechRecognition: class { start() { throw new Error('nicht nutzbar'); } } };
    const events = [];
    const handle = startListening({ onText: () => {}, onError: (c) => events.push(['error', c]), onEnd: () => events.push(['end']) });
    expect(events).toEqual([['error', 'start-failed'], ['end']]);
    expect(() => handle.stop()).not.toThrow();
  });

  it('meldet erkannten Gesamttext, auch Zwischenstände', () => {
    let inst;
    globalThis.window = { SpeechRecognition: class { constructor() { inst = this; } start() {} stop() {} } };
    const texts = [];
    startListening({ onText: (t) => texts.push(t), onError: () => {}, onEnd: () => {} });
    inst.onresult({ results: [[{ transcript: 'morgen ' }], [{ transcript: 'Zahnarzt' }]] });
    expect(texts).toEqual(['morgen Zahnarzt']);
  });

  it('speechSupported ohne Spracherkennung', () => {
    globalThis.window = {};
    expect(speechSupported()).toBe(false);
  });
});

describe('speechErrorMessage', () => {
  it('Meldungen', () => {
    expect(speechErrorMessage('not-allowed')).toBe('Mikrofon nicht erlaubt.');
    expect(speechErrorMessage('no-speech')).toBe('Ich habe nichts gehört.');
    expect(speechErrorMessage('aborted')).toBe('');
    expect(speechErrorMessage('start-failed')).toBe('Spracherkennung hat nicht geklappt.');
  });
});
