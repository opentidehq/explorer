"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ObjectDetailPanel } from "./object-detail-panel";
import { useExplorer } from "@/components/shell/explorer-context";

export function ObjectDetailPage({ uuid }: { uuid: string }) {
  const { getSummary, bundle, setSelectedId } = useExplorer();
  const summary = getSummary(uuid);
  const body = bundle.flatIndex[uuid];

  useEffect(() => {
    if (!summary) return;
    setSelectedId(summary.uuid);
  }, [summary, setSelectedId]);

  if (!summary || !body) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-xl font-semibold">Object not found</h1>
          <Link href="/" className="mt-4 text-primary hover:underline">
            Back to explorer
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Explorer
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">{summary.name}</h1>
      </header>
      <div className="relative flex flex-1 justify-end">
        <ObjectDetailPanel summary={summary} body={body} />
      </div>
    </div>
  );
}
