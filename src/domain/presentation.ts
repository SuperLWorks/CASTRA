import type {
  AuditEvent,
  AuditKind,
  CanonicalRoleId,
  CastraCommand,
  CastraState,
  CommandContext,
  PresentationCommand,
  PresentationSettingsVersion,
  RoleDisplayEntry,
  RoleIconChoice,
  RoleLabelMode,
  RoleModelSelection,
  RoleRuntimeClass,
  ThemeProfileId,
} from "./types.js";
import { requireConfigurationPreferences } from "../team-configuration/configurationCenter.js";
import type { ConfigurationPreferences } from "../team-configuration/configurationCenter.js";

export const canonicalRoleIds: readonly CanonicalRoleId[] = [
  "COMMANDER_PRODUCT_OWNER",
  "SARGE",
  "FORGE",
  "SIGNAL",
  "RECON",
  "SCRIBE",
  "QUARTERMASTER",
  "FIREWATCH",
  "VEXILLARIUS",
  "CENSOR",
];

export const roleIconChoices: readonly RoleIconChoice[] = [
  "command",
  "chevron",
  "forge",
  "signal",
  "compass",
  "scribe",
  "supply",
  "shield",
  "standard",
  "scales",
];

export const roleIconGlyphs: Record<RoleIconChoice, string> = {
  command: "★",
  chevron: "»",
  forge: "◆",
  signal: "⌁",
  compass: "⌖",
  scribe: "≡",
  supply: "▦",
  shield: "⬟",
  standard: "⚑",
  scales: "⚖",
};

export const canonicalRoleNames: Record<CanonicalRoleId, string> = {
  COMMANDER_PRODUCT_OWNER: "Commander / Product Owner",
  SARGE: "SARGE",
  FORGE: "FORGE",
  SIGNAL: "SIGNAL",
  RECON: "RECON",
  SCRIBE: "SCRIBE",
  QUARTERMASTER: "QUARTERMASTER",
  FIREWATCH: "FIREWATCH",
  VEXILLARIUS: "VEXILLARIUS",
  CENSOR: "CENSOR",
};

export interface SemanticThemeTokens {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceInset: string;
  text: string;
  textMuted: string;
  border: string;
  borderSoft: string;
  primary: string;
  primaryStrong: string;
  onPrimary: string;
  secondary: string;
  success: string;
  warning: string;
  critical: string;
  info: string;
  bodyFont: string;
  displayFont: string;
  density: "compact" | "standard" | "spacious";
}

export interface ThemeProfile {
  id: ThemeProfileId;
  name: string;
  shortName: string;
  description: string;
  scope: "standard" | "public_demo_only";
  tokens: SemanticThemeTokens;
}

