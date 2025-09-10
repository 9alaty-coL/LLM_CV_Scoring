const form = document.getElementById('scoreForm');
const resultEl = document.getElementById('result');
const copyBtn = document.getElementById('copyBtn');
const loadingEl = document.getElementById('loading');
const submitBtn = document.getElementById('submitBtn');
const includeCvText = document.getElementById('includeCvText');
const cvTextContainer = document.getElementById('cvTextContainer');
const cvTextEl = document.getElementById('cvText');

function setLoading(isLoading){
  loadingEl.classList.toggle('hidden', !isLoading);
  submitBtn.disabled = isLoading;
  submitBtn.textContent = isLoading ? 'Scoring...' : 'Score CV';
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
      const { cvText, ...rest } = json;
      resultEl.textContent = JSON.stringify(rest, null, 2);
      copyBtn.disabled = false;
      if (cvText && includeCvText.checked) {
        cvTextEl.textContent = cvText;
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
