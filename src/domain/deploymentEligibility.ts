import type {
  Campaign,
  DeploymentEligibility,
  DeploymentEligibilityDisposition,
} from "./types.js";

export type DeploymentEligibilityAssessment = Omit<
  DeploymentEligibility,
  "disposition" | "dispositionExplanation" | "disposedAt" | "disposedBy"
>;

export function deploymentEligibilityTemplate(): DeploymentEligibility {
  return {
    webDeploymentIntent: "unresolved",
    brandedSubdomainRequirement: "unresolved",
    standardPattern: "unresolved",
    commercialUse: "unresolved",
    providerEligibility: "unresolved",
    proposedHostname: "",
    dnsAuthorityState: "",
    exportImportImplication: "",
    hostedPersistenceImplication: "",
    authenticationImplication: "",
    synchronizationImplication: "",
    migrationImplication: "",
    providerChangeAssessment: "",
    evidenceReference: "",
    disposition: null,
    dispositionExplanation: "",
    disposedAt: null,
    disposedBy: null,
  };
}

const dispositionValues: DeploymentEligibilityDisposition[] = [
  "eligible",
  "not_applicable",
  "product_owner_decision_required",
];

function option<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeDeploymentEligibility(
  value: Partial<DeploymentEligibility> | undefined,
): DeploymentEligibility {
  const template = deploymentEligibilityTemplate();
  if (!value) return template;
  const disposition = typeof value.disposition === "string"
    && dispositionValues.includes(value.disposition as DeploymentEligibilityDisposition)
    ? value.disposition as DeploymentEligibilityDisposition
    : null;
  const hasDisposition = disposition !== null;
  return {
    webDeploymentIntent: option(
      value.webDeploymentIntent,
      ["unresolved", "intended", "not_intended"],
      "unresolved",
    ),
    brandedSubdomainRequirement: option(
      value.brandedSubdomainRequirement,
      ["unresolved", "required", "not_required"],
      "unresolved",
    ),
    standardPattern: option(
      value.standardPattern,
      ["unresolved", "applies", "exception_required", "not_applicable"],
      "unresolved",
    ),
    commercialUse: option(
      value.commercialUse,
      ["unresolved", "commercial_branded", "non_commercial"],
      "unresolved",
    ),
    providerEligibility: option(
      value.providerEligibility,
      ["unresolved", "verified_eligible", "not_eligible"],
      "unresolved",
    ),
    proposedHostname: text(value.proposedHostname),
    dnsAuthorityState: text(value.dnsAuthorityState),
    exportImportImplication: text(value.exportImportImplication),
    hostedPersistenceImplication: text(value.hostedPersistenceImplication),
    authenticationImplication: text(value.authenticationImplication),
    synchronizationImplication: text(value.synchronizationImplication),
    migrationImplication: text(value.migrationImplication),
    providerChangeAssessment: text(value.providerChangeAssessment),
    evidenceReference: text(value.evidenceReference),
    disposition: hasDisposition ? disposition : null,
    dispositionExplanation: hasDisposition ? text(value.dispositionExplanation) : "",
    disposedAt: hasDisposition && typeof value.disposedAt === "string" ? value.disposedAt : null,
    disposedBy: hasDisposition && value.disposedBy === "Commander" ? "Commander" : null,
  };
}

export function deploymentAssessmentOf(
  eligibility: DeploymentEligibility,
): DeploymentEligibilityAssessment {
  const {
    disposition: _disposition,
    dispositionExplanation: _explanation,
    disposedAt: _disposedAt,
    disposedBy: _disposedBy,
    ...assessment
  } = eligibility;
  return assessment;
}

export function deploymentAssessmentChanged(
  current: DeploymentEligibility,
  next: DeploymentEligibilityAssessment,
): boolean {
  return JSON.stringify(deploymentAssessmentOf(current)) !== JSON.stringify(next);
}

export function deploymentGateSatisfied(campaign: Campaign): boolean {
  return campaign.deploymentEligibility.disposition === "eligible"
    || campaign.deploymentEligibility.disposition === "not_applicable";
}

export function requireDeploymentGate(campaign: Campaign, operation: string): void {
  if (deploymentGateSatisfied(campaign)) return;
  const disposition = campaign.deploymentEligibility.disposition ?? "missing or unresolved";
  throw new Error(
    `${operation} is blocked by the Deployment Eligibility gate (${disposition}). Record Eligible or Not applicable first.`,
  );
}
