"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ObjectDetailPanel } from "./object-detail-panel";
import { useExplorer } from "@/components/shell/explorer-context";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";

interface ObjectDetailPageProps {
  summary: BundleObjectSummary;
  body: ObjectBody;
}

export function ObjectDetailPage({ summary, body }: ObjectDetailPageProps) {
  const { setSelectedId } = useExplorer();

  useEffect(() => {
    setSelectedId(summary.uuid);
  }, [summary.uuid, setSelectedId]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border bg-card/80 px-4 py-3 backdrop-blur-md">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Explorer
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">{summary.name}</h1>
      </header>
      <div className="relative flex flex-1 justify-end">
        <ObjectDetailPanel
          summary={summary}
          body={body}
          onClose={() => setSelectedId(null)}
        />
      </div>
    </div>
  );
}
