const form = document.getElementById('scoreForm');
const resultEl = document.getElementById('result');
const copyBtn = document.getElementById('copyBtn');
const loadingEl = document.getElementById('loading');
const submitBtn = document.getElementById('submitBtn');
const includeCvText = document.getElementById('includeCvText');
const cvTextContainer = document.getElementById('cvTextContainer');
const cvTextEl = document.getElementById('cvText');
const jdFileInput = document.getElementById('jdFileInput');
const jdTextarea = document.getElementById('jdInput');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const tableWrapper = document.getElementById('tableWrapper');
const resultsTableBody = document.querySelector('#resultsTable tbody');
let lastResults = null; // cache of last JSON response
const runDatasetBtn = document.getElementById('runDatasetBtn');
const downloadDatasetBtn = document.getElementById('downloadDatasetBtn');
const datasetStatus = document.getElementById('datasetStatus');
let lastDatasetBlob = null;

function setLoading(isLoading){
  loadingEl.classList.toggle('hidden', !isLoading);
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Scoring...' : 'Score CVs';
  exportCsvBtn.disabled = isLoading || !lastResults;
}

function renderTable(payload){
  if (!payload || !Array.isArray(payload.results)) return;
  resultsTableBody.innerHTML = '';
  payload.results.forEach(r => {
    const tr = document.createElement('tr');
    const explanation = Array.isArray(r.explanation) ? r.explanation.join(' | ') : (r.error || '');
    tr.innerHTML = `<td>${escapeHtml(r.file || '')}</td><td>${r.score ?? ''}</td><td>${escapeHtml(explanation)}</td>`;
    tr.addEventListener('click', () => {
      if (r.cvText) {
        cvTextEl.textContent = r.cvText;
        cvTextContainer.classList.remove('hidden');
      }
    });
    resultsTableBody.appendChild(tr);
  });
  tableWrapper.classList.remove('hidden');
}

function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
}

function toCsv(payload){
  if (!payload || !Array.isArray(payload.results)) return '';
  const jdFull = jdTextarea.value || '';
  const header = ['file','score','explanation','jd'];
  const rows = payload.results.map(r => [
    r.file || '',
    r.score == null ? '' : r.score,
    Array.isArray(r.explanation) ? r.explanation.join(' | ') : (r.error || ''),
    jdFull
  ]);
  const all = [header, ...rows];
  return all.map(cols => cols.map(v => {
    const s = String(v).replace(/"/g,'""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  }).join(',')).join('\n');
}

exportCsvBtn.addEventListener('click', () => {
  if (!lastResults) return;
  const csv = toCsv(lastResults);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cv_scores.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
});

jdFileInput?.addEventListener('change', async () => {
  const file = jdFileInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    jdTextarea.value = text;
  } catch (e) {
    alert('Failed to read JD file: ' + e.message);
  }
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  resultEl.textContent = '';
  copyBtn.disabled = true;
  tableWrapper.classList.add('hidden');
  resultsTableBody.innerHTML='';
  lastResults = null;
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
      lastResults = json;
      resultEl.textContent = JSON.stringify(json, null, 2);
      copyBtn.disabled = false;
      exportCsvBtn.disabled = false;
      if (Array.isArray(json.results)) {
        renderTable(json);
      }
      // show first CV text if include flag and available
      const firstWithText = json.results?.find(r => r.cvText);
      if (firstWithText) {
        cvTextEl.textContent = firstWithText.cvText;
        cvTextContainer.classList.remove('hidden');
      } else {
        cvTextEl.textContent = '';
        cvTextContainer.classList.add('hidden');
      }
    } else {
      resultEl.textContent = text;
      cvTextContainer.classList.add('hidden');
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

runDatasetBtn?.addEventListener('click', async () => {
  datasetStatus.textContent = 'Running dataset...';
  runDatasetBtn.disabled = true;
  downloadDatasetBtn.disabled = true;
  lastDatasetBlob = null;
  try {
    const respJson = await fetch('/bulk-csv?format=json');
    if (!respJson.ok) {
      const t = await respJson.text();
      datasetStatus.textContent = `Error: ${respJson.status} ${t}`;
      return;
    }
    const data = await respJson.json();
  datasetStatus.textContent = `Rows: ${data.total}\nNumeric rows: ${data.numeric_rows}\nAggregate loss (signed): ${data.aggregate_loss_signed}\nMean absolute loss: ${data.mean_absolute_loss}`;
    // Also fetch CSV for download in parallel
    const respCsv = await fetch('/bulk-csv');
    if (respCsv.ok) {
      lastDatasetBlob = await respCsv.blob();
      downloadDatasetBtn.disabled = false;
    }
  } catch (e) {
    datasetStatus.textContent = 'Failed: ' + e.message;
  } finally {
    runDatasetBtn.disabled = false;
  }
});

downloadDatasetBtn?.addEventListener('click', () => {
  if (!lastDatasetBlob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(lastDatasetBlob);
  a.download = 'processed_test.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
});
