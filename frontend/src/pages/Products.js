import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { productsApi, salesApi } from '../api/client';
import styles from './Products.module.css';

const CATEGORIES = ['Electronics', 'Clothing', 'Food', 'Furniture', 'Books', 'Toys'];
const EMPTY_FORM = { name: '', category: 'Electronics', price: '', stock: '' };

export default function Products() {
  const qc = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState(null);
  const [saleForm, setSaleForm] = useState({ productId: '', quantity: '' });
  const [showSaleModal, setShowSaleModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['products'],
    queryFn: () => productsApi.getAll().then((r) => r.data)
  });

  const saveMutation = useMutation({
    mutationFn: (d) => editId ? productsApi.update(editId, d) : productsApi.create(d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['products'] });
      setForm(EMPTY_FORM);
      setEditId(null);
      toast.success(editId ? 'Product updated' : 'Product created');
    },
    onError: (e) => toast.error(e.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => productsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['products'] }); toast.success('Product removed'); },
    onError: (e) => toast.error(e.message)
  });

  const saleMutation = useMutation({
    mutationFn: (d) => salesApi.create(d),
    onSuccess: () => {
      setShowSaleModal(false);
      setSaleForm({ productId: '', quantity: '' });
      toast.success('Sale recorded');
    },
    onError: (e) => toast.error(e.message)
  });

  const handleEdit = (p) => {
    setEditId(p._id);
    setForm({ name: p.name, category: p.category, price: p.price, stock: p.stock });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    saveMutation.mutate({ ...form, price: parseFloat(form.price), stock: parseInt(form.stock) });
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Product Management</h1>

      <div className={styles.grid}>
        <div className={styles.formCard}>
          <h2 className={styles.cardTitle}>{editId ? 'Edit Product' : 'Add Product'}</h2>
          <form onSubmit={handleSubmit} className={styles.form}>
            <input className={styles.input} placeholder="Product name" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <select className={styles.input} value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
            <input className={styles.input} type="number" placeholder="Price ($)" value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })} required min="0" step="0.01" />
            <input className={styles.input} type="number" placeholder="Stock quantity" value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })} required min="0" />
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary} type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
              {editId && (
                <button type="button" className={styles.btnSecondary}
                  onClick={() => { setEditId(null); setForm(EMPTY_FORM); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        <div className={styles.tableCard}>
          <div className={styles.tableHeader}>
            <h2 className={styles.cardTitle}>Products ({data?.length || 0})</h2>
            <button className={styles.btnAccent} onClick={() => setShowSaleModal(true)}>
              + Record Sale
            </button>
          </div>
          {isLoading ? <p className={styles.muted}>Loading...</p> : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Name</th><th>Category</th><th>Price</th><th>Stock</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data?.map((p) => (
                  <tr key={p._id} className={p.stock < 20 ? styles.lowStockRow : ''}>
                    <td>{p.name}</td>
                    <td><span className={styles.catBadge}>{p.category}</span></td>
                    <td>${p.price.toFixed(2)}</td>
                    <td>
                      <span className={p.stock < 20 ? styles.stockDanger : styles.stockOk}>
                        {p.stock}
                      </span>
                    </td>
                    <td className={styles.actions}>
                      <button className={styles.btnEdit} onClick={() => handleEdit(p)}>Edit</button>
                      <button className={styles.btnDel} onClick={() => deleteMutation.mutate(p._id)}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showSaleModal && (
        <div className={styles.overlay}>
          <div className={styles.modal}>
            <h2 className={styles.cardTitle}>Record Manual Sale</h2>
            <select className={styles.input} value={saleForm.productId}
              onChange={(e) => setSaleForm({ ...saleForm, productId: e.target.value })}>
              <option value="">Select product</option>
              {data?.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            <input className={styles.input} type="number" placeholder="Quantity" value={saleForm.quantity}
              onChange={(e) => setSaleForm({ ...saleForm, quantity: e.target.value })} min="1" />
            <div className={styles.btnRow}>
              <button className={styles.btnPrimary}
                onClick={() => saleMutation.mutate({ ...saleForm, quantity: parseInt(saleForm.quantity) })}
                disabled={!saleForm.productId || !saleForm.quantity || saleMutation.isPending}>
                {saleMutation.isPending ? 'Saving...' : 'Record Sale'}
              </button>
              <button className={styles.btnSecondary} onClick={() => setShowSaleModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
