import type { IdKind } from "./types.js";

const prefixes: Record<IdKind, string> = {
  campaign: "cmp",
  mission: "mis",
  action: "act",
  test_plan: "tpl",
  test_cycle: "tcy",
  test_case: "tcs",
  test_result: "trs",
  punch_item: "pnc",
  firewatch_verification: "fwv",
  exit_decision: "exd",
  aerarium_run: "run",
  aerarium_run_event: "rev",
  aerarium_measure: "mea",
  subscription_plan_version: "spv",
  model_profile_version: "mpv",
  price_card_version: "pcv",
  allocation_rule_version: "arv",
  budget_settings_version: "bsv",
  presentation_settings_version: "psv",
  local_model_policy_version: "lmp",
  local_model_catalog_observation: "lmc",
  local_model_invocation: "lmi",
  local_model_proposal: "lmo",
  local_model_review: "lmr",
  remote_work_proposal: "rwp",
  remote_commander_decision: "rcd",
  remote_companion_registration: "rcr",
  remote_work_job: "rwj",
  remote_work_attempt: "rwa",
  remote_work_receipt: "rwr",
  deployment_request: "dpr",
  deployment_commander_decision: "dcd",
  deployment_receipt: "drc",
  ui_review_plan: "urp",
  ui_review_fixture_contract: "urf",
  ui_review_checkpoint: "urc",
  ui_review_inventory_entry: "uri",
  ui_review_item: "urt",
  ui_review_decision: "urd",
  ui_review_invalidation: "urv",
  ui_review_punch_link: "url",
  welcome_access_configuration_version: "wav",
  authentication_policy_version: "apv",
  identity_reference_version: "irv",
  authority_assignment: "aut",
  auth_workflow_record: "awr",
  session_receipt: "ssr",
  step_up_receipt: "sur",
  auth_event: "aue",
  sarge_runtime_policy_version: "sgp",
  sarge_engagement_request: "sgr",
  sarge_commander_decision: "sgd",
  sarge_result_package: "sgo",
  command_connector_identity_receipt: "cci",
  command_connector_result_package: "ccp",
  command_connector_receipt: "ccr",
  audit: "evt",
};

export function createId(kind: IdKind): string {
  return `${prefixes[kind]}_${crypto.randomUUID()}`;
}

export function shortId(id: string | null): string {
  if (!id) return "UI-REVIEW";
  const [prefix, value] = id.split("_");
  // Imported stable-code ids (e.g. "C001", "C001.M013.A050") contain no
  // underscore-delimited value part; display them exactly as recorded.
  if (!value) return id;
  return `${prefix.toUpperCase()}-${value.slice(0, 8)}`;
}
