import { it, expect } from 'vitest';
import { validateNewPassword } from '../src/lib/account.js';

it('zu kurzes Passwort wird abgelehnt', () => expect(validateNewPassword('12345')).toBe('Mindestens 6 Zeichen.'));
it('leeres Passwort wird abgelehnt', () => expect(validateNewPassword('')).toBe('Mindestens 6 Zeichen.'));
it('gültiges Passwort', () => expect(validateNewPassword('123456')).toBeNull());
