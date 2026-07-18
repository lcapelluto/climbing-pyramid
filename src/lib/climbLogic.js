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

export const TYPES = [
  { key: "redpoint", label: "Redpoint" },
  { key: "lead", label: "Lead" },
  { key: "toprope", label: "Top rope" },
];
export const typeLabel = (key) => TYPES.find((t) => t.key === key)?.label || key;
export const NAV_TABS = [...TYPES, { key: "analytics", label: "Analytics" }];
export const CHART_COLORS = { redpoint: "#DC5B44", lead: "#E8A93D", toprope: "#3E86C7" };

export const OUTCOMES = [
  { key: "send", label: "Send" },
  { key: "take", label: "Take" },
  { key: "worked", label: "Worked" },
  { key: "attempt", label: "Attempt" },
];
export const outcomeColor = (outcome) => (outcome === "send" ? "green" : outcome === "attempt" ? "red" : "yellow");

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

// derive box slot state for a tier from the full climb log, in chronological order.
// sends overwrite the oldest non-green slot if one exists, else fill the next empty slot.
// take/worked/attempt fill the next empty slot with their color.
export function computeSlots(grade, type, required, climbsList) {
  const relevant = climbsList
    .filter((c) => c.grade === grade && c.type === type)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const slots = Array(required).fill(null);
  for (const c of relevant) {
    if (c.outcome === "send") {
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
