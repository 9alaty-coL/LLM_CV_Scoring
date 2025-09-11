import express from 'express';
import multer from 'multer';
import { extractPdfText } from '../services/pdfService.js';
import { scoreCvAgainstJd } from '../services/scoringService.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB each
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

// Bulk scoring endpoint – supports multiple CV PDFs in a single request using field name "cv".
router.post('/', upload.array('cv', 25), async (req, res) => {
  try {
    const jd = req.body.jd;
    if (!jd) {
      return res.status(400).json({ error: 'Missing jd field (Job Description markdown text)' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No CV PDF files uploaded (field name: cv)' });
    }

    const include = req.body.includeCvText && ['1','true','on','yes'].includes(String(req.body.includeCvText).toLowerCase());

    // Process each CV sequentially to limit memory spikes (files already in memory storage).
    const results = [];
    for (const file of req.files) {
      try {
        const cvText = await extractPdfText(file.buffer);
        const scored = await scoreCvAgainstJd({ cvText, jdMarkdown: jd });
        results.push({
          file: file.originalname,
          score: scored.score,
          explanation: scored.explanation,
          ...(include ? { cvText } : {})
        });
      } catch (e) {
        results.push({ file: file.originalname, error: e.message || 'Failed to process CV' });
      }
    }

    res.json({
      jdCharacters: jd.length,
      total: results.length,
      results
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

export default router;
