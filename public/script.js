const form = document.getElementById('scoreForm');
const resultEl = document.getElementById('result');
const copyBtn = document.getElementById('copyBtn');
const loadingEl = document.getElementById('loading');
const submitBtn = document.getElementById('submitBtn');
const includeCvText = document.getElementById('includeCvText');
const cvTextContainer = document.getElementById('cvTextContainer');
const cvTextEl = document.getElementById('cvText');
const cvCriteriaContainer = document.getElementById('cvCriteriaContainer');
const cvCriteriaEl = document.getElementById('cvCriteria');
const jdCriteriaContainer = document.getElementById('jdCriteriaContainer');
const jdCriteriaEl = document.getElementById('jdCriteria');

function setLoading(isLoading){
  loadingEl.classList.toggle('hidden', !isLoading);
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Scoring...' : 'Score CV';
}

function formatCriteria(criteria) {
  const sections = [
    { key: 'skills', title: 'Skills' },
    { key: 'experience', title: 'Experience' },
    { key: 'education', title: 'Education' },
    { key: 'certifications', title: 'Certifications' },
    { key: 'projects', title: 'Projects' },
    { key: 'tools_technologies', title: 'Tools & Technologies' },
    { key: 'domain_knowledge', title: 'Domain Knowledge' },
    { key: 'languages', title: 'Languages' },
    { key: 'soft_skills', title: 'Soft Skills' },
    { key: 'achievements', title: 'Achievements' },
    { key: 'publications', title: 'Publications' },
    { key: 'other', title: 'Other' }
  ];

  let html = '';
  sections.forEach(section => {
    const items = criteria[section.key] || [];
    html += `<div class="criteria-section">`;
    html += `<div class="criteria-title">${section.title}</div>`;
    
    if (items.length === 0) {
      html += `<div class="criteria-empty">No ${section.title.toLowerCase()} found</div>`;
    } else {
      html += `<ul class="criteria-list">`;
      items.forEach(item => {
        if (typeof item === 'string') {
          html += `<li>${escapeHtml(item)}</li>`;
        } else if (typeof item === 'object' && item !== null) {
          // Handle complex objects like experience entries
          if (item.description) {
            const years = item.years || item.years_required || '';
            const desc = item.description || '';
            html += `<li>${years ? `${years} years: ` : ''}${escapeHtml(desc)}</li>`;
          } else if (item.degree) {
            const degree = item.degree || '';
            const field = item.field || '';
            const institution = item.institution || '';
            const preferred = item.preferred ? ' (preferred)' : '';
            html += `<li>${escapeHtml(degree)} ${escapeHtml(field)} ${institution ? `at ${escapeHtml(institution)}` : ''}${preferred}</li>`;
          } else {
            html += `<li>${escapeHtml(JSON.stringify(item))}</li>`;
          }
        }
      });
      html += `</ul>`;
    }
    html += `</div>`;
  });
  
  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultEl.textContent = '';
  copyBtn.disabled = true;
  setLoading(true);

  try {
    const fd = new FormData(form);
    if (includeCvText.checked) {
      fd.set('includeCvText', '1');
    } else {
      fd.delete('includeCvText');
    }
    const resp = await fetch('/score-cv', { method: 'POST', body: fd });
    const text = await resp.text();
    let json;
    try { json = JSON.parse(text); } catch { /* ignore */ }

    if (!resp.ok) {
      resultEl.textContent = `Error (${resp.status}): ${text}`;
      return;
    }

    if (json) {
      const { cvText, cvCriteria, jdCriteria, ...rest } = json;
      resultEl.textContent = JSON.stringify(rest, null, 2);
      copyBtn.disabled = false;
      
      if (includeCvText.checked) {
        if (cvText) {
          cvTextEl.textContent = cvText;
          cvTextContainer.classList.remove('hidden');
        }
        if (cvCriteria) {
          cvCriteriaEl.innerHTML = formatCriteria(cvCriteria);
          cvCriteriaContainer.classList.remove('hidden');
        }
        if (jdCriteria) {
          jdCriteriaEl.innerHTML = formatCriteria(jdCriteria);
          jdCriteriaContainer.classList.remove('hidden');
        }
      } else {
        cvTextEl.textContent = '';
        cvTextContainer.classList.add('hidden');
        cvCriteriaContainer.classList.add('hidden');
        jdCriteriaContainer.classList.add('hidden');
      }
    } else {
      resultEl.textContent = text;
      cvTextContainer.classList.add('hidden');
      cvCriteriaContainer.classList.add('hidden');
      jdCriteriaContainer.classList.add('hidden');
    }
  } catch (err) {
    resultEl.textContent = 'Request failed: ' + err.message;
    cvTextContainer.classList.add('hidden');
  } finally {
    setLoading(false);
  }
});

copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(resultEl.textContent);
    copyBtn.textContent = 'Copied';
    setTimeout(()=> copyBtn.textContent = 'Copy JSON', 1500);
  } catch {}
});