export const themeProfiles: readonly ThemeProfile[] = [
  {
    id: "slw_oil_gas",
    name: "Super L Works Oil & Gas Capital Project / Operations",
    shortName: "SLW Oil & Gas",
    description: "Dark control-room presentation with industrial orange, steel blue, and compact project controls density.",
    scope: "standard",
    tokens: {
      background: "#0d151b",
      surface: "#172731",
      surfaceRaised: "#1d303b",
      surfaceInset: "#0f1d25",
      text: "#f4f0e7",
      textMuted: "#9baab0",
      border: "#324650",
      borderSoft: "#253943",
      primary: "#ed7d31",
      primaryStrong: "#ff9248",
      onPrimary: "#101820",
      secondary: "#d8b45a",
      success: "#4fb286",
      warning: "#ed7d31",
      critical: "#dc6f66",
      info: "#6fa7c0",
      bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
      displayFont: "Georgia, 'Times New Roman', serif",
      density: "compact",
    },
  },
  {
    id: "roman_command",
    name: "Roman Command",
    shortName: "Roman Command",
    description: "Bronze, oxblood, parchment, and formal command typography with measured spacing.",
    scope: "standard",
    tokens: {
      background: "#15110f",
      surface: "#241c18",
      surfaceRaised: "#30241e",
      surfaceInset: "#1b1512",
      text: "#f2e8d5",
      textMuted: "#b5a38c",
      border: "#574638",
      borderSoft: "#3a2e27",
      primary: "#b88a4a",
      primaryStrong: "#d5a85f",
      onPrimary: "#1d130b",
      secondary: "#a13b43",
      success: "#73966f",
      warning: "#c58a3e",
      critical: "#c95854",
      info: "#7895a5",
      bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
      displayFont: "Georgia, 'Times New Roman', serif",
      density: "standard",
    },
  },
  {
    id: "operations_neutral",
    name: "Operations Neutral — Software Company",
    shortName: "Operations Neutral",
    description: "Clear software-operations presentation with slate surfaces, accessible blue, and neutral product typography.",
    scope: "standard",
    tokens: {
      background: "#0f172a",
      surface: "#172033",
      surfaceRaised: "#202b42",
      surfaceInset: "#111a2c",
      text: "#f1f5f9",
      textMuted: "#9aa9bd",
      border: "#34445e",
      borderSoft: "#26364f",
      primary: "#5b8def",
      primaryStrong: "#78a5ff",
      onPrimary: "#071225",
      secondary: "#9a7bea",
      success: "#45b783",
      warning: "#e7a94b",
      critical: "#e36d73",
      info: "#5fb8d3",
      bodyFont: "Inter, ui-sans-serif, system-ui, sans-serif",
      displayFont: "Inter, ui-sans-serif, system-ui, sans-serif",
      density: "compact",
    },
  },
  {
    id: "comic_command",
    name: "Comic Command",
    shortName: "Comic Command",
    description: "Demo-only four-color command presentation with heroic blue, action red, golden yellow, ink-black panels, and off-white newsprint.",
    scope: "public_demo_only",
    tokens: {
      background: "#f3e6bd",
      surface: "#fff8dc",
      surfaceRaised: "#ffffff",
      surfaceInset: "#e1e3e6",
      text: "#151515",
      textMuted: "#514a40",
      border: "#151515",
      borderSoft: "#77726a",
      primary: "#0645ad",
      primaryStrong: "#002f7a",
      onPrimary: "#ffffff",
      secondary: "#f4c430",
      success: "#176b4a",
      warning: "#d47b00",
      critical: "#b71c1c",
      info: "#005a9c",
      bodyFont: "Arial, Helvetica, ui-sans-serif, system-ui, sans-serif",
      displayFont: "Impact, Haettenschweiler, 'Arial Narrow Bold', sans-serif",
      density: "compact",
    },
  },
  {
    id: "galactic_command_bridge",
    name: "Galactic Command Bridge",
    shortName: "Galactic Bridge",
    description: "Demo-only severe command-console presentation with black and gunmetal panels, cool-gray geometry, red alerts, and restrained amber and blue status indicators.",
    scope: "public_demo_only",
    tokens: {
      background: "#080a0d",
      surface: "#151a20",
      surfaceRaised: "#20262d",
      surfaceInset: "#0d1116",
      text: "#edf1f4",
      textMuted: "#a6afb7",
      border: "#56616b",
      borderSoft: "#303942",
      primary: "#d6383f",
      primaryStrong: "#f04b52",
      onPrimary: "#ffffff",
      secondary: "#d5a84d",
      success: "#4e9e83",
      warning: "#d5a84d",
      critical: "#e0444b",
      info: "#4d8fc2",
      bodyFont: "'Arial Narrow', 'Bahnschrift Condensed', 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
      displayFont: "'Bahnschrift Condensed', 'Arial Narrow', 'Segoe UI', ui-sans-serif, system-ui, sans-serif",
      density: "compact",
    },
  },
];

export const COMIC_COMMAND_FAN_DISCLAIMER = "Comic Command is an unaffiliated fan demonstration. Character names and trademarks belong to their respective owners; no endorsement or affiliation is claimed.";

export const COMIC_COMMAND_ROLE_TAGLINES: Record<CanonicalRoleId, string> = {
  COMMANDER_PRODUCT_OWNER: "Sets the mission headline.",
  SARGE: "Truth, focus, forward motion.",
  FORGE: "Build it strong. Ship it sound.",
  SIGNAL: "Every system tells a story.",
  RECON: "Follow the evidence into the shadows.",
  SCRIBE: "Get the facts on the record.",
  QUARTERMASTER: "Every mission starts prepared.",
  FIREWATCH: "Keep the perimeter bright.",
  VEXILLARIUS: "Lead with courage and clarity.",
  CENSOR: "Question every hidden risk.",
};

