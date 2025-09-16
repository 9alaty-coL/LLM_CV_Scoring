import OpenAI from 'openai';
import dotenv from 'dotenv';
import { safeJsonParse } from '../utils/text.js';

// Ensure environment variables are loaded
dotenv.config();

const DEFAULT_MODEL = process.env.MODEL || 'gpt-4o-mini';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const API_KEY = process.env.OPENAI_API_KEY || 'dummy-key';

let client = null;
if (API_KEY) {
  client = new OpenAI({ 
    apiKey: API_KEY,
    baseURL: LLM_BASE_URL
  });
  console.log(`[criteriaExtractionService] OpenAI client initialized (model=${DEFAULT_MODEL}, baseURL=${LLM_BASE_URL})`);
} else {
  console.warn('[criteriaExtractionService] OPENAI_API_KEY not set – extraction will fail.');
}

const CV_EXTRACTION_PROMPT = `You are an information extraction assistant. 
Your task is to extract structured data from a CV text. 
Focus only on the requested criteria and ignore irrelevant text.

### Criteria to Extract:
1. Skills
2. Experience (years + description)
3. Education (degree, field, institution)
4. Certifications
5. Projects
6. Tools & Technologies
7. Domain Knowledge
8. Languages
9. Soft Skills
10. Achievements
11. Publications / Research
12. Other Relevant Info

### Output Format (JSON):
{
  "skills": [ "Python", "React", "Docker" ],
  "experience": [
    { "years": 3, "description": "Software Engineer at Company A working on Django and React" },
    { "years": 2, "description": "Frontend Developer at Company B focusing on Angular" }
  ],
  "education": [
    { "degree": "Bachelor", "field": "Computer Science", "institution": "University of X" }
  ],
  "certifications": ["AWS Certified Developer"],
  "projects": ["E-commerce web app using Django and React"],
  "tools_technologies": ["Git", "Kubernetes", "Jenkins"],
  "domain_knowledge": ["FinTech", "E-commerce"],
  "languages": ["English (Fluent)", "Vietnamese (Native)"],
  "soft_skills": ["Teamwork", "Leadership", "Communication"],
  "achievements": ["Employee of the Month 2022"],
  "publications": ["Paper on AI Optimization - IEEE 2021"],
  "other": ["Open-source contributor to Django"]
}

### Example:
CV Text:
"John Doe, 5 years of experience as a Python backend engineer, skilled in Django, React, and Docker. 
Worked at Company A for 3 years, Company B for 2 years. 
Bachelor's in Computer Science from University of X. 
Certified AWS Developer. 
Fluent in English. 
Published a paper on AI Optimization at IEEE 2021."

Output:
{
  "skills": ["Python", "Django", "React", "Docker"],
  "experience": [
    { "years": 3, "description": "Backend Engineer at Company A" },
    { "years": 2, "description": "Backend Engineer at Company B" }
  ],
  "education": [
    { "degree": "Bachelor", "field": "Computer Science", "institution": "University of X" }
  ],
  "certifications": ["AWS Certified Developer"],
  "projects": [],
  "tools_technologies": ["Docker"],
  "domain_knowledge": [],
  "languages": ["English (Fluent)"],
  "soft_skills": [],
  "achievements": [],
  "publications": ["AI Optimization - IEEE 2021"],
  "other": []
}

---

Now extract the criteria from the following CV text:

{CV_TEXT}`;

const JD_EXTRACTION_PROMPT = `You are an information extraction assistant. 
Your task is to extract structured job requirements from a Job Description (JD) text. 
Focus only on the requested criteria and ignore irrelevant text.

### Criteria to Extract:
1. Skills (required/desired)
2. Experience (years required, role context)
3. Education (degree, field, institution if specified)
4. Certifications (required or preferred)
5. Projects (type of projects expected)
6. Tools & Technologies
7. Domain Knowledge (industry/domain expertise required)
8. Languages (e.g., English, French, technical writing)
9. Soft Skills
10. Achievements (if company expects certain track record)
11. Publications / Research (if research role)
12. Other Relevant Info

### Output Format (JSON):
{
  "skills": [],
  "experience": [],
  "education": [],
  "certifications": [],
  "projects": [],
  "tools_technologies": [],
  "domain_knowledge": [],
  "languages": [],
  "soft_skills": [],
  "achievements": [],
  "publications": [],
  "other": []
}

### Example:
JD Text:
"We are hiring a Backend Developer with 3+ years of experience in Python and Django. 
Bachelor's degree in Computer Science required, Master's is a plus. 
AWS certification preferred. 
Must have worked on scalable web applications. 
Good communication and teamwork skills are required. 
Experience in FinTech domain is highly desirable."

Output:
{
  "skills": ["Python", "Django"],
  "experience": [
    { "years_required": 3, "description": "Backend Developer experience" }
  ],
  "education": [
    { "degree": "Bachelor", "field": "Computer Science", "institution": null },
    { "degree": "Master", "field": "Computer Science", "institution": null, "preferred": true }
  ],
  "certifications": ["AWS Certification (preferred)"],
  "projects": ["Scalable web applications"],
  "tools_technologies": [],
  "domain_knowledge": ["FinTech"],
  "languages": [],
  "soft_skills": ["Communication", "Teamwork"],
  "achievements": [],
  "publications": [],
  "other": []
}

---

Now extract the criteria from the following Job Description:

{JD_TEXT}`;

