import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { productsApi, predictApi } from "../api/client";
import ConfidenceMeter from "../components/ConfidenceMeter";
import DataQualityBadge from "../components/DataQualityBadge";
import styles from "./Predictions.module.css";

export default function Predictions() {
  const [form, setForm] = useState({ productId: "", targetDate: "", price: "" });
  const [result, setResult] = useState(null);

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

  const handleSubmit = (e) => {
    e.preventDefault();
    predictMutation.mutate({
      productId: form.productId,
      targetDate: form.targetDate || new Date().toISOString(),
      price: form.price ? parseFloat(form.price) : undefined
    });
  };

  const stockColor = { UNDERSTOCK: "var(--danger)", OVERSTOCK: "var(--warning)", OPTIMAL: "var(--success)" };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.title}>Prediction Engine</h1>
          <p className={styles.subtitle}>ML-powered demand forecasting with intelligent fallback</p>
        </div>
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
          {result ? (
            <div className={styles.resultPanel}>
              <div className={styles.productName}>{result.product?.name}</div>
              <div className={styles.bigNumber}>
                {result.predictedDemand}
                <span className={styles.bigUnit}> units / month</span>
              </div>
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
                  <span style={{ color: stockColor[result.stockStatus], fontWeight: 700 }}>
                    {result.stockStatus}
                  </span>
                </div>
              </div>
              <div className={styles.qualityRow}>
                <span className={styles.metaLabel}>Data Quality</span>
                <DataQualityBadge score={result.features?.dataQuality} dataPoints={result.features?.dataPoints} />
              </div>
              {result.fallback && (
                <div className={styles.fallbackBanner}>
                  Exact data not found. Prediction based on trend analysis.
                </div>
              )}
            </div>
          ) : (
            <div className={styles.emptyResult}>
              <span className={styles.emptyIcon}>Robot</span>
              <p>Select a product and run a prediction to see results here.</p>
            </div>
          )}
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Batch Forecast - All Products</h2>
        {batchLoading ? (
          <p className={styles.muted}>Running batch predictions...</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Product</th><th>Predicted Demand</th><th>Confidence</th><th>Method</th></tr>
            </thead>
            <tbody>
              {batchData?.map((row) => (
                <tr key={row.productId}>
                  <td>{row.name}</td>
                  <td className={styles.demandCell}>{row.predicted_demand} units</td>
                  <td>
                    <span className={styles.confBadge}>
                      {(row.confidence_score * 100).toFixed(0)}%
                    </span>
                  </td>
                  <td className={styles.muted}>{row.method || "random_forest"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}