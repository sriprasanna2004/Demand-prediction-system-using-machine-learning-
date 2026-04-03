import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { analyticsApi } from '../api/client';

export default function FeedbackModal({ prediction, onClose }) {
  const qc = useQueryClient();
  const [actual, setActual] = useState('');

  const mutation = useMutation({
    mutationFn: () => analyticsApi.feedback({
      product_id: prediction.productId,
      prediction_date: new Date().toISOString(),
      actual_demand: parseFloat(actual),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['model-card'] });
      qc.invalidateQueries({ queryKey: ['monitor-perf'] });
      toast.success('Actual demand recorded — Model Card will update');
      onClose();
    },
    onError: e => toast.error(e.message),
  });

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }}>
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={e => e.stopPropagation()}
          style={{
            background: 'linear-gradient(135deg, rgba(20,25,45,0.98), rgba(15,20,35,0.98))',
            border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 20, padding: 28, width: '100%', maxWidth: 400,
            boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
          }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Record Actual Demand
          </h2>
          <p style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 20, lineHeight: 1.5 }}>
            Submit the real demand for <strong style={{ color: 'var(--text)' }}>{prediction?.name}</strong> to improve model accuracy tracking.
          </p>

          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: '12px 14px', marginBottom: 18 }}>
            <div style={{ fontSize: 11, color: '#a5b4fc', fontWeight: 600, marginBottom: 4 }}>AI Predicted</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#6366f1' }}>{prediction?.predicted_demand} units</div>
          </div>

          <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            Actual Demand (units)
          </label>
          <input
            type="number" min="0" step="1" autoFocus
            value={actual} onChange={e => setActual(e.target.value)}
            placeholder="Enter real demand..."
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 12, boxSizing: 'border-box',
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none',
            }}
            onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.5)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
          />

          {actual && prediction?.predicted_demand && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)' }}>
              Error: <strong style={{ color: Math.abs(parseFloat(actual) - prediction.predicted_demand) / prediction.predicted_demand < 0.1 ? 'var(--success)' : 'var(--warning)' }}>
                {((Math.abs(parseFloat(actual) - prediction.predicted_demand) / prediction.predicted_demand) * 100).toFixed(1)}%
              </strong>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button onClick={() => mutation.mutate()} disabled={!actual || mutation.isPending}
              style={{
                flex: 1, padding: '11px', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer',
                opacity: !actual || mutation.isPending ? 0.5 : 1,
              }}>
              {mutation.isPending ? 'Saving...' : 'Submit Feedback'}
            </button>
            <button onClick={onClose} style={{
              padding: '11px 18px', borderRadius: 12,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text2)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
