export const POST_LOGIN_NAVIGATION = [
  { view: "overview", label: "Command Overview", glyph: "CO" },
  { view: "war-efforts", label: "War Efforts", glyph: "WE" },
  { view: "campaigns", label: "Campaigns", glyph: "CA" },
  { view: "baseops", label: "BASEOPS", glyph: "BO" },
  { view: "session-board", label: "Session Board", glyph: "SB" },
  { view: "troop-welfare", label: "Troop Welfare", glyph: "TW" },
  { view: "local-models", label: "Local Models", glyph: "LM" },
  { view: "remote-work", label: "Remote Workbench", glyph: "RW" },
  { view: "deployment-workbench", label: "Deployment Workbench", glyph: "DW" },
  { view: "governed-closure", label: "Governed Closure", glyph: "GC" },
  { view: "decision-inbox", label: "Decision Inbox", glyph: "DI" },
  { view: "configuration", label: "Configuration", glyph: "CF" },
  { view: "agents", label: "Agent Boundaries", glyph: "AB" },
  { view: "deployment-guide", label: "Deployment Guide", glyph: "DG" },
] as const;

export const DEMO_NAVIGATION_VIEWS = ["overview", "war-efforts", "campaigns", "baseops", "session-board", "configuration", "troop-welfare", "agents"] as const;
