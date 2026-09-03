import type {
  AuditEvent,
  AuditKind,
  CastraCommand,
  CastraState,
  CommandContext,
  ExitDecision,
  FirewatchVerification,
  PunchItem,
  PunchStatus,
  TestCase,
  TestCommand,
  TestCycle,
  TestOutcome,
  TestPlan,
  TestResult,
} from "./types.js";

const planTransitions = {
  draft: ["active"],
  active: ["exit_review"],
  exit_review: ["active", "closed"],
  closed: [],
} as const;

const cycleTransitions = {
  planned: ["active"],
  active: ["completed"],
  completed: [],
} as const;

const caseTransitions = {
  draft: ["ready", "retired"],
  ready: ["executed", "retired"],
  executed: ["ready", "retired"],
  retired: [],
} as const;

const punchTransitions: Record<PunchStatus, PunchStatus[]> = {
  open: ["in_remediation", "cancelled"],
  in_remediation: ["ready_for_verification", "cancelled"],
  ready_for_verification: ["in_remediation", "cancelled"],
  verified_closed: [],
  waived: [],
  cancelled: [],
};

const punchEligibleOutcomes: TestOutcome[] = ["fail", "blocked", "accepted_with_follow_up"];

export function isTestCommand(command: CastraCommand): command is TestCommand {
  return (
    command.type.startsWith("test_") ||
    command.type.startsWith("punch_item.") ||
    command.type.startsWith("firewatch_verification.") ||
    command.type.startsWith("exit_decision.")
  );
}

function requiredText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function requirePlan(state: CastraState, id: string): TestPlan {
  const record = state.testPlans.find((plan) => plan.id === id);
  if (!record) throw new Error("Test plan not found.");
  return record;
}

function requireCycle(state: CastraState, id: string): TestCycle {
  const record = state.testCycles.find((cycle) => cycle.id === id);
  if (!record) throw new Error("Test cycle not found.");
  return record;
}

function requireCase(state: CastraState, id: string): TestCase {
  const record = state.testCases.find((testCase) => testCase.id === id);
  if (!record) throw new Error("Test case not found.");
  return record;
}

function requireResult(state: CastraState, id: string): TestResult {
  const record = state.testResults.find((result) => result.id === id);
  if (!record) throw new Error("Test result not found.");
  return record;
}

function requirePunch(state: CastraState, id: string): PunchItem {
  const record = state.punchItems.find((punch) => punch.id === id);
  if (!record) throw new Error("Punch item not found.");
  return record;
}

function appendTestAudit(
  state: CastraState,
  context: CommandContext,
  occurredAt: string,
  kind: AuditKind,
  target: { type: AuditEvent["entityType"]; id: string },
  summary: string,
  detail: Record<string, string> = {},
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt,
    actor: "Commander",
    origin: "direct",
    kind,
    entityType: target.type,
    entityId: target.id,
    summary,
    detail,
  };
  return {
    ...state,
    nextAuditSequence: state.nextAuditSequence + 1,
    auditEvents: [...state.auditEvents, event],
  };
}

export function latestResultForCase(state: CastraState, testCaseId: string): TestResult | undefined {
  return state.testResults.filter((result) => result.testCaseId === testCaseId).at(-1);
}

export interface TestPlanRollup {
  planned: number;
  executed: number;
  pass: number;
  fail: number;
  blocked: number;
  followUp: number;
  punchOpen: number;
  punchVerified: number;
  exitReady: boolean;
  blockers: string[];
}