export const GALACTIC_COMMAND_BRIDGE_DISCLAIMER = "Galactic Command Bridge is an original, unaffiliated fan-inspired presentation. It uses no franchise names, logos, characters, ships, artwork, sounds, fonts, or copied layouts.";

export const GALACTIC_COMMAND_BRIDGE_ROLE_TAGLINES: Record<CanonicalRoleId, string> = {
  COMMANDER_PRODUCT_OWNER: "Command authority remains human, distinct, and final.",
  SARGE: "Coordinates the bounded mission docket; never self-approves.",
  FORGE: "Presents engineering and delivery status for Commander review.",
  SIGNAL: "Presents communications and system-coordination readiness.",
  RECON: "Presents evidence-led intelligence and uncertainty.",
  SCRIBE: "Maintains the visible log and evidence narrative.",
  QUARTERMASTER: "Presents supply, preparation, and resource stewardship.",
  FIREWATCH: "Presents verification, assurance, and protective watch status.",
  VEXILLARIUS: "Presents liaison and audience-readiness proposals.",
  CENSOR: "Presents compliance issue-spotting; not legal advice.",
};

function role(
  canonicalId: CanonicalRoleId,
  displayName: string,
  compactCode: string,
  icon: RoleIconChoice,
  accentColor: string,
  description: string,
): RoleDisplayEntry {
  return { canonicalId, displayName, compactCode, icon, accentColor, description };
}

