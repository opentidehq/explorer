"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ObjectDetailPanel } from "./object-detail-panel";
import { useExplorer } from "@/components/shell/explorer-context";
import type { BundleObjectSummary, ObjectBody } from "@/lib/opentide/types";
import { useEffect } from "react";

interface ObjectDetailPageProps {
  summary: BundleObjectSummary;
  body: ObjectBody;
  routeType: string;
}

export function ObjectDetailPage({ summary, body }: ObjectDetailPageProps) {
  const { setFocusId, pushBreadcrumb } = useExplorer();

  useEffect(() => {
    setFocusId(summary.uuid);
    pushBreadcrumb(summary);
  }, [summary, setFocusId, pushBreadcrumb]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center gap-4 border-b border-border p-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Explorer
          </Link>
        </Button>
        <h1 className="text-lg font-semibold">{summary.name}</h1>
      </header>
      <div className="flex flex-1 justify-end">
        <ObjectDetailPanel summary={summary} body={body} />
      </div>
    </div>
  );
}
