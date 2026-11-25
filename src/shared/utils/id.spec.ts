import { generateId } from './id.js';

describe('generateId', () => {
  it('produces RFC 9562 UUIDv7 strings', () => {
    const id = generateId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is unique and time-ordered', () => {
    const ids = Array.from({ length: 1000 }, () => generateId());
    expect(new Set(ids).size).toBe(ids.length);
    const first = ids[0]!.slice(0, 13);
    const last = ids.at(-1)!.slice(0, 13);
    expect(last >= first).toBe(true);
  });
});
