// Load environment variables as early as possible so that constants below see them.
import 'dotenv/config';
import OpenAI from 'openai';
import { safeJsonParse } from '../utils/text.js';

const DEFAULT_MODEL = process.env.MODEL || 'gpt-4o-mini';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const API_KEY = process.env.OPENAI_API_KEY;

let client = null;
if (API_KEY) {
  client = new OpenAI({ apiKey: API_KEY });
  console.log(`[scoringService] OpenAI client initialized (model=${DEFAULT_MODEL})`);
  if (LOG_LEVEL === 'debug') {
    console.debug('[scoringService] Debug logging enabled.');
  }
} else {
  console.warn('[scoringService] OPENAI_API_KEY not set – using heuristic fallback only.');
}

function buildPrompt({ jdMarkdown, cvText }) {
  return `You are an assistant that strictly outputs JSON matching a schema.\n\nJOB DESCRIPTION (Markdown):\n---\n${jdMarkdown}\n---\n\nCANDIDATE CV (Extracted Plain Text):\n---\n${cvText}\n---\n\nTask: Compare the candidate CV to the Job Description. Provide: \n1. An overall fit score from 1 (poor) to 5 (excellent).\n2. An array of at least 3 concise explanation strings covering skills, experience, education, or gaps.\n\nReturn ONLY valid JSON with this exact schema (no markdown, no extra text):\n{\n  "score": number,\n  "explanation": [string, string, string]\n}\nIf unsure, make a best-effort judgment.`;
}

// Heuristic fallback if LLM unavailable or errors.
function heuristicScore({ jdMarkdown, cvText }) {
  const tokenize = (t) => (t || '')
    .toLowerCase()
    .replace(/[^a-z0-9+\-# ]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !/^(and|with|for|the|this|that|have|has|are|was|were|you|our|job|role|will)$/.test(w));
  const jdTokens = new Set(tokenize(jdMarkdown));
  const cvTokens = new Set(tokenize(cvText));
  let overlap = 0;
  jdTokens.forEach(w => { if (cvTokens.has(w)) overlap++; });
  const ratio = jdTokens.size ? overlap / jdTokens.size : 0;
  const score = Math.min(5, Math.max(1, Math.round(ratio * 5) || 1));
  const topMissing = [...jdTokens].filter(w => !cvTokens.has(w)).slice(0, 5);
  return {
    score,
    explanation: [
      `Heuristic overlap: ${(ratio * 100).toFixed(1)}% of JD keywords found in CV (${overlap}/${jdTokens.size}).`,
      topMissing.length ? `Missing/not prominent keywords: ${topMissing.join(', ')}` : 'Most JD keywords present.',
      'LLM result unavailable – keyword similarity heuristic used.'
    ]
  };
}

async function callLlm(messages) {
  if (!client) return null;
  try {
    return await client.chat.completions.create({
      model: DEFAULT_MODEL,
      messages,
      temperature: 0.2,
      max_tokens: 400
    });
  } catch (err) {
    if (LOG_LEVEL === 'debug') {
      console.debug('[scoringService] LLM error:', err?.status, err?.message);
    }
    throw err;
  }
}

export async function scoreCvAgainstJd({ jdMarkdown, cvText }) {
  const prompt = buildPrompt({ jdMarkdown, cvText });
  const messages = [
    { role: 'system', content: 'You are a strict JSON output generator.' },
    { role: 'user', content: prompt }
  ];

  if (!client) {
    return heuristicScore({ jdMarkdown, cvText });
  }

  let completion;
  try {
    completion = await callLlm(messages);
  } catch (err) {
    if (err?.status === 429) {
      const h = heuristicScore({ jdMarkdown, cvText });
      return {
        score: h.score,
        explanation: [
          'Quota / rate limit exceeded (429) – heuristic fallback used.',
          ...h.explanation
        ]
      };
    }
    const h = heuristicScore({ jdMarkdown, cvText });
    return {
      score: h.score,
      explanation: [
        `LLM error: ${err?.message || 'unknown'} – heuristic fallback used.`,
        ...h.explanation
      ]
    };
  }

  const raw = completion?.choices?.[0]?.message?.content?.trim() || '';
  let parsed = safeJsonParse(raw);
  if (!parsed) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) parsed = safeJsonParse(match[0]);
  }

  if (!parsed || typeof parsed.score !== 'number' || !Array.isArray(parsed.explanation)) {
    const h = heuristicScore({ jdMarkdown, cvText });
    return {
      score: h.score,
      explanation: [
        'Model output malformed – heuristic fallback used.',
        ...h.explanation
      ]
    };
  }

  const score = Math.min(5, Math.max(1, Math.round(parsed.score)));
  const explanation = parsed.explanation
    .slice(0, 10)
    .map(e => String(e).trim())
    .filter(Boolean);
  while (explanation.length < 3) explanation.push('Additional explanation not provided.');
  return { score, explanation };
}
