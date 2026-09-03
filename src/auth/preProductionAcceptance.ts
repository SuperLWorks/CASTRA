export const PRE_PRODUCTION_RLS_ACCEPTANCE = Object.freeze({
  contractVersion: "C001.M012.A005.rls-acceptance/1.0.0",
  selfRead: {
    agentSafe: true,
    method: "GET",
    route: "/api/auth/session",
    evidence: "authenticated RLS-backed self authority read",
    valuesReturned: false,
    mutationAttempted: false,
  },
  nonselfRead: {
    agentSafe: false,
    reason: "One-identity production state has no nonself row; a false-success read cannot prove RLS denial.",
    requiredGate: "Run a reviewed, transactionally rolled-back Supabase SQL acceptance artifact under administrator supervision.",
    artifact: "supabase/acceptance/202608140001_castra_auth_rls_acceptance.sql",
  },
  directMutation: {
    agentSafe: false,
    reason: "A browser mutation probe could become durable if a grant or policy is wrong.",
    requiredGate: "Run a reviewed, transactionally rolled-back Supabase SQL acceptance artifact under administrator supervision.",
    artifact: "supabase/acceptance/202608140001_castra_auth_rls_acceptance.sql",
  },
  identityValuesReturned: false,
  providerValuesReturned: false,
} as const);

export interface DemoIsolationObservation {
  authenticatedSessionVisible: boolean;
  providerWriteCount: number;
  protectedRecordCount: number;
  persistenceTargetCount: number;
  baselineRestoredAfterReload: boolean;
  baselineRestoredAfterExit: boolean;
}

export function evaluateDemoIsolation(observation: DemoIsolationObservation) {
  const passed = !observation.authenticatedSessionVisible
    && observation.providerWriteCount === 0
    && observation.protectedRecordCount === 0
    && observation.persistenceTargetCount === 0
    && observation.baselineRestoredAfterReload
    && observation.baselineRestoredAfterExit;
  return Object.freeze({
    contractVersion: "C001.M012.A005.demo-isolation/1.0.0",
    passed,
    authenticatedSessionVisible: observation.authenticatedSessionVisible,
    providerWriteObserved: observation.providerWriteCount > 0,
    protectedRecordExposureObserved: observation.protectedRecordCount > 0,
    persistenceObserved: observation.persistenceTargetCount > 0,
    reloadRestoredBaseline: observation.baselineRestoredAfterReload,
    exitRestoredBaseline: observation.baselineRestoredAfterExit,
    valuesReturned: false,
  });
}

export const PREVIEW_DISABLE_ROLLBACK_PLAN = Object.freeze({
  contractVersion: "C001.M012.A005.preview-disable-rollback/1.0.0",
  killSwitch: "CASTRA_AUTH_ENABLED",
  target: "preview_only",
  authorizedDeploymentsAvailable: 2,
  minimumAdditionalDeploymentsToDisableThenRestore: 2,
  executableWithinCurrentAuthorization: true,
  sequence: [
    "Set the Preview-only kill switch to false without touching Production.",
    "Deploy current source once and prove fail-closed disabled authentication.",
    "Restore the Preview-only kill switch to true.",
    "Deploy current source once and prove the configured boundary is restored.",
  ],
  rollbackArtifact: "DATA-SCOPE.md#withheld-internal-reference",
} as const);
