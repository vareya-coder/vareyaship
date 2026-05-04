"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Download,
  Eye,
  FileText,
  Lock,
  PackageSearch,
  RefreshCw,
  Search,
  Settings,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BatchReadiness = "ready" | "partial" | "risk";
type SystemStatus = "auto_mode_active" | "partial_manual_override" | "blocked";

type BatchSummary = {
  batchId: number;
  groupingKey: string | null;
  crmId: string | null;
  clientName: string | null;
  operationalDate: string;
  status: string | null;
  shipmentCountStored: number;
  shipmentCountActual: number;
  manifestedShipmentCount: number;
  pendingShipmentCount: number;
  lateShipmentCount: number;
  cutoffApplied: boolean;
  readiness: BatchReadiness;
  readinessPercent: number;
  createdAt: string | null;
  closingAt: string | null;
};

type ShipmentRow = {
  id: number;
  externalShipmentId?: string | null;
  orderId: number | null;
  accountId?: number | null;
  crmId?: string | null;
  clientName?: string | null;
  senderTaxCode?: string | null;
  shippingMethod: string | null;
  parcelId: string;
  trackingNumber: string | null;
  labelUrl?: string | null;
  batchId: number | null;
  manifestId: string | null;
  isManifested: boolean;
  createdAt: string | null;
};

type BatchApiResponse = {
  selectedDate: string;
  timezone: string;
  cutoffTime: string;
  pickupWindow: string;
  systemStatus: SystemStatus;
  systemStatusLabel: string;
  systemStatusDetail: string;
  refreshedAt: string;
  totals: {
    batchCount: number;
    shipmentCount: number;
    pendingShipmentCount: number;
    lateShipmentCount: number;
    openBatchCount: number;
    closingBatchCount: number;
    manifestedBatchCount: number;
    riskBatchCount: number;
    partialBatchCount: number;
  };
  batches: BatchSummary[];
  lateShipments: ShipmentRow[];
  filterOptions: {
    batches: Array<{
      batchId: number;
      crmId: string | null;
      clientName: string | null;
      label: string;
    }>;
    clients: Array<{
      crmId: string;
      clientName: string | null;
      batchCount: number;
      shipmentCount: number;
    }>;
  };
};

type ManifestSummary = {
  manifestId: string;
  batchId: number | null;
  status: string | null;
  parcelCountExpected: number;
  parcelCountActual: number | null;
  verificationStatus: string | null;
  documentUrl: string | null;
  createdAt: string | null;
  countDelta: number | null;
};

type ManifestApiResponse = {
  refreshedAt: string;
  manifests: ManifestSummary[];
};

type ManifestDetailResponse = {
  manifest: ManifestSummary;
  batch: {
    batchId: number;
    groupingKey: string | null;
    crmId: string | null;
    status: string | null;
    operationalDate: string | null;
    shipmentCountStored: number;
    createdAt: string | null;
    closingAt: string | null;
  } | null;
  parcels: ShipmentRow[];
  atRiskParcelIds: string[];
  expectedBatchParcelIds: string[];
  refreshedAt: string;
};

type ShipmentSearchResponse = {
  query: string;
  shipments: ShipmentRow[];
  refreshedAt: string;
};

type FeatureFlagsResponse = {
  flags: Record<string, unknown>;
  refreshedAt: string;
  source: string;
  editable: boolean;
};

