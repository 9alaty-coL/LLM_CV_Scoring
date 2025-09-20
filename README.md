# CV Scoring LLM Service.

Node.js + Express microservice to score a candidate CV PDF against a Job Description (Markdown) using an OpenAI model.

## Features
- Upload CV (PDF) + JD (Markdown) via `POST /score-cv` (multipart/form-data)
# CV Scoring LLM Service

Node.js + Express microservice to score a candidate CV PDF against a Job Description (Markdown) using an OpenAI model.

## Features

- Upload CV (PDF) + JD (Markdown) via `POST /score-cv` (multipart/form-data)
- Extracts text with `pdf-parse`
- Cleans whitespace
- Sends structured prompt to OpenAI Chat Completion API
- Enforces strict JSON output `{ score: number, explanation: string[] }`
- Attempts robust JSON parsing + salvage

## Tech Stack

- Express
- Multer (memory storage) for file upload
- pdf-parse for PDF text extraction
- openai (Chat Completions API)
- dotenv for config

## Setup

1. Copy `ENV_SAMPLE.txt` to `.env` and fill values:

```env
OPENAI_API_KEY=sk-...
PORT=3000
MODEL=gpt-4o-mini
```

1. Install dependencies

```bash
npm install
```

1. Start server

```bash
npm run start
```

Or for auto-reload during development:

```bash
npm run dev
```

## Endpoint

`POST /score-cv`

Content-Type: `multipart/form-data`

Fields:

- `cv` (file) PDF only
- `jd` (text) Job description in Markdown

### Curl Example

```bash
curl -X POST http://localhost:3000/score-cv \
  -F "cv=@/path/to/cv.pdf" \
  -F "jd=$(cat jd.md)"
```

### Sample Response

```json
{
  "score": 4,
  "explanation": [
    "Strong skill match: Python, Django, and SQL.",
    "Experience: 3 years backend development, meets requirement.",
    "Education: Bachelor’s degree in Computer Science."
  ]
}
```

## Notes

- File size limited to 5MB (adjust in `scoreRoute.js`).
- Basic error responses include `error` field.
- Score is clamped to 1..5.
- If model output malformed, returns fallback structure with score 0.

## Future Ideas

- Add token-length truncation
- Add embedding-based pre-filter
- Add TypeScript
- Add tests (Jest / Supertest)
- Add rate limiting & auth

---
MIT License
