import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { datasetsApi } from '../api/client';
import styles from './Datasets.module.css';

const REQUIRED_FIELDS = ['quantity'];
const OPTIONAL_FIELDS = ['date_or_month', 'product_name', 'category', 'price', 'temperature', 'trend_score', 'stock', 'day_of_week'];
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS];

const FIELD_LABELS = {
  date_or_month: 'Date or Month',
  quantity: 'Quantity / Sales *',
  product_name: 'Product Name',
  category: 'Category',
  price: 'Price / Revenue',
  temperature: 'Temperature',
  trend_score: 'Market Trend Score',
  stock: 'Stock Level',
  day_of_week: 'Day of Week'
};

export default function Datasets() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileRef = useRef();
  const [dragOver, setDragOver] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [mappings, setMappings] = useState({});
  const [step, setStep] = useState('list'); // 'list' | 'mapping' | 'done'

  const { data: datasets, isLoading } = useQuery({
    queryKey: ['datasets'],
    queryFn: () => datasetsApi.list().then(r => r.data)
  });

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const result = await datasetsApi.upload(file);
      return result;
    },
    onSuccess: (res) => {
      const data = res?.data || res;
      setUploadResult(data);

      // Auto-detect column mappings from common patterns
      const cols = (data?.columns || []).map(c => c.toLowerCase());
      const autoMap = {};
      const find = (...patterns) => data?.columns?.find(c => patterns.some(p => c.toLowerCase().includes(p)));

      autoMap.quantity     = find('qty', 'quantity', 'sales', 'weekly_sales', 'units', 'sold', 'demand', 'volume', 'amount');
      autoMap.date_or_month = find('date', 'month', 'week', 'period', 'time', 'year');
      autoMap.product_name = find('product', 'item', 'name', 'sku', 'description', 'store');
      autoMap.category     = find('category', 'dept', 'department', 'type', 'class', 'segment');
      autoMap.price        = find('price', 'revenue', 'sales_amount', 'value', 'cost', 'fuel_price', 'cpi');
      autoMap.temperature  = find('temp', 'temperature', 'weather');
      autoMap.stock        = find('stock', 'inventory', 'supply');
      autoMap.day_of_week  = find('day', 'weekday', 'dow');
      autoMap.trend_score  = find('trend', 'score', 'index', 'unemployment');

      // Remove undefined values
      Object.keys(autoMap).forEach(k => { if (!autoMap[k]) delete autoMap[k]; });

      setMappings(autoMap);
      setStep('mapping');
      const mapped = Object.keys(autoMap).length;
      toast.success(`Uploaded ${data?.row_count} rows — auto-detected ${mapped} columns`, { duration: 5000 });
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
      qc.invalidateQueries({ queryKey: ['timeseries'] });
      qc.invalidateQueries({ queryKey: ['viz-datasets-list'] });
      qc.invalidateQueries({ queryKey: ['viz-overview'] });
      qc.invalidateQueries({ queryKey: ['viz-ts'] });
      qc.invalidateQueries({ queryKey: ['viz-cat'] });
      qc.invalidateQueries({ queryKey: ['viz-top'] });
      qc.invalidateQueries({ queryKey: ['viz-monthly'] });
      const msg = data.message || `Mapped ${data.processed_rows} rows successfully`;
      toast.success(msg, { duration: 6000 });
    },
    onError: (e) => toast.error(`Mapping failed: ${e.message}`)
  });

  const trainMutation = useMutation({
    mutationFn: () => datasetsApi.train(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['timeseries'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['batch-predict'] });
      qc.invalidateQueries({ queryKey: ['batch-ml-predictions'] });
      qc.invalidateQueries({ queryKey: ['viz-datasets-list'] });
      qc.invalidateQueries({ queryKey: ['viz-overview'] });
      qc.invalidateQueries({ queryKey: ['viz-ts'] });
      qc.invalidateQueries({ queryKey: ['viz-cat'] });
      qc.invalidateQueries({ queryKey: ['viz-top'] });
      qc.invalidateQueries({ queryKey: ['viz-monthly'] });
      const m = res.data?.metrics;
      const note = res.data?.note;
      if (note) {
        toast(`⚠️ ${note}`, { icon: '⚠️', duration: 6000 });
      } else {
        toast.success(m ? `Model retrained — MAE: ${m.mae}, R²: ${m.r2}` : 'Model retrained', { duration: 4000 });
      }
      // Auto-redirect to dashboard after 1.5s
      setTimeout(() => navigate('/'), 1500);
    },
    onError: (e) => toast.error(`Training failed: ${e.message}`)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => datasetsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['datasets'] }); toast.success('Dataset deleted'); }
  });

  const purgeMutation = useMutation({
    mutationFn: () => datasetsApi.purgeProducts(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['batch-predict'] });
      toast.success(res.message || 'Cleaned up dataset products', { duration: 6000 });
    },
    onError: e => toast.error(e.message),
  });

  const mappedCount = Object.values(mappings).filter(Boolean).length;

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

  const [trainSeconds, setTrainSeconds] = useState(0);

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
  const requiredMapped = REQUIRED_FIELDS.every(f => mappings[f]);

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

          {/* Sample CSV format */}
          <div className={styles.sampleCard}>
            <div className={styles.sampleTitle}>Sample CSV Format</div>
            <pre className={styles.sampleCode}>{`date,product_name,category,quantity,price,temperature
2024-01-15,iPhone 15,Electronics,12,999,18
2024-01-15,Nike Air Max,Clothing,25,120,18
2024-01-16,Organic Coffee,Food,80,18,17`}</pre>
            <p className={styles.sampleNote}>
              Only <strong>Quantity / Sales</strong> is required — all other columns are optional and auto-detected.
              Works with Walmart, retail, e-commerce, or any sales dataset.
            </p>
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

            {/* Preview */}
            <div className={styles.previewScroll}>
              <table className={styles.previewTable}>
                <thead>
                  <tr>{uploadResult.columns.map(c => <th key={c}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {uploadResult.preview?.slice(0,3).map((row, i) => (
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

        {step === 'done' && (
          <motion.div className={styles.successCard}
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <div className={styles.successIcon}>✅</div>
            <h2>Data Imported Successfully</h2>
            <p>Your products and sales history are now live in the system.</p>
            <p className={styles.successHint}>
              Check <strong>Products</strong>, <strong>Dashboard</strong>, <strong>Analytics</strong> and <strong>Predictions</strong> — your data is there.
              Retrain the model below to improve forecast accuracy with your data.
            </p>
            <div className={styles.successActions}>
              <button className={styles.btnPrimary}
                onClick={() => trainMutation.mutate()}
                disabled={trainMutation.isPending}>
                {trainMutation.isPending
                  ? `🔄 ${trainStage} (${trainSeconds}s)`
                  : '🚀 Retrain AI Model Now'}
              </button>              <button className={styles.btnSecondary} onClick={() => { setStep('list'); setUploadResult(null); }}>
                Upload Another
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dataset list */}
      {step === 'list' && (
        <motion.div className={styles.card} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
          <div className={styles.listHeader}>
            <h2 className={styles.cardTitle}>Uploaded Datasets</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {datasets?.length > 0 && (
                <button className={styles.btnTrain}
                  onClick={() => trainMutation.mutate()}
                  disabled={trainMutation.isPending}>
                  {trainMutation.isPending ? `🔄 ${trainStage} (${trainSeconds}s)` : '🚀 Retrain on All Data'}
                </button>
              )}
              <button
                onClick={() => { if (window.confirm('This will delete all auto-generated products and their sales from dataset imports. Manually added products are kept. Continue?')) purgeMutation.mutate(); }}
                disabled={purgeMutation.isPending}
                style={{
                  padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)',
                  background: 'rgba(239,68,68,0.08)', color: '#f87171',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>
                {purgeMutation.isPending ? 'Cleaning...' : '🗑 Clean Up Products'}
              </button>
            </div>
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
                  <button className={styles.btnDelete}
                    onClick={() => deleteMutation.mutate(ds.dataset_id)}>
                    🗑
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