export function testPlanRollup(state: CastraState, testPlanId: string): TestPlanRollup {
  const cases = state.testCases.filter(
    (testCase) => testCase.testPlanId === testPlanId && testCase.status !== "retired",
  );
  const latest = cases.map((testCase) => ({ testCase, result: latestResultForCase(state, testCase.id) }));
  const punches = state.punchItems.filter((punch) => punch.testPlanId === testPlanId);
  const openStatuses: PunchStatus[] = ["open", "in_remediation", "ready_for_verification"];
  const blockers: string[] = [];

  if (cases.length === 0) blockers.push("No planned test cases.");

  for (const { testCase, result } of latest) {
    if (testCase.required && (!result || result.outcome === "not_run")) {
      blockers.push(`Required test not executed: ${testCase.title}`);
    }
    if (testCase.required && result && ["fail", "blocked"].includes(result.outcome)) {
      blockers.push(`Required test ${result.outcome}: ${testCase.title}`);
    }

    if (result && punchEligibleOutcomes.includes(result.outcome)) {
      const linked = punches.filter((punch) => punch.testResultId === result.id);
      if (testCase.severity === "critical" && !linked.some((punch) => punch.status === "verified_closed")) {
        blockers.push(`Critical issue lacks verified closure: ${testCase.title}`);
      }
      if (
        testCase.severity === "high" &&
        !linked.some((punch) => ["verified_closed", "waived"].includes(punch.status))
      ) {
        blockers.push(`High-severity issue needs verified closure or Commander waiver: ${testCase.title}`);
      }
    }
  }

  for (const punch of punches) {
    if (punch.severity === "critical" && punch.status !== "verified_closed") {
      blockers.push(`Critical punch item unresolved: ${punch.title}`);
    }
    if (
      punch.severity === "high" &&
      !["verified_closed", "waived", "cancelled"].includes(punch.status)
    ) {
      blockers.push(`High-severity punch item unresolved: ${punch.title}`);
    }
  }

  const firewatch = state.firewatchVerifications
    .filter((verification) => verification.testPlanId === testPlanId)
    .at(-1);
  if (firewatch?.outcome !== "verified") {
    blockers.push("FIREWATCH verification with evidence is not recorded.");
  }

  return {
    planned: cases.length,
    executed: latest.filter(({ result }) => result && result.outcome !== "not_run").length,
    pass: latest.filter(({ result }) => result?.outcome === "pass").length,
    fail: latest.filter(({ result }) => result?.outcome === "fail").length,
    blocked: latest.filter(({ result }) => result?.outcome === "blocked").length,
    followUp: latest.filter(({ result }) => result?.outcome === "accepted_with_follow_up").length,
    punchOpen: punches.filter((punch) => openStatuses.includes(punch.status)).length,
    punchVerified: punches.filter((punch) => punch.status === "verified_closed").length,
    exitReady: blockers.length === 0,
    blockers: [...new Set(blockers)],
  };
}

