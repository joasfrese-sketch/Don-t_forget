// Der eine Speicher dieser App (auf dem Gerät). Dünne Hülle, damit die Oberfläche kurze Namen nutzen kann.
import { createStore, DEFAULTS } from './store.js';
import { defaultStorage } from './storage.js';

export { DEFAULTS };
export const store = createStore(defaultStorage());

export const getSettings = () => store.getSettings();
export const saveSettings = (patch) => store.saveSettings(patch);
export const listNotes = () => store.listNotes();
export const createNote = (text, remindAt, custom) => store.createNote(text, remindAt, custom);
export const updateNote = (id, patch) => store.updateNote(id, patch);
export const markDone = (id) => store.markDone(id);
export const reopen = (id, remindAt) => store.reopen(id, remindAt);
export const snooze = (id) => store.snooze(id);
export const deleteNote = (id) => store.deleteNote(id);
