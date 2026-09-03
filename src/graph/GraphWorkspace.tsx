import { useMemo, useState } from "react";
import { buildGraphSourceBundle } from "../domain/graphify";
import type { GraphCategory, GraphEdge, GraphNode, GraphProvenance, GraphSourceReference } from "../domain/graphify";
import type { CastraState } from "../domain/types";

const provenanceOrder: GraphProvenance[] = ["evidenced", "approved", "proposed", "unknown/gap", "retired"];
const categories: GraphCategory[] = ["work", "testing", "aerarium", "configuration", "role", "approval", "audit", "evidence", "gap"];
const laneFor: Record<GraphCategory, number> = {
  work: 0, role: 0, testing: 1, aerarium: 2, configuration: 2,
  approval: 3, audit: 3, evidence: 3, gap: 4,
};
const laneLabels = ["WORK / ROLES", "TEST & PUNCH", "AERARIUM / CONFIG", "EVIDENCE / AUTHORITY", "GAPS"];

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function compact(value: string, length = 28): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function Sources({ items }: { items: GraphSourceReference[] }) {
  return <div className="graph-source-list">{items.map((item, index) => (
    <div key={`${item.sourceType}:${item.sourceId}:${item.path}:${index}`}>
      <code>{item.sourceType}:{item.sourceId} · {item.path}</code><span>{item.label}</span>
    </div>
  ))}</div>;
}

