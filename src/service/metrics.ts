/**
 * Prometheus text-format metrics (spec 05 §7). Every label value comes from a closed set (outcomes,
 * reason codes, configured brands or "invalid"), so no client can grow the series without bound.
 */

export type Outcome = "ok" | "declined" | "invalid" | "unavailable";

export const LATENCY_BUCKETS_MS = [1, 2, 5, 10, 25, 50, 100] as const;

export class Metrics {
  private readonly requests = new Map<string, { labels: { outcome: Outcome; reason: string; brand: string }; count: number }>();
  private readonly bucketCounts = new Array<number>(LATENCY_BUCKETS_MS.length).fill(0);
  private latencySum = 0;
  private latencyCount = 0;
  private indexVersion: string | null = null;

  countRequest(outcome: Outcome, reason: string, brand: string): void {
    const key = `${outcome}\u0000${reason}\u0000${brand}`;
    const entry = this.requests.get(key) ?? { labels: { outcome, reason, brand }, count: 0 };
    entry.count++;
    this.requests.set(key, entry);
  }

  observeLatency(ms: number): void {
    this.latencySum += ms;
    this.latencyCount++;
    LATENCY_BUCKETS_MS.forEach((le, i) => {
      if (ms <= le) this.bucketCounts[i] = (this.bucketCounts[i] as number) + 1;
    });
  }

  setIndexVersion(version: string | null): void {
    this.indexVersion = version;
  }

  render(): string {
    const lines: string[] = [
      "# HELP recs_requests_total Related-games requests by outcome, reason and brand.",
      "# TYPE recs_requests_total counter",
    ];
    const sorted = [...this.requests.values()].sort((a, b) => labelText(a.labels).localeCompare(labelText(b.labels)));
    for (const { labels, count } of sorted) lines.push(`recs_requests_total{${labelText(labels)}} ${count}`);

    lines.push("# HELP recs_latency_ms Related-games request latency in milliseconds.", "# TYPE recs_latency_ms histogram");
    LATENCY_BUCKETS_MS.forEach((le, i) => lines.push(`recs_latency_ms_bucket{le="${le}"} ${this.bucketCounts[i]}`));
    lines.push(`recs_latency_ms_bucket{le="+Inf"} ${this.latencyCount}`, `recs_latency_ms_sum ${this.latencySum}`, `recs_latency_ms_count ${this.latencyCount}`);

    lines.push("# HELP recs_index_info The loaded index version (1 when loaded).", "# TYPE recs_index_info gauge");
    if (this.indexVersion) lines.push(`recs_index_info{version="${escapeLabel(this.indexVersion)}"} 1`);
    return `${lines.join("\n")}\n`;
  }
}

const escapeLabel = (v: string): string => v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
const labelText = (labels: Record<string, string>): string =>
  Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",");
