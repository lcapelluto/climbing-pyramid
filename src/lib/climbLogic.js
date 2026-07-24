// ---- grade system (Yosemite Decimal System, "5." dropped) ----
export const GRADES = (() => {
  const g = [];
  for (let n = 5; n <= 9; n++) g.push(String(n));
  for (let n = 10; n <= 15; n++) {
    for (const l of ["a", "b", "c", "d"]) g.push(`${n}${l}`);
  }
  return g;
})();
export const gIndex = (grade) => GRADES.indexOf(grade);
export const LOG_GRADES = GRADES.slice(gIndex("7"), gIndex("12d") + 1);

// ---- boulder grade system (V-scale, separate from YDS above) ----
// VB ("V-beginner") through V9. Boulder has no pyramid, so this list is only
// ever used for the grade picker and the boulder bar chart's x-axis.
export const BOULDER_GRADES = ["VB", "V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9"];
// Quick-tap grade buttons on the Boulder tab show a fixed subset (VB-V7);
// harder sends are still loggable via the "Log a specific grade" form.
export const BOULDER_QUICK_GRADES = BOULDER_GRADES.slice(0, 9);

export const TYPES = [
  { key: "redpoint", label: "Redpoint" },
  { key: "lead", label: "Lead" },
  { key: "toprope", label: "Top rope", navLabel: "TR" },
  { key: "boulder", label: "Boulder" },
];
export const typeLabel = (key) => TYPES.find((t) => t.key === key)?.label || key;
// Rope types have YDS-grade pyramids and appear in the Analytics chart; boulder does not.
export const ROPE_TYPES = TYPES.filter((t) => t.key !== "boulder");
export const NAV_TABS = [...TYPES, { key: "analytics", label: "Analytics" }];
export const CHART_COLORS = { redpoint: "#DC5B44", lead: "#E8A93D", toprope: "#3E86C7" };

// A flash is a send on the first attempt, so it's listed first and treated as a send
// everywhere box/pyramid/analytics logic cares about "did this count as a success".
export const OUTCOMES = [
  { key: "flash", label: "Flash" },
  { key: "send", label: "Send" },
  { key: "take", label: "Take" },
  { key: "worked", label: "Worked" },
  { key: "attempt", label: "Attempt" },
];
// Boulder problems only ever get flashed, sent, or attempted — no take/worked (those are rope-specific).
export const BOULDER_OUTCOMES = OUTCOMES.filter((o) => o.key === "flash" || o.key === "send" || o.key === "attempt");
// Redpoints are lead sends with no takes, so the only outcomes that make sense are flash/send.
export const REDPOINT_OUTCOMES = OUTCOMES.filter((o) => o.key === "flash" || o.key === "send");
export const outcomeColor = (outcome) =>
  outcome === "send" || outcome === "flash" ? "green" : outcome === "attempt" ? "red" : "yellow";

// Analytics buckets a climb by what it *is*, not how it was logged: a lead "send" or
// "flash" is a redpoint by definition, so it counts under redpoint there. A lead
// take/worked is a normal successful lead ascent, so it counts under lead. A lead
// "attempt" isn't a completed ascent of either kind, so it's excluded from Analytics
// entirely. Toprope counts sends and flashes (unchanged otherwise, matches the pyramid
// view's definition of progress).
export function analyticsType(c) {
  if (c.type === "redpoint") return "redpoint";
  if (c.type === "lead") {
    if (c.outcome === "send" || c.outcome === "flash") return "redpoint";
    if (c.outcome === "take" || c.outcome === "worked") return "lead";
    return null;
  }
  if (c.type === "toprope") return c.outcome === "send" || c.outcome === "flash" ? "toprope" : null;
  return null;
}

export const DEFAULT_SHAPE = [8, 4, 2, 1];
export const DEFAULT_PYRAMID = { baseGrade: "9", shape: DEFAULT_SHAPE };
export const DEFAULT_CONFIG = {
  redpoint: { ...DEFAULT_PYRAMID },
  lead: { ...DEFAULT_PYRAMID },
  toprope: { ...DEFAULT_PYRAMID },
};

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function sixMonthsAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().slice(0, 10);
}

export function threeMonthsAgoStr() {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d.toISOString().slice(0, 10);
}

// derive box slot state for a tier from the full climb log, in chronological order.
// sends and flashes overwrite the oldest non-green slot if one exists, else fill the
// next empty slot. take/worked/attempt fill the next empty slot with their color.
//
// Redpoints are lead sends, so redpoint climbs also count toward the lead pyramid,
// and — the other direction — a "send" or "flash" logged directly as lead is itself a
// redpoint by definition, so it also counts toward the redpoint pyramid.
// And on lead, "take"/"worked" are the normal successful outcome (not a partial
// attempt like they are for redpoint/toprope), so they fill green like a send would.
export function computeSlots(grade, type, required, climbsList) {
  const isLead = type === "lead";
  const isRedpoint = type === "redpoint";
  const relevant = climbsList
    .filter(
      (c) =>
        c.grade === grade &&
        (c.type === type ||
          (isLead && c.type === "redpoint") ||
          (isRedpoint && c.type === "lead" && (c.outcome === "send" || c.outcome === "flash")))
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const slots = Array(required).fill(null);
  for (const c of relevant) {
    if (c.outcome === "send" || c.outcome === "flash" || (isLead && (c.outcome === "take" || c.outcome === "worked"))) {
      let idx = slots.findIndex((s) => s && s.color !== "green");
      if (idx === -1) idx = slots.findIndex((s) => s === null);
      if (idx !== -1) slots[idx] = { color: "green", climbId: c.id };
    } else {
      const idx = slots.findIndex((s) => s === null);
      if (idx !== -1) slots[idx] = { color: outcomeColor(c.outcome), climbId: c.id };
    }
  }
  return slots;
}