async function callLlm(messages) {
  if (!client) return null;
  try {
    return await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 800
    });
  } catch (err) {
    if (LOG_LEVEL === 'debug') {
      console.debug('[criteriaExtractionService] LLM error:', err?.status, err?.message);
    }
    throw err;
  }
}

function getDefaultCvCriteria() {
  return {
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    tools_technologies: [],
    domain_knowledge: [],
    languages: [],
    soft_skills: [],
    achievements: [],
    publications: [],
    other: []
  };
}

function getDefaultJdCriteria() {
  return {
    skills: [],
    experience: [],
    education: [],
    certifications: [],
    projects: [],
    tools_technologies: [],
    domain_knowledge: [],
    languages: [],
    soft_skills: [],
    achievements: [],
    publications: [],
    other: []
  };
}

export async function extractCvCriteria(cvText) {
  if (!client) {
    console.warn('[criteriaExtractionService] No OpenAI client - returning default CV criteria');
    return getDefaultCvCriteria();
  }

  const prompt = CV_EXTRACTION_PROMPT.replace('{CV_TEXT}', cvText);
  const messages = [
    { role: 'system', content: 'You are a strict JSON output generator for CV criteria extraction.' },
    { role: 'user', content: prompt }
  ];

  try {
    const completion = await callLlm(messages);
    const raw = completion?.choices?.[0]?.message?.content?.trim() || '';
    
    let parsed = safeJsonParse(raw);
    if (!parsed) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = safeJsonParse(match[0]);
    }

    if (!parsed || typeof parsed !== 'object') {
      console.warn('[criteriaExtractionService] Failed to parse CV criteria - using defaults');
      return getDefaultCvCriteria();
    }

    // Ensure all required fields exist with defaults
    const defaultCriteria = getDefaultCvCriteria();
    const result = { ...defaultCriteria };
    
    Object.keys(defaultCriteria).forEach(key => {
      if (parsed[key] && Array.isArray(parsed[key])) {
        result[key] = parsed[key];
      }
    });

    return result;
  } catch (err) {
    console.error('[criteriaExtractionService] Error extracting CV criteria:', err.message);
    return getDefaultCvCriteria();
  }
}

export async function extractJdCriteria(jdText) {
  if (!client) {
    console.warn('[criteriaExtractionService] No OpenAI client - returning default JD criteria');
    return getDefaultJdCriteria();
  }

  const prompt = JD_EXTRACTION_PROMPT.replace('{JD_TEXT}', jdText);
  const messages = [
    { role: 'system', content: 'You are a strict JSON output generator for Job Description criteria extraction.' },
    { role: 'user', content: prompt }
  ];

  try {
    const completion = await callLlm(messages);
    const raw = completion?.choices?.[0]?.message?.content?.trim() || '';
    
    let parsed = safeJsonParse(raw);
    if (!parsed) {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = safeJsonParse(match[0]);
    }

    if (!parsed || typeof parsed !== 'object') {
      console.warn('[criteriaExtractionService] Failed to parse JD criteria - using defaults');
      return getDefaultJdCriteria();
    }

    // Ensure all required fields exist with defaults
    const defaultCriteria = getDefaultJdCriteria();
    const result = { ...defaultCriteria };
    
    Object.keys(defaultCriteria).forEach(key => {
      if (parsed[key] && Array.isArray(parsed[key])) {
        result[key] = parsed[key];
      }
    });

    return result;
  } catch (err) {
    console.error('[criteriaExtractionService] Error extracting JD criteria:', err.message);
    return getDefaultJdCriteria();
  }
}
