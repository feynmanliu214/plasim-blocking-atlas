// Generic private-identifier patterns for the public repo (G-PUB's public half). They are built from fragments so this
// file carries no private token itself; the full private list stays in plasim-physics (config.PUBLIC_FORBIDDEN), which
// scans this whole repo at the Publish gate.
const j = (...parts) => new RegExp(parts.join(''));
export const PUBLIC_FORBIDDEN = [
  j('season', '_id'), j('source', '_root'), j('root', '_path'), j('/scr', 'atch'), j('/wo', 'rk2?/'), j('/ho', 'me1'),
  j('MO', 'ST\\.\\d'), j('\\bs', 'im\\d+'), j('__s', 'im\\d'), j('TG', '-ATM'),
];
