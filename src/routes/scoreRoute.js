import express from 'express';
import multer from 'multer';
import { extractPdfText } from '../services/pdfService.js';
import { scoreCvAgainstJd } from '../services/scoringService.js';

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

    const result = await scoreCvAgainstJd({ cvText, jdMarkdown: jd });
    const include = req.body.includeCvText;
    if (include && ['1','true','on','yes'].includes(String(include).toLowerCase())) {
      result.cvText = cvText; // attach raw (cleaned) extracted text
    }
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
});

export default router;
