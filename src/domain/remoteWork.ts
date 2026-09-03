import type {
  AuditEvent,
  AuditKind,
  CastraState,
  CommandContext,
  LocalModelPolicyVersion,
  RemoteCompanionRegistration,
  RemoteEvidenceBuckets,
  RemoteRuntimeSelection,
  RemoteWorkCommand,
  RemoteWorkJob,
  RemoteWorkProposal,
  RemoteWorkReceipt,
} from "./types.js";

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const paddedLength = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const lengthView = new DataView(padded.buffer);
  const bitLength = bytes.length * 8;
  lengthView.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  lengthView.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const hash = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      schedule[index] = lengthView.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const a = schedule[index - 15];
      const b = schedule[index - 2];
      const s0 = rotateRight(a, 7) ^ rotateRight(a, 18) ^ (a >>> 3);
      const s1 = rotateRight(b, 17) ^ rotateRight(b, 19) ^ (b >>> 10);
      schedule[index] = (schedule[index - 16] + s0 + schedule[index - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + choice + SHA256_K[index] + schedule[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return [...hash].map((part) => part.toString(16).padStart(8, "0")).join("");
}

function requiredText(value: string, label: string, max = 4_000): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > max) throw new Error(`${label} must be ${max.toLocaleString()} characters or fewer.`);
  return normalized;
}

