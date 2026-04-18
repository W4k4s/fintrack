import type { Detector, IntelScope } from "../types";
import { priceDipDetector } from "./price-dip";
import { fgRegimeDetector } from "./fg-regime";
import { dcaPendingDetector } from "./dca-pending";
import { newsFilterDetector } from "./news-filter";
import { macroCalendarDetector } from "./macro-calendar";

export const ALL_DETECTORS: Detector[] = [
  priceDipDetector,
  fgRegimeDetector,
  dcaPendingDetector,
  newsFilterDetector,
  macroCalendarDetector,
];

export function detectorsForScope(scope: IntelScope | "all"): Detector[] {
  if (scope === "all") return ALL_DETECTORS;
  return ALL_DETECTORS.filter((d) => d.scope === scope);
}