const suppliedRoleProfiles: Record<ThemeProfileId, RoleDisplayEntry[]> = {
  slw_oil_gas: [
    role("COMMANDER_PRODUCT_OWNER", "Project Director", "CMD", "command", "#ed7d31", "Final product, foundation, approval, and release authority."),
    role("SARGE", "Program Controls Lead", "SGT", "chevron", "#d8b45a", "Bounded drafting and work orchestration; never self-approves."),
    role("FORGE", "Engineering & Delivery", "FRG", "forge", "#d2763f", "Implementation and delivery proposals within Commander-confirmed scope."),
    role("SIGNAL", "Systems & Integration", "SIG", "signal", "#6fa7c0", "Interfaces, integration readiness, and communication-system proposals."),
    role("RECON", "Technical & Market Intelligence", "RCN", "compass", "#69a999", "Evidence-first overlap, intent, repository, and product research."),
    role("SCRIBE", "Document Control", "SCR", "scribe", "#a990bd", "Authoritative documentation and traceable record support."),
    role("QUARTERMASTER", "Resource Stewardship", "QTR", "supply", "#c2a85d", "Local resource, subscription, and effort stewardship."),
    role("FIREWATCH", "Quality, Safety & Assurance", "FW", "shield", "#dc6f66", "Proportionate verification and assurance without release authority."),
    role("VEXILLARIUS", "Market Readiness", "VEX", "standard", "#bb7397", "Positioning, readiness, and feedback proposals."),
    role("CENSOR", "Regulatory & Trademark Research", "CEN", "scales", "#9baab0", "Research and issue-spotting only; not legal advice or external authority contact."),
  ],
  roman_command: [
    role("COMMANDER_PRODUCT_OWNER", "Imperator", "IMP", "command", "#b88a4a", "Final product, foundation, approval, and release authority."),
    role("SARGE", "Centurion", "CENT", "chevron", "#c49a57", "Bounded drafting and work orchestration; never self-approves."),
    role("FORGE", "Faber", "FAB", "forge", "#a85d3b", "Implementation and delivery proposals within Commander-confirmed scope."),
    role("SIGNAL", "Signifer", "SIGN", "signal", "#7895a5", "Interfaces, integration readiness, and communication-system proposals."),
    role("RECON", "Explorator", "EXP", "compass", "#71907a", "Evidence-first overlap, intent, repository, and product research."),
    role("SCRIBE", "Scriba", "SCR", "scribe", "#9c83a7", "Authoritative documentation and traceable record support."),
    role("QUARTERMASTER", "Quaestor", "QST", "supply", "#b88a4a", "Local resource, subscription, and effort stewardship."),
    role("FIREWATCH", "Vigiles", "VIG", "shield", "#c95854", "Proportionate verification and assurance without release authority."),
    role("VEXILLARIUS", "Vexillarius", "VEX", "standard", "#a13b43", "Positioning, readiness, and feedback proposals."),
    role("CENSOR", "Censor", "CEN", "scales", "#b5a38c", "Research and issue-spotting only; not legal advice or external authority contact."),
  ],
  operations_neutral: [
    role("COMMANDER_PRODUCT_OWNER", "Product Executive", "PO", "command", "#5b8def", "Final product, foundation, approval, and release authority."),
    role("SARGE", "Product Operations Lead", "OPS", "chevron", "#9a7bea", "Bounded drafting and work orchestration; never self-approves."),
    role("FORGE", "Engineering", "ENG", "forge", "#5b8def", "Implementation and delivery proposals within Commander-confirmed scope."),
    role("SIGNAL", "Platform & Integrations", "PLAT", "signal", "#5fb8d3", "Interfaces, integration readiness, and communication-system proposals."),
    role("RECON", "Research", "RSR", "compass", "#45b783", "Evidence-first overlap, intent, repository, and product research."),
    role("SCRIBE", "Knowledge Operations", "KNW", "scribe", "#9a7bea", "Authoritative documentation and traceable record support."),
    role("QUARTERMASTER", "Business Operations", "BIZ", "supply", "#e7a94b", "Local resource, subscription, and effort stewardship."),
    role("FIREWATCH", "Quality & Reliability", "QA", "shield", "#e36d73", "Proportionate verification and assurance without release authority."),
    role("VEXILLARIUS", "Go-to-Market", "GTM", "standard", "#c777b3", "Positioning, readiness, and feedback proposals."),
    role("CENSOR", "Risk Research", "RISK", "scales", "#9aa9bd", "Research and issue-spotting only; not legal advice or external authority contact."),
  ],
  comic_command: [
    role("COMMANDER_PRODUCT_OWNER", "League Commander", "LEAD", "command", "#c62828", "Display-only command chair. The human Commander and Product Owner authorities remain distinct, canonical, and final."),
    role("SARGE", "Superman", "SUP", "chevron", "#0645ad", "Frames Commander intent and bounded drafting support; never self-approves, releases, or changes authoritative records."),
    role("FORGE", "Steel", "STL", "forge", "#6b7178", "Presents engineering and build execution as reviewable work inside the approved scope."),
    role("SIGNAL", "Oracle", "ORC", "signal", "#176b4a", "Presents systems, information, and connector coordination without implying a live integration."),
    role("RECON", "Batman", "BAT", "compass", "#2f343a", "Presents investigative research and evidence gathering; source facts and uncertainty remain unchanged."),
    role("SCRIBE", "Lois Lane", "LOIS", "scribe", "#7b3f8c", "Presents documentation, narrative, and evidence reporting without rewriting the governed record."),
    role("QUARTERMASTER", "Alfred Pennyworth", "ALF", "supply", "#8a5a2b", "Presents logistics, preparation, and resource stewardship while measures retain their original provenance."),
    role("FIREWATCH", "Green Lantern", "GL", "shield", "#176b4a", "Presents protective assurance, verification testing, and watch duties without release authority."),
    role("VEXILLARIUS", "Wonder Woman", "WW", "standard", "#c62828", "Presents diplomacy, market readiness, and audience-facing positioning as governed proposals."),
    role("CENSOR", "The Question", "Q", "scales", "#6a3d8f", "Presents regulatory and trademark issue-spotting and investigative review; it is not legal advice."),
  ],
  galactic_command_bridge: [
    role("COMMANDER_PRODUCT_OWNER", "Fleet Commander", "CMD", "command", "#d6383f", "Display-only command station. Commander and Product Owner authorities remain distinct, protected, and human."),
    role("SARGE", "Executive Officer", "XO", "chevron", "#d5a84d", "Presents bounded intent drafting and work coordination; never self-approves or changes authoritative records."),
    role("FORGE", "Engineering", "ENG", "forge", "#87939d", "Presents implementation and delivery work as reviewable proposals within approved scope."),
    role("SIGNAL", "Communications", "COM", "signal", "#4d8fc2", "Presents interface and coordination readiness without implying a live connector."),
    role("RECON", "Intelligence", "INT", "compass", "#6e96b5", "Presents evidence-led research, source traceability, and uncertainty without altering facts."),
    role("SCRIBE", "Log Officer", "LOG", "scribe", "#aeb7bf", "Presents documentation and evidence reporting while the governed record remains unchanged."),
    role("QUARTERMASTER", "Supply Officer", "SUP", "supply", "#d5a84d", "Presents logistics, preparation, and stewardship while measure provenance remains separate."),
    role("FIREWATCH", "Tactical Control", "TAC", "shield", "#d6383f", "Presents verification and assurance watch status without release authority."),
    role("VEXILLARIUS", "Liaison", "LIA", "standard", "#4e9e83", "Presents market readiness, stakeholder positioning, and feedback as governed proposals."),
    role("CENSOR", "Compliance Officer", "CMP", "scales", "#a6afb7", "Presents regulatory and trademark issue-spotting only; it is not legal advice."),
  ],
};

