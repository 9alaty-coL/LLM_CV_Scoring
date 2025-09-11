import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseCsv, csvRowsToObjects } from '../utils/csv.js';
import { extractPdfText } from '../services/pdfService.js';
import { scoreCvAgainstJd } from '../services/scoringService.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..');
const DATASET_DIR = path.join(ROOT, 'dataset');
const CVS_DIR = path.join(DATASET_DIR, 'cvs');
const JDS_DIR = path.join(DATASET_DIR, 'jds');

// GET to retrieve processed CSV with llm_score appended
// Query params: file (default test.csv)
router.get('/', async (req, res) => {
  try {
    const csvFileName = req.query.file || 'test.csv';
    const csvPath = path.join(DATASET_DIR, csvFileName);
    const exists = await fileExists(csvPath);
    if (!exists) {
      return res.status(404).json({ error: `CSV file not found: ${csvFileName}` });
    }
    const rawCsv = await fs.readFile(csvPath, 'utf8');
    const rows = parseCsv(rawCsv);
    const objs = csvRowsToObjects(rows);
    if (!objs.length) {
      return res.status(400).json({ error: 'CSV contains no data rows.' });
    }

    // Expect columns: cv_file_name, format, jd_file_name, format, score
    // We'll produce: cv_file_name, format, jd_file_name, format, score, llm_score
    const out = [];
  for (const row of objs) {
      const cvNameRaw = row.cv_file_name?.trim();
      const jdNameRaw = row.jd_file_name?.trim();
      let llmScore = '';
      try {
        if (!cvNameRaw || !jdNameRaw) throw new Error('Missing cv_file_name or jd_file_name');
        const jdCandidates = buildJdCandidates(jdNameRaw);
        const jdPath = await firstExisting(jdCandidates.map(n => path.join(JDS_DIR, n)));
        if (!jdPath) throw new Error(`JD file not found (tried: ${jdCandidates.join(', ')})`);
        const cvCandidates = buildCvPdfCandidates(cvNameRaw);
        const cvPdfPath = await firstExisting(cvCandidates.map(n => path.join(CVS_DIR, n)));
        if (!cvPdfPath) throw new Error(`CV PDF not found (tried: ${cvCandidates.join(', ')})`);
        // Read JD as text or extract from PDF
        let jdText;
        if (/\.pdf$/i.test(jdPath)) {
          const jdBuffer = await fs.readFile(jdPath);
          jdText = await extractPdfText(jdBuffer);
        } else {
          jdText = await fs.readFile(jdPath, 'utf8');
        }
        const cvBuffer = await fs.readFile(cvPdfPath);
        const cvText = await extractPdfText(cvBuffer);
        const scored = await scoreCvAgainstJd({ cvText, jdMarkdown: jdText });
        llmScore = scored.score;
      } catch (e) {
        llmScore = `ERR:${e.message}`;
      }
      out.push({ ...row, llm_score: llmScore });
    }
    // Compute per-row delta (ground truth - llm) where numeric
    let sumGt = 0, sumLlm = 0, sumAbs = 0, count = 0;
    const enriched = out.map(o => {
      const gt = parseFloat(o.score);
      const llm = parseFloat(o.llm_score);
      let delta = '';
      let abs_delta = '';
      if (!Number.isNaN(gt) && !Number.isNaN(llm)) {
        delta = gt - llm;
        abs_delta = Math.abs(delta);
        sumGt += gt; sumLlm += llm; count += 1;
        sumAbs += abs_delta;
      }
      return { ...o, delta, abs_delta };
    });
    const aggregateLossSigned = count ? ( (sumGt - sumLlm) / count ) : '';
    const meanAbsoluteLoss = count ? ( sumAbs / count ) : '';

    if (String(req.query.format).toLowerCase() === 'json') {
      return res.json({
        file: csvFileName,
        total: enriched.length,
        numeric_rows: count,
        sum_groundtruth: sumGt,
        sum_llm: sumLlm,
        aggregate_loss_signed: aggregateLossSigned,
        mean_absolute_loss: meanAbsoluteLoss,
        rows: enriched
      });
    }

    // ensure consistent header ordering (include delta & abs_delta at end if missing)
    const baseHeader = Object.keys(enriched[0]);
    const header = [...baseHeader];
    if (!header.includes('delta')) header.push('delta');
    if (!header.includes('abs_delta')) header.push('abs_delta');
    const csvOutput = [header, ...enriched.map(o => header.map(h => o[h]))];
    // Append blank line + aggregate loss summary as final line
    if (count) {
      csvOutput.push([]);
      csvOutput.push(['aggregate_loss_signed', aggregateLossSigned]);
      csvOutput.push(['mean_absolute_loss', meanAbsoluteLoss]);
    }
    const csvString = csvOutput.map(cols => cols.map(v => {
      const s = String(v ?? '').replace(/"/g,'""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    }).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="processed_${csvFileName}"`);
    res.send(csvString);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function buildCvPdfCandidates(name) {
  // If already ends with .pdf (any case) use as-is first.
  const variants = new Set();
  const base = name.trim();
  if (!base) return [];
  const hasExt = /\.pdf$/i.test(base);
  if (hasExt) variants.add(base);
  else {
    variants.add(base); // raw (maybe already includes extension omitted incorrectly)
    variants.add(`${base}.pdf`);
  }
  // Also attempt to normalize spaces and parentheses.
  const simplified = base.replace(/\s+\(\d+\)$/,'').trim();
  if (simplified && simplified !== base) {
    variants.add(`${simplified}.pdf`);
    variants.add(simplified);
  }
  return [...variants];
}

function buildJdCandidates(name) {
  const variants = new Set();
  const base = name.trim();
  if (!base) return [];
  const hasExt = /\.(md|txt|pdf)$/i.test(base);
  if (hasExt) variants.add(base);
  else {
    variants.add(`${base}.md`);
    variants.add(`${base}.txt`);
    variants.add(`${base}.pdf`);
    variants.add(base); // raw
  }
  // Also allow space/parenthesis normalization similar to CVs
  const simplified = base.replace(/\s+\(\d+\)$/,'').trim();
  if (simplified && simplified !== base) {
    variants.add(`${simplified}.md`);
    variants.add(`${simplified}.txt`);
    variants.add(`${simplified}.pdf`);
  }
  return [...variants];
}

async function firstExisting(paths) {
  for (const p of paths) {
    if (await fileExists(p)) return p;
  }
  return null;
}

export default router;