function instant(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be a valid timestamp.`);
  return parsed;
}

function runtimeSelection(selection: RemoteRuntimeSelection): RemoteRuntimeSelection {
  return {
    runtimeKind: selection.runtimeKind,
    runtimeReference: requiredText(selection.runtimeReference, "Runtime reference", 160),
    modelPolicyVersionId: requiredText(selection.modelPolicyVersionId, "Model-policy version reference", 180),
    selectedModelName: requiredText(selection.selectedModelName, "Selected model name", 180),
    selectedModelDigest: requiredText(selection.selectedModelDigest, "Selected model digest", 256),
  };
}

function canonicalProposal(input: Pick<RemoteWorkProposal, "source" | "sourceText" | "sourceReference" | "target" | "allowedActivity" | "riskTier" | "authority" | "runtimeSelection">): string {
  return JSON.stringify({
    source: input.source,
    sourceText: input.sourceText,
    sourceReference: input.sourceReference,
    target: { type: input.target.type, id: input.target.id },
    allowedActivity: input.allowedActivity,
    riskTier: input.riskTier,
    authority: input.authority,
    runtimeSelection: {
      runtimeKind: input.runtimeSelection.runtimeKind,
      runtimeReference: input.runtimeSelection.runtimeReference,
      modelPolicyVersionId: input.runtimeSelection.modelPolicyVersionId,
      selectedModelName: input.runtimeSelection.selectedModelName,
      selectedModelDigest: input.runtimeSelection.selectedModelDigest,
    },
  });
}

export function remoteProposalHash(proposal: Pick<RemoteWorkProposal, "source" | "sourceText" | "sourceReference" | "target" | "allowedActivity" | "riskTier" | "authority" | "runtimeSelection">): string {
  return `sha256-v1:${sha256(canonicalProposal(proposal))}`;
}

export function isRemoteWorkCommand(command: { type: string }): command is RemoteWorkCommand {
  return command.type.startsWith("remote_work.");
}

function appendAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: AuditKind,
  entityType: AuditEvent["entityType"],
  entityId: string,
  summary: string,
  detail: Record<string, string>,
  origin: AuditEvent["origin"] = "direct",
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: origin === "local_companion_simulation" ? "Local Companion simulator" : "Commander",
    origin,
    kind,
    entityType,
    entityId,
    summary,
    detail,
  };
  return { ...state, nextAuditSequence: state.nextAuditSequence + 1, auditEvents: [...state.auditEvents, event] };
}

function currentPolicy(state: CastraState, id: string): LocalModelPolicyVersion | null {
  const policy = state.localModelPolicyVersions.find((item) => item.id === id) ?? null;
  if (!policy) return null;
  if (state.localModelPolicyVersions.some((item) => item.supersedesId === policy.id)) return null;
  return policy;
}

export interface RemoteWorkGate {
  ready: boolean;
  reasons: string[];
  policy: LocalModelPolicyVersion | null;
}

export function evaluateRemoteProposal(state: CastraState, proposal: RemoteWorkProposal, at: string): RemoteWorkGate {
  const reasons: string[] = [];
  const selection = proposal.runtimeSelection;
  const policy = currentPolicy(state, selection.modelPolicyVersionId);
  if (proposal.riskTier !== "low" || proposal.authority !== "proposal_only") reasons.push("Only Low-risk proposal-only work is permitted.");
  if (selection.runtimeKind !== "local_ollama" || selection.runtimeReference !== "ollama_loopback") reasons.push("The local Companion proof supports only the fixed local Ollama runtime selection.");
  if (!policy) reasons.push("The selected model-policy version is missing or superseded.");
  if (policy && (!policy.enabled || !policy.productOwnerPermitted)) reasons.push("The selected policy must be enabled and Product-Owner permitted.");
  if (policy && (policy.workflowKey !== "remote_work" || policy.activityKey !== proposal.allowedActivity || policy.riskTier !== "low")) reasons.push("The selected policy does not match the remote-work activity and Low-risk classification.");
  if (policy && policy.requiredCapability !== "completion") reasons.push("The remote draft-only slice permits completion capability only.");
  if (policy && !policy.allowedModelNames.includes(selection.selectedModelName)) reasons.push("The selected model is not in the activity policy allowlist.");
  if (proposal.sourceText.length > (policy?.maxInputCharacters ?? 0)) reasons.push("The supplied source exceeds the selected policy input limit.");

  const catalog = state.localModelCatalogObservations.at(-1) ?? null;
  if (!catalog || catalog.runtimeStatus !== "healthy") reasons.push("No healthy local loopback catalog observation is recorded.");
  if (catalog && (catalog.endpointOrigin !== "http://127.0.0.1:11434" || catalog.locality !== "fixed_os_loopback")) reasons.push("The catalog does not satisfy fixed loopback locality.");
  const model = catalog?.models.find((item) => item.name === selection.selectedModelName && item.digest === selection.selectedModelDigest) ?? null;
  if (!model || !model.capabilities.includes("completion")) reasons.push("The exact selected model name/digest is unavailable or lacks completion capability.");

  const decision = [...state.remoteCommanderDecisions].reverse().find((item) => item.proposalId === proposal.id) ?? null;
  const hash = remoteProposalHash(proposal);
  if (!decision || decision.decision !== "approved") reasons.push("A current Commander approval is required.");
  if (decision && (decision.proposalRevision !== proposal.revision || decision.proposalHash !== hash)) reasons.push("The Commander approval does not match the current proposal content.");
  if (decision?.expiresAt && instant(decision.expiresAt, "Approval expiry") <= instant(at, "Evaluation time")) reasons.push("The Commander approval is stale or expired.");
  return { ready: reasons.length === 0, reasons, policy };
}

function requireProposal(state: CastraState, id: string): RemoteWorkProposal {
  const proposal = state.remoteWorkProposals.find((item) => item.id === id);
  if (!proposal) throw new Error("Remote-work proposal was not found.");
  return proposal;
}

function requireCompanion(state: CastraState, id: string): RemoteCompanionRegistration {
  const companion = state.remoteCompanionRegistrations.find((item) => item.id === id);
  if (!companion) throw new Error("Companion registration was not found.");
  return companion;
}

function requireJob(state: CastraState, id: string): RemoteWorkJob {
  const job = state.remoteWorkJobs.find((item) => item.id === id);
  if (!job) throw new Error("Remote-work job was not found.");
  return job;
}

function replaceCompanion(state: CastraState, companion: RemoteCompanionRegistration): CastraState {
  return { ...state, remoteCompanionRegistrations: state.remoteCompanionRegistrations.map((item) => item.id === companion.id ? companion : item) };
}

function replaceJob(state: CastraState, job: RemoteWorkJob): CastraState {
  return { ...state, remoteWorkJobs: state.remoteWorkJobs.map((item) => item.id === job.id ? job : item) };
}

function companionGate(companion: RemoteCompanionRegistration): string[] {
  const reasons: string[] = [];
  if (companion.pairingState !== "placeholder_paired") reasons.push("Companion pairing is revoked or unavailable.");
  if (companion.sessionState !== "ready") reasons.push(`Companion session is ${companion.sessionState}, not ready.`);
  if (companion.platform !== "windows" || companion.userScope !== "current_user") reasons.push("The local proof permits one Windows current-user Companion only.");
  return reasons;
}

function jobGate(state: CastraState, job: RemoteWorkJob, at: string): string[] {
  const reasons: string[] = [];
  const proposal = requireProposal(state, job.proposalId);
  if (proposal.revision !== job.proposalRevision || remoteProposalHash(proposal) !== job.proposalHash) reasons.push("The queued snapshot no longer matches the proposal.");
  reasons.push(...evaluateRemoteProposal(state, proposal, at).reasons);
  if (instant(job.expiresAt, "Job expiry") <= instant(at, "Evaluation time")) reasons.push("The queued job is expired.");
  if (job.canceledAt) reasons.push("The queued job is canceled.");
  if (state.remoteWorkReceipts.some((item) => item.jobId === job.id)) reasons.push("The job already has an immutable terminal receipt.");
  return reasons;
}

export function remoteEvidenceBuckets(): RemoteEvidenceBuckets {
  return {
    subscriptionInteraction: { availability: "unavailable", amountMinor: null, currency: "", tokens: null, observedRuntimeMs: null, provenance: "No subscription interaction was performed or evidenced." },
    localRuntime: { availability: "simulated", amountMinor: null, currency: "", tokens: null, observedRuntimeMs: null, provenance: "Deterministic state-machine simulation; no model/runtime call." },
    hostedProviderInfrastructure: { availability: "unavailable", amountMinor: null, currency: "", tokens: null, observedRuntimeMs: null, provenance: "Hosted provider is not configured; no provider call or cost evidence." },
    apiMeteredUse: { availability: "zero", amountMinor: 0, currency: "USD", tokens: 0, observedRuntimeMs: null, provenance: "No API or Realtime call was made by this local proof." },
  };
}

function terminalReceipt(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  job: RemoteWorkJob,
  attemptId: string | null,
  outcome: RemoteWorkReceipt["outcome"],
  redactedResult: string,
  reasonCode: string,
  reason: string,
  origin: AuditEvent["origin"],
): CastraState {
  if (state.remoteWorkReceipts.some((item) => item.jobId === job.id)) throw new Error("Remote-work job already has an immutable terminal receipt.");
  const receipt: RemoteWorkReceipt = {
    id: context.id("remote_work_receipt"),
    jobId: job.id,
    attemptId,
    outcome,
    redactedResult,
    reasonCode,
    reason,
    authority: "proposal_only",
    evidenceMode: "deterministic_local_simulation",
    modelCalls: 0,
    remoteProviderCalls: 0,
    evidenceBuckets: remoteEvidenceBuckets(),
    createdAt: occurredAt,
  };
  let next = replaceJob({ ...state, remoteWorkReceipts: [...state.remoteWorkReceipts, receipt] }, { ...job, status: "terminal" });
  if (attemptId) {
    next = { ...next, remoteWorkAttempts: next.remoteWorkAttempts.map((item) => item.id === attemptId ? { ...item, status: "terminal", terminalAt: occurredAt } : item) };
  }
  const companion = next.remoteCompanionRegistrations.find((item) => item.id === job.companionId);
  if (companion) next = replaceCompanion(next, { ...companion, lastReceiptAt: occurredAt, updatedAt: occurredAt });
  return appendAudit(next, context, occurredAt, "remote_work.receipt_recorded", "remote_work_receipt", receipt.id, `Remote-work ${outcome} receipt recorded`, { jobId: job.id, attemptId: attemptId ?? "none", reasonCode, authority: "proposal_only", evidenceMode: receipt.evidenceMode, modelCalls: "0", remoteProviderCalls: "0" }, origin);
}

export function applyRemoteWorkCommand(state: CastraState, command: RemoteWorkCommand, context: CommandContext): CastraState {
  const occurredAt = context.now();

  if (command.type === "remote_work.proposal.create") {
    const sourceText = requiredText(command.sourceText, "Supplied source text", 20_000);
    const targetId = requiredText(command.target.id, "Target reference", 180);
    const selection = runtimeSelection(command.runtimeSelection);
    const proposal: RemoteWorkProposal = {
      id: context.id("remote_work_proposal"), revision: 1, source: command.source, sourceText,
      sourceHash: `sha256-v1:${sha256(sourceText)}`, sourceReference: command.sourceReference.trim(),
      target: { type: command.target.type, id: targetId }, allowedActivity: command.allowedActivity,
      riskTier: "low", authority: "proposal_only", runtimeSelection: selection,
      createdAt: occurredAt, updatedAt: occurredAt,
    };
    const next = { ...state, remoteWorkProposals: [...state.remoteWorkProposals, proposal] };
    return appendAudit(next, context, occurredAt, "remote_work.proposal_created", "remote_work_proposal", proposal.id, "Remote-work draft proposal created", { source: proposal.source, sourceHash: proposal.sourceHash, proposalHash: remoteProposalHash(proposal), activity: proposal.allowedActivity, runtime: selection.runtimeKind, authority: proposal.authority, voiceApproval: "false" });
  }

  if (command.type === "remote_work.proposal.update") {
    const current = requireProposal(state, command.proposalId);
    if (state.remoteWorkJobs.some((item) => item.proposalId === current.id)) throw new Error("A released proposal is immutable; create a new proposal for changed content.");
    const sourceText = requiredText(command.sourceText, "Supplied source text", 20_000);
    const updated: RemoteWorkProposal = {
      ...current, revision: current.revision + 1, sourceText,
      sourceHash: `sha256-v1:${sha256(sourceText)}`, sourceReference: command.sourceReference.trim(),
      target: { type: command.target.type, id: requiredText(command.target.id, "Target reference", 180) },
      allowedActivity: command.allowedActivity, runtimeSelection: runtimeSelection(command.runtimeSelection), updatedAt: occurredAt,
    };
    let next = { ...state, remoteWorkProposals: state.remoteWorkProposals.map((item) => item.id === updated.id ? updated : item) };
    const approval = [...state.remoteCommanderDecisions].reverse().find((item) => item.proposalId === current.id && item.decision === "approved");
    if (approval) next = appendAudit(next, context, occurredAt, "remote_work.approval_invalidated", "remote_commander_decision", approval.id, "Remote-work approval invalidated by material proposal change", { proposalId: current.id, approvedHash: approval.proposalHash, currentHash: remoteProposalHash(updated) });
    return appendAudit(next, context, occurredAt, "remote_work.proposal_updated", "remote_work_proposal", updated.id, "Remote-work draft proposal updated", { revision: String(updated.revision), sourceHash: updated.sourceHash, proposalHash: remoteProposalHash(updated), authority: "proposal_only" });
  }

  if (command.type === "remote_work.proposal.decide") {
    const proposal = requireProposal(state, command.proposalId);
    if (state.remoteWorkJobs.some((item) => item.proposalId === proposal.id)) throw new Error("A released proposal cannot receive a replacement decision.");
    const reason = requiredText(command.reason, "Commander decision reason", 2_000);
    let expiresAt: string | null = null;
    if (command.decision === "approved") {
      expiresAt = requiredText(command.expiresAt ?? "", "Approval expiry", 80);
      const now = instant(occurredAt, "Decision time");
      const expiry = instant(expiresAt, "Approval expiry");
      if (expiry <= now || expiry > now + 24 * 60 * 60 * 1_000) throw new Error("Approval expiry must be after the decision and no more than 24 hours later.");
    }
    const decision = {
      id: context.id("remote_commander_decision"), proposalId: proposal.id, proposalRevision: proposal.revision,
      proposalHash: remoteProposalHash(proposal), decision: command.decision, reason,
      decidedBy: "Commander" as const, decidedAt: occurredAt, expiresAt,
    };
    const next = { ...state, remoteCommanderDecisions: [...state.remoteCommanderDecisions, decision] };
    return appendAudit(next, context, occurredAt, command.decision === "approved" ? "remote_work.approval_recorded" : "remote_work.approval_rejected", "remote_commander_decision", decision.id, `Commander ${command.decision} remote-work proposal`, { proposalId: proposal.id, proposalHash: decision.proposalHash, expiresAt: expiresAt ?? "not_applicable", source: proposal.source, voiceApproval: "false", authority: "proposal_only" });
  }

  if (command.type === "remote_work.companion.register_placeholder") {
    if (state.remoteCompanionRegistrations.some((item) => item.pairingState !== "revoked")) throw new Error("Only one active Companion registration is permitted for the Commander.");
    const fingerprint = requiredText(command.publicFingerprintPlaceholder, "Public fingerprint placeholder", 180);
    if (!/^PLACEHOLDER:[A-Z0-9_-]+$/.test(fingerprint)) throw new Error("The local proof accepts only a visibly labelled PLACEHOLDER fingerprint; never enter a key or secret.");
    const companion: RemoteCompanionRegistration = {
      id: context.id("remote_companion_registration"), commanderId: "COMMANDER_PRODUCT_OWNER",
      displayName: requiredText(command.displayName, "Companion display name", 180), platform: "windows", userScope: "current_user",
      protocolVersion: "castra-companion-poc/1.0.0", pairingState: "placeholder_paired",
      publicFingerprintPlaceholder: fingerprint, sessionState: "offline", lastReceiptAt: null,
      registeredAt: occurredAt, updatedAt: occurredAt,
    };
    const next = { ...state, remoteCompanionRegistrations: [...state.remoteCompanionRegistrations, companion] };
    return appendAudit(next, context, occurredAt, "remote_work.companion_registered", "remote_companion_registration", companion.id, "Placeholder Companion registration recorded", { platform: companion.platform, userScope: companion.userScope, pairing: companion.pairingState, fingerprint: companion.publicFingerprintPlaceholder, secretsStored: "false", simulation: "true" });
  }

  if (command.type === "remote_work.companion.session.set") {
    const current = requireCompanion(state, command.companionId);
    if (current.pairingState === "revoked" || current.sessionState === "revoked") throw new Error("A revoked Companion cannot change session state.");
    if (current.sessionState === "disabled") throw new Error("A disabled Companion must be revoked or handled by a separately approved recovery action.");
    const updated = { ...current, sessionState: command.sessionState, updatedAt: occurredAt };
    return appendAudit(replaceCompanion(state, updated), context, occurredAt, "remote_work.companion_session_changed", "remote_companion_registration", updated.id, `Companion simulation state changed to ${updated.sessionState}`, { previous: current.sessionState, current: updated.sessionState, listener: "none", simulation: "true" });
  }

  if (command.type === "remote_work.companion.disable" || command.type === "remote_work.companion.revoke") {
    const current = requireCompanion(state, command.companionId);
    const reason = requiredText(command.reason, command.type.endsWith("disable") ? "Disable reason" : "Revocation reason", 2_000);
    const revoked = command.type === "remote_work.companion.revoke";
    const updated: RemoteCompanionRegistration = { ...current, pairingState: revoked ? "revoked" : current.pairingState, sessionState: revoked ? "revoked" : "disabled", updatedAt: occurredAt };
    const next = replaceCompanion(state, updated);
    return appendAudit(next, context, occurredAt, revoked ? "remote_work.companion_revoked" : "remote_work.companion_disabled", "remote_companion_registration", updated.id, revoked ? "Companion pairing revoked" : "Companion locally disabled", { reason, pendingJobsExecute: "false", emergencyControl: "local" });
  }

  if (command.type === "remote_work.job.release") {
    const proposal = requireProposal(state, command.proposalId);
    const companion = requireCompanion(state, command.companionId);
    if (companion.pairingState !== "placeholder_paired" || companion.sessionState === "disabled" || companion.sessionState === "revoked") throw new Error("Job release requires a non-disabled, non-revoked paired Companion placeholder.");
    if (state.remoteWorkJobs.some((item) => item.proposalId === proposal.id)) throw new Error("The proposal already has a released job; duplicate release is blocked.");
    const gate = evaluateRemoteProposal(state, proposal, occurredAt);
    if (!gate.ready) throw new Error(`Remote-work release blocked: ${gate.reasons.join(" ")}`);
    const approval = [...state.remoteCommanderDecisions].reverse().find((item) => item.proposalId === proposal.id && item.decision === "approved")!;
    const job: RemoteWorkJob = {
      id: context.id("remote_work_job"), proposalId: proposal.id, proposalRevision: proposal.revision,
      proposalHash: remoteProposalHash(proposal), approvalId: approval.id, companionId: companion.id,
      runtimeSelection: { ...proposal.runtimeSelection }, status: "queued", releasedAt: occurredAt,
      expiresAt: approval.expiresAt!, canceledAt: null,
    };
    const next = { ...state, remoteWorkJobs: [...state.remoteWorkJobs, job] };
    return appendAudit(next, context, occurredAt, "remote_work.job_released", "remote_work_job", job.id, "Commander released one low-risk draft-only job to the local proof queue", { proposalId: proposal.id, proposalHash: job.proposalHash, approvalId: job.approvalId, companionId: job.companionId, runtime: job.runtimeSelection.runtimeKind, model: job.runtimeSelection.selectedModelName, providerCalls: "0", modelCalls: "0", simulation: "true" });
  }

  if (command.type === "remote_work.job.claim") {
    const job = requireJob(state, command.jobId);
    const companion = requireCompanion(state, command.companionId);
    if (job.status !== "queued") throw new Error("Only a queued job can be claimed.");
    if (job.companionId !== companion.id) throw new Error("The job is bound to a different Companion.");
    if (state.remoteWorkAttempts.some((item) => item.jobId === job.id)) throw new Error("At-most-once guard blocked a duplicate claim/attempt.");
    const reasons = [...companionGate(companion), ...jobGate(state, job, occurredAt)];
    if (reasons.length) throw new Error(`Companion claim blocked: ${reasons.join(" ")}`);
    const lease = instant(command.leaseExpiresAt, "Lease expiry");
    const now = instant(occurredAt, "Claim time");
    if (lease <= now || lease > now + 15 * 60 * 1_000) throw new Error("Claim lease must be after claim time and no more than 15 minutes later.");
    const attempt = {
      id: context.id("remote_work_attempt"), jobId: job.id, companionId: companion.id, attemptNumber: 1 as const,
      status: "claimed" as const, leaseExpiresAt: command.leaseExpiresAt, claimedAt: occurredAt, startedAt: null, terminalAt: null,
    };
    let next = { ...state, remoteWorkAttempts: [...state.remoteWorkAttempts, attempt] };
    next = replaceJob(next, { ...job, status: "claimed" });
    return appendAudit(next, context, occurredAt, "remote_work.job_claimed", "remote_work_attempt", attempt.id, "Deterministic Companion simulation claimed job", { jobId: job.id, leaseExpiresAt: attempt.leaseExpiresAt, attemptNumber: "1", listener: "none", providerCalls: "0", modelCalls: "0", simulation: "true" }, "local_companion_simulation");
  }

  if (command.type === "remote_work.job.reject") {
    const job = requireJob(state, command.jobId);
    if (job.companionId !== command.companionId) throw new Error("The job is bound to a different Companion.");
    if (job.status !== "queued" && job.status !== "claimed") throw new Error("Only queued or claimed work can be rejected.");
    const attempt = state.remoteWorkAttempts.find((item) => item.jobId === job.id) ?? null;
    const rejected = terminalReceipt(state, context, occurredAt, job, attempt?.id ?? null, "rejected", "", "companion_rejected", requiredText(command.reason, "Rejection reason", 2_000), "local_companion_simulation");
    return appendAudit(rejected, context, occurredAt, "remote_work.job_rejected", "remote_work_job", job.id, "Companion simulation rejected job before execution", { reason: command.reason.trim(), modelCalls: "0" }, "local_companion_simulation");
  }

  if (command.type === "remote_work.job.start") {
    const job = requireJob(state, command.jobId);
    const attempt = state.remoteWorkAttempts.find((item) => item.id === command.attemptId && item.jobId === job.id);
    if (!attempt) throw new Error("Remote-work attempt was not found for this job.");
    if (job.status !== "claimed" || attempt.status !== "claimed") throw new Error("Only one claimed attempt can start.");
    const companion = requireCompanion(state, attempt.companionId);
    const reasons = [...companionGate(companion), ...jobGate(state, job, occurredAt)];
    if (instant(attempt.leaseExpiresAt, "Lease expiry") <= instant(occurredAt, "Start time")) reasons.push("The claim lease is expired.");
    if (reasons.length) throw new Error(`Companion start blocked: ${reasons.join(" ")}`);
    let next = { ...state, remoteWorkAttempts: state.remoteWorkAttempts.map((item) => item.id === attempt.id ? { ...item, status: "executing", startedAt: occurredAt } : item) } as CastraState;
    next = replaceJob(next, { ...job, status: "executing" });
    return appendAudit(next, context, occurredAt, "remote_work.job_started", "remote_work_attempt", attempt.id, "Deterministic Companion execution simulation started; no model call", { jobId: job.id, authority: "proposal_only", executionMode: "state_machine_simulation", listener: "none", providerCalls: "0", modelCalls: "0" }, "local_companion_simulation");
  }

  if (command.type === "remote_work.job.cancel") {
    const job = requireJob(state, command.jobId);
    if (job.status === "terminal") throw new Error("Terminal remote-work jobs are immutable.");
    const attempt = state.remoteWorkAttempts.find((item) => item.jobId === job.id) ?? null;
    const updated = { ...job, canceledAt: occurredAt };
    const outcome = job.status === "executing" ? "unknown" as const : "canceled" as const;
    const reason = requiredText(command.reason, "Cancellation reason", 2_000);
    let next = terminalReceipt(replaceJob(state, updated), context, occurredAt, updated, attempt?.id ?? null, outcome, "", job.status === "executing" ? "canceled_after_start_unknown" : "canceled_before_start", reason, "direct");
    return appendAudit(next, context, occurredAt, "remote_work.job_canceled", "remote_work_job", job.id, `Commander canceled remote-work job; outcome ${outcome}`, { previousStatus: job.status, outcome, automaticRetry: "false", reason });
  }

  const job = requireJob(state, command.jobId);
  const attempt = state.remoteWorkAttempts.find((item) => item.id === command.attemptId && item.jobId === job.id);
  if (!attempt || attempt.status !== "executing" || job.status !== "executing") throw new Error("Only the executing at-most-once attempt can record an outcome.");
  const result = command.outcome === "proposal" ? requiredText(command.redactedResult, "Redacted review-only result", 20_000) : command.redactedResult.trim();
  const reasonCode = requiredText(command.reasonCode, "Outcome reason code", 80);
  const reason = requiredText(command.reason, "Outcome reason", 2_000);
  return terminalReceipt(state, context, occurredAt, job, attempt.id, command.outcome, result, reasonCode, reason, "local_companion_simulation");
}
