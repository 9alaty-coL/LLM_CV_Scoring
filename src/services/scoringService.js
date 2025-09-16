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
  console.log(`[scoringService] OpenAI client initialized (model=${DEFAULT_MODEL}, baseURL=${LLM_BASE_URL})`);
  if (LOG_LEVEL === 'debug') {
    console.debug('[scoringService] Debug logging enabled.');
  }
} else {
  console.warn('[scoringService] OPENAI_API_KEY not set – using heuristic fallback only.');
}

function buildPrompt({ jdCriteria, cvCriteria }) {
  return `You are an AI assistant that evaluates how well a candidate's CV matches a given job description (JD).  
You will receive two structured JSON inputs:

1. **Job Description (JD)** extracted criteria.  
2. **Candidate CV** extracted criteria.  

Your task is to **score each criterion**, explain the reasoning, and provide a **final weighted score**.

JOB DESCRIPTION CRITERIA (Required):
---
${JSON.stringify(jdCriteria, null, 2)}
---

CANDIDATE CV CRITERIA (Extracted):
---
${JSON.stringify(cvCriteria, null, 2)}
---

## Scoring Criteria & Weights

1. **Skills + Years of Experience (55%)**  
   - Check if the candidate's skills match the required skills in the JD.  
   - Consider the **depth of experience** (number of years, projects, or demonstrated proficiency).  
   - Missing years of experience should lower the score even if the skill is present.  
   - Partial matches (e.g., similar frameworks, older versions) should get partial credit.  

2. **Education & Certifications (15%)**  
   - Evaluate if the candidate's degrees and certifications align with the JD requirements.  
   - Prioritize required certifications (e.g., AWS Certified, PMP).  
   - Bonus for advanced or relevant degrees.  

3. **Achievements & Impact (15%)**  
   - Look for measurable results (e.g., "increased efficiency by 20%," "managed team of 10").  
   - Prioritize achievements relevant to the JD's responsibilities.  

4. **Soft Skills & Communication (10%)**  
   - Extract soft skills (leadership, teamwork, problem-solving).  
   - Score higher if the CV gives **examples** of applying these skills (not just buzzwords).  

5. **Languages & Cultural Fit (5%)**  
   - Check if the candidate's language proficiency matches JD requirements (e.g., English fluency).  
   - Note cultural or regional preferences if explicitly required.  

## Output Format (JSON)

Return a structured JSON with this format:

{
  "criteria_scores": {
    "skills_experience": {
      "score": 0-100,
      "explanation": "Why this score was given"
    },
    "education_certifications": {
      "score": 0-100,
      "explanation": "Why this score was given"
    },
    "achievements_impact": {
      "score": 0-100,
      "explanation": "Why this score was given"
    },
    "soft_skills": {
      "score": 0-100,
      "explanation": "Why this score was given"
    },
    "languages_cultural_fit": {
      "score": 0-100,
      "explanation": "Why this score was given"
    }
  },
  "final_score": 0-100,
  "overall_summary": "Brief explanation of candidate fit"
}`;
}

// Heuristic fallback if LLM unavailable or errors.
function heuristicScore({ jdCriteria, cvCriteria }) {
  // Extract all text from criteria for basic keyword matching
  const extractText = (criteria) => {
    const texts = [];
    Object.values(criteria).forEach(value => {
      if (Array.isArray(value)) {
        value.forEach(item => {
          if (typeof item === 'string') {
            texts.push(item);
          } else if (typeof item === 'object' && item !== null) {
            Object.values(item).forEach(subValue => {
              if (typeof subValue === 'string') {
                texts.push(subValue);
              }
            });
          }
        });
      }
    });
    return texts.join(' ');
  };

  const tokenize = (t) => (t || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-# ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^(and|with|for|the|this|that|have|has|are|was|were|you|our|job|role|will)$/.test(w));
  
  const jdText = extractText(jdCriteria);
  const cvText = extractText(cvCriteria);
  
  const jdTokens = new Set(tokenize(jdText));
  const cvTokens = new Set(tokenize(cvText));
  let overlap = 0;
  jdTokens.forEach(w => { if (cvTokens.has(w)) overlap++; });
  const ratio = jdTokens.size ? overlap / jdTokens.size : 0;
  const baseScore = Math.min(100, Math.max(20, Math.round(ratio * 100) || 20));
  
  // Return new weighted format for heuristic fallback
  const skillsScore = baseScore;
  const educationScore = Math.max(10, baseScore - 10);
  const achievementsScore = Math.max(5, baseScore - 30);
  const softSkillsScore = Math.max(5, baseScore - 25);
  const languagesScore = Math.max(5, baseScore - 15);
  
  const finalScore = Math.round(
    skillsScore * 0.55 + 
    educationScore * 0.15 + 
    achievementsScore * 0.15 + 
    softSkillsScore * 0.10 + 
    languagesScore * 0.05
  );

  return {
    criteria_scores: {
      skills_experience: { 
        score: skillsScore, 
        explanation: "Heuristic keyword matching used - LLM unavailable." 
      },
      education_certifications: { 
        score: educationScore, 
        explanation: "Education match estimated from available data." 
      },
      achievements_impact: { 
        score: achievementsScore, 
        explanation: "Achievement assessment limited without LLM analysis." 
      },
      soft_skills: { 
        score: softSkillsScore, 
        explanation: "Soft skills evaluation not available in heuristic mode." 
      },
      languages_cultural_fit: { 
        score: languagesScore, 
        explanation: "Language requirements assessment limited." 
      }
    },
    final_score: finalScore,
    overall_summary: "Heuristic scoring based on keyword matching - limited accuracy without LLM analysis."
  };
}

async function callLlm(messages) {
  if (!client) return null;
  try {
    return await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 800
    });
  } catch (err) {
    if (LOG_LEVEL === 'debug') {
      console.debug('[scoringService] LLM error:', err?.status, err?.message);
    }
    throw err;
  }
}