function copyRoles(roles: RoleDisplayEntry[]): RoleDisplayEntry[] {
  return roles.map((entry) => ({ ...entry }));
}

const roleRuntimeOptions: Record<RoleRuntimeClass, Omit<RoleModelSelection, "canonicalId" | "workflowKey">> = {
  human_only: {
    runtimeClass: "human_only",
    modelReference: "No model default",
    availability: "human_authority",
    policyNote: "Human authority only. No model may approve, release, or alter authoritative records.",
    apiFallbackAllowed: false,
  },
  local_ollama: {
    runtimeClass: "local_ollama",
    modelReference: "qwen3:0.6b",
    availability: "review_required",
    policyNote: "Bounded low-risk drafting, extraction, short summaries, labels, and fixed-category classification only; semantic acceptance previously failed and every output requires Commander review.",
    apiFallbackAllowed: false,
  },
  codex_subscription_handoff: {
    runtimeClass: "codex_subscription_handoff",
    modelReference: "Codex subscription runtime · model not configured",
    availability: "unverified",
    policyNote: "Preferred subscription handoff for stronger implementation work when separately available and Commander-confirmed. Connectivity is not claimed.",
    apiFallbackAllowed: false,
  },
  chatgpt_subscription_handoff: {
    runtimeClass: "chatgpt_subscription_handoff",
    modelReference: "ChatGPT subscription runtime · model not configured",
    availability: "unverified",
    policyNote: "Subscription handoff only; no programmatic provider driving or API fallback is configured.",
    apiFallbackAllowed: false,
  },
  claude_code_subscription_handoff: {
    runtimeClass: "claude_code_subscription_handoff",
    modelReference: "Claude Code subscription runtime · model not configured",
    availability: "unverified",
    policyNote: "Preferred subscription handoff for bounded research/build work when separately available and Commander-confirmed. Connectivity is not claimed.",
    apiFallbackAllowed: false,
  },
};

export const roleRuntimeClasses = Object.keys(roleRuntimeOptions) as RoleRuntimeClass[];

function runtimeSelection(canonicalId: CanonicalRoleId, runtimeClass: RoleRuntimeClass): RoleModelSelection {
  return { canonicalId, workflowKey: `role_default:${canonicalId.toLowerCase()}`, ...roleRuntimeOptions[runtimeClass] };
}

export function suppliedRoleModelSelections(): RoleModelSelection[] {
  const defaults: Record<CanonicalRoleId, RoleRuntimeClass> = {
    COMMANDER_PRODUCT_OWNER: "human_only",
    SARGE: "local_ollama",
    FORGE: "codex_subscription_handoff",
    SIGNAL: "codex_subscription_handoff",
    RECON: "claude_code_subscription_handoff",
    SCRIBE: "local_ollama",
    QUARTERMASTER: "human_only",
    FIREWATCH: "human_only",
    VEXILLARIUS: "chatgpt_subscription_handoff",
    CENSOR: "claude_code_subscription_handoff",
  };
  return canonicalRoleIds.map((canonicalId) => runtimeSelection(canonicalId, defaults[canonicalId]));
}

function copyModelSelections(selections: RoleModelSelection[]): RoleModelSelection[] {
  return selections.map((entry) => ({ ...entry }));
}

