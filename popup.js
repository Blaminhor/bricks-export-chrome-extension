/**
 * BRICKS.co : Export CSV et JSON — Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  const mainContent = document.getElementById('content-main');
  const notBricksContent = document.getElementById('content-not-bricks');
  const authStatus = document.getElementById('auth-status');
  const btnFetch = document.getElementById('btn-fetch');
  const exportButtons = document.getElementById('export-buttons');
  const btnCsv = document.getElementById('btn-csv');
  const btnJson = document.getElementById('btn-json');
  const progressText = document.getElementById('progress-text');
  const successMsg = document.getElementById('success-msg');
  const errorMsg = document.getElementById('error-msg');
  const resultsBox = document.getElementById('results-box');
  const projectCount = document.getElementById('project-count');
  const paymentCount = document.getElementById('payment-count');
  const bricksCount = document.getElementById('bricks-count');
  const portfolioValue = document.getElementById('portfolio-value');

  // Stored export data
  let exportData = null;

  // Check if current tab is Bricks
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isBricks = tab?.url?.includes('app.bricks.co');

  if (!isBricks) {
    notBricksContent.style.display = 'block';
    mainContent.style.display = 'none';
    return;
  }

  mainContent.style.display = 'block';
  notBricksContent.style.display = 'none';

  // Check auth status
  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'CHECK_AUTH' });
    if (response?.authenticated) {
      authStatus.textContent = 'Connecté';
      authStatus.className = 'status-value ok';
    } else {
      authStatus.textContent = 'Non connecté';
      authStatus.className = 'status-value empty';
      btnFetch.disabled = true;
    }
  } catch {
    authStatus.textContent = 'Rechargez la page';
    authStatus.className = 'status-value empty';
    btnFetch.disabled = true;
  }

  // Listen for progress messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'PROGRESS') {
      progressText.textContent = message.text;
    }
  });

  // Fetch button
  btnFetch.addEventListener('click', async () => {
    btnFetch.disabled = true;
    btnFetch.textContent = 'Récupération en cours...';
    btnFetch.classList.add('btn-loading');
    errorMsg.style.display = 'none';
    successMsg.style.display = 'none';
    progressText.textContent = 'Démarrage...';

    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'FETCH_BRICKS_DATA' });

      if (!response?.success) {
        throw new Error(response?.error || 'Erreur inconnue');
      }

      exportData = response;

      // Show results
      const s = response.summary;
      projectCount.textContent = s.projectCount;
      paymentCount.textContent = s.paymentCount;
      bricksCount.textContent = s.totalBricks;
      portfolioValue.textContent =
        new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(s.portfolioValue);

      resultsBox.style.display = 'block';
      exportButtons.style.display = 'flex';
      btnFetch.style.display = 'none';
      progressText.textContent = '';
      successMsg.textContent = 'Données récupérées avec succès !';
      successMsg.style.display = 'block';
    } catch (e) {
      errorMsg.textContent = e.message;
      errorMsg.style.display = 'block';
      progressText.textContent = '';
      btnFetch.disabled = false;
      btnFetch.textContent = 'Récupérer les données';
      btnFetch.classList.remove('btn-loading');
    }
  });

  // CSV Export
  btnCsv.addEventListener('click', async () => {
    if (!exportData?.csv) return;
    await downloadFile(
      exportData.csv,
      `bricks_export_${today()}.csv`,
      'text/csv;charset=utf-8'
    );
    showSuccess('CSV téléchargé !');
  });

  // JSON Export (AllMyCapital)
  btnJson.addEventListener('click', async () => {
    if (!exportData?.json) return;
    await downloadFile(
      JSON.stringify(exportData.json, null, 2),
      `bricks_allmycapital_${today()}.json`,
      'application/json'
    );
    showSuccess('JSON AllMyCapital téléchargé !');
  });

  async function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    try {
      await chrome.downloads.download({ url, filename, saveAs: false });
    } finally {
      // Revoke after a small delay to ensure download starts
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }

  function today() {
    return new Date().toISOString().split('T')[0];
  }

  function showSuccess(text) {
    successMsg.textContent = text;
    successMsg.style.display = 'block';
    setTimeout(() => { successMsg.style.display = 'none'; }, 3000);
  }
});
