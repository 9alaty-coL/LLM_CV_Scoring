// Workaround: importing the library entry point triggers a debug block that
// tries to read a non-existent test PDF when used under ESM (module.parent undefined).
// So we import the internal implementation directly to avoid that side effect.
import { createRequire } from 'module';
import { normalizeWhitespace } from '../utils/text.js';
const require = createRequire(import.meta.url);
// eslint-disable-next-line import/no-commonjs, global-require
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

export async function extractPdfText(buffer) {
  const data = await pdfParse(buffer);
  const raw = data.text || '';
  return normalizeWhitespace(raw);
}
