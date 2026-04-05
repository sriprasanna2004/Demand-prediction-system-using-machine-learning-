/**
 * Returns products filtered to the active dataset when one exists.
 * Falls back to all products when no dataset is active.
 */
import { useQuery } from '@tanstack/react-query';
import { productsApi, vizApi } from '../api/client';

export function useDatasetProducts() {
  const { data: dsList } = useQuery({
    queryKey: ['viz-datasets-list'],
    queryFn: () => vizApi.datasetsList().then(r => r.data),
    staleTime: 30000,
  });

  const activeDataset = dsList?.[0];
  const dsId = activeDataset?.dataset_id;

  const { data: products, isLoading } = useQuery({
    queryKey: ['products', dsId],
    queryFn: () => productsApi.getAll(dsId ? { dataset_id: dsId } : {}).then(r => r.data),
    staleTime: 0,
  });

  return { products, isLoading, activeDataset, dsId };
}
