import express from 'express';
import multer from 'multer';
import { extractPdfText } from '../services/pdfService.js';
import { scoreCvAgainstJd } from '../services/scoringService.js';
import { extractCvCriteria, extractJdCriteria } from '../services/criteriaExtractionService.js';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  }
});

router.post('/', upload.single('cv'), async (req, res) => {
  try {
    const jd = req.body.jd;
    if (!jd) {
      return res.status(400).json({ error: 'Missing jd field (Job Description markdown text)' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'Missing cv PDF file field' });
    }

    const pdfBuffer = req.file.buffer;
    const cvText = await extractPdfText(pdfBuffer);

    // Step 1: Extract criteria from both CV and JD
    console.log('[scoreRoute] Extracting criteria from CV and JD...');
    const [cvCriteria, jdCriteria] = await Promise.all([
      extractCvCriteria(cvText),
      extractJdCriteria(jd)
    ]);

    // Step 2: Score based on extracted criteria
    console.log('[scoreRoute] Scoring CV against JD using extracted criteria...');
    const result = await scoreCvAgainstJd({ cvCriteria, jdCriteria });

    // Optional: Include extracted criteria and/or raw CV text in response
    const include = req.body.includeCvText;
    if (include && ['1','true','on','yes'].includes(String(include).toLowerCase())) {
      result.cvText = cvText; // attach raw (cleaned) extracted text
      result.cvCriteria = cvCriteria; // attach extracted CV criteria
      result.jdCriteria = jdCriteria; // attach extracted JD criteria
    }

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

export default router;