export function suppliedRolesFor(profileId: ThemeProfileId): RoleDisplayEntry[] {
  const roles = suppliedRoleProfiles[profileId];
  if (!roles) throw new Error("Presentation profile not found.");
  return copyRoles(roles);
}

export function themeProfile(profileId: ThemeProfileId): ThemeProfile {
  const profile = themeProfiles.find((candidate) => candidate.id === profileId);
  if (!profile) throw new Error("Presentation profile not found.");
  return profile;
}

export function availableThemeProfiles(scope: "authoritative" | "public_demo"): readonly ThemeProfile[] {
  return scope === "public_demo" ? themeProfiles : themeProfiles.filter((profile) => profile.scope === "standard");
}

export function rolePresentationTagline(profileId: ThemeProfileId, canonicalId: CanonicalRoleId): string | null {
  if (profileId === "comic_command") return COMIC_COMMAND_ROLE_TAGLINES[canonicalId];
  if (profileId === "galactic_command_bridge") return GALACTIC_COMMAND_BRIDGE_ROLE_TAGLINES[canonicalId];
  return null;
}

export interface ResolvedPresentation {
  id: string;
  familyId: string;
  version: number;
  themeProfileId: ThemeProfileId;
  roleProfileName: string;
  aerariumLabelMode: RoleLabelMode;
  roles: RoleDisplayEntry[];
  modelSelections: RoleModelSelection[];
  createdAt: string;
  builtIn: boolean;
  configurationPreferences?: ConfigurationPreferences;
}

export function currentPresentation(state: CastraState): ResolvedPresentation {
  const current = state.presentationVersions.at(-1);
  if (current) return {
    ...current,
    roles: copyRoles(current.roles),
    modelSelections: copyModelSelections(current.modelSelections?.length ? current.modelSelections : suppliedRoleModelSelections()),
    ...(current.configurationPreferences === undefined ? {} : { configurationPreferences: requireConfigurationPreferences(current.configurationPreferences) }),
    builtIn: false,
  };
  return {
    id: "builtin:slw_oil_gas",
    familyId: "builtin:presentation",
    version: 0,
    themeProfileId: "slw_oil_gas",
    roleProfileName: themeProfile("slw_oil_gas").name,
    aerariumLabelMode: "icon_compact",
    roles: suppliedRolesFor("slw_oil_gas"),
    modelSelections: suppliedRoleModelSelections(),
    createdAt: "",
    builtIn: true,
  };
}

export function canonicalRoleId(value: string): CanonicalRoleId | null {
  if (canonicalRoleIds.includes(value as CanonicalRoleId)) return value as CanonicalRoleId;
  const normalized = value.trim().toUpperCase().replace(/[\s/]+/g, "_");
  if (["COMMANDER", "PRODUCT_OWNER", "COMMANDER_PRODUCT_OWNER"].includes(normalized)) {
    return "COMMANDER_PRODUCT_OWNER";
  }
  return null;
}

export function roleDisplay(state: CastraState, roleId: string): RoleDisplayEntry | null {
  const canonicalId = canonicalRoleId(roleId);
  if (!canonicalId) return null;
  return currentPresentation(state).roles.find((entry) => entry.canonicalId === canonicalId) ?? null;
}

export interface PresentedRole {
  canonicalId: string;
  canonicalName: string;
  displayName: string;
  compactCode: string;
  icon: string;
  accentColor: string;
  description: string;
  visualLabel: string;
  accessibleTitle: string;
}

export function presentRole(
  state: CastraState,
  roleId: string,
  mode = currentPresentation(state).aerariumLabelMode,
): PresentedRole {
  const entry = roleDisplay(state, roleId);
  if (!entry) {
    const fallback = roleId.trim() || "Unavailable role";
    return {
      canonicalId: fallback,
      canonicalName: fallback,
      displayName: fallback,
      compactCode: fallback.slice(0, 8).toUpperCase(),
      icon: "?",
      accentColor: "#9baab0",
      description: "Legacy or unavailable role ID; no canonical authority is inferred.",
      visualLabel: mode === "icon_only" ? "?" : mode === "full_name" ? fallback : `? ${fallback.slice(0, 8).toUpperCase()}`,
      accessibleTitle: `${fallback} · canonical mapping unavailable`,
    };
  }
  const glyph = roleIconGlyphs[entry.icon];
  return {
    ...entry,
    canonicalName: canonicalRoleNames[entry.canonicalId],
    icon: glyph,
    visualLabel: mode === "icon_only" ? glyph : mode === "full_name" ? entry.displayName : `${glyph} ${entry.compactCode}`,
    accessibleTitle: `${entry.displayName} · ${canonicalRoleNames[entry.canonicalId]} · ${entry.canonicalId}`,
  };
}

