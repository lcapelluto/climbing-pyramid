import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, TriangleAlert, Check, X, LogOut } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { ensureUserDoc, subscribeUserData, saveClimbs, savePyramidConfig } from "../lib/userData";
import {
  GRADES,
  LOG_GRADES,
  gIndex,
  TYPES,
  typeLabel,
  NAV_TABS,
  CHART_COLORS,
  OUTCOMES,
  DEFAULT_CONFIG,
  todayStr,
  sixMonthsAgoStr,
  computeSlots,
} from "../lib/climbLogic";

export default function PyramidTracker({ uid }) {
  const [climbs, setClimbs] = useState(null);
  const [config, setConfig] = useState(null);
  const [activeType, setActiveType] = useState("redpoint");
  const [error, setError] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [logGrade, setLogGrade] = useState("9");
  const [logDate, setLogDate] = useState(todayStr());
  const [logOutcome, setLogOutcome] = useState("send");
  const [filterMode, setFilterMode] = useState("recent");
  const [showLevel, setShowLevel] = useState(false);
  const [levelGrade, setLevelGrade] = useState("9");
  const [climbsPage, setClimbsPage] = useState(0);
  const CLIMBS_PAGE_SIZE = 10;

  useEffect(() => {
    setClimbsPage(0);
  }, [activeType]);

  useEffect(() => {
    let unsubscribe = () => {};
    (async () => {
      try {
        await ensureUserDoc(uid);
        unsubscribe = subscribeUserData(uid, (data) => {
          setClimbs(data.climbs);
          setConfig(data.pyramidConfig);
        });
      } catch {
        setError("Couldn't load your data. Check your connection and try again.");
        setClimbs([]);
        setConfig(DEFAULT_CONFIG);
      }
    })();
    return () => unsubscribe();
  }, [uid]);

  async function persistClimbs(next) {
    setClimbs(next);
    try {
      await saveClimbs(uid, next);
    } catch {
      setError("Couldn't save that climb. Check your connection and try again.");
    }
  }

  async function persistConfig(next) {
    setConfig(next);
    try {
      await savePyramidConfig(uid, next);
    } catch {
      setError("Couldn't save your pyramid settings.");
    }
  }

  function logClimb(grade, type, date, outcome) {
    setError(null);
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      grade,
      type,
      date,
      outcome,
    };
    persistClimbs([...climbs, entry]);
  }

  function removeClimbById(id) {
    persistClimbs(climbs.filter((c) => c.id !== id));
  }

  function advance() {
    const pyramid = config[activeType];
    const idx = gIndex(pyramid.baseGrade);
    if (idx + 1 >= GRADES.length) return;
    persistConfig({ ...config, [activeType]: { ...pyramid, baseGrade: GRADES[idx + 1] } });
  }

  const isAnalytics = activeType === "analytics";
  const pyramid = config && !isAnalytics ? config[activeType] : null;

  const chartData = useMemo(() => {
    if (!climbs) return [];
    const gradesPresent = GRADES.filter((g) => climbs.some((c) => c.grade === g));
    return gradesPresent.map((g) => {
      const row = { grade: g };
      TYPES.forEach((t) => {
        row[t.key] = climbs.filter((c) => c.grade === g && c.type === t.key).length;
      });
      return row;
    });
  }, [climbs]);

  const cutoff = useMemo(() => sixMonthsAgoStr(), []);
  const filteredClimbs = useMemo(() => {
    if (!climbs) return [];
    return filterMode === "all" ? climbs : climbs.filter((c) => c.date >= cutoff);
  }, [climbs, filterMode, cutoff]);

  const tiers = useMemo(() => {
    if (!pyramid || !filteredClimbs) return [];
    const baseIdx = gIndex(pyramid.baseGrade);
    return pyramid.shape.map((required, i) => {
      const grade = GRADES[baseIdx + i];
      const slots = computeSlots(grade, activeType, required, filteredClimbs);
      const done = slots.filter((s) => s && s.color === "green").length;
      return { grade, required, slots, done, remaining: Math.max(0, required - done) };
    });
  }, [pyramid, filteredClimbs, activeType]);

  const complete = tiers.length > 0 && tiers.every((t) => t.remaining === 0);
  const topGrade = tiers.length ? tiers[tiers.length - 1].grade : pyramid?.baseGrade;
  const nextTopGrade = tiers.length ? GRADES[gIndex(topGrade) + 1] : null;

  useEffect(() => {
    if (topGrade) setLevelGrade(topGrade);
  }, [activeType, topGrade]);

  function setPyramidLevel(topGradeChoice) {
    const shapeLen = pyramid.shape.length;
    const newBaseIdx = Math.max(0, gIndex(topGradeChoice) - (shapeLen - 1));
    persistConfig({ ...config, [activeType]: { ...pyramid, baseGrade: GRADES[newBaseIdx] } });
  }

  const allClimbsForType = climbs
    ? [...climbs]
        .filter((c) => c.type === activeType)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    : [];
  const climbsPageCount = Math.max(1, Math.ceil(allClimbsForType.length / CLIMBS_PAGE_SIZE));
  const pagedClimbs = allClimbsForType.slice(
    climbsPage * CLIMBS_PAGE_SIZE,
    climbsPage * CLIMBS_PAGE_SIZE + CLIMBS_PAGE_SIZE
  );

  useEffect(() => {
    if (climbsPage > climbsPageCount - 1) setClimbsPage(Math.max(0, climbsPageCount - 1));
  }, [climbsPageCount, climbsPage]);

  if (climbs === null || config === null) {
    return (
      <div style={S.page}>
        <style>{CSS}</style>
        <div style={{ ...S.card, textAlign: "center", color: C.textMuted }}>Loading your pyramid…</div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <style>{CSS}</style>

      <div style={S.scrollArea}>
        <div style={S.header}>
          <button aria-label="Sign out" style={S.signOutBtn} onClick={() => signOut(auth)}>
            <LogOut size={16} />
          </button>
          <div style={S.title}>
            {isAnalytics ? "Climb analytics" : `${topGrade} ${typeLabel(activeType)} pyramid`}
          </div>
        </div>

        {error && (
          <div style={S.errorBanner}>
            <TriangleAlert size={15} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {isAnalytics ? (
          <div style={{ ...S.card, marginBottom: 90 }}>
            <div style={S.legendRow}>
              {TYPES.map((t) => (
                <div key={t.key} style={S.legendItem}>
                  <span style={{ ...S.dot, background: CHART_COLORS[t.key] }} />
                  <span style={S.legendLabel}>{t.label}</span>
                </div>
              ))}
            </div>
            {chartData.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 14 }}>Nothing logged yet. Log a climb to see your chart.</div>
            ) : (
              <div style={{ width: "100%", height: 260 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                    <CartesianGrid stroke={C.cardBorder} vertical={false} />
                    <XAxis
                      dataKey="grade"
                      tick={{ fontSize: 11, fill: C.textMuted }}
                      interval={0}
                      angle={-45}
                      textAnchor="end"
                      height={40}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: C.textMuted }}
                      width={36}
                      label={{ value: "climbs", angle: -90, position: "insideLeft", fill: C.textMuted, fontSize: 11 }}
                    />
                    <Tooltip
                      contentStyle={{ background: C.card, border: `1px solid ${C.cardBorder}`, borderRadius: 8, fontSize: 12 }}
                      labelStyle={{ color: C.text, fontWeight: 600 }}
                    />
                    <Bar dataKey="redpoint" stackId="climbs" fill={CHART_COLORS.redpoint} name="Redpoint" barSize={16} />
                    <Bar dataKey="lead" stackId="climbs" fill={CHART_COLORS.lead} name="Lead" barSize={16} />
                    <Bar
                      dataKey="toprope"
                      stackId="climbs"
                      fill={CHART_COLORS.toprope}
                      name="Top rope"
                      barSize={16}
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ ...S.card, position: "relative" }}>
              <div style={S.filterToggle}>
                {[
                  { key: "recent", label: "6 mo" },
                  { key: "all", label: "All" },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => setFilterMode(opt.key)}
                    style={{
                      ...S.filterToggleBtn,
                      background: filterMode === opt.key ? C.gold : "transparent",
                      color: filterMode === opt.key ? "#FFFDF8" : C.textMuted,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div style={S.pyramidWrap}>
                {[...tiers].reverse().map((t) => (
                  <div key={t.grade} style={S.tierRow}>
                    <div style={S.tierGradeLabel}>{t.grade}</div>
                    <div style={S.boxGrid}>
                      {t.slots.map((slot, i) => {
                        const isGreen = slot && slot.color === "green";
                        const bg = !slot ? C.inputBg : slot.color === "green" ? C.green : slot.color === "red" ? C.red : C.yellow;
                        const border = !slot ? C.cardBorder : bg;
                        return (
                          <button
                            key={i}
                            aria-label={isGreen ? `${t.grade} sent` : `Log a send at ${t.grade}`}
                            onClick={isGreen ? undefined : () => logClimb(t.grade, activeType, todayStr(), "send")}
                            style={{ ...S.box, background: bg, borderColor: border, cursor: isGreen ? "default" : "pointer" }}
                          >
                            {slot && slot.color === "green" && <Check size={16} color="#F7F5F0" strokeWidth={3} />}
                            {slot && slot.color === "red" && <X size={15} color="#F7F5F0" strokeWidth={3} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {complete && (
                <div style={S.advanceBox}>
                  <div style={S.advanceText}>Pyramid complete. Ready to move up to {nextTopGrade}?</div>
                  <button style={S.advanceBtn} onClick={advance}>
                    Advance pyramid
                  </button>
                </div>
              )}
            </div>

            <button style={S.logToggle} onClick={() => setShowLog((v) => !v)}>
              <span>Log a specific grade</span>
              {showLog ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showLog && (
              <div style={S.card}>
                <div style={S.formRow}>
                  <label style={S.formLabel}>Grade</label>
                  <select style={S.select} value={logGrade} onChange={(e) => setLogGrade(e.target.value)}>
                    {LOG_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={S.formRow}>
                  <label style={S.formLabel}>Date</label>
                  <input
                    type="date"
                    style={S.input}
                    value={logDate}
                    max={todayStr()}
                    onChange={(e) => setLogDate(e.target.value)}
                  />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ ...S.formLabel, display: "block", marginBottom: 6 }}>Result</label>
                  <div style={S.segmented}>
                    {OUTCOMES.map((o) => {
                      const active = logOutcome === o.key;
                      const color = o.key === "send" ? C.green : o.key === "attempt" ? C.red : C.yellow;
                      return (
                        <button
                          key={o.key}
                          onClick={() => setLogOutcome(o.key)}
                          style={{
                            ...S.segmentBtn,
                            background: active ? color : "transparent",
                            color: active ? "#F7F5F0" : C.textMuted,
                            borderColor: active ? color : C.cardBorder,
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <button style={S.submitBtn} onClick={() => logClimb(logGrade, activeType, logDate, logOutcome)}>
                  <Plus size={16} />
                  Add climb
                </button>
              </div>
            )}

            <button style={S.logToggle} onClick={() => setShowLevel((v) => !v)}>
              <span>Set pyramid level</span>
              {showLevel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showLevel && (
              <div style={S.card}>
                <div style={S.formRow}>
                  <label style={S.formLabel}>Top grade</label>
                  <select style={S.select} value={levelGrade} onChange={(e) => setLevelGrade(e.target.value)}>
                    {LOG_GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <button style={S.submitBtn} onClick={() => setPyramidLevel(levelGrade)}>
                  Set level
                </button>
              </div>
            )}

            <div style={S.sectionLabel}>{typeLabel(activeType).toLowerCase()} climbs</div>
            <div style={{ ...S.card, marginBottom: 14 }}>
              {allClimbsForType.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: 14 }}>Nothing logged yet. Tap a box above to start.</div>
              ) : (
                pagedClimbs.map((c) => (
                  <div key={c.id} style={S.climbRow}>
                    <span
                      style={{
                        ...S.dot,
                        background: c.outcome === "send" ? C.green : c.outcome === "attempt" ? C.red : C.yellow,
                      }}
                    />
                    <span style={S.climbGrade}>{c.grade}</span>
                    <span style={S.climbDate}>{c.date}</span>
                    <button aria-label="Delete climb" style={S.deleteBtn} onClick={() => removeClimbById(c.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>

            {allClimbsForType.length > CLIMBS_PAGE_SIZE && (
              <div style={{ ...S.pagination, marginBottom: 90 }}>
                <button
                  style={S.pageBtn}
                  disabled={climbsPage === 0}
                  onClick={() => setClimbsPage((p) => Math.max(0, p - 1))}
                >
                  Prev
                </button>
                <span style={S.pageLabel}>
                  Page {climbsPage + 1} of {climbsPageCount}
                </span>
                <button
                  style={S.pageBtn}
                  disabled={climbsPage >= climbsPageCount - 1}
                  onClick={() => setClimbsPage((p) => Math.min(climbsPageCount - 1, p + 1))}
                >
                  Next
                </button>
              </div>
            )}
            {allClimbsForType.length <= CLIMBS_PAGE_SIZE && <div style={{ marginBottom: 90 }} />}
          </>
        )}
      </div>

      <div style={S.tabBar}>
        {NAV_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveType(t.key)}
            style={{ ...S.tabBtn, color: activeType === t.key ? C.gold : C.textMuted }}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- theme (light) ----
const C = {
  bg: "#F7F5F0",
  card: "#FFFFFF",
  cardBorder: "#E3DECF",
  text: "#2A2822",
  textMuted: "#8A8478",
  gold: "#B8792A",
  green: "#4F8B5B",
  red: "#C1503A",
  yellow: "#D9A62E",
  inputBg: "#F1EDE2",
};

const CSS = `
  * { box-sizing: border-box; }
  select, input { font-family: inherit; }
`;

const S = {
  page: {
    background: C.bg,
    color: C.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif',
    maxWidth: 480,
    margin: "0 auto",
    minHeight: "100%",
    position: "relative",
    display: "flex",
    flexDirection: "column",
  },
  scrollArea: { padding: "20px 16px 0" },
  header: { marginBottom: 18, textAlign: "center", position: "relative" },
  signOutBtn: {
    position: "absolute",
    right: 0,
    top: 0,
    background: "transparent",
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 8,
    padding: 6,
    color: C.textMuted,
    cursor: "pointer",
    display: "flex",
  },
  title: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.01em", textTransform: "capitalize" },
  card: {
    background: C.card,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
  },
  errorBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    background: "#FBEAE6",
    border: `1px solid ${C.red}`,
    color: "#8C3221",
    borderRadius: 10,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 14,
  },
  pyramidWrap: { display: "flex", flexDirection: "column", alignItems: "center", gap: 10, marginTop: 20 },
  tierRow: { display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: "100%" },
  tierGradeLabel: { fontSize: 12, fontWeight: 600, color: C.textMuted },
  boxGrid: { display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 6 },
  box: {
    width: 32,
    height: 32,
    borderRadius: 7,
    border: "1px solid",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    padding: 0,
    transition: "background 0.15s ease, border-color 0.15s ease",
  },
  filterToggle: {
    position: "absolute",
    top: 12,
    right: 12,
    display: "flex",
    gap: 2,
    background: C.inputBg,
    borderRadius: 8,
    padding: 2,
  },
  filterToggleBtn: {
    border: "none",
    borderRadius: 6,
    padding: "4px 9px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
  },
  advanceBox: {
    marginTop: 14,
    paddingTop: 14,
    borderTop: `1px solid ${C.cardBorder}`,
    textAlign: "center",
  },
  advanceText: { fontSize: 13, color: C.textMuted, marginBottom: 10, textTransform: "capitalize" },
  advanceBtn: {
    background: C.green,
    color: "#F7F5F0",
    border: "none",
    borderRadius: 10,
    padding: "12px 18px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  logToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    background: "transparent",
    border: "none",
    color: C.textMuted,
    fontSize: 13,
    padding: "8px 4px",
    marginBottom: 6,
    cursor: "pointer",
  },
  formRow: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  formLabel: { fontSize: 13, color: C.textMuted },
  select: {
    background: C.inputBg,
    color: C.text,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
  },
  input: {
    background: C.inputBg,
    color: C.text,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
  },
  segmented: { display: "flex", gap: 6 },
  segmentBtn: {
    flex: 1,
    border: "1px solid",
    borderRadius: 8,
    padding: "8px 4px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  submitBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    width: "100%",
    background: C.gold,
    color: "#FFFDF8",
    border: "none",
    borderRadius: 10,
    padding: "11px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    letterSpacing: "0.08em",
    color: C.textMuted,
    textTransform: "uppercase",
    margin: "4px 4px 8px",
  },
  climbRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 0",
    borderBottom: `1px solid ${C.cardBorder}`,
    fontSize: 14,
  },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  legendRow: { display: "flex", gap: 16, marginBottom: 14 },
  legendItem: { display: "flex", alignItems: "center", gap: 6 },
  legendLabel: { fontSize: 12, color: C.textMuted },
  climbGrade: { fontWeight: 600, width: 40 },
  climbDate: { color: C.textMuted, flex: 1 },
  deleteBtn: {
    background: "transparent",
    border: "none",
    color: C.textMuted,
    cursor: "pointer",
    padding: 4,
  },
  pagination: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "2px 4px",
  },
  pageBtn: {
    background: "transparent",
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 8,
    color: C.text,
    fontSize: 13,
    fontWeight: 600,
    padding: "6px 12px",
    cursor: "pointer",
  },
  pageLabel: { fontSize: 12, color: C.textMuted },
  tabBar: {
    position: "sticky",
    bottom: 0,
    display: "flex",
    background: C.card,
    borderTop: `1px solid ${C.cardBorder}`,
    padding: "10px 8px calc(10px + env(safe-area-inset-bottom))",
    marginTop: "auto",
  },
  tabBtn: {
    flex: 1,
    background: "transparent",
    border: "none",
    fontSize: 13,
    fontWeight: 600,
    padding: "8px 4px",
    cursor: "pointer",
  },
};
