import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { predictApi } from '../api/client';

export function useRetrain() {
  return useMutation({
    mutationFn: () => predictApi.retrain(),
    onSuccess: (res) => {
      const m = res?.metrics;
      toast.success(m ? `Retrained — MAE: ${m.mae}, R²: ${m.r2}` : 'Model retrained successfully');
    },
    onError: (err) => toast.error(`Retrain failed: ${err.message}`)
  });
}