export function semanticThemeVariables(profile: ThemeProfile): Record<string, string> {
  const tokens = profile.tokens;
  const pageSpacing = tokens.density === "spacious" ? "54px" : tokens.density === "standard" ? "48px" : "42px";
  const controlHeight = tokens.density === "spacious" ? "46px" : tokens.density === "standard" ? "44px" : "42px";
  return {
    "--theme-background": tokens.background,
    "--theme-surface": tokens.surface,
    "--theme-surface-raised": tokens.surfaceRaised,
    "--theme-surface-inset": tokens.surfaceInset,
    "--theme-text": tokens.text,
    "--theme-text-muted": tokens.textMuted,
    "--theme-border": tokens.border,
    "--theme-border-soft": tokens.borderSoft,
    "--theme-primary": tokens.primary,
    "--theme-primary-strong": tokens.primaryStrong,
    "--theme-on-primary": tokens.onPrimary,
    "--theme-secondary": tokens.secondary,
    "--theme-success": tokens.success,
    "--theme-warning": tokens.warning,
    "--theme-critical": tokens.critical,
    "--theme-info": tokens.info,
    "--theme-body-font": tokens.bodyFont,
    "--theme-display-font": tokens.displayFont,
    "--theme-density": tokens.density === "spacious" ? "1.08" : tokens.density === "standard" ? "1" : ".94",
    "--theme-page-spacing": pageSpacing,
    "--theme-control-height": controlHeight,
  };
}

export function isPresentationCommand(command: CastraCommand): command is PresentationCommand {
  return command.type.startsWith("presentation.");
}

