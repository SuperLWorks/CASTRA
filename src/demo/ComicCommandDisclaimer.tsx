import { COMIC_COMMAND_FAN_DISCLAIMER } from "../domain/presentation";

export function ComicCommandDisclaimer({ active }: { active: boolean }) {
  if (!active) return null;
  return <span className="comic-fan-disclaimer">{COMIC_COMMAND_FAN_DISCLAIMER}</span>;
}
