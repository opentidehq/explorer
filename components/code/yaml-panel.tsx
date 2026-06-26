"use client";

import { stringify } from "yaml";
import { CodeBlock } from "./code-block";

interface YamlPanelProps {
  data: Record<string, unknown>;
}

export function YamlPanel({ data }: YamlPanelProps) {
  const yaml = stringify(data);
  return <CodeBlock code={yaml} language="yaml" />;
}
