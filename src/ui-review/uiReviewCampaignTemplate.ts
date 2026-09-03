import type { CastraCommand, UIReviewApplicability, UIReviewCheckpointCode } from "../domain/types";
import { UI_REVIEW_CHECKPOINT_CATALOG } from "../domain/uiReview";

export const UI_REVIEW_CAMPAIGN_TEMPLATE_VERSION = "C001.M010.A004.ui-review-template.r1" as const;

export interface UIReviewCampaignSpecification {
  campaignId: string;
  applicability: UIReviewApplicability;
  applicabilityReason: string;
  applicabilityEvidenceReference: string;
  experienceIntent: string;
  devicesAndScreenSizes: string;
  themeAndNavigationPattern: string;
  requiredCheckpoints: UIReviewCheckpointCode[];
  demonstrationDataNeeds: string;
  evidenceRequirement: string;
  screenshotRequired: boolean;
}

export const DEFAULT_UI_REVIEW_CHECKPOINTS = UI_REVIEW_CHECKPOINT_CATALOG.map((entry) => entry.code);

export const FUTURE_UI_CAMPAIGN_EXAMPLE: Omit<UIReviewCampaignSpecification, "campaignId"> = {
  applicability: "ui",
  applicabilityReason: "The product includes browser-accessible Commander screens.",
  applicabilityEvidenceReference: "campaign-specification://ui-applicability",
  experienceIntent: "The Commander can understand status, evidence, blockers, and required decisions without source-code access.",
  devicesAndScreenSizes: "Desktop browser and responsive phone-sized browser",
  themeAndNavigationPattern: "Commander-selected semantic theme and Campaign-oriented navigation",
  requiredCheckpoints: [...DEFAULT_UI_REVIEW_CHECKPOINTS],
  demonstrationDataNeeds: "Deterministic representative records isolated from authoritative data",
  evidenceRequirement: "Screen/state inventory, source references, accessibility checks, and exact Commander disposition",
  screenshotRequired: true,
};

export function buildUIReviewPlanCommand(specification: UIReviewCampaignSpecification): CastraCommand {
  return {
    type: "ui_review.plan.create",
    campaignId: specification.campaignId,
    applicability: specification.applicability,
    applicabilityReason: specification.applicabilityReason,
    applicabilityEvidenceReference: specification.applicabilityEvidenceReference,
    experienceIntent: specification.applicability === "ui" ? specification.experienceIntent : "",
    devicesAndScreenSizes: specification.applicability === "ui" ? specification.devicesAndScreenSizes : "",
    themeAndNavigationPattern: specification.applicability === "ui" ? specification.themeAndNavigationPattern : "",
    requiredCheckpoints: specification.applicability === "ui" ? [...specification.requiredCheckpoints] : [],
    demonstrationDataNeeds: specification.applicability === "ui" ? specification.demonstrationDataNeeds : "",
    evidenceRequirement: specification.applicability === "ui" ? specification.evidenceRequirement : "",
    screenshotRequired: specification.applicability === "ui" && specification.screenshotRequired,
  };
}

export function futureCampaignUIReviewCommand(campaignId: string): CastraCommand {
  return buildUIReviewPlanCommand({ campaignId, ...FUTURE_UI_CAMPAIGN_EXAMPLE });
}

