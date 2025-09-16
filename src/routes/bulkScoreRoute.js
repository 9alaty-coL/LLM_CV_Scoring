import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractPdfText } from '../services/pdfService.js';
import { extractCvCriteria, extractJdCriteria } from '../services/criteriaExtractionService.js';
import { scoreCvAgainstJd } from '../services/scoringService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 100 // Max 100 files
  }
});

// Store for uploaded files and processing status
const processingJobs = new Map();
const uploadedFiles = new Map();

// Upload multiple CV files
router.post('/upload-cvs', upload.array('cvFiles', 50), (req, res) => {
  try {
    const files = req.files || [];
    const uploadedCvs = [];

    files.forEach(file => {
      const fileId = `cv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      uploadedFiles.set(file.originalname, {
        id: fileId,
        buffer: file.buffer,
        originalName: file.originalname,
        type: 'cv'
      });
      uploadedCvs.push({
        id: fileId,
        name: file.originalname,
        size: file.size
      });
    });

    res.json({
      success: true,
      files: uploadedCvs,
      message: `${files.length} CV files uploaded successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload multiple JD files
router.post('/upload-jds', upload.array('jdFiles', 50), (req, res) => {
  try {
    const files = req.files || [];
    const uploadedJds = [];

    files.forEach(file => {
      const fileId = `jd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      uploadedFiles.set(file.originalname, {
        id: fileId,
        buffer: file.buffer,
        originalName: file.originalname,
        type: 'jd'
      });
      uploadedJds.push({
        id: fileId,
        name: file.originalname,
        size: file.size
      });
    });

    res.json({
      success: true,
      files: uploadedJds,
      message: `${files.length} JD files uploaded successfully`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Upload CSV configuration file
router.post('/upload-csv', upload.single('csvFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No CSV file uploaded'
      });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const configurations = parseCsv(csvContent);
    
    res.json({
      success: true,
      configurations,
      message: `${configurations.length} configurations loaded from CSV`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start bulk processing
router.post('/process-bulk', async (req, res) => {
  try {
    const { configurations } = req.body;
    
    if (!configurations || !Array.isArray(configurations)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid configurations provided'
      });
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize job status
    processingJobs.set(jobId, {
      id: jobId,
      status: 'processing',
      progress: 0,
      total: configurations.length,
      completed: 0,
      results: [],
      startTime: new Date(),
      currentItem: null
    });

    // Start processing asynchronously
    processBulkAsync(jobId, configurations);

    res.json({
      success: true,
      jobId,
      message: 'Bulk processing started'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get processing status
router.get('/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;
    const job = processingJobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    res.json({
      success: true,
      job: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        total: job.total,
        completed: job.completed,
        currentItem: job.currentItem,
        startTime: job.startTime,
        endTime: job.endTime
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download results
router.get('/download/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = processingJobs.get(jobId);
    
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }

    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Job not completed yet'
      });
    }

    // Generate CSV content manually
    const csvContent = generateCsv(job.results);
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bulk_scoring_results_${jobId}.csv"`);
    res.send(csvContent);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Download CSV template
router.get('/template', (req, res) => {
  try {
    const templateCsv = `cv_file_name,format,jd_file_name,jd_format
john_doe_cv,pdf,software_engineer_jd,pdf
jane_smith_cv,pdf,data_scientist_jd,pdf
test_candidate,pdf,backend_developer_jd,pdf`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="bulk_scoring_template.csv"');
    res.send(templateCsv);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Async processing function
async function processBulkAsync(jobId, configurations) {
  const job = processingJobs.get(jobId);
  
  try {
    for (let i = 0; i < configurations.length; i++) {
      const config = configurations[i];
      
      // Update job status
      job.currentItem = `Processing ${config.cv_file_name} vs ${config.jd_file_name}`;
      job.progress = Math.round((i / configurations.length) * 100);
      
      try {
        // Get uploaded files - handle both with and without extensions
        let cvFile = uploadedFiles.get(config.cv_file_name);
        let jdFile = uploadedFiles.get(config.jd_file_name);
        
        // If not found, try adding the format extension
        if (!cvFile) {
          const cvFileNameWithExt = config.cv_file_name + '.' + config.format;
          cvFile = uploadedFiles.get(cvFileNameWithExt);
        }
        
        if (!jdFile) {
          const jdFileNameWithExt = config.jd_file_name + '.' + config.jd_format;
          jdFile = uploadedFiles.get(jdFileNameWithExt);
        }
        
        // If still not found, try searching by partial name match
        if (!cvFile) {
          for (const [fileName, file] of uploadedFiles.entries()) {
            if (file.type === 'cv' && (fileName.startsWith(config.cv_file_name) || fileName.includes(config.cv_file_name))) {
              cvFile = file;
              break;
            }
          }
        }
        
        if (!jdFile) {
          for (const [fileName, file] of uploadedFiles.entries()) {
            if (file.type === 'jd' && (fileName.startsWith(config.jd_file_name) || fileName.includes(config.jd_file_name))) {
              jdFile = file;
              break;
            }
          }
        }
        
        if (!cvFile) {
          throw new Error(`CV file not found: ${config.cv_file_name} (tried with .${config.format} extension)`);
        }
        
        if (!jdFile) {
          throw new Error(`JD file not found: ${config.jd_file_name} (tried with .${config.jd_format} extension)`);
        }

        // Extract text from files (only PDF supported for now)
        const cvText = await extractPdfText(cvFile.buffer);
        const jdText = await extractPdfText(jdFile.buffer);

        // Extract criteria
        const cvCriteria = await extractCvCriteria(cvText);
        const jdCriteria = await extractJdCriteria(jdText);

        // Score CV against JD
        const scoringResult = await scoreCvAgainstJd({ jdCriteria, cvCriteria });

        // Add result to job
        const result = {
          ...config,
          cv_criteria: JSON.stringify(cvCriteria),
          jd_criteria: JSON.stringify(jdCriteria),
          result: JSON.stringify(scoringResult),
          score: scoringResult.final_score || scoringResult.total_score || 0
        };
        
        job.results.push(result);
        job.completed++;
        
      } catch (error) {
        // Add error result
        const errorResult = {
          ...config,
          cv_criteria: JSON.stringify({ error: 'Failed to extract criteria' }),
          jd_criteria: JSON.stringify({ error: 'Failed to extract criteria' }),
          result: JSON.stringify({ error: error.message }),
          score: 0
        };
        
        job.results.push(errorResult);
        job.completed++;
      }
    }
    
    // Mark job as completed
    job.status = 'completed';
    job.progress = 100;
    job.currentItem = 'Processing completed';
    job.endTime = new Date();
    
  } catch (error) {
    job.status = 'failed';
    job.error = error.message;
    job.endTime = new Date();
  }
}

// Helper function to parse CSV content
function parseCsv(csvContent) {
  const configurations = [];
  const lines = csvContent.split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV file must have at least a header row and one data row');
  }
  
  const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
  
  // Validate required columns
  const requiredColumns = ['cv_file_name', 'format', 'jd_file_name', 'jd_format'];
  const missingColumns = requiredColumns.filter(col => !headers.includes(col));
  
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(', ')}`);
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
    const config = {};
    
    headers.forEach((header, index) => {
      config[header] = values[index] || '';
    });
    
    if (config.cv_file_name && config.jd_file_name) {
      configurations.push(config);
    }
  }
  
  return configurations;
}

// Helper function to generate CSV content
function generateCsv(results) {
  if (!results || results.length === 0) {
    return 'cv_file_name,format,jd_file_name,jd_format,cv_criteria,jd_criteria,result,score\n';
  }
  
  const headers = ['cv_file_name', 'format', 'jd_file_name', 'jd_format', 'cv_criteria', 'jd_criteria', 'result', 'score'];
  let csvContent = headers.join(',') + '\n';
  
  results.forEach(result => {
    const row = headers.map(header => {
      let value = result[header] || '';
      // Escape quotes and wrap in quotes if contains comma or quote
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        value = '"' + value.replace(/"/g, '""') + '"';
      }
      return value;
    });
    csvContent += row.join(',') + '\n';
  });
  
  return csvContent;
}

export default router;
