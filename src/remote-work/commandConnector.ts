export type CommandConnectorOperation =
  | "read_status"
  | "list_results"
  | "create_draft_proposal"
  | "submit_confirmed_low_risk_draft"
  | "cancel_confirmed_request";

export const commandConnectorContract = {
  version: "castra-command-connector/1.0.0" as const,
  allowedOperations: [
    "read_status",
    "list_results",
    "create_draft_proposal",
    "submit_confirmed_low_risk_draft",
    "cancel_confirmed_request",
  ] as const,
  prohibitedAuthorities: [
    "raw_database",
    "raw_queue",
    "raw_ollama",
    "companion_device",
    "file",
    "terminal",
    "browser",
    "tool",
    "credential",
    "authoritative_record_mutation",
  ] as const,
  confirmation: "The Commander must see and freshly confirm the exact content hash, target, Low-risk draft-only activity, one runtime/model-policy selection, expiry, and proposal-only authority before submission.",
  runtimeBoundary: "Codex/ChatGPT subscription handoff, Claude Code subscription handoff, and local Ollama are distinct selections. A subscription may be an approved human handoff target; this contract assumes no programmatic driving or API access.",
};

export interface CommandConnectorRequest {
  operation: string;
  commanderConfirmed: boolean;
  proposalOnly: boolean;
  risk: "low" | "medium" | "high";
  exactContentHash: string;
}

export function validateCommandConnectorRequest(request: CommandConnectorRequest): string[] {
  const reasons: string[] = [];
  if (!commandConnectorContract.allowedOperations.includes(request.operation as CommandConnectorOperation)) reasons.push("Operation is outside the narrow Command Connector allowlist.");
  if (["submit_confirmed_low_risk_draft", "cancel_confirmed_request"].includes(request.operation) && !request.commanderConfirmed) reasons.push("Fresh Commander confirmation is required for submit or cancel.");
  if (!request.proposalOnly) reasons.push("Command Connector authority is proposal-only.");
  if (request.risk !== "low") reasons.push("Only Low-risk draft-only work is allowed.");
  if (!/^sha256-v1:[a-f0-9]{64}$/.test(request.exactContentHash)) reasons.push("A valid exact-content SHA-256 binding is required.");
  return reasons;
}
