import { GALACTIC_COMMAND_BRIDGE_DISCLAIMER } from "../domain/presentation";

export function GalacticCommandBridgeDisclaimer({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="galactic-command-disclaimer">{GALACTIC_COMMAND_BRIDGE_DISCLAIMER}</span>;
}
