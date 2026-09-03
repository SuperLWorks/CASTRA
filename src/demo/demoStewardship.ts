export const DEMO_STEWARDSHIP_REVISION = "demo-stewardship.2026-08-11.r1" as const;

export interface DemoSyntheticMeasure {
  id: string;
  label: string;
  value: number;
  unit: "minor_currency" | "hours";
  provenance: "synthetic_demo_only";
  campaignReference: "C001";
  explanation: string;
}

export interface DemoSyntheticSeries {
  id: string;
  label: string;
  value: number;
  unit: "minor_currency" | "hours";
  provenance: "synthetic_demo_only";
}

export const DEMO_SYNTHETIC_MEASURES: readonly DemoSyntheticMeasure[] = [
  {
    id: "demo_synthetic_cost_total",
    label: "Demonstration cost",
    value: 124850,
    unit: "minor_currency",
    provenance: "synthetic_demo_only",
    campaignReference: "C001",
    explanation: "Synthetic Demo-only total used to demonstrate stewardship graphics; it is not a CASTRA actual, allocation, estimate, subscription charge, or provider fact.",
  },
  {
    id: "demo_synthetic_effort_total",
    label: "Demonstration effort",
    value: 126.5,
    unit: "hours",
    provenance: "synthetic_demo_only",
    campaignReference: "C001",
    explanation: "Synthetic Demo-only effort used to demonstrate stewardship graphics; it is not observed runtime or an authoritative labor record.",
  },
] as const;

export const DEMO_SYNTHETIC_COST_SERIES: readonly DemoSyntheticSeries[] = [
  { id: "demo_cost_discovery", label: "Discovery", value: 14850, unit: "minor_currency", provenance: "synthetic_demo_only" },
  { id: "demo_cost_build", label: "Build", value: 52300, unit: "minor_currency", provenance: "synthetic_demo_only" },
  { id: "demo_cost_verification", label: "Verification", value: 33700, unit: "minor_currency", provenance: "synthetic_demo_only" },
  { id: "demo_cost_release", label: "Release preparation", value: 24000, unit: "minor_currency", provenance: "synthetic_demo_only" },
] as const;

export const DEMO_SYNTHETIC_EFFORT_SERIES: readonly DemoSyntheticSeries[] = [
  { id: "demo_effort_discovery", label: "Discovery", value: 18.5, unit: "hours", provenance: "synthetic_demo_only" },
  { id: "demo_effort_build", label: "Build", value: 54, unit: "hours", provenance: "synthetic_demo_only" },
  { id: "demo_effort_verification", label: "Verification", value: 35, unit: "hours", provenance: "synthetic_demo_only" },
  { id: "demo_effort_release", label: "Release preparation", value: 19, unit: "hours", provenance: "synthetic_demo_only" },
] as const;

export function demoSyntheticMeasure(id: string): DemoSyntheticMeasure {
  const measure = DEMO_SYNTHETIC_MEASURES.find((item) => item.id === id);
  if (!measure) throw new Error(`Unknown Demo synthetic measure: ${id}`);
  return measure;
}