function getAmsterdamTodayISO() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body?.message ?? `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? value.toLocaleString() : "-";
}

function statusBadgeClass(status: string | null) {
  if (status === "OPEN") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "CLOSING") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "MANIFESTED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "completed" || status === "created") return "border-slate-200 bg-slate-50 text-slate-700";
  return "border-gray-200 bg-gray-50 text-gray-700";
}

function readinessBadgeClass(readiness: BatchReadiness) {
  if (readiness === "ready") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (readiness === "partial") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

function verificationBadgeClass(status: string | null) {
  if (status === "matched") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "mismatch") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function compact(value: unknown, fallback = "-") {
  if (value === null || value === undefined || value === "") return fallback;
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : fallback;
  return String(value);
}

function MetricTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "neutral" | "ready" | "warn" | "risk";
}) {
  const toneClass = {
    neutral: "border-gray-200 bg-white text-gray-900",
    ready: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warn: "border-amber-200 bg-amber-50 text-amber-900",
    risk: "border-red-200 bg-red-50 text-red-900",
  }[tone];

  return (
    <div className={`rounded-md border p-4 ${toneClass}`}>
      <div className="text-xs font-medium uppercase tracking-normal text-gray-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold leading-none">{value}</div>
    </div>
  );
}

function BooleanFlag({ value }: { value: unknown }) {
  const enabled = value === true;
  const Icon = enabled ? ToggleRight : ToggleLeft;
  return (
    <span className={`inline-flex items-center gap-2 text-sm font-medium ${enabled ? "text-emerald-700" : "text-gray-500"}`}>
      <Icon className="h-5 w-5" aria-hidden="true" />
      {enabled ? "On" : "Off"}
    </span>
  );
}

function SystemStatusBadge({
  status,
  label,
  detail,
  hasError,
}: {
  status: SystemStatus | undefined;
  label?: string;
  detail?: string;
  hasError: boolean;
}) {
  if (hasError || status === "blocked") {
    return (
      <Badge variant="outline" className="gap-1 border-red-200 bg-red-50 text-red-700">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        Blocked
      </Badge>
    );
  }

  if (status === "partial_manual_override") {
    return (
      <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700" title={detail}>
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {label ?? "Dry-run/manual mode"}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700" title={detail}>
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      {label ?? "Auto mode active"}
    </Badge>
  );
}

export default function AsendiaManifestConsole() {
  const [selectedDate, setSelectedDate] = useState(getAmsterdamTodayISO);
  const [batchData, setBatchData] = useState<BatchApiResponse | null>(null);
  const [manifestData, setManifestData] = useState<ManifestApiResponse | null>(null);
  const [manifestDetail, setManifestDetail] = useState<ManifestDetailResponse | null>(null);
  const [flagsData, setFlagsData] = useState<FeatureFlagsResponse | null>(null);
  const [shipmentSearch, setShipmentSearch] = useState<ShipmentSearchResponse | null>(null);
  const [shipmentQuery, setShipmentQuery] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [crmFilter, setCrmFilter] = useState("all");
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [selectedManifestId, setSelectedManifestId] = useState<string | null>(null);
  const [selectedShipmentId, setSelectedShipmentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [actionBatchId, setActionBatchId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const loadOperations = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const batchParams = new URLSearchParams({ date: selectedDate });
      const shipmentParams = new URLSearchParams({
        date: selectedDate,
        query: shipmentQuery,
        limit: "100",
      });
      if (batchFilter !== "all") {
        batchParams.set("batchId", batchFilter);
        shipmentParams.set("batchId", batchFilter);
      }
      if (crmFilter !== "all") {
        batchParams.set("crmId", crmFilter);
        shipmentParams.set("crmId", crmFilter);
      }

      const [batches, manifests, flags, shipments] = await Promise.all([
        fetchJson<BatchApiResponse>(`/api/batches?${batchParams.toString()}`),
        fetchJson<ManifestApiResponse>("/api/manifests"),
        fetchJson<FeatureFlagsResponse>("/api/feature-flags"),
        fetchJson<ShipmentSearchResponse>(`/api/shipments?${shipmentParams.toString()}`),
      ]);

      setBatchData(batches);
      setManifestData(manifests);
      setFlagsData(flags);
      setShipmentSearch(shipments);
      setLastUpdated(new Date().toISOString());

      setSelectedManifestId((current) => (
        current && manifests.manifests.some((manifest) => manifest.manifestId === current)
          ? current
          : manifests.manifests[0]?.manifestId ?? null
      ));
      setSelectedBatchId((current) => (
        current && batches.batches.some((batch) => batch.batchId === current)
          ? current
          : batches.batches[0]?.batchId ?? null
      ));
      setSelectedShipmentId((current) => (
        current && shipments.shipments.some((shipment) => shipment.id === current)
          ? current
          : shipments.shipments[0]?.id ?? null
      ));
    } catch (loadError: any) {
      setError(loadError?.message ?? "Failed to load manifest operations data");
    } finally {
      setLoading(false);
    }
  }, [batchFilter, crmFilter, selectedDate, shipmentQuery]);

  useEffect(() => {
    void loadOperations();
  }, [loadOperations]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadOperations();
    }, 45_000);

    return () => window.clearInterval(interval);
  }, [loadOperations]);

  useEffect(() => {
    if (!selectedManifestId) {
      setManifestDetail(null);
      return;
    }

    let active = true;
    fetchJson<ManifestDetailResponse>(`/api/manifests/${encodeURIComponent(selectedManifestId)}`)
      .then((detail) => {
        if (active) setManifestDetail(detail);
      })
      .catch((detailError: any) => {
        if (active) setError(detailError?.message ?? "Failed to load manifest detail");
      });

    return () => {
      active = false;
    };
  }, [selectedManifestId]);

  const selectedBatch = useMemo(
    () => batchData?.batches.find((batch) => batch.batchId === selectedBatchId) ?? null,
    [batchData, selectedBatchId],
  );

  const selectedShipment = useMemo(
    () => shipmentSearch?.shipments.find((shipment) => shipment.id === selectedShipmentId) ?? null,
    [shipmentSearch, selectedShipmentId],
  );

  const selectedShipmentManifest = useMemo(
    () => manifestData?.manifests.find((manifest) => manifest.manifestId === selectedShipment?.manifestId) ?? null,
    [manifestData, selectedShipment],
  );

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        date: selectedDate,
        query: shipmentQuery,
        limit: "100",
      });
      if (batchFilter !== "all") params.set("batchId", batchFilter);
      if (crmFilter !== "all") params.set("crmId", crmFilter);
      const response = await fetchJson<ShipmentSearchResponse>(
        `/api/shipments?${params.toString()}`,
      );
      setShipmentSearch(response);
      setSelectedShipmentId(response.shipments[0]?.id ?? null);
    } catch (searchError: any) {
      setError(searchError?.message ?? "Shipment search failed");
    } finally {
      setSearching(false);
    }
  }

  async function forceCloseBatch(batch: BatchSummary) {
    const confirmed = window.confirm(`Force close batch ${batch.batchId}? This locks the batch and does not create a manifest.`);
    if (!confirmed) return;

    setActionBatchId(batch.batchId);
    setError(null);
    try {
      await fetchJson(`/api/batches/${batch.batchId}/force-close`, { method: "POST" });
      await loadOperations();
    } catch (closeError: any) {
      setError(closeError?.message ?? "Force close failed");
    } finally {
      setActionBatchId(null);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-950">
      <section className="border-b bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold leading-tight text-gray-950">Asendia Manifest Operations</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-gray-600">
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="h-4 w-4" aria-hidden="true" />
                  {batchData?.timezone ?? "Europe/Amsterdam"}
                </span>
                <span>Pickup {batchData?.pickupWindow ?? "20:00-22:00"}</span>
                <span>Cutoff {batchData?.cutoffTime ?? "17:00"}</span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <SystemStatusBadge
                status={batchData?.systemStatus}
                label={batchData?.systemStatusLabel}
                detail={batchData?.systemStatusDetail}
                hasError={!!error}
              />
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(event) => {
                    setSelectedDate(event.target.value);
                    setBatchFilter("all");
                    setCrmFilter("all");
                  }}
                  className="h-9 w-[155px] rounded-md border-gray-300 bg-white"
                />
              </label>
              <Button
                type="button"
                variant="outline"
                className="h-9 gap-2 border-gray-300 bg-white text-gray-800"
                onClick={() => void loadOperations()}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
                Refresh
              </Button>
            </div>
          </div>

          {error ? (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <MetricTile label="Batches" value={formatNumber(batchData?.totals.batchCount)} tone="neutral" />
            <MetricTile label="Shipments" value={formatNumber(batchData?.totals.shipmentCount)} tone="neutral" />
            <MetricTile label="Pending" value={formatNumber(batchData?.totals.pendingShipmentCount)} tone="warn" />
            <MetricTile label="Late" value={formatNumber(batchData?.totals.lateShipmentCount)} tone={batchData?.totals.lateShipmentCount ? "risk" : "ready"} />
            <MetricTile label="Manifested" value={formatNumber(batchData?.totals.manifestedBatchCount)} tone="ready" />
          </div>

          <div className="text-xs text-gray-500">
            Last refresh: {lastUpdated ? formatDateTime(lastUpdated) : "-"}
          </div>

          <div className="flex flex-col gap-3 rounded-md border bg-gray-50 p-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="text-sm text-gray-600">
              {batchData?.systemStatusDetail ?? "Manifest operations status will appear after data loads."}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Client
                <select
                  value={crmFilter}
                  onChange={(event) => {
                    setCrmFilter(event.target.value);
                    setBatchFilter("all");
                  }}
                  className="h-9 min-w-[230px] rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="all">All clients</option>
                  {(batchData?.filterOptions.clients ?? []).map((client) => (
                    <option key={client.crmId} value={client.crmId}>
                      {client.clientName ? `${client.clientName} · ${client.crmId}` : client.crmId}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                Batch
                <select
                  value={batchFilter}
                  onChange={(event) => setBatchFilter(event.target.value)}
                  className="h-9 min-w-[210px] rounded-md border border-gray-300 bg-white px-3 text-sm"
                >
                  <option value="all">All batches</option>
                  {(batchData?.filterOptions.batches ?? [])
                    .filter((batch) => crmFilter === "all" || batch.crmId === crmFilter)
                    .map((batch) => (
                      <option key={batch.batchId} value={String(batch.batchId)}>
                        {batch.clientName ? `Batch ${batch.batchId} · ${batch.clientName}` : batch.label}
                      </option>
                    ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1500px] px-4 py-5 sm:px-6 lg:px-8">
        <Tabs defaultValue="batches" className="w-full">
          <TabsList className="h-auto flex-wrap justify-start gap-1 rounded-md border bg-white p-1">
            <TabsTrigger value="batches" className="gap-2 data-[state=active]:bg-gray-900 data-[state=active]:text-white">
              <PackageSearch className="h-4 w-4" aria-hidden="true" />
              Batch Monitor
            </TabsTrigger>
            <TabsTrigger value="manifests" className="gap-2 data-[state=active]:bg-gray-900 data-[state=active]:text-white">
              <FileText className="h-4 w-4" aria-hidden="true" />
              Manifest Viewer
            </TabsTrigger>
            <TabsTrigger value="shipments" className="gap-2 data-[state=active]:bg-gray-900 data-[state=active]:text-white">
              <Search className="h-4 w-4" aria-hidden="true" />
              Shipment Inspector
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2 data-[state=active]:bg-gray-900 data-[state=active]:text-white">
              <Settings className="h-4 w-4" aria-hidden="true" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="batches" className="mt-5 space-y-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-md border bg-white">
                <div className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-950">Batch Monitor</h2>
                    <p className="text-sm text-gray-500">{selectedDate}</p>
                  </div>
                  <Badge variant="outline" className="w-fit border-gray-200 bg-gray-50 text-gray-700">
                    {batchData?.totals.openBatchCount ?? 0} open
                  </Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch ID</TableHead>
                      <TableHead>Grouping Key</TableHead>
                      <TableHead>Shipments</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Cutoff</TableHead>
                      <TableHead>Readiness</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(batchData?.batches ?? []).map((batch) => (
                      <TableRow key={batch.batchId} data-state={batch.batchId === selectedBatchId ? "selected" : undefined}>
                        <TableCell className="font-mono font-medium">{batch.batchId}</TableCell>
                        <TableCell>
                          <div className="max-w-[360px] truncate font-mono text-xs text-gray-700" title={batch.groupingKey ?? "default"}>
                            {batch.groupingKey ?? "default"}
                          </div>
                          {batch.crmId ? (
                            <div className="mt-1 text-xs text-gray-500">
                              {batch.clientName ? `${batch.clientName} · ` : ""}{batch.crmId}
                            </div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{batch.shipmentCountActual}</div>
                          <div className="text-xs text-gray-500">{batch.pendingShipmentCount} pending</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(batch.status)}>
                            {compact(batch.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(batch.createdAt)}</TableCell>
                        <TableCell>{batch.cutoffApplied ? "Yes" : "No"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={readinessBadgeClass(batch.readiness)}>
                            {batch.readinessPercent}% {batch.readiness}
                          </Badge>
                          {batch.lateShipmentCount > 0 ? (
                            <div className="mt-1 text-xs text-red-600">{batch.lateShipmentCount} late</div>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-gray-300 bg-white text-gray-700"
                              onClick={() => setSelectedBatchId(batch.batchId)}
                              title="View batch"
                            >
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="outline"
                              className="h-8 w-8 border-amber-300 bg-amber-50 text-amber-700"
                              disabled={batch.status !== "OPEN" || actionBatchId === batch.batchId}
                              onClick={() => void forceCloseBatch(batch)}
                              title="Force close batch"
                            >
                              <Lock className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {batchData?.batches.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="py-10 text-center text-sm text-gray-500">
                          No batches for this operational date.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>

              <div className="space-y-5">
                <div className="rounded-md border bg-white">
                  <div className="border-b px-4 py-3">
                    <h2 className="text-base font-semibold text-gray-950">Selected Batch</h2>
                  </div>
                  <div className="space-y-3 p-4 text-sm">
                    {selectedBatch ? (
                      <>
                        <InfoRow label="Batch ID" value={selectedBatch.batchId} mono />
                        <InfoRow label="Status" value={selectedBatch.status ?? "-"} />
                        <InfoRow label="Grouping" value={selectedBatch.groupingKey ?? "default"} mono />
                        <InfoRow label="Client" value={selectedBatch.clientName ? `${selectedBatch.clientName} · ${selectedBatch.crmId}` : selectedBatch.crmId ?? "-"} />
                        <InfoRow label="Shipments" value={`${selectedBatch.shipmentCountActual} total, ${selectedBatch.pendingShipmentCount} pending`} />
                        <InfoRow label="Readiness" value={`${selectedBatch.readinessPercent}% ${selectedBatch.readiness}`} />
                        <InfoRow label="Closing At" value={formatDateTime(selectedBatch.closingAt)} />
                      </>
                    ) : (
                      <div className="text-gray-500">No batch selected.</div>
                    )}
                  </div>
                </div>

                <div className="rounded-md border bg-white">
                  <div className="flex items-center justify-between border-b px-4 py-3">
                    <h2 className="text-base font-semibold text-gray-950">Late Shipments</h2>
                    <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
                      {batchData?.lateShipments.length ?? 0}
                    </Badge>
                  </div>
                  <div className="max-h-[360px] overflow-auto">
                    {(batchData?.lateShipments ?? []).map((shipment) => (
                      <button
                        type="button"
                        key={shipment.id}
                        className="block w-full border-b px-4 py-3 text-left last:border-0 hover:bg-gray-50"
                        onClick={() => {
                          setSelectedShipmentId(shipment.id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-sm text-gray-900">{shipment.parcelId}</span>
                          <span className="text-xs text-gray-500">{formatDateTime(shipment.createdAt)}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Order {compact(shipment.orderId)} · Batch {compact(shipment.batchId)}
                        </div>
                      </button>
                    ))}
                    {batchData?.lateShipments.length === 0 ? (
                      <div className="px-4 py-8 text-sm text-gray-500">No late shipments for this date.</div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="manifests" className="mt-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
              <div className="rounded-md border bg-white">
                <div className="border-b px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-950">Manifest Viewer</h2>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Manifest ID</TableHead>
                      <TableHead>Batch ID</TableHead>
                      <TableHead>Parcels</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Verification</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead className="text-right">Document</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(manifestData?.manifests ?? []).map((manifest) => (
                      <TableRow
                        key={manifest.manifestId}
                        data-state={manifest.manifestId === selectedManifestId ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedManifestId(manifest.manifestId)}
                      >
                        <TableCell className="max-w-[280px] truncate font-mono text-xs font-medium">
                          {manifest.manifestId}
                        </TableCell>
                        <TableCell className="font-mono">{compact(manifest.batchId)}</TableCell>
                        <TableCell>
                          <div>{manifest.parcelCountExpected} expected</div>
                          <div className="text-xs text-gray-500">{compact(manifest.parcelCountActual, "pending")} actual</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(manifest.status)}>
                            {compact(manifest.status)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={verificationBadgeClass(manifest.verificationStatus)}>
                            {compact(manifest.verificationStatus, "pending")}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(manifest.createdAt)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            {manifest.documentUrl ? (
                              <Button asChild size="icon" variant="outline" className="h-8 w-8 border-gray-300 bg-white text-gray-700">
                                <Link href={manifest.documentUrl} target="_blank" rel="noopener noreferrer" title="Download document">
                                  <Download className="h-4 w-4" aria-hidden="true" />
                                </Link>
                              </Button>
                            ) : (
                              <span className="text-sm text-gray-400">-</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {manifestData?.manifests.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-gray-500">
                          No manifests found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-md border bg-white">
                <div className="border-b px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-950">Manifest Detail</h2>
                </div>
                {manifestDetail ? (
                  <div className="space-y-5 p-4">
                    <div className="space-y-3 text-sm">
                      <InfoRow label="Manifest ID" value={manifestDetail.manifest.manifestId} mono />
                      <InfoRow label="Batch ID" value={manifestDetail.manifest.batchId ?? "-"} mono />
                      <InfoRow label="Expected" value={`${manifestDetail.manifest.parcelCountExpected} parcels`} />
                      <InfoRow label="Actual" value={`${compact(manifestDetail.manifest.parcelCountActual, "pending")} parcels`} />
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-gray-500">Verification</span>
                        <Badge variant="outline" className={verificationBadgeClass(manifestDetail.manifest.verificationStatus)}>
                          {compact(manifestDetail.manifest.verificationStatus, "pending")}
                        </Badge>
                      </div>
                    </div>

                    <div className="rounded-md border border-gray-200">
                      <div className="border-b bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">Parcel List</div>
                      <div className="max-h-[260px] overflow-auto">
                        {(manifestDetail.parcels ?? []).map((shipment) => (
                          <div key={shipment.id} className="border-b px-3 py-2 last:border-0">
                            <div className="truncate font-mono text-xs text-gray-900">{shipment.parcelId}</div>
                            <div className="mt-1 flex justify-between gap-2 text-xs text-gray-500">
                              <span>{compact(shipment.trackingNumber)}</span>
                              <span>{shipment.isManifested ? "manifested" : "pending"}</span>
                            </div>
                          </div>
                        ))}
                        {manifestDetail.parcels.length === 0 ? (
                          <div className="px-3 py-8 text-sm text-gray-500">No local parcels attached.</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="rounded-md border border-gray-200">
                      <div className="border-b bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">Error Panel</div>
                      <div className="max-h-[180px] overflow-auto p-3 text-sm">
                        {manifestDetail.atRiskParcelIds.length > 0 ? (
                          <div className="space-y-2">
                            {manifestDetail.atRiskParcelIds.map((parcelId) => (
                              <div key={parcelId} className="rounded border border-red-200 bg-red-50 px-2 py-1 font-mono text-xs text-red-700">
                                {parcelId}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-gray-500">No local parcel gap detected.</div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-sm text-gray-500">No manifest selected.</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="shipments" className="mt-5">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
              <div className="rounded-md border bg-white">
                <div className="border-b px-4 py-3">
                  <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-gray-950">Shipment Inspector</h2>
                      <p className="text-sm text-gray-500">Filtered by selected date, client, and batch.</p>
                    </div>
                    <div className="flex gap-2 sm:min-w-[420px]">
                      <Input
                        value={shipmentQuery}
                        onChange={(event) => setShipmentQuery(event.target.value)}
                        placeholder="order, parcel, tracking, manifest"
                        className="h-9 border-gray-300 bg-white"
                      />
                      <Button type="submit" className="h-9 gap-2 bg-gray-900 text-white hover:bg-gray-800" disabled={searching}>
                        <Search className="h-4 w-4" aria-hidden="true" />
                        Search
                      </Button>
                    </div>
                  </form>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Client</TableHead>
                      <TableHead>Parcel ID</TableHead>
                      <TableHead>Tracking</TableHead>
                      <TableHead>Batch</TableHead>
                      <TableHead>Manifest</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(shipmentSearch?.shipments ?? []).map((shipment) => (
                      <TableRow
                        key={shipment.id}
                        data-state={shipment.id === selectedShipmentId ? "selected" : undefined}
                        className="cursor-pointer"
                        onClick={() => setSelectedShipmentId(shipment.id)}
                      >
                        <TableCell>{compact(shipment.orderId)}</TableCell>
                        <TableCell>
                          <div className="max-w-[220px] truncate">{compact(shipment.clientName ?? shipment.crmId)}</div>
                          {shipment.clientName && shipment.crmId ? (
                            <div className="text-xs text-gray-500">{shipment.crmId}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate font-mono text-xs">{shipment.parcelId}</TableCell>
                        <TableCell className="max-w-[220px] truncate">{compact(shipment.trackingNumber)}</TableCell>
                        <TableCell className="font-mono">{compact(shipment.batchId)}</TableCell>
                        <TableCell className="max-w-[220px] truncate font-mono text-xs">{compact(shipment.manifestId)}</TableCell>
                        <TableCell>{formatDateTime(shipment.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                    {shipmentSearch?.shipments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-10 text-center text-sm text-gray-500">
                          No shipments found.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>

              <div className="rounded-md border bg-white">
                <div className="border-b px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-950">Shipment Detail</h2>
                </div>
                {selectedShipment ? (
                  <div className="space-y-5 p-4">
                    <div className="space-y-3 text-sm">
                      <InfoRow label="Order ID" value={selectedShipment.orderId ?? "-"} />
                      <InfoRow label="Client" value={selectedShipment.clientName ? `${selectedShipment.clientName} · ${selectedShipment.crmId}` : selectedShipment.crmId ?? "-"} />
                      <InfoRow label="Parcel ID" value={selectedShipment.parcelId} mono />
                      <InfoRow label="Tracking" value={selectedShipment.trackingNumber ?? "-"} />
                      <InfoRow label="Batch ID" value={selectedShipment.batchId ?? "-"} mono />
                      <InfoRow label="Manifest ID" value={selectedShipment.manifestId ?? "-"} mono />
                      <InfoRow label="Shipping" value={selectedShipment.shippingMethod ?? "-"} />
                      <InfoRow label="Created" value={formatDateTime(selectedShipment.createdAt)} />
                    </div>

                    <div className="rounded-md border border-gray-200">
                      <div className="border-b bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700">Timeline</div>
                      <div className="space-y-3 p-3 text-sm">
                        <TimelineItem label="Created" complete={!!selectedShipment.createdAt} value={formatDateTime(selectedShipment.createdAt)} />
                        <TimelineItem label="Batched" complete={!!selectedShipment.batchId} value={compact(selectedShipment.batchId)} />
                        <TimelineItem label="Manifested" complete={!!selectedShipment.manifestId || selectedShipment.isManifested} value={compact(selectedShipment.manifestId)} />
                        <TimelineItem
                          label="Verified"
                          complete={selectedShipmentManifest?.verificationStatus === "matched"}
                          warning={selectedShipmentManifest?.verificationStatus === "mismatch"}
                          value={compact(selectedShipmentManifest?.verificationStatus, "pending")}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 text-sm text-gray-500">No shipment selected.</div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="settings" className="mt-5">
            <div className="grid gap-5 lg:grid-cols-2">
              <SettingsPanel
                title="Time Controls"
                rows={[
                  ["Cutoff time", flagsData?.flags.cutoff_time],
                  ["Cutoff timezone", flagsData?.flags.cutoff_timezone],
                  ["Manifest trigger", flagsData?.flags.manifest_trigger_time],
                  ["Trigger timezone", flagsData?.flags.manifest_trigger_timezone],
                  ["Batch interval", `${compact(flagsData?.flags.batch_interval_hours)} hours`],
                ]}
              />
              <SettingsPanel
                title="Grouping Controls"
                rows={[
                  ["Separate by service", flagsData?.flags.enable_service_separation],
                  ["Separate by client", flagsData?.flags.enable_client_separation],
                  ["Late shipment mode", flagsData?.flags.late_shipment_mode],
                  ["Shipment threshold", flagsData?.flags.shipment_threshold],
                ]}
              />
              <SettingsPanel
                title="Safety Flags"
                rows={[
                  ["Dry-run mode", flagsData?.flags.dry_run_manifest],
                  ["Dry-run email", flagsData?.flags.dry_run_manifest_send_email],
                  ["Retention days", flagsData?.flags.retention_days],
                ]}
              />
              <div className="rounded-md border bg-white">
                <div className="border-b px-4 py-3">
                  <h2 className="text-base font-semibold text-gray-950">Access</h2>
                </div>
                <div className="space-y-3 p-4 text-sm">
                  <InfoRow label="Flag source" value={flagsData?.source ?? "-"} />
                  <InfoRow label="Editable" value={flagsData?.editable ? "Yes" : "No"} />
                  <InfoRow label="Current role" value="Existing app session" />
                  <InfoRow label="Refreshed" value={formatDateTime(flagsData?.refreshedAt ?? null)} />
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

function InfoRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | number;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 text-gray-500">{label}</span>
      <span className={`min-w-0 text-right text-gray-900 ${mono ? "break-all font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}

function TimelineItem({
  label,
  complete,
  warning,
  value,
}: {
  label: string;
  complete: boolean;
  warning?: boolean;
  value: string | number;
}) {
  const Icon = warning ? AlertTriangle : complete ? CheckCircle2 : Clock3;
  const className = warning
    ? "text-red-700"
    : complete
      ? "text-emerald-700"
      : "text-gray-400";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
        {label}
      </span>
      <span className="max-w-[190px] truncate text-right text-gray-600">{value}</span>
    </div>
  );
}

function SettingsPanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, unknown]>;
}) {
  return (
    <div className="rounded-md border bg-white">
      <div className="border-b px-4 py-3">
        <h2 className="text-base font-semibold text-gray-950">{title}</h2>
      </div>
      <div className="divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
            <span className="text-gray-500">{label}</span>
            {typeof value === "boolean" ? (
              <BooleanFlag value={value} />
            ) : (
              <span className="text-right font-medium text-gray-900">{compact(value as string | number | null | undefined)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
