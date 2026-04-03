import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const ACCENT = [99, 102, 241];
const DARK   = [8, 12, 20];
const LIGHT  = [241, 245, 249];
const MUTED  = [100, 116, 139];

function addHeader(doc, title, subtitle) {
  // Background
  doc.setFillColor(...DARK);
  doc.rect(0, 0, 210, 297, 'F');

  // Accent bar
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, 210, 2, 'F');

  // Logo area
  doc.setFillColor(30, 35, 60);
  doc.roundedRect(14, 10, 40, 14, 3, 3, 'F');
  doc.setTextColor(...ACCENT);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('⚡ DemandAI', 18, 19);

  // Title
  doc.setTextColor(...LIGHT);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 38);

  // Subtitle
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(subtitle, 14, 45);

  // Date
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 51);

  // Divider
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.3);
  doc.line(14, 55, 196, 55);

  return 62; // y position after header
}

function addSection(doc, y, title) {
  doc.setFillColor(20, 25, 45);
  doc.roundedRect(14, y, 182, 8, 2, 2, 'F');
  doc.setTextColor(...ACCENT);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), 18, y + 5.5);
  return y + 12;
}

function addKpiRow(doc, y, kpis) {
  const w = 42, gap = 4, startX = 14;
  kpis.forEach((kpi, i) => {
    const x = startX + i * (w + gap);
    doc.setFillColor(20, 25, 45);
    doc.roundedRect(x, y, w, 18, 2, 2, 'F');
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, 18, 2, 2, 'S');
    doc.setTextColor(...ACCENT);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(String(kpi.value), x + 4, y + 10);
    doc.setTextColor(...MUTED);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.text(kpi.label, x + 4, y + 15);
  });
  return y + 24;
}

// ── Export functions ─────────────────────────────────────────────

export function exportDashboardPDF(insights, timeseries, topProducts) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = addHeader(doc, 'Dashboard Report', 'Business intelligence summary');

  // KPIs
  y = addSection(doc, y, 'Key Performance Indicators');
  const bm = insights?.businessMetrics || {};
  y = addKpiRow(doc, y, [
    { label: 'Units Sold (30d)',  value: insights?.totalSalesLast30Days?.toLocaleString() || '—' },
    { label: 'Revenue (30d)',     value: `$${((insights?.totalRevenueLast30Days || 0) / 1000).toFixed(1)}k` },
    { label: 'Demand Change',     value: `${insights?.demandChangePct > 0 ? '+' : ''}${insights?.demandChangePct || 0}%` },
    { label: 'Efficiency Score',  value: `${bm.efficiencyScore || 0}%` },
  ]);

  // Insights
  if (insights?.insights?.length) {
    y = addSection(doc, y, 'AI Insights');
    insights.insights.forEach(item => {
      const text = typeof item === 'string' ? item : `${item.title}: ${item.text}`;
      doc.setTextColor(...LIGHT);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(`• ${text}`, 178);
      doc.text(lines, 18, y);
      y += lines.length * 4.5 + 2;
    });
    y += 4;
  }

  // Top products table
  if (topProducts?.length) {
    y = addSection(doc, y, 'Top Products');
    autoTable(doc, {
      startY: y,
      head: [['Product', 'Category', 'Units Sold']],
      body: topProducts.map(p => [p.name, p.category, p.qty]),
      theme: 'plain',
      styles: { fillColor: [15, 20, 35], textColor: LIGHT, fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [20, 25, 50], textColor: ACCENT, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 23, 40] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Timeseries table
  if (timeseries?.length) {
    y = addSection(doc, y, 'Sales Timeseries');
    autoTable(doc, {
      startY: y,
      head: [['Date', 'Units Sold', 'Revenue']],
      body: timeseries.slice(-14).map(d => [d._id, d.totalQty, `$${d.totalRevenue?.toFixed(0)}`]),
      theme: 'plain',
      styles: { fillColor: [15, 20, 35], textColor: LIGHT, fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [20, 25, 50], textColor: ACCENT, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 23, 40] },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`demandai_dashboard_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportPredictionsPDF(predictions) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = addHeader(doc, 'Predictions Report', 'ML-powered demand forecasts for all products');

  y = addSection(doc, y, `Batch Predictions — ${predictions?.length || 0} products`);
  autoTable(doc, {
    startY: y,
    head: [['Product', 'Predicted Demand', 'Lower CI', 'Upper CI', 'Confidence', 'Method']],
    body: (predictions || []).map(r => [
      r.name,
      `${r.predicted_demand} units`,
      r.lower_bound ?? '—',
      r.upper_bound ?? '—',
      r.confidence_score ? `${(r.confidence_score * 100).toFixed(0)}%` : '—',
      r.method || 'ML',
    ]),
    theme: 'plain',
    styles: { fillColor: [15, 20, 35], textColor: LIGHT, fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [20, 25, 50], textColor: ACCENT, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [18, 23, 40] },
    margin: { left: 14, right: 14 },
  });

  doc.save(`demandai_predictions_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function exportDataVizPDF(overview, topProducts, byCategory, monthly) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = addHeader(doc, 'Dataset Analysis Report', overview ? `Dataset: ${overview.totalRows?.toLocaleString()} rows` : 'Data visualization export');

  // Overview KPIs
  y = addSection(doc, y, 'Dataset Overview');
  y = addKpiRow(doc, y, [
    { label: 'Total Quantity',  value: overview?.totalQty?.toLocaleString() || '—' },
    { label: 'Total Revenue',   value: overview ? `$${(overview.totalRevenue / 1000).toFixed(1)}k` : '—' },
    { label: 'Total Rows',      value: overview?.totalRows?.toLocaleString() || '—' },
    { label: 'Products',        value: overview?.totalProducts?.toLocaleString() || '—' },
  ]);

  // Category table
  if (byCategory?.length) {
    y = addSection(doc, y, 'Sales by Category');
    autoTable(doc, {
      startY: y,
      head: [['Category', 'Total Qty', 'Total Revenue', 'Products']],
      body: byCategory.map(c => [c._id, c.totalQty?.toLocaleString(), `$${c.totalRevenue?.toLocaleString()}`, c.productCount]),
      theme: 'plain',
      styles: { fillColor: [15, 20, 35], textColor: LIGHT, fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [20, 25, 50], textColor: ACCENT, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 23, 40] },
      margin: { left: 14, right: 14 },
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Top products
  if (topProducts?.length) {
    y = addSection(doc, y, 'Top Products');
    autoTable(doc, {
      startY: y,
      head: [['Product', 'Category', 'Total Qty', 'Total Revenue']],
      body: topProducts.map(p => [p.name, p.category, p.totalQty?.toLocaleString(), `$${p.totalRevenue?.toLocaleString()}`]),
      theme: 'plain',
      styles: { fillColor: [15, 20, 35], textColor: LIGHT, fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [20, 25, 50], textColor: ACCENT, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [18, 23, 40] },
      margin: { left: 14, right: 14 },
    });
  }

  doc.save(`demandai_analysis_${new Date().toISOString().slice(0, 10)}.pdf`);
}