export async function scoreCvAgainstJd({ jdCriteria, cvCriteria }) {
  const prompt = buildPrompt({ jdCriteria, cvCriteria });
  const messages = [
    { role: 'system', content: 'You are a strict JSON output generator for CV scoring based on extracted criteria.' },
    { role: 'user', content: prompt }
  ];

  if (!client) {
    return heuristicScore({ jdCriteria, cvCriteria });
  }

  let completion;
  try {
    completion = await callLlm(messages);
  } catch (err) {
    if (err?.status === 429) {
      const h = heuristicScore({ jdCriteria, cvCriteria });
      return {
        ...h,
        fallback_reason: 'Quota / rate limit exceeded (429) – heuristic fallback used.'
      };
    }
    const h = heuristicScore({ jdCriteria, cvCriteria });
    return {
      ...h,
      fallback_reason: `LLM error: ${err?.message || 'unknown'} – heuristic fallback used.`
    };
  }

  const raw = completion?.choices?.[0]?.message?.content?.trim() || '';
  let parsed = safeJsonParse(raw);
  if (!parsed) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = safeJsonParse(match[0]);
  }

  // Validate new criteria-based scoring format
  const isValidFormat = parsed.criteria_scores && 
    parsed.final_score !== undefined &&
    parsed.overall_summary &&
    typeof parsed.final_score === 'number' &&
    typeof parsed.overall_summary === 'string';

  const requiredCriteria = ['skills_experience', 'education_certifications', 'achievements_impact', 'soft_skills', 'languages_cultural_fit'];
  const hasValidCriteria = isValidFormat && requiredCriteria.every(criterion => {
    const criteriaData = parsed.criteria_scores[criterion];
    return criteriaData && 
           typeof criteriaData.score === 'number' && 
           typeof criteriaData.explanation === 'string';
  });

  if (!hasValidCriteria) {
    const h = heuristicScore({ jdCriteria, cvCriteria });
    return {
      ...h,
      fallback_reason: 'Model output malformed – heuristic fallback used.'
    };
  }

  // Ensure scores are within valid ranges
  const result = {
    criteria_scores: {
      skills_experience: {
        score: Math.min(100, Math.max(0, Math.round(parsed.criteria_scores.skills_experience.score))),
        explanation: parsed.criteria_scores.skills_experience.explanation.trim()
      },
      education_certifications: {
        score: Math.min(100, Math.max(0, Math.round(parsed.criteria_scores.education_certifications.score))),
        explanation: parsed.criteria_scores.education_certifications.explanation.trim()
      },
      achievements_impact: {
        score: Math.min(100, Math.max(0, Math.round(parsed.criteria_scores.achievements_impact.score))),
        explanation: parsed.criteria_scores.achievements_impact.explanation.trim()
      },
      soft_skills: {
        score: Math.min(100, Math.max(0, Math.round(parsed.criteria_scores.soft_skills.score))),
        explanation: parsed.criteria_scores.soft_skills.explanation.trim()
      },
      languages_cultural_fit: {
        score: Math.min(100, Math.max(0, Math.round(parsed.criteria_scores.languages_cultural_fit.score))),
        explanation: parsed.criteria_scores.languages_cultural_fit.explanation.trim()
      }
    },
    final_score: Math.min(100, Math.max(0, Math.round(parsed.final_score))),
    overall_summary: parsed.overall_summary.trim()
  };

  return result;
}
