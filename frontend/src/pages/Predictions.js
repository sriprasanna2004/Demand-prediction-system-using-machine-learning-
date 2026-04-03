import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { productsApi, predictApi, forecastApi } from "../api/client";
import { useRetrain } from "../hooks/useRetrain";
import ConfidenceMeter from "../components/ConfidenceMeter";
import DataQualityBadge from "../components/DataQualityBadge";
import FeedbackModal from "../components/FeedbackModal";
import { exportPredictionsPDF } from "../utils/exportPDF";
import styles from "./Predictions.module.css";

const stockColor = { UNDERSTOCK: "var(--danger)", OVERSTOCK: "var(--warning)", OPTIMAL: "var(--success)" };

function exportCSV(data) {
  if (!data?.length) return;
  const headers = ["Product", "Predicted Demand", "Lower Bound", "Upper Bound", "Confidence", "Method", "Status"];
  const rows = data.map(r => [
    r.name, r.predicted_demand, r.lower_bound ?? "", r.upper_bound ?? "",
    r.confidence_score ? `${(r.confidence_score * 100).toFixed(0)}%` : "",
    r.method ?? "", r.fallback ? "fallback" : "ml"
  ]);
  const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "predictions.csv"; a.click();
  URL.revokeObjectURL(url);
  toast.success("Exported predictions.csv");
}

