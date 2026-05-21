"use client";

import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  commitmentAnalytics,
  type CommitmentAnalytics,
  type CommitmentCommunicationStatus,
  type CommitmentOrigin,
  type OpenThread,
} from "@related/shared";
import { getBrowserDeps } from "@/lib/deps/client";
import {
  AnalyticTile,
  Badge,
  Button,
  AnalyticsRow,
  DataGrid,
  Display,
  EmptyState,
  Eyebrow,
  Mono,
  Pill,
  Select,
} from "@/components/ui";
import type { DataGridColumn } from "@/components/ui";

type OriginFilter = "all" | CommitmentOrigin | "unset";
type StatusFilter = "all" | CommitmentCommunicationStatus;

interface Props {
  initialCommitments: OpenThread[];
  initialAnalytics: CommitmentAnalytics;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CommitmentsView({
  initialCommitments,
  initialAnalytics,
}: Props) {
  const deps = getBrowserDeps();
  const [commitments, setCommitments] = useState(initialCommitments);
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const [origin, setOrigin] = useState<OriginFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const rows = useMemo(() => {
    return commitments.filter((c) => {
      if (origin !== "all") {
        if (origin === "unset") {
          if (c.origin !== null) return false;
        } else if (c.origin !== origin) return false;
      }
      if (status !== "all" && c.communicationStatus !== status) return false;
      return true;
    });
  }, [commitments, origin, status]);

  function recompute(next: OpenThread[]) {
    setCommitments(next);
    setAnalytics(commitmentAnalytics({ commitments: next }));
  }

  async function setRowOrigin(id: string, value: CommitmentOrigin | "") {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      origin: value === "" ? null : value,
    });
    recompute(commitments.map((c) => (c.id === id ? updated : c)));
  }

  async function setRowStatus(id: string, value: CommitmentCommunicationStatus) {
    const updated = await deps.openThreads.setCommitmentMeta(id, {
      communicationStatus: value,
    });
    recompute(commitments.map((c) => (c.id === id ? updated : c)));
  }

  async function closeRow(id: string) {
    await deps.openThreads.closeOpenThread(id);
    recompute(commitments.filter((c) => c.id !== id));
  }

  const columns: DataGridColumn<OpenThread>[] = [
    {
      key: "description",
      header: "What I owe",
      width: "minmax(240px, 2fr)",
      cell: (c) => <span className="text-fg">{c.description}</span>,
    },
    {
      key: "origin",
      header: "Origin",
      width: "180px",
      cell: (c) => (
        <Select
          value={c.origin ?? ""}
          onChange={(e) =>
            setRowOrigin(c.id, e.target.value as CommitmentOrigin | "")
          }
        >
          <option value="">Unset</option>
          <option value="asked_of_me">Asked of me</option>
          <option value="self_led">Self-led</option>
        </Select>
      ),
    },
    {
      key: "status",
      header: "Communication",
      width: "200px",
      cell: (c) => (
        <Select
          value={c.communicationStatus}
          onChange={(e) =>
            setRowStatus(
              c.id,
              e.target.value as CommitmentCommunicationStatus,
            )
          }
        >
          <option value="not_communicated">Not communicated</option>
          <option value="confirmed">Confirmed</option>
        </Select>
      ),
    },
    {
      key: "created",
      header: "Opened",
      width: "120px",
      mono: true,
      align: "right",
      cell: (c) => fmtDate(c.createdAt),
    },
    {
      key: "close",
      header: "",
      width: "100px",
      align: "right",
      cell: (c) => (
        <Button
          variant="ghost"
          size="sm"
          leading={<CheckCircle2 size={14} />}
          onClick={() => closeRow(c.id)}
        >
          Close
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <Eyebrow>Open threads I owe</Eyebrow>
        <Display className="mt-1">Commitments</Display>
      </header>

      <AnalyticsRow>
        <AnalyticTile label="Open" value={<Mono>{analytics.total}</Mono>} />
        <AnalyticTile
          label="Asked of me"
          value={<Mono>{analytics.byOrigin.askedOfMe}</Mono>}
        />
        <AnalyticTile
          label="Self-led"
          value={<Mono>{analytics.byOrigin.selfLed}</Mono>}
        />
        <AnalyticTile
          label="Not yet communicated"
          value={<Mono>{analytics.byCommunicationStatus.notCommunicated}</Mono>}
        />
      </AnalyticsRow>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
            Origin
          </span>
          <Pill active={origin === "all"} onClick={() => setOrigin("all")}>
            All
          </Pill>
          <Pill
            active={origin === "asked_of_me"}
            onClick={() => setOrigin("asked_of_me")}
          >
            Asked of me
          </Pill>
          <Pill
            active={origin === "self_led"}
            onClick={() => setOrigin("self_led")}
          >
            Self-led
          </Pill>
          <Pill
            active={origin === "unset"}
            onClick={() => setOrigin("unset")}
          >
            Unset
          </Pill>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.08em] text-fg-subtle">
            Status
          </span>
          <Pill active={status === "all"} onClick={() => setStatus("all")}>
            All
          </Pill>
          <Pill
            active={status === "not_communicated"}
            onClick={() => setStatus("not_communicated")}
          >
            Not communicated
          </Pill>
          <Pill
            active={status === "confirmed"}
            onClick={() => setStatus("confirmed")}
          >
            Confirmed
          </Pill>
        </div>
      </div>

      <DataGrid
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        emptyState={
          <EmptyState
            title={
              commitments.length === 0
                ? "No open commitments"
                : "No commitments match these filters"
            }
            description={
              commitments.length === 0
                ? "Commitments born from an Agent Pass or captured directly appear here."
                : "Try clearing one of the filters above."
            }
          />
        }
      />
    </div>
  );
}
