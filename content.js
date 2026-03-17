/**
 * BRICKS.co : Export CSV et JSON — Content Script
 *
 * Runs on app.bricks.co. Reads the JWT from localStorage (Redux persist)
 * and fetches portfolio data from api.bricks.co on demand (popup request).
 */

(function () {
  'use strict';

  const API_BASE = 'https://api.bricks.co';

  // ---------------------------------------------------------------------------
  // Auth
  // ---------------------------------------------------------------------------

  function getJwt() {
    try {
      const auth = JSON.parse(localStorage.getItem('persist:auth') || '{}');
      return JSON.parse(auth.token || '""');
    } catch {
      return null;
    }
  }

  function apiFetch(path) {
    const jwt = getJwt();
    if (!jwt) return Promise.reject(new Error('Non connecté — rechargez Bricks.co'));
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    return fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${jwt}` },
      signal: controller.signal,
    }).then((r) => {
      clearTimeout(timeoutId);
      if (!r.ok) throw new Error(`API ${r.status} on ${path}`);
      return r.json();
    }).catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') throw new Error(`Timeout sur ${path} (15s)`);
      throw err;
    });
  }

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  async function fetchAllData(sendProgress) {
    // 1. Fetch properties list
    sendProgress('Récupération de la liste des projets...');
    const list = await apiFetch('/investor/portfolio/properties');
    if (!list || (typeof list !== 'object')) {
      throw new Error('Réponse API invalide pour la liste des projets');
    }
    const allProperties = [...(list.ongoing || []), ...(list.refunded || [])];
    const total = allProperties.length;

    // 2. Fetch portfolio metrics (parallel — independent calls)
    sendProgress('Récupération des métriques...');
    const [metrics, bricksCount] = await Promise.all([
      apiFetch('/investor/portfolio/wealth/home-metrics'),
      apiFetch('/investor/portfolio/properties/my-projects-and-bricks-count'),
    ]);

    // 3. Fetch detail for each property in batches of 3 (includes pastRevenues + interestRate)
    const BATCH_SIZE = 3;
    const projects = [];

    function processProperty(prop, detail) {
      const brickCount = prop.brickCount || (detail ? detail.bricksOwned : 0);
      const brickPriceCents = prop.brickPrice || (detail ? detail.property?.brickPrice : 1000);
      const brickPriceEur = brickPriceCents / 100;
      const investedAmount = brickCount * brickPriceEur;

      const interestRate = detail?.property?.interestRate ?? 0;
      const durationMonths = prop.investmentHorizonInMonths || detail?.contractDuration?.totalMonths || 0;
      const remainingMonths = prop.contractRemainingMonths ?? detail?.contractDuration?.remainingMonths ?? null;

      let maturityDate = null;
      if (prop.investmentDate && durationMonths > 0) {
        const start = new Date(prop.investmentDate);
        maturityDate = new Date(start.getFullYear(), start.getMonth() + durationMonths, start.getDate());
      }

      const payments = [];
      if (detail?.pastRevenues && Array.isArray(detail.pastRevenues)) {
        for (const rev of detail.pastRevenues) {
          payments.push({ date: rev.date, amount: (rev.value || 0) / 100 });
        }
      }

      const revSummary = detail?.revenuesSummary || {};
      const cumulatedRevenuesCents = prop.cumulatedRevenues ?? revSummary.cumulatedRevenuesBeforeTax ?? 0;

      let status = 'active';
      const rawStatus = (prop.status || prop.refundStatus || '').toLowerCase();
      if (rawStatus.includes('refund') || rawStatus === 'completed') {
        status = 'completed';
      } else if (rawStatus.includes('default') || rawStatus.includes('retard')) {
        status = 'defaulted';
      }

      const nextRevenue = detail?.nextRevenue
        ? { month: detail.nextRevenue.month, amount: (detail.nextRevenue.value || 0) / 100 }
        : null;

      const principalRepayments = [];
      if (detail?.principalRepayments && Array.isArray(detail.principalRepayments)) {
        for (const rep of detail.principalRepayments) {
          principalRepayments.push({
            date: rep.date,
            amount: (rep.value || 0) / 100,
            percentage: rep.repaymentPercentage,
            isPast: rep.isPast,
          });
        }
      }

      return {
        name: prop.propertyName || detail?.property?.name || 'Projet inconnu',
        location: prop.address || detail?.property?.address || null,
        propertyType: prop.investorContractType || detail?.contractType || null,
        investedAmount,
        numberOfBricks: brickCount,
        interestRate,
        startDate: prop.investmentDate || detail?.investmentDate || null,
        maturityDate: maturityDate ? maturityDate.toISOString() : null,
        durationMonths,
        status,
        payments,
        brickPriceEur,
        cumulatedRevenues: cumulatedRevenuesCents / 100,
        remainingMonths,
        nextRevenue,
        principalRepayments,
        taxRate: revSummary.currentTaxRate ?? null,
        cumulatedAfterTax: (revSummary.cumulatedRevenuesAfterTax || 0) / 100,
        totalExpectedBeforeTax: (revSummary.totalRevenuesBeforeTax || 0) / 100,
        totalExpectedAfterTax: (revSummary.totalRevenuesAfterTax || 0) / 100,
        country: prop.country || null,
        propertyId: prop.propertyId || detail?.property?.id || null,
      };
    }

    for (let i = 0; i < allProperties.length; i += BATCH_SIZE) {
      const batch = allProperties.slice(i, i + BATCH_SIZE);
      sendProgress(`Projets ${i + 1}–${Math.min(i + BATCH_SIZE, total)}/${total}...`);

      const batchResults = await Promise.all(
        batch.map(async (prop) => {
          let detail = null;
          try {
            detail = await apiFetch(`/investor/portfolio/properties/${prop.propertyId}`);
          } catch {
            // If detail fails, we still have the list data
          }
          return processProperty(prop, detail);
        })
      );
      projects.push(...batchResults);

      // Small delay between batches to avoid hammering the API
      if (i + BATCH_SIZE < allProperties.length) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    return {
      portfolioValue: (metrics.portfolioCurrentValue || 0) / 100,
      balanceAvailable: (metrics.balanceAvailable || 0) / 100,
      totalBricks: bricksCount.brickCount || 0,
      totalProjects: bricksCount.projectsCount || 0,
      projects,
    };
  }

  // ---------------------------------------------------------------------------
  // Export builders
  // ---------------------------------------------------------------------------

  function buildAmcJson(data) {
    return {
      source: 'bricks.co',
      exportDate: new Date().toISOString(),
      projects: data.projects.map((p) => ({
        name: p.name,
        location: p.location,
        propertyType: p.propertyType,
        investedAmount: p.investedAmount,
        numberOfBricks: p.numberOfBricks,
        interestRate: p.interestRate,
        startDate: p.startDate,
        maturityDate: p.maturityDate,
        durationMonths: p.durationMonths,
        status: p.status,
        payments: p.payments.map((pay) => ({
          date: pay.date,
          amount: pay.amount,
        })),
      })),
    };
  }

  function buildCsv(data) {
    const SEP = ';';
    const lines = [];

    // --- Sheet 1: Portfolio summary ---
    lines.push('=== PORTEFEUILLE BRICKS.CO ===');
    lines.push(`Date d'export${SEP}${new Date().toLocaleDateString('fr-FR')}`);
    lines.push(`Valeur du portefeuille${SEP}${fmt(data.portfolioValue)}`);
    lines.push(`Solde disponible${SEP}${fmt(data.balanceAvailable)}`);
    lines.push(`Nombre total de bricks${SEP}${data.totalBricks}`);
    lines.push(`Nombre de projets${SEP}${data.totalProjects}`);
    lines.push('');

    // --- Sheet 2: Projects ---
    lines.push('=== PROJETS ===');
    const projectHeaders = [
      'Nom du projet',
      'Adresse',
      'Type de contrat',
      'Statut',
      'Nombre de bricks',
      'Prix du brick (EUR)',
      'Montant investi (EUR)',
      'Taux d\'interet (%)',
      'Duree (mois)',
      'Mois restants',
      'Date d\'investissement',
      'Date d\'echeance',
      'Revenus cumules bruts (EUR)',
      'Revenus cumules nets (EUR)',
      'Revenus totaux attendus bruts (EUR)',
      'Revenus totaux attendus nets (EUR)',
      'Taux d\'imposition (%)',
      'Prochain revenu (EUR)',
      'Mois prochain revenu',
      'Pays',
    ];
    lines.push(projectHeaders.join(SEP));

    for (const p of data.projects) {
      lines.push(
        [
          esc(p.name),
          esc(p.location || ''),
          esc(p.propertyType || ''),
          esc(p.status),
          p.numberOfBricks,
          fmt(p.brickPriceEur),
          fmt(p.investedAmount),
          p.interestRate,
          p.durationMonths,
          p.remainingMonths ?? '',
          formatDate(p.startDate),
          formatDate(p.maturityDate),
          fmt(p.cumulatedRevenues),
          fmt(p.cumulatedAfterTax),
          fmt(p.totalExpectedBeforeTax),
          fmt(p.totalExpectedAfterTax),
          p.taxRate ?? '',
          p.nextRevenue ? fmt(p.nextRevenue.amount) : '',
          p.nextRevenue ? p.nextRevenue.month : '',
          esc(p.country || ''),
        ].join(SEP)
      );
    }

    lines.push('');

    // --- Sheet 3: All payments ---
    lines.push('=== REVENUS PAR PROJET ===');
    lines.push(['Projet', 'Date', 'Montant brut (EUR)'].join(SEP));

    for (const p of data.projects) {
      for (const pay of p.payments) {
        lines.push([esc(p.name), formatDate(pay.date), fmt(pay.amount)].join(SEP));
      }
    }

    lines.push('');

    // --- Sheet 4: Remboursements de capital ---
    lines.push('=== REMBOURSEMENTS DE CAPITAL ===');
    lines.push(['Projet', 'Date', 'Montant (EUR)', 'Pourcentage', 'Passe'].join(SEP));

    for (const p of data.projects) {
      for (const rep of p.principalRepayments) {
        lines.push(
          [esc(p.name), rep.date, fmt(rep.amount), `${rep.percentage}%`, rep.isPast ? 'Oui' : 'Non'].join(SEP)
        );
      }
    }

    // BOM for Excel UTF-8 recognition
    return '\uFEFF' + lines.join('\r\n');
  }

  function fmt(n) {
    if (n == null) return '';
    return n.toFixed(2).replace('.', ',');
  }

  function esc(s) {
    if (!s) return '';
    if (s.includes(';') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function formatDate(d) {
    if (!d) return '';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return d;
      return date.toLocaleDateString('fr-FR');
    } catch {
      return d;
    }
  }

  // ---------------------------------------------------------------------------
  // Message handler
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'FETCH_BRICKS_DATA') {
      const sendProgress = (text) => {
        chrome.runtime.sendMessage({ type: 'PROGRESS', text }).catch(() => {});
      };

      fetchAllData(sendProgress)
        .then((data) => {
          sendResponse({
            success: true,
            csv: buildCsv(data),
            json: buildAmcJson(data),
            summary: {
              totalProjects: data.totalProjects,
              totalBricks: data.totalBricks,
              portfolioValue: data.portfolioValue,
              balanceAvailable: data.balanceAvailable,
              projectCount: data.projects.length,
              paymentCount: data.projects.reduce((s, p) => s + p.payments.length, 0),
            },
          });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });

      return true; // Keep message channel open for async response
    }

    if (message.type === 'CHECK_AUTH') {
      const jwt = getJwt();
      sendResponse({ authenticated: !!jwt });
    }
  });

  console.log('[BRICKS.co : Export] Content script loaded.');
})();