export default function Predictions() {
  const [form, setForm] = useState({ productId: "", targetDate: "", price: "" });
  const [result, setResult] = useState(null);
  const [explainMode, setExplainMode] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const [whatIfPrice, setWhatIfPrice] = useState(null);
  const [whatIfResult, setWhatIfResult] = useState(null);
  const [feedbackRow, setFeedbackRow] = useState(null);
  const retrain = useRetrain();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll().then(r => r.data)
  });

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: ["batch-predict"],
    queryFn: () => predictApi.batchPredict().then(r => r.data),
    refetchInterval: 120000
  });

  const predictMutation = useMutation({
    mutationFn: d => predictApi.predict(d).then(r => r.data),
    onSuccess: data => {
      setResult(data);
      const selectedProduct = products?.find(p => p._id === form.productId);
      setWhatIfPrice(form.price ? parseFloat(form.price) : selectedProduct?.price || 50);
      setWhatIfResult(null);
    }
  });

  const explainMutation = useMutation({
    mutationFn: d => forecastApi.explain(d.productId, d.targetDate, d.price).then(r => r.data),
    onSuccess: data => setExplanation(data)
  });

  const whatIfMutation = useMutation({
    mutationFn: d => predictApi.predict(d).then(r => r.data),
    onSuccess: data => setWhatIfResult(data)
  });

  const handleSubmit = e => {
    e.preventDefault();
    const payload = {
      productId: form.productId,
      targetDate: form.targetDate || new Date().toISOString(),
      price: form.price ? parseFloat(form.price) : undefined
    };
    predictMutation.mutate(payload);
    if (explainMode) explainMutation.mutate(payload);
  };

  const handleWhatIf = useCallback(price => {
    if (!form.productId || !result) return;
    whatIfMutation.mutate({
      productId: form.productId,
      targetDate: form.targetDate || new Date().toISOString(),
      price: parseFloat(price)
    });
  }, [form.productId, form.targetDate, result]);

  const selectedProduct = products?.find(p => p._id === form.productId);
  const basePrice = selectedProduct?.price || 50;
  const priceMin = Math.round(basePrice * 0.5);
  const priceMax = Math.round(basePrice * 2);

  const demandDelta = whatIfResult && result
    ? whatIfResult.predictedDemand - result.predictedDemand
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Prediction Engine</h1>
          <p className={styles.subtitle}>ML-powered demand forecasting with conformal prediction intervals</p>
        </div>
        <button className={styles.retrainBtn} onClick={() => retrain.mutate()} disabled={retrain.isPending}>
          {retrain.isPending ? "Retraining..." : "🔄 Retrain Model"}
        </button>
      </div>

      <div className={styles.grid}>
        {/* Input panel */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Configure Prediction</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Product</label>
              <select className={styles.input} value={form.productId}
                onChange={e => setForm({ ...form, productId: e.target.value })} required>
                <option value="">Select a product</option>
                {products?.map(p => (
                  <option key={p._id} value={p._id}>{p.name} ({p.category}) — ${p.price}</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Target Date (optional)</label>
              <input className={styles.input} type="date" value={form.targetDate}
                onChange={e => setForm({ ...form, targetDate: e.target.value })} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>
                Override Price (optional)
                {selectedProduct && <span style={{ color: 'var(--muted)', marginLeft: 8 }}>default: ${selectedProduct.price}</span>}
              </label>
              <input className={styles.input} type="number" placeholder="Uses product price by default"
                value={form.price} onChange={e => setForm({ ...form, price: e.target.value })}
                min="0" step="0.01" />
            </div>
            <label className={styles.explainToggle}>
              <input type="checkbox" checked={explainMode} onChange={e => setExplainMode(e.target.checked)} />
              <span>🧠 Include AI Explanation</span>
            </label>
            <button className={styles.btnPrimary} type="submit" disabled={predictMutation.isPending}>
              {predictMutation.isPending ? "Predicting..." : "▶ Run Prediction"}
            </button>
          </form>
          {predictMutation.isError && (
            <div className={styles.errorBox}>{predictMutation.error.message}</div>
          )}

          {/* What-If Price Slider */}
          {result && selectedProduct && (
            <motion.div className={styles.whatIfPanel}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className={styles.whatIfHeader}>
                <span className={styles.whatIfTitle}>💡 What-If Price Simulator</span>
                <span className={styles.whatIfPrice}>${whatIfPrice}</span>
              </div>
              <input type="range" className={styles.slider}
                min={priceMin} max={priceMax} step={1}
                value={whatIfPrice || basePrice}
                onChange={e => {
                  const p = parseFloat(e.target.value);
                  setWhatIfPrice(p);
                  handleWhatIf(p);
                }} />
              <div className={styles.sliderLabels}>
                <span>${priceMin}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11 }}>base: ${basePrice}</span>
                <span>${priceMax}</span>
              </div>
              {whatIfResult && (
                <div className={styles.whatIfResult}>
                  <span>Predicted: <strong>{whatIfResult.predictedDemand} units</strong></span>
                  <span style={{ color: demandDelta >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>
                    {demandDelta >= 0 ? '↑' : '↓'} {Math.abs(demandDelta).toFixed(1)} units
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </div>

        {/* Result panel */}
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Prediction Result</h2>
          <AnimatePresence mode="wait">
            {result ? (
              <motion.div className={styles.resultPanel} key="result"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <div className={styles.productName}>{result.product?.name}</div>
                <motion.div className={styles.bigNumber}
                  initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: "spring" }}>
                  {result.predictedDemand}
                  <span className={styles.bigUnit}> units / month</span>
                </motion.div>

                {result.lower_bound != null && result.upper_bound != null && (
                  <div className={styles.intervalRow}>
                    <span className={styles.intervalLabel}>
                      {result.coverage ? `${(result.coverage * 100).toFixed(0)}% CI` : '90% CI'}
                    </span>
                    <span className={styles.intervalRange}>
                      {result.lower_bound} – {result.upper_bound} units
                    </span>
                    <span className={styles.intervalMethod}>{result.method}</span>
                  </div>
                )}

                <ConfidenceMeter score={result.confidenceScore} />
                <div className={styles.metaGrid}>
                  {[
                    { label: "Recommended Stock", value: result.recommendedStock },
                    { label: "Safety Buffer",      value: result.safetyStock },
                    { label: "Current Stock",      value: result.currentStock },
                    { label: "Status",             value: result.stockStatus, color: stockColor[result.stockStatus] },
                  ].map(item => (
                    <div key={item.label} className={styles.metaItem}>
                      <span className={styles.metaLabel}>{item.label}</span>
                      <span className={styles.metaValue} style={item.color ? { color: item.color } : {}}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
                <div className={styles.qualityRow}>
                  <span className={styles.metaLabel}>Data Quality</span>
                  <DataQualityBadge score={result.features?.dataQuality} dataPoints={result.features?.dataPoints} />
                </div>
                {result.fallback && (
                  <div className={styles.fallbackBanner}>⚠️ Prediction based on trend analysis (ML fallback).</div>
                )}
                {explainMode && explanation?.explanation && (
                  <motion.div className={styles.explanationSection} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className={styles.explainTitle}>🧠 Why this prediction?</div>
                    {explanation.explanation.explanation?.map((line, i) => (
                      <motion.p key={i} className={styles.explainLine}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}>{line}</motion.p>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div className={styles.emptyResult} key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <span className={styles.emptyIcon}>🤖</span>
                <p>Select a product and run a prediction to see results here.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Batch table */}
      <div className={styles.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 className={styles.cardTitle} style={{ margin: 0 }}>Batch Forecast — All Products</h2>
          <button className={styles.retrainBtn} onClick={() => exportCSV(batchData)}
            disabled={!batchData?.length} style={{ fontSize: 12, padding: '7px 14px' }}>
            ⬇ Export CSV
          </button>
        </div>
        {batchLoading ? (
          <p className={styles.muted}>Running batch predictions...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Product</th><th>Predicted Demand</th><th>90% CI</th><th>Confidence</th><th>Method</th><th>Feedback</th></tr>
            </thead>
            <tbody>
              {batchData?.map((row, i) => (
                <motion.tr key={row.productId}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}>
                  <td>{row.name}</td>
                  <td className={styles.demandCell}>{row.predicted_demand} units</td>
                  <td>
                    {row.lower_bound != null
                      ? <span className={styles.intervalSmall}>{row.lower_bound}–{row.upper_bound}</span>
                      : <span className={styles.muted}>—</span>}
                  </td>
                  <td>
                    <span className={styles.confBadge}
                      style={{ background: `rgba(99,102,241,${row.confidence_score || 0.5})`, color: '#fff' }}>
                      {((row.confidence_score || 0) * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className={styles.muted}>{row.method || "random_forest"}</td>
                  <td>
                    <button onClick={() => setFeedbackRow(row)}
                      style={{
                        padding: '3px 10px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.3)',
                        background: 'rgba(16,185,129,0.08)', color: '#6ee7b7',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      }}>+ Actual</button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {feedbackRow && (
        <FeedbackModal prediction={feedbackRow} onClose={() => setFeedbackRow(null)} />
      )}
    </div>
  );
}
