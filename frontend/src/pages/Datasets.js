import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { datasetsApi } from '../api/client';
import SalesChart from '../components/SalesChart';
import styles from './Datasets.module.css';

const REQUIRED_FIELDS = ['date_or_month', 'quantity', 'product_name', 'category', 'price'];
const OPTIONAL_FIELDS = ['temperature', 'trend_score', 'stock', 'day_of_week'];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_LABELS = {
  date_or_month: 'Date or Month *',
  quantity: 'Quantity Sold *',
  product_name: 'Product Name *',
  category: 'Category *',
  price: 'Price *',
  temperature: 'Temperature',
  trend_score: 'Market Trend Score',
  stock: 'Stock Level',
  day_of_week: 'Day of Week'
};

const CAT_COLORS = ['#6366f1','#06b6d4','#10b981','#f59e0b','#ef4444','#8b5cf6'];

export default function Datasets() {
  const qc = useQueryClient();
  const fileRef = useRef();
  const [dragOver, setDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [mappings, setMappings] = useState({});
  const [step, setStep] = useState('list'); // 'list' | 'mapping' | 'done'
  const [trainSeconds, setTrainSeconds] = useState(0);

  const { data: datasets, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetsApi.list().then(r => r.data)
  });

  // Fetch trends for the just-mapped dataset
  const { data: trendsData } = useQuery({
    queryKey: ['dataset-trends', uploadResult?.dataset_id],
    queryFn: () => datasetsApi.trends(uploadResult.dataset_id).then(r => r.data),
    enabled: step === 'done' && !!uploadResult?.dataset_id
  });

  const uploadMutation = useMutation({
    mutationFn: (file) => datasetsApi.upload(file),
    onSuccess: (res) => {
      const data = res?.data || res;
      setUploadResult(data);
      setMappings({});
      setStep('mapping');
      toast.success(`Uploaded ${data?.row_count} rows — now map your columns`);
    },
    onError: (e) => toast.error(`Upload failed: ${e.message}`)
  });

  const mapMutation = useMutation({
    mutationFn: () => datasetsApi.map({ dataset_id: uploadResult.dataset_id, mappings }),
    onSuccess: (res) => {
      const data = res.data || res;
      setStep('done');
      qc.invalidateQueries({ queryKey: ['datasets'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
      toast.success(data.message || `Mapped ${data.processed_rows} rows successfully`, { duration: 6000 });
    },
    onError: (e) => toast.error(`Mapping failed: ${e.message}`)
  });

  const trainMutation = useMutation({
    mutationFn: () => datasetsApi.train(),
    onSuccess: (res) => {
      const m = res.data?.metrics;
      const note = res.data?.note;
      if (note) toast(`⚠️ ${note}`, { icon: '⚠️', duration: 6000 });
      else toast.success(m ? `Ensemble retrained — MAE: ${m.mae}, R²: ${m.r2}, MAPE: ${m.mape}%` : 'Model retrained');
    },
    onError: (e) => toast.error(`Training failed: ${e.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => datasetsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasets'] }); toast.success('Dataset deleted'); }
  });

  useEffect(() => {
    if (!trainMutation.isPending) { setTrainSeconds(0); return; }
    const t = setInterval(() => setTrainSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, [trainMutation.isPending]);

  const trainStage = trainSeconds < 10 ? 'Loading data...'
    : trainSeconds < 30 ? 'Filtering anomalies...'
    : trainSeconds < 60 ? 'Training XGBoost + LightGBM...'
    : trainSeconds < 90 ? 'Fitting meta-learner...'
    : trainSeconds < 110 ? 'Calibrating conformal intervals...'
    : 'Saving models...';

  const mappedCount = Object.values(mappings).filter(Boolean).length;
  const requiredMapped = REQUIRED_FIELDS.every(f => mappings[f]);

  const handleDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) uploadMutation.mutate(file);
    else toast.error('Please upload a CSV file');
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (file) uploadMutation.mutate(file);
  };

  const trends = trendsData;
  const maxQty = trends?.productBreakdown?.[0]?.qty || 1;

  return (
    <div className={styles.page}>
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className={styles.title}>Dataset Manager</h1>
        <p className={styles.subtitle}>Upload your own sales data, map columns, and retrain the AI model</p>
      </motion.div>

      {/* Upload zone */}
      {step === 'list' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className={styles.uploadZone}
            data-dragover={dragOver}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}>
            <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFile} />
            {uploadMutation.isPending ? (
              <div className={styles.uploadSpinner} />
            ) : (
              <>
                <div className={styles.uploadIcon}>📂</div>
                <div className={styles.uploadText}>Drop your CSV file here or click to browse</div>
                <div className={styles.uploadHint}>Max 10MB · CSV format only</div>
              </>
            )}
          </div>

          <div className={styles.sampleCard}>
            <div className={styles.sampleTitle}>Sample CSV Format</div>
            <pre className={styles.sampleCode}>{`date,product_name,category,quantity,price,temperature
2024-01-15,iPhone 15,Electronics,12,999,18
2024-01-15,Nike Air Max,Clothing,25,120,18
2024-01-16,Organic Coffee,Food,80,18,17`}</pre>
            <p className={styles.sampleNote}>Your columns can have any names — you'll map them in the next step.</p>
          </div>
        </motion.div>
      )}

      {/* Column mapping step */}
      <AnimatePresence>
        {step === 'mapping' && uploadResult && (
          <motion.div className={styles.mappingCard}
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className={styles.mappingHeader}>
              <div>
                <h2 className={styles.cardTitle}>Map Your Columns</h2>
                <p className={styles.mappingMeta}>{uploadResult.filename} · {uploadResult.row_count} rows · {uploadResult.columns.length} columns</p>
              </div>
              <span className={styles.progressBadge}>{mappedCount} / {ALL_FIELDS.length} mapped</span>
            </div>

            <div className={styles.previewScroll}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>{uploadResult.columns.map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {uploadResult.preview?.slice(0, 3).map((row, i) => (
                    <tr key={i}>{uploadResult.columns.map(c => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.mappingGrid}>
              {ALL_FIELDS.map(field => (
                <div key={field} className={styles.mappingRow}>
                  <label className={styles.fieldLabel}>
                    {FIELD_LABELS[field]}
                    {REQUIRED_FIELDS.includes(field) && <span className={styles.required}>required</span>}
                  </label>
                  <select className={styles.mappingSelect}
                    value={mappings[field] || ''}
                    onChange={e => setMappings({ ...mappings, [field]: e.target.value || undefined })}>
                    <option value="">— skip —</option>
                    {uploadResult.columns.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div className={styles.mappingActions}>
              <button className={styles.btnSecondary} onClick={() => setStep('list')}>← Back</button>
              <button className={styles.btnPrimary}
                onClick={() => mapMutation.mutate()}
                disabled={!requiredMapped || mapMutation.isPending}>
                {mapMutation.isPending ? 'Processing...' : `Apply Mapping (${mappedCount} fields)`}
              </button>
            </div>
          </motion.div>
        )}

        {/* Done step — success + trends */}
        {step === 'done' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={styles.doneWrapper}>

            {/* Success banner */}
            <motion.div className={styles.successBanner}
              initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
              <span className={styles.successIcon}>✅</span>
              <div className={styles.successText}>
                <h2>Data Imported Successfully</h2>
                <p>Your products and sales history are now live. Retrain the model to improve forecast accuracy.</p>
              </div>
              <div className={styles.successActions}>
                <button className={styles.btnPrimary}
                  onClick={() => trainMutation.mutate()}
                  disabled={trainMutation.isPending}>
                  {trainMutation.isPending ? `🔄 ${trainStage} (${trainSeconds}s)` : '🚀 Retrain AI Model'}
                </button>
                <button className={styles.btnSecondary} onClick={() => { setStep('list'); setUploadResult(null); }}>
                  Upload Another
                </button>
              </div>
            </motion.div>

            {/* Trends section */}
            {trends && !trends.empty && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className={styles.trendsSection}>
                <h2 className={styles.trendsTitle}>📊 Dataset Trends</h2>
                <p className={styles.trendsMeta}>
                  {trends.summary?.dateRange?.from} → {trends.summary?.dateRange?.to}
                </p>

                {/* Summary stat cards */}
                <div className={styles.statsRow}>
                  <div className={styles.statBox}>
                    <div className={styles.statValue}>{trends.summary?.totalQty?.toLocaleString()}</div>
                    <div className={styles.statLabel}>Total Units</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statValue}>${trends.summary?.totalRevenue?.toLocaleString()}</div>
                    <div className={styles.statLabel}>Total Revenue</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statValue}>${trends.summary?.avgPrice?.toFixed(2)}</div>
                    <div className={styles.statLabel}>Avg Price</div>
                  </div>
                  <div className={styles.statBox}>
                    <div className={styles.statValue}>{trends.summary?.totalSales?.toLocaleString()}</div>
                    <div className={styles.statLabel}>Sale Records</div>
                  </div>
                </div>

                {/* Sales over time chart */}
                {trends.timeseries?.length > 0 && (
                  <div className={styles.chartCard}>
                    <div className={styles.chartTitle}>Sales Over Time</div>
                    <SalesChart data={trends.timeseries} />
                  </div>
                )}

                <div className={styles.trendsGrid}>
                  {/* Top products */}
                  {trends.productBreakdown?.length > 0 && (
                    <div className={styles.breakdownCard}>
                      <div className={styles.chartTitle}>Top Products</div>
                      <div className={styles.barList}>
                        {trends.productBreakdown.slice(0, 8).map((p, i) => (
                          <div key={p.name} className={styles.barRow}>
                            <div className={styles.barLabel} title={p.name}>{p.name}</div>
                            <div className={styles.barTrack}>
                              <motion.div className={styles.barFill}
                                initial={{ width: 0 }}
                                animate={{ width: `${(p.qty / maxQty) * 100}%` }}
                                transition={{ delay: i * 0.05, duration: 0.5 }}
                                style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                            </div>
                            <div className={styles.barValue}>{p.qty.toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Category breakdown */}
                  {trends.categoryBreakdown?.length > 0 && (
                    <div className={styles.breakdownCard}>
                      <div className={styles.chartTitle}>By Category</div>
                      <div className={styles.catList}>
                        {trends.categoryBreakdown.map((c, i) => (
                          <div key={c.category} className={styles.catRow}>
                            <span className={styles.catDot} style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />
                            <span className={styles.catName}>{c.category}</span>
                            <span className={styles.catQty}>{c.qty.toLocaleString()} units</span>
                            <span className={styles.catRev}>${c.revenue.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* Loading state for trends */}
            {!trends && (
              <div className={styles.trendsLoading}>
                <div className={styles.uploadSpinner} />
                <span>Loading trends...</span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dataset list */}
      {step === 'list' && (
        <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className={styles.listHeader}>
            <h2 className={styles.cardTitle}>Uploaded Datasets</h2>
            {datasets?.length > 0 && (
              <button className={styles.btnTrain}
                onClick={() => trainMutation.mutate()}
                disabled={trainMutation.isPending}>
                {trainMutation.isPending ? `🔄 ${trainStage} (${trainSeconds}s)` : '🚀 Retrain on All Data'}
              </button>
            )}
          </div>

          {isLoading ? <p className={styles.muted}>Loading...</p> :
           !datasets?.length ? (
            <div className={styles.emptyState}>
              <span>📊</span>
              <p>No datasets uploaded yet. Upload a CSV to get started.</p>
            </div>
          ) : (
            <div className={styles.datasetList}>
              {datasets.map((ds, i) => (
                <motion.div key={ds.dataset_id} className={styles.datasetItem}
                  initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <div className={styles.dsIcon}>📄</div>
                  <div className={styles.dsInfo}>
                    <div className={styles.dsName}>{ds.filename}</div>
                    <div className={styles.dsMeta}>
                      {ds.row_count} rows · {ds.columns?.length} columns ·
                      <span className={styles.dsStatus} data-status={ds.status}> {ds.status}</span>
                    </div>
                    {ds.processed_rows && <div className={styles.dsMeta}>{ds.processed_rows} rows processed</div>}
                  </div>
                  <button className={styles.btnDelete} onClick={() => deleteMutation.mutate(ds.dataset_id)}>🗑</button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