export function applyTestCommand(
  state: CastraState,
  command: TestCommand,
  context: CommandContext,
): CastraState {
  const occurredAt = context.now();

  if (command.type === "test_plan.create") {
    if (command.link.type !== "baseops") {
      const collection =
        command.link.type === "campaign"
          ? state.campaigns
          : command.link.type === "mission"
            ? state.missions
            : state.actions;
      const linked = collection.find((record) => record.id === command.link.id);
      if (!linked) throw new Error("Linked work record not found.");
    } else {
      requiredText(command.link.id, "BASEOPS link");
    }
    const plan: TestPlan = {
      id: context.id("test_plan"),
      title: requiredText(command.title, "Title"),
      description: command.description.trim(),
      link: command.link,
      status: "draft",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, testPlans: [...state.testPlans, plan] },
      context,
      occurredAt,
      "test_plan.created",
      { type: "test_plan", id: plan.id },
      `Test plan created: ${plan.title}`,
      { linkedType: plan.link.type, linkedId: plan.link.id },
    );
  }

  if (command.type === "test_plan.status") {
    const plan = requirePlan(state, command.testPlanId);
    if (!(planTransitions[plan.status] as readonly string[]).includes(command.status)) {
      throw new Error(`Test plan transition from ${plan.status} to ${command.status} is not allowed.`);
    }
    if (command.status === "closed" && !state.exitDecisions.some((decision) => decision.testPlanId === plan.id)) {
      throw new Error("A Commander exit decision is required before closing the test plan.");
    }
    const updated = { ...plan, status: command.status, updatedAt: occurredAt };
    return appendTestAudit(
      { ...state, testPlans: state.testPlans.map((item) => (item.id === plan.id ? updated : item)) },
      context,
      occurredAt,
      "test_plan.status_changed",
      { type: "test_plan", id: plan.id },
      `${plan.title}: ${plan.status} → ${command.status}`,
      { from: plan.status, to: command.status },
    );
  }

  if (command.type === "test_cycle.create") {
    const plan = requirePlan(state, command.testPlanId);
    const cycle: TestCycle = {
      id: context.id("test_cycle"),
      testPlanId: plan.id,
      title: requiredText(command.title, "Cycle title"),
      status: "planned",
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, testCycles: [...state.testCycles, cycle] },
      context,
      occurredAt,
      "test_cycle.created",
      { type: "test_cycle", id: cycle.id },
      `Test cycle created: ${cycle.title}`,
      { testPlanId: plan.id },
    );
  }

  if (command.type === "test_cycle.status") {
    const cycle = requireCycle(state, command.testCycleId);
    if (!(cycleTransitions[cycle.status] as readonly string[]).includes(command.status)) {
      throw new Error(`Test cycle transition from ${cycle.status} to ${command.status} is not allowed.`);
    }
    const updated = { ...cycle, status: command.status, updatedAt: occurredAt };
    return appendTestAudit(
      { ...state, testCycles: state.testCycles.map((item) => (item.id === cycle.id ? updated : item)) },
      context,
      occurredAt,
      "test_cycle.status_changed",
      { type: "test_cycle", id: cycle.id },
      `${cycle.title}: ${cycle.status} → ${command.status}`,
      { from: cycle.status, to: command.status },
    );
  }

  if (command.type === "test_case.create") {
    const plan = requirePlan(state, command.testPlanId);
    const testCase: TestCase = {
      id: context.id("test_case"),
      testPlanId: plan.id,
      title: requiredText(command.title, "Case title"),
      status: "draft",
      expectedResult: requiredText(command.expectedResult, "Expected result"),
      requirementReference: requiredText(command.requirementReference, "Requirement reference"),
      sourceReference: requiredText(command.sourceReference, "Source reference"),
      required: command.required,
      severity: command.severity,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, testCases: [...state.testCases, testCase] },
      context,
      occurredAt,
      "test_case.created",
      { type: "test_case", id: testCase.id },
      `Test case created: ${testCase.title}`,
      { testPlanId: plan.id, severity: testCase.severity, required: String(testCase.required) },
    );
  }

  if (command.type === "test_case.status") {
    const testCase = requireCase(state, command.testCaseId);
    if (!(caseTransitions[testCase.status] as readonly string[]).includes(command.status)) {
      throw new Error(`Test case transition from ${testCase.status} to ${command.status} is not allowed.`);
    }
    const updated = { ...testCase, status: command.status, updatedAt: occurredAt };
    return appendTestAudit(
      { ...state, testCases: state.testCases.map((item) => (item.id === testCase.id ? updated : item)) },
      context,
      occurredAt,
      "test_case.status_changed",
      { type: "test_case", id: testCase.id },
      `${testCase.title}: ${testCase.status} → ${command.status}`,
      { from: testCase.status, to: command.status },
    );
  }

  if (command.type === "test_result.record") {
    const testCase = requireCase(state, command.testCaseId);
    const cycle = requireCycle(state, command.testCycleId);
    if (testCase.testPlanId !== cycle.testPlanId) throw new Error("Test case and cycle must belong to the same plan.");
    if (testCase.status === "retired") throw new Error("Cannot execute a retired test case.");
    if (cycle.status !== "active") throw new Error("The test cycle must be active before recording results.");
    const executor = requiredText(command.executor, "Executor");
    if (Number.isNaN(Date.parse(command.executedAt))) throw new Error("Execution time is invalid.");
    if (
      !command.evidenceReference.trim() &&
      !command.resultReference.trim() &&
      !command.unavailableReason.trim()
    ) {
      throw new Error("Evidence/reference or an unavailable reason is required.");
    }
    const result: TestResult = {
      id: context.id("test_result"),
      testPlanId: testCase.testPlanId,
      testCycleId: cycle.id,
      testCaseId: testCase.id,
      outcome: command.outcome,
      actualResult: command.actualResult.trim(),
      executor,
      executedAt: new Date(command.executedAt).toISOString(),
      evidenceReference: command.evidenceReference.trim(),
      resultReference: command.resultReference.trim(),
      unavailableReason: command.unavailableReason.trim(),
      createdAt: occurredAt,
    };
    let next = appendTestAudit(
      { ...state, testResults: [...state.testResults, result] },
      context,
      occurredAt,
      "test_result.recorded",
      { type: "test_result", id: result.id },
      `Test result recorded: ${testCase.title} — ${result.outcome}`,
      { testCaseId: testCase.id, testCycleId: cycle.id, outcome: result.outcome },
    );
    if (testCase.status !== "executed") {
      const updated = { ...testCase, status: "executed" as const, updatedAt: occurredAt };
      next = appendTestAudit(
        { ...next, testCases: next.testCases.map((item) => (item.id === testCase.id ? updated : item)) },
        context,
        occurredAt,
        "test_case.status_changed",
        { type: "test_case", id: testCase.id },
        `${testCase.title}: ${testCase.status} → executed`,
        { from: testCase.status, to: "executed", cause: result.id },
      );
    }
    return next;
  }

  if (command.type === "punch_item.create_from_result") {
    const result = requireResult(state, command.testResultId);
    if (!punchEligibleOutcomes.includes(result.outcome)) {
      throw new Error("Punch items can only be created from failed, blocked, or follow-up results.");
    }
    const plan = requirePlan(state, result.testPlanId);
    const testCase = requireCase(state, result.testCaseId);
    const punch: PunchItem = {
      id: context.id("punch_item"),
      testPlanId: plan.id,
      testResultId: result.id,
      source: "test_result",
      uiReviewItemId: null,
      uiReviewDecisionId: null,
      affectedWork: plan.link,
      title: requiredText(command.title, "Punch title"),
      description: command.description.trim(),
      status: "open",
      severity: command.severity,
      requirementReference: testCase.requirementReference,
      evidenceReference: result.evidenceReference || result.resultReference,
      verificationEvidence: "",
      verifiedAt: null,
      waiverReason: "",
      commanderAcceptedAt: null,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, punchItems: [...state.punchItems, punch] },
      context,
      occurredAt,
      "punch_item.created",
      { type: "punch_item", id: punch.id },
      `Punch item created: ${punch.title}`,
      { testResultId: result.id, affectedType: plan.link.type, affectedId: plan.link.id },
    );
  }

  if (command.type === "punch_item.update") {
    const punch = requirePunch(state, command.punchItemId);
    if (["verified_closed", "waived", "cancelled"].includes(punch.status)) {
      throw new Error("Closed punch items cannot be edited.");
    }
    const updated = {
      ...punch,
      title: requiredText(command.title, "Punch title"),
      description: command.description.trim(),
      severity: command.severity,
      updatedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, punchItems: state.punchItems.map((item) => (item.id === punch.id ? updated : item)) },
      context,
      occurredAt,
      "punch_item.updated",
      { type: "punch_item", id: punch.id },
      `Punch item updated: ${updated.title}`,
      { severity: updated.severity },
    );
  }

  if (command.type === "punch_item.transition") {
    const punch = requirePunch(state, command.punchItemId);
    if (!punchTransitions[punch.status].includes(command.status)) {
      throw new Error(`Punch transition from ${punch.status} to ${command.status} is not allowed.`);
    }
    const updated = { ...punch, status: command.status, updatedAt: occurredAt };
    return appendTestAudit(
      { ...state, punchItems: state.punchItems.map((item) => (item.id === punch.id ? updated : item)) },
      context,
      occurredAt,
      "punch_item.status_changed",
      { type: "punch_item", id: punch.id },
      `${punch.title}: ${punch.status} → ${command.status}`,
      { from: punch.status, to: command.status },
    );
  }

  if (command.type === "punch_item.verify") {
    const punch = requirePunch(state, command.punchItemId);
    if (punch.status !== "ready_for_verification") {
      throw new Error("Punch item must be ready for verification before verified close.");
    }
    const evidence = requiredText(command.evidenceReference, "Verification evidence");
    const updated = {
      ...punch,
      status: "verified_closed" as const,
      verificationEvidence: evidence,
      verifiedAt: occurredAt,
      updatedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, punchItems: state.punchItems.map((item) => (item.id === punch.id ? updated : item)) },
      context,
      occurredAt,
      "punch_item.verified",
      { type: "punch_item", id: punch.id },
      `Punch item verified closed: ${punch.title}`,
      { evidenceReference: evidence },
    );
  }

  if (command.type === "punch_item.waive") {
    const punch = requirePunch(state, command.punchItemId);
    if (["verified_closed", "waived", "cancelled"].includes(punch.status)) {
      throw new Error("This punch item can no longer be waived.");
    }
    const reason = requiredText(command.reason, "Commander waiver reason");
    const updated = {
      ...punch,
      status: "waived" as const,
      waiverReason: reason,
      commanderAcceptedAt: occurredAt,
      updatedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, punchItems: state.punchItems.map((item) => (item.id === punch.id ? updated : item)) },
      context,
      occurredAt,
      "punch_item.waived",
      { type: "punch_item", id: punch.id },
      `Commander waived punch item: ${punch.title}`,
      { reason },
    );
  }

  if (command.type === "firewatch_verification.record") {
    const plan = requirePlan(state, command.testPlanId);
    if (Number.isNaN(Date.parse(command.verifiedAt))) throw new Error("Verification time is invalid.");
    const evidence = command.evidenceReference.trim();
    const unavailable = command.unavailableReason.trim();
    if (command.outcome === "unavailable" && !unavailable) {
      throw new Error("Unavailable reason is required.");
    }
    if (command.outcome !== "unavailable" && !evidence) {
      throw new Error("FIREWATCH evidence reference is required.");
    }
    const verification: FirewatchVerification = {
      id: context.id("firewatch_verification"),
      testPlanId: plan.id,
      outcome: command.outcome,
      evidenceReference: evidence,
      unavailableReason: unavailable,
      verifiedAt: new Date(command.verifiedAt).toISOString(),
      recordedAt: occurredAt,
    };
    return appendTestAudit(
      { ...state, firewatchVerifications: [...state.firewatchVerifications, verification] },
      context,
      occurredAt,
      "firewatch_verification.recorded",
      { type: "firewatch_verification", id: verification.id },
      `FIREWATCH verification recorded: ${verification.outcome}`,
      { testPlanId: plan.id, evidenceReference: evidence || "unavailable" },
    );
  }

  if (command.type === "exit_decision.record") {
    const plan = requirePlan(state, command.testPlanId);
    const rationale = requiredText(command.rationale, "Commander rationale");
    if (command.decision === "pass") {
      const rollup = testPlanRollup(state, plan.id);
      if (!rollup.exitReady) {
        throw new Error(`Pass is blocked: ${rollup.blockers.join(" ")}`);
      }
    }
    const decision: ExitDecision = {
      id: context.id("exit_decision"),
      testPlanId: plan.id,
      decision: command.decision,
      rationale,
      decidedAt: occurredAt,
      decidedBy: "Commander",
    };
    return appendTestAudit(
      { ...state, exitDecisions: [...state.exitDecisions, decision] },
      context,
      occurredAt,
      "exit_decision.recorded",
      { type: "exit_decision", id: decision.id },
      `Commander exit decision: ${decision.decision}`,
      { testPlanId: plan.id, rationale },
    );
  }

  return state;
}
