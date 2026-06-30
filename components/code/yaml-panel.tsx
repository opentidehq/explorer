"use client";

import { stringify } from "yaml";
import { CodeBlock } from "./code-block";

interface YamlPanelProps {
  data: Record<string, unknown>;
  variant?: "default" | "plain";
}

export function YamlPanel({ data, variant = "default" }: YamlPanelProps) {
  const yaml = stringify(data);
  return <CodeBlock code={yaml} language="yaml" variant={variant} />;
}
