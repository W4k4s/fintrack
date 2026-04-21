import type { Detector, IntelScope } from "../types";
import { priceDipDetector } from "./price-dip";
import { fgRegimeDetector } from "./fg-regime";
import { dcaPendingDetector } from "./dca-pending";
import { newsFilterDetector } from "./news-filter";
import { macroCalendarDetector } from "./macro-calendar";
import { marketStressDetector } from "./market-stress";
import { rebalanceDriftDetector } from "./rebalance-drift";
import { taxHarvestWindowDetector } from "./tax-harvest-window";
import { profileReviewDetector } from "./profile-review";
import { concentrationRiskDetector } from "./concentration-risk";
import { correlationRiskDetector } from "./correlation-risk";
import { opportunityDetector } from "./opportunity";
import { thesisWatchDetector } from "./thesis-watch";

export const ALL_DETECTORS: Detector[] = [
  priceDipDetector,
  fgRegimeDetector,
  dcaPendingDetector,
  newsFilterDetector,
  macroCalendarDetector,
  marketStressDetector,
  rebalanceDriftDetector,
  taxHarvestWindowDetector,
  profileReviewDetector,
  concentrationRiskDetector,
  correlationRiskDetector,
  opportunityDetector,
  thesisWatchDetector,
];

export function detectorsForScope(scope: IntelScope | "all"): Detector[] {
  if (scope === "all") return ALL_DETECTORS;
  // Fase 4: thesisWatchDetector engloba 4 sub-scopes thesis_* (target_hit,
  // stop_hit, near_stop, expired). Un debug manual contra cualquiera de ellos
  // debe ejecutar el mismo detector.
  if (scope.startsWith("thesis_")) {
    return ALL_DETECTORS.filter((d) => d.scope === "thesis_stop_hit");
  }
  return ALL_DETECTORS.filter((d) => d.scope === scope);
}
