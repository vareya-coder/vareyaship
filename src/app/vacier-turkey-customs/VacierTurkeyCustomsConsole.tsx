"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, CircleSlash, RefreshCw, Save, Search, Upload } from 'lucide-react';

type OverrideRow = {
  id: number;
  sku: string;
  productName: string | null;
  customsDescription: string;
  customsValue: string;
  tariffCode: string | null;
  currency: string;
  isActive: boolean;
  source: string | null;
  updatedAt: string;
};

type FormState = {
  id?: number;
  sku: string;
  productName: string;
  customsDescription: string;
  customsValue: string;
  tariffCode: string;
  currency: string;
  source: string;
  isActive: boolean;
};

const emptyForm: FormState = {
  sku: '',
  productName: '',
  customsDescription: '',
  customsValue: '',
  tariffCode: '',
  currency: 'EUR',
  source: 'manual_ui',
  isActive: true,
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export default function VacierTurkeyCustomsConsole() {
  const [rows, setRows] = useState<OverrideRow[]>([]);
  const [skuFilter, setSkuFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('true');
  const [form, setForm] = useState<FormState>(emptyForm);
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: '500' });
      if (skuFilter.trim()) params.set('sku', skuFilter.trim());
      if (activeFilter !== 'all') params.set('active', activeFilter);
      const data = await fetchJson<{ overrides: OverrideRow[] }>(
        `/api/vacier-turkey-customs/overrides?${params.toString()}`,
      );
      setRows(data.overrides);
    } catch (loadError: any) {
      setError(loadError?.message ?? 'Failed to load overrides');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, skuFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const formTitle = useMemo(() => form.id ? `Editing #${form.id}` : 'Create override', [form.id]);

  function selectRow(row: OverrideRow) {
    setForm({
      id: row.id,
      sku: row.sku,
      productName: row.productName ?? '',
      customsDescription: row.customsDescription,
      customsValue: row.customsValue,
      tariffCode: row.tariffCode ?? '',
      currency: row.currency,
      source: row.source ?? '',
      isActive: row.isActive,
    });
  }

  async function submitOverride(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await fetchJson('/api/vacier-turkey-customs/overrides', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setMessage(form.id ? 'Override updated' : 'Override created');
      setForm(emptyForm);
      await load();
    } catch (saveError: any) {
      setError(saveError?.message ?? 'Failed to save override');
    }
  }

  async function setActive(row: OverrideRow, isActive: boolean) {
    setError(null);
    setMessage(null);
    try {
      await fetchJson('/api/vacier-turkey-customs/overrides', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isActive ? { id: row.id, isActive: true } : { id: row.id, action: 'deactivate' }),
      });
      setMessage(isActive ? 'Override activated' : 'Override deactivated');
      await load();
    } catch (actionError: any) {
      setError(actionError?.message ?? 'Failed to change override status');
    }
  }

  async function importCsv(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const result = await fetchJson<{
        imported: number;
        failed: number;
        errors: Array<{ row: number; message: string }>;
      }>('/api/vacier-turkey-customs/overrides/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv }),
      });
      setMessage(`Imported ${result.imported}; failed ${result.failed}`);
      if (result.errors.length > 0) {
        setError(result.errors.map((item) => `Row ${item.row}: ${item.message}`).join('\n'));
      }
      setCsv('');
      await load();
    } catch (importError: any) {
      setError(importError?.message ?? 'Failed to import CSV');
    }
  }

  async function loadCsvFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
  }

  return (
    <main className="min-h-screen bg-gray-50 px-6 py-6 text-gray-900">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Vacier Turkey Customs Overrides</h1>
            <p className="mt-1 text-sm text-gray-600">SKU values, descriptions and tariff codes used for Vacier Turkey Asendia labels.</p>
          </div>
          <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-100">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>

        {(message || error) && (
          <div className={`whitespace-pre-wrap rounded-md border px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
            {error ?? message}
          </div>
        )}

        <section className="rounded-md border bg-white p-4">
          <form onSubmit={(event) => { event.preventDefault(); void load(); }} className="grid gap-3 md:grid-cols-[1fr_160px_auto]">
            <input value={skuFilter} onChange={(event) => setSkuFilter(event.target.value)} placeholder="SKU" className="rounded-md border px-3 py-2 text-sm" />
            <select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)} className="rounded-md border px-3 py-2 text-sm">
              <option value="true">Active</option>
              <option value="false">Inactive</option>
              <option value="all">All</option>
            </select>
            <button className="inline-flex items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white">
              <Search className="h-4 w-4" /> Filter
            </button>
          </form>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1fr_400px]">
          <section className="overflow-hidden rounded-md border bg-white">
            <div className="border-b px-4 py-3 text-sm font-medium">Overrides {loading ? '(loading)' : `(${rows.length})`}</div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-100 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Tariff</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{row.sku}</td>
                      <td className="px-4 py-3 text-gray-700">{row.customsDescription}</td>
                      <td className="px-4 py-3">{row.customsValue} {row.currency}</td>
                      <td className="px-4 py-3">{row.tariffCode || '-'}</td>
                      <td className="px-4 py-3">{row.isActive ? <span className="inline-flex items-center gap-1 text-emerald-700"><Check className="h-4 w-4" /> Active</span> : 'Inactive'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => selectRow(row)} className="rounded-md border px-2 py-1 text-xs hover:bg-gray-100">Edit</button>
                          <button onClick={() => void setActive(row, !row.isActive)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-gray-100">
                            {row.isActive ? <CircleSlash className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                            {row.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="rounded-md border bg-white p-4">
              <div className="mb-3 text-sm font-medium">{formTitle}</div>
              <form onSubmit={(event) => void submitOverride(event)} className="space-y-3">
                <input required value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="SKU" className="w-full rounded-md border px-3 py-2 text-sm" />
                <input value={form.productName} onChange={(event) => setForm({ ...form, productName: event.target.value })} placeholder="Product name" className="w-full rounded-md border px-3 py-2 text-sm" />
                <textarea required value={form.customsDescription} onChange={(event) => setForm({ ...form, customsDescription: event.target.value })} placeholder="Customs description" className="h-20 w-full rounded-md border px-3 py-2 text-sm" />
                <div className="grid grid-cols-2 gap-3">
                  <input required value={form.customsValue} onChange={(event) => setForm({ ...form, customsValue: event.target.value })} placeholder="Customs value" className="rounded-md border px-3 py-2 text-sm" />
                  <input required value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} placeholder="EUR" className="rounded-md border px-3 py-2 text-sm" />
                </div>
                <input value={form.tariffCode} onChange={(event) => setForm({ ...form, tariffCode: event.target.value })} placeholder="Tariff code" className="w-full rounded-md border px-3 py-2 text-sm" />
                <input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Source" className="w-full rounded-md border px-3 py-2 text-sm" />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} />
                  Active
                </label>
                <div className="flex gap-2">
                  <button className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                    <Save className="h-4 w-4" /> Save
                  </button>
                  <button type="button" onClick={() => setForm(emptyForm)} className="rounded-md border px-3 py-2 text-sm">Clear</button>
                </div>
              </form>
            </section>

            <section className="rounded-md border bg-white p-4">
              <div className="mb-3 text-sm font-medium">CSV import</div>
              <form onSubmit={(event) => void importCsv(event)} className="space-y-3">
                <input type="file" accept=".csv,text/csv" onChange={(event) => void loadCsvFile(event)} className="w-full rounded-md border px-3 py-2 text-sm" />
                <textarea value={csv} onChange={(event) => setCsv(event.target.value)} placeholder="SKU,ProductName,CustomsDescription,CustomsValue,TariffCode,Currency,Source" className="h-40 w-full rounded-md border px-3 py-2 font-mono text-xs" />
                <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white">
                  <Upload className="h-4 w-4" /> Import CSV
                </button>
              </form>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