function exportBundle(bundle: ReturnType<typeof buildGraphSourceBundle>): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `castra-graph-source-bundle-${bundle.generatedAt.slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function GraphMap({ nodes, edges, selectedId, select }: {
  nodes: GraphNode[]; edges: GraphEdge[]; selectedId: string | null; select: (id: string) => void;
}) {
  const positioned = useMemo(() => {
    const counts = [0, 0, 0, 0, 0];
    return nodes.map((node) => {
      const lane = laneFor[node.category];
      const positionedNode = { node, x: 28 + lane * 232, y: 54 + counts[lane] * 76 };
      counts[lane] += 1;
      return positionedNode;
    });
  }, [nodes]);
  const positions = new Map(positioned.map((item) => [item.node.id, item]));
  const height = Math.max(510, ...[0, 1, 2, 3, 4].map((lane) => positioned.filter((item) => laneFor[item.node.category] === lane).length * 76 + 86));
  if (!nodes.length) return <div className="inline-empty">No nodes match the current read-only filters.</div>;
  return <div className="graph-map-scroll" aria-label="Read-only Castra relationship graph">
    <svg className="graph-map" viewBox={`0 0 1160 ${height}`} role="img" aria-labelledby="graph-map-title">
      <title id="graph-map-title">Castra evidence-first relationship graph</title>
      <defs><marker id="graph-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 z" /></marker></defs>
      {laneLabels.map((lane, index) => <g key={lane}>
        <text className="graph-lane-label" x={28 + index * 232} y={25}>{lane}</text>
        <line className="graph-lane-rule" x1={22 + index * 232} x2={216 + index * 232} y1={34} y2={34} />
      </g>)}
      <g>{edges.map((edge) => {
        const from = positions.get(edge.from); const to = positions.get(edge.to);
        if (!from || !to) return null;
        return <line key={edge.id} className={`graph-edge provenance-${edge.provenance.replace("/", "-")}`}
          x1={from.x + 88} y1={from.y + 26} x2={to.x + 88} y2={to.y + 26} markerEnd="url(#graph-arrow)">
          <title>{edge.relation}: {edge.explanation}</title>
        </line>;
      })}</g>
      <g>{positioned.map(({ node, x, y }) => <g key={node.id} role="button" tabIndex={0}
        aria-label={`${node.label}, ${node.provenance}`}
        className={`graph-node provenance-${node.provenance.replace("/", "-")} ${selectedId === node.id ? "selected" : ""}`}
        transform={`translate(${x} ${y})`} onClick={() => select(node.id)}
        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") select(node.id); }}>
        <rect width="176" height="52" rx="2" />
        <text className="graph-node-type" x="10" y="15">{compact(node.sourceType.toUpperCase(), 24)}</text>
        <text className="graph-node-label" x="10" y="34">{compact(node.label)}</text>
        <circle cx="163" cy="13" r="4" />
      </g>)}</g>
    </svg>
  </div>;
}

function Inspector({ node, edges }: { node: GraphNode | null; edges: GraphEdge[] }) {
  if (!node) return <aside className="graph-inspector empty"><span className="eyebrow">Source inspector</span><h2>Select a node</h2><p>Every node and relationship exposes the exact Castra source field that caused it to exist.</p></aside>;
  return <aside className="graph-inspector">
    <div className="graph-inspector-heading"><div><span className="eyebrow">{node.category}</span><h2>{node.label}</h2></div><span className={`graph-provenance provenance-${node.provenance.replace("/", "-")}`}>{node.provenance}</span></div>
    <code className="graph-stable-id">{node.id}</code><p>{node.explanation}</p>
    <h3>Authoritative source</h3><Sources items={node.sourceReferences} />
    {!!Object.keys(node.attributes).length && <><h3>Preserved fields</h3><div className="graph-attributes">{Object.entries(node.attributes).map(([key, value]) => <div key={key}><span>{title(key)}</span><strong>{value === null || value === "" ? "unavailable" : String(value)}</strong></div>)}</div></>}
    <h3>Why connected ({edges.length})</h3>
    {!edges.length ? <small>No relationships were derived for this record.</small> : <div className="graph-relationship-list">{edges.map((edge) => <article key={edge.id}>
      <div><strong>{title(edge.relation)}</strong><span className={`graph-provenance provenance-${edge.provenance.replace("/", "-")}`}>{edge.provenance}</span></div>
      <code>{edge.from === node.id ? `to ${edge.to}` : `from ${edge.from}`}</code><p>{edge.explanation}</p><Sources items={edge.sourceReferences} />
    </article>)}</div>}
  </aside>;
}

export function GraphWorkspace({ state, embedded = false, openSource }: {
  state: CastraState;
  embedded?: boolean;
  openSource?: (sourceType: string, sourceId: string) => void;
}) {
  const [generatedAt] = useState(() => new Date().toISOString());
  const bundle = useMemo(() => buildGraphSourceBundle(state, generatedAt), [generatedAt, state]);
  const [provenance, setProvenance] = useState<Set<GraphProvenance>>(() => new Set(provenanceOrder));
  const [category, setCategory] = useState<GraphCategory | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const visibleNodes = bundle.nodes.filter((node) => provenance.has(node.provenance) && (category === "all" || node.category === category) && (showAudit || node.category !== "audit") && (showEvidence || node.category !== "evidence"));
  const visibleIds = new Set(visibleNodes.map((node) => node.id));
  const visibleEdges = bundle.edges.filter((edge) => visibleIds.has(edge.from) && visibleIds.has(edge.to));
  const selectedNode = bundle.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedEdges = selectedNode ? bundle.edges.filter((edge) => edge.from === selectedNode.id || edge.to === selectedNode.id) : [];
  function toggleProvenance(value: GraphProvenance): void {
    setProvenance((current) => { const next = new Set(current); if (next.has(value)) next.delete(value); else next.add(value); return next; });
  }
  function inspectGap(gap: (typeof bundle.gaps)[number]): void {
    if (gap.governedNodeId) setSelectedId(gap.governedNodeId);
    const sourceReference = gap.sourceReferences.find((item) => ["campaign", "mission", "action", "test_plan", "punch_item", "ui_review_checkpoint"].includes(item.sourceType));
    if (sourceReference && openSource) openSource(sourceReference.sourceType, sourceReference.sourceId);
  }
  return <>
    <div className={`page-heading graph-title ${embedded ? "embedded" : ""}`}><div><span className="eyebrow">Evidence-first source projection</span><h1>{embedded ? "Relationship view" : "Commander Graph"}</h1><p>Read-only relationships derived from authoritative local Castra records. No Graphify service, AI enrichment, write-back, or external source resolution is connected.</p></div>
      <div className="graph-heading-actions"><span className="integrity-mark">CASTRA AUTHORITATIVE · READ ONLY</span><button className="button button-primary" onClick={() => exportBundle(bundle)}>Export JSON source bundle</button></div></div>
    <div className="graph-summary">
      <div><span>Bundle contract</span><strong>v{bundle.contractVersion}</strong><small>{bundle.contract}</small></div>
      <div><span>Source nodes</span><strong>{bundle.nodes.length}</strong><small>Stable IDs + field references</small></div>
      <div><span>Relationships</span><strong>{bundle.edges.length}</strong><small>Every edge explains why</small></div>
      <div className={bundle.gaps.length ? "attention" : ""}><span>Visible gaps</span><strong>{bundle.gaps.length}</strong><small>Deterministic checks only</small></div>
    </div>
    <section className="graph-contract-note"><strong>Graphify-ready contract · not connected</strong><span>The export is a one-way source bundle. Graph interactions and downloads never call a Castra command or update IndexedDB.</span></section>
    <div className="graph-toolbar"><div className="graph-provenance-filters" aria-label="Provenance filters">{provenanceOrder.map((item) => <button key={item} className={`graph-filter provenance-${item.replace("/", "-")} ${provenance.has(item) ? "active" : ""}`} aria-pressed={provenance.has(item)} onClick={() => toggleProvenance(item)}><span />{item}</button>)}</div>
      <label>Category<select value={category} onChange={(event) => setCategory(event.target.value as GraphCategory | "all")}><option value="all">All categories</option>{categories.map((item) => <option key={item} value={item}>{title(item)}</option>)}</select></label>
      <label className="toggle"><input type="checkbox" checked={showEvidence} onChange={(event) => setShowEvidence(event.target.checked)} /> Evidence nodes</label><label className="toggle"><input type="checkbox" checked={showAudit} onChange={(event) => setShowAudit(event.target.checked)} /> Audit nodes</label>
    </div>
    <div className="graph-layout"><GraphMap nodes={visibleNodes} edges={visibleEdges} selectedId={selectedId} select={setSelectedId} /><Inspector node={selectedNode} edges={selectedEdges} /></div>
    <div className="section-heading"><div><span className="eyebrow">Deterministic gap register</span><h2>Findings linked to governing records</h2></div><span className="integrity-mark">{bundle.gaps.filter((gap) => gap.severity === "blocking").length} BLOCKING · {bundle.gaps.filter((gap) => gap.severity === "attention").length} ATTENTION</span></div>
    {!bundle.gaps.length ? <div className="inline-empty">No gaps were produced by the declared Release 1 checks.</div> : <div className="graph-gap-list">{bundle.gaps.map((gap) => <article key={gap.id} className={`graph-gap ${gap.severity}`}><div><span>{title(gap.kind)}</span><strong>{gap.explanation}</strong><p>{gap.remediation}</p><Sources items={gap.sourceReferences} /></div>{gap.governedNodeId && <button className="button button-quiet" onClick={() => inspectGap(gap)}>Inspect governing record</button>}</article>)}</div>}
    <div className="section-heading"><div><span className="eyebrow">Declared logic</span><h2>Gap-check contract</h2></div></div>
    <div className="graph-rule-grid">{bundle.deterministicRules.map((rule) => <article key={rule.id}><span>{title(rule.id)}</span><p>{rule.description}</p></article>)}</div>
  </>;
}