function requiredText(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function validateRoleUpdate(command: Extract<PresentationCommand, { type: "presentation.role.update" }>): RoleDisplayEntry {
  if (!canonicalRoleIds.includes(command.canonicalId)) throw new Error("Canonical role ID is protected and invalid.");
  if (!roleIconChoices.includes(command.icon)) throw new Error("Role icon choice is invalid.");
  if (!/^#[0-9a-f]{6}$/i.test(command.accentColor)) throw new Error("Accent color must be a six-digit hex color.");
  return {
    canonicalId: command.canonicalId,
    displayName: requiredText(command.displayName, "Display name", 80),
    compactCode: requiredText(command.compactCode, "Compact code", 12),
    icon: command.icon,
    accentColor: command.accentColor.toLowerCase(),
    description: requiredText(command.description, "Description", 240),
  };
}

function validateCanonicalBoundary(roles: RoleDisplayEntry[]): void {
  const ids = roles.map((entry) => entry.canonicalId);
  if (ids.length !== canonicalRoleIds.length || new Set(ids).size !== canonicalRoleIds.length) {
    throw new Error("Presentation version must contain each protected canonical role exactly once.");
  }
  for (const canonicalId of canonicalRoleIds) {
    if (!ids.includes(canonicalId)) throw new Error(`Protected canonical role missing: ${canonicalId}.`);
  }
}

function appendPresentationAudit(
  state: CastraState,
  context: CommandContext,
  version: PresentationSettingsVersion,
  kind: AuditKind,
  summary: string,
  detail: Record<string, string>,
): CastraState {
  const event: AuditEvent = {
    id: context.id("audit"),
    sequence: state.nextAuditSequence,
    occurredAt: version.createdAt,
    actor: "Commander",
    origin: "direct",
    kind,
    entityType: "presentation_settings_version",
    entityId: version.id,
    summary,
    detail,
  };
  return {
    ...state,
    nextAuditSequence: state.nextAuditSequence + 1,
    auditEvents: [...state.auditEvents, event],
  };
}

export function applyPresentationCommand(
  state: CastraState,
  command: PresentationCommand,
  context: CommandContext,
): CastraState {
  // Refuse the entire new command before allocating IDs, appending a version or auditing.
  if (command.type === "presentation.configuration.save") {
    if (Reflect.ownKeys(command).length !== 2 || !Object.hasOwn(command, "configurationPreferences")) {
      throw new Error("Configuration save accepts only the exact preference command fields.");
    }
    requireConfigurationPreferences(command.configurationPreferences);
  }
  const previous = currentPresentation(state);
  const createdAt = context.now();
  const id = context.id("presentation_settings_version");
  let themeProfileId = previous.themeProfileId;
  let roleProfileName = previous.roleProfileName;
  let aerariumLabelMode = previous.aerariumLabelMode;
  let roles = copyRoles(previous.roles);
  let modelSelections = copyModelSelections(previous.modelSelections);
  let configurationPreferences = previous.configurationPreferences;
  let kind: AuditKind;
  let summary: string;
  let detail: Record<string, string>;

  if (command.type === "presentation.configuration.save") {
    configurationPreferences = requireConfigurationPreferences(command.configurationPreferences);
    kind = "presentation.configuration_saved";
    summary = "Configuration preferences saved; no runtime or provider applied";
    detail = { preferenceSchemaVersion: String(configurationPreferences.schemaVersion), authorityChanged: "false", runtimeApplied: "false", providerActivated: "false", evidenceStored: "false" };
  } else if (command.type === "presentation.profile.apply") {
    const profile = themeProfile(command.themeProfileId);
    if (profile.scope === "public_demo_only" && context.presentationScope !== "public_demo") {
      throw new Error(`${profile.name} is a Public-Demo-only presentation profile and cannot be applied to authoritative or post-login state.`);
    }
    themeProfileId = profile.id;
    roleProfileName = profile.name;
    roles = suppliedRolesFor(profile.id);
    kind = "presentation.profile_applied";
    summary = `Presentation profile applied: ${profile.name}`;
    detail = { themeProfileId: profile.id, canonicalRolesPreserved: "true" };
  } else if (command.type === "presentation.role.update") {
    const updated = validateRoleUpdate(command);
    roles = roles.map((entry) => entry.canonicalId === updated.canonicalId ? updated : entry);
    roleProfileName = "Commander custom role display";
    kind = "presentation.role_updated";
    summary = `Role display updated: ${canonicalRoleNames[updated.canonicalId]}`;
    detail = { canonicalId: updated.canonicalId, displayName: updated.displayName, authorityChanged: "false" };
  } else if (command.type === "presentation.label_mode.change") {
    if (!["icon_only", "icon_compact", "full_name"].includes(command.labelMode)) {
      throw new Error("AERARIUM label mode is invalid.");
    }
    aerariumLabelMode = command.labelMode;
    kind = "presentation.label_mode_changed";
    summary = `AERARIUM role label mode changed: ${command.labelMode}`;
    detail = { labelMode: command.labelMode, canonicalRolesPreserved: "true" };
  } else {
    if (!canonicalRoleIds.includes(command.canonicalId)) throw new Error("Canonical role ID is protected and invalid.");
    if (!roleRuntimeClasses.includes(command.runtimeClass)) throw new Error("Role runtime selection is not recognized.");
    modelSelections = modelSelections.map((entry) => entry.canonicalId === command.canonicalId
      ? runtimeSelection(command.canonicalId, command.runtimeClass)
      : entry);
    kind = "presentation.role_updated";
    summary = `Role model policy updated: ${canonicalRoleNames[command.canonicalId]}`;
    detail = {
      canonicalId: command.canonicalId,
      runtimeClass: command.runtimeClass,
      apiFallbackAllowed: "false",
      authorityChanged: "false",
    };
  }

  validateCanonicalBoundary(roles);
  const version: PresentationSettingsVersion = {
    id,
    familyId: previous.builtIn ? id : previous.familyId,
    version: previous.version + 1,
    supersedesId: previous.builtIn ? null : previous.id,
    createdAt,
    themeProfileId,
    roleProfileName,
    aerariumLabelMode,
    roles,
    modelSelections,
    ...(configurationPreferences === undefined ? {} : { configurationPreferences }),
  };
  return appendPresentationAudit(
    { ...state, presentationVersions: [...state.presentationVersions, version] },
    context,
    version,
    kind,
    summary,
    { ...detail, version: String(version.version), familyId: version.familyId },
  );
}
