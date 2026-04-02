import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { predictApi } from '../api/client';

export function useRetrain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => predictApi.retrain(),
    onSuccess: (res) => {
      // Refresh all dashboard data after retrain
      qc.invalidateQueries({ queryKey: ['insights'] });
      qc.invalidateQueries({ queryKey: ['timeseries'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['batch-predict'] });
      qc.invalidateQueries({ queryKey: ['batch-ml-predictions'] });
      const m = res?.metrics;
      toast.success(m ? `Retrained — MAE: ${m.mae}, R²: ${m.r2}` : 'Model retrained — dashboard refreshed', { duration: 5000 });
    },
    onError: (err) => toast.error(`Retrain failed: ${err.message}`)
  });
}
