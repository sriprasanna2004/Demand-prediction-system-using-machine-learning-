import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { productsApi, predictApi, forecastApi } from "../api/client";
import { useRetrain } from "../hooks/useRetrain";
import ConfidenceMeter from "../components/ConfidenceMeter";
import DataQualityBadge from "../components/DataQualityBadge";
import styles from "./Predictions.module.css";

export default function Predictions() {
  const [form, setForm] = useState({ productId: "", targetDate: "", price: "" });
  const [result, setResult] = useState(null);
  const [explainMode, setExplainMode] = useState(false);
  const [explanation, setExplanation] = useState(null);
  const retrain = useRetrain();

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: () => productsApi.getAll().then((r) => r.data)
  });

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: ["batch-predict"],
    queryFn: () => predictApi.batchPredict().then((r) => r.data),
    refetchInterval: 120000
  });

  const predictMutation = useMutation({
    mutationFn: (d) => predictApi.predict(d).then((r) => r.data),
    onSuccess: (data) => setResult(data)
  });

  const explainMutation = useMutation({
    mutationFn: (d) => forecastApi.explain(d.productId, d.targetDate, d.price).then((r) => r.data),
    onSuccess: (data) => setExplanation(data)
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      productId: form.productId,
      targetDate: form.targetDate || new Date().toISOString(),
      price: form.price ? parseFloat(form.price) : undefined
    };
    predictMutation.mutate(payload);
    if (explainMode) explainMutation.mutate(payload);
  };

  const stockColor = { UNDERSTOCK: "var(--danger)", OVERSTOCK: "var(--warning)", OPTIMAL: "var(--success)" };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Prediction Engine</h1>
          <p className={styles.subtitle}>ML-powered demand forecasting with intelligent fallback</p>
        </div>
        <button className={styles.retrainBtn} onClick={() => retrain.mutate()} disabled={retrain.isPending}>
          {retrain.isPending ? "Retraining..." : "🔄 Retrain Model"}
        </button>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Run Prediction</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label className={styles.label}>Product</label>
              <select className={styles.input} value={form.productId}
                onChange={(e) => setForm({ ...form, productId: e.target.value })} required>
                <option value="">Select a product</option>
                {products?.map((p) => (
                  <option key={p._id} value={p._id}>{p.name} ({p.category})</option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Target Date (optional)</label>
              <input className={styles.input} type="date" value={form.targetDate}
                onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Override Price (optional)</label>
              <input className={styles.input} type="number" placeholder="Uses product price by default"
                value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })}
                min="0" step="0.01" />
            </div>
            <label className={styles.explainToggle}>
              <input type="checkbox" checked={explainMode} onChange={e => setExplainMode(e.target.checked)} />
              <span>🧠 Explain AI Decision</span>
            </label>
            <button className={styles.btnPrimary} type="submit" disabled={predictMutation.isPending}>
              {predictMutation.isPending ? "Predicting..." : "Predict Demand"}
            </button>
          </form>
          {predictMutation.isError && (
            <div className={styles.errorBox}>{predictMutation.error.message}</div>
          )}
        </div>

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

                {/* Conformal prediction interval */}
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
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Recommended Stock</span>
                    <span className={styles.metaValue}>{result.recommendedStock}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Safety Buffer</span>
                    <span className={styles.metaValue}>{result.safetyStock}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Current Stock</span>
                    <span className={styles.metaValue}>{result.currentStock}</span>
                  </div>
                  <div className={styles.metaItem}>
                    <span className={styles.metaLabel}>Status</span>
                    <span style={{ color: stockColor[result.stockStatus], fontWeight: 700, fontSize: 16 }}>
                      {result.stockStatus}
                    </span>
                  </div>
                </div>
                <div className={styles.qualityRow}>
                  <span className={styles.metaLabel}>Data Quality</span>
                  <DataQualityBadge score={result.features?.dataQuality} dataPoints={result.features?.dataPoints} />
                </div>
                {result.fallback && (
                  <div className={styles.fallbackBanner}>Prediction based on trend analysis (ML fallback).</div>
                )}

                {/* AI Explanation */}
                {explainMode && explanation?.explanation && (
                  <motion.div className={styles.explanationSection}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className={styles.explainTitle}>🧠 Why this prediction?</div>
                    {explanation.explanation.explanation?.map((line, i) => (
                      <motion.p key={i} className={styles.explainLine}
                        initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}>
                        {line}
                      </motion.p>
                    ))}
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div className={styles.emptyResult} key="empty"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <span className={styles.emptyIcon}>🤖</span>
                <p>Select a product and run a prediction to see results here.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Batch Forecast — All Products</h2>
        {batchLoading ? (
          <p className={styles.muted}>Running batch predictions...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Product</th><th>Predicted Demand</th><th>90% CI</th><th>Confidence</th><th>Method</th></tr>
            </thead>
            <tbody>
              {batchData?.map((row, i) => (
                <motion.tr key={row.productId}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}>
                  <td>{row.name}</td>
                  <td className={styles.demandCell}>{row.predicted_demand} units</td>
                  <td>
                    {row.lower_bound != null
                      ? <span className={styles.intervalSmall}>{row.lower_bound}–{row.upper_bound}</span>
                      : <span className={styles.muted}>—</span>}
                  </td>
                  <td>
                    <span className={styles.confBadge}
                      style={{ background: `rgba(99,102,241,${row.confidence_score})`, color: '#fff' }}>
                      {(row.confidence_score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className={styles.muted}>{row.method || "random_forest"}</td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
