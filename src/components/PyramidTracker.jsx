import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, ChevronDown, ChevronUp, TriangleAlert, Check, X, LogOut, Pencil } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Rectangle } from "recharts";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { ensureUserDoc, subscribeUserData, saveClimbs, savePyramidConfig } from "../lib/userData";
import {
  GRADES,
  LOG_GRADES,
  gIndex,
  ROPE_TYPES,
  typeLabel,
  NAV_TABS,
  CHART_COLORS,
  OUTCOMES,
  BOULDER_GRADES,
  BOULDER_QUICK_GRADES,
  BOULDER_OUTCOMES,
  DEFAULT_CONFIG,
  todayStr,
  sixMonthsAgoStr,
  threeMonthsAgoStr,
  computeSlots,
  analyticsType,
} from "../lib/climbLogic";

// Bars are stacked per grade column, so which series forms the visible top of the bar
// depends on which series have nonzero counts in that specific column. This shape rounds
// only the top of the *last* key (in stack order, bottom to top) with a nonzero value.
function endRoundedBarShape(stackOrder, dataKey) {
  return function BarShape(props) {
    const { x, y, width, height, fill, payload } = props;
    const lastActiveKey = [...stackOrder].reverse().find((k) => (payload[k] || 0) > 0);
    const rounded = lastActiveKey === dataKey;
    return <Rectangle x={x} y={y} width={width} height={height} fill={fill} radius={rounded ? [4, 4, 0, 0] : 0} />;
  };
}

export default function PyramidTracker({ uid }) {
  const [climbs, setClimbs] = useState(null);
  const [config, setConfig] = useState(null);
  const [activeType, setActiveType] = useState("redpoint");
  const [error, setError] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [logGrade, setLogGrade] = useState("9");
  const [logDate, setLogDate] = useState(todayStr());
  const [logOutcome, setLogOutcome] = useState("send");
  const [logNotes, setLogNotes] = useState("");
  const [filterMode, setFilterMode] = useState("recent");
  const [boulderFilterMode, setBoulderFilterMode] = useState("recent");
  const [chartFilter, setChartFilter] = useState(() => new Set());
  const [showLevel, setShowLevel] = useState(false);
  const [levelGrade, setLevelGrade] = useState("9");
  const [climbsPage, setClimbsPage] = useState(0);
  const CLIMBS_PAGE_SIZE = 10;
  const [editingClimbId, setEditingClimbId] = useState(null);
  const [editNotes, setEditNotes] = useState("");

  const isAnalytics = activeType === "analytics";
  const isBoulder = activeType === "boulder";
  // Redpoints are lead sends with no takes — the outcome is always "send",
  // so there's no result to choose (logOutcome resets to "send" on tab change).
  const isRedpoint = activeType === "redpoint";

  useEffect(() => {
    setClimbsPage(0);
    setEditingClimbId(null);
    setEditNotes("");
  }, [activeType]);

  useEffect(() => {
    const grades = isBoulder ? BOULDER_GRADES : LOG_GRADES;
    setLogGrade((g) => (grades.includes(g) ? g : grades[0]));
    // Lead climbs are usually taken, not redpointed, so default the form to "Take".
    setLogOutcome(activeType === "lead" ? "take" : "send");
    setLogNotes("");
  }, [activeType, isBoulder]);

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

  const NOTES_MAX_LENGTH = 1000;

  function logClimb(grade, type, date, outcome, notes = "") {
    const trimmedNotes = notes.trim();
    if (trimmedNotes.length > NOTES_MAX_LENGTH) {
      setError(`Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`);
      return false;
    }
    setError(null);
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      grade,
      type,
      date,
      outcome,
    };
    if (trimmedNotes) entry.notes = trimmedNotes;
    persistClimbs([...climbs, entry]);
    return true;
  }

  function removeClimbById(id) {
    if (editingClimbId === id) {
      setEditingClimbId(null);
      setEditNotes("");
    }
    persistClimbs(climbs.filter((c) => c.id !== id));
  }

  function startEditNotes(c) {
    setError(null);
    setEditingClimbId(c.id);
    setEditNotes(c.notes || "");
  }

  function cancelEditNotes() {
    setEditingClimbId(null);
    setEditNotes("");
  }

  function saveEditNotes(id) {
    const trimmedNotes = editNotes.trim();
    if (trimmedNotes.length > NOTES_MAX_LENGTH) {
      setError(`Notes must be ${NOTES_MAX_LENGTH} characters or fewer.`);
      return;
    }
    setError(null);
    persistClimbs(
      climbs.map((c) => {
        if (c.id !== id) return c;
        if (!trimmedNotes) {
          const { notes, ...rest } = c;
          return rest;
        }
        return { ...c, notes: trimmedNotes };
      })
    );
    setEditingClimbId(null);
    setEditNotes("");
  }

  function advance() {
    const pyramid = config[activeType];
    const idx = gIndex(pyramid.baseGrade);
    if (idx + 1 >= GRADES.length) return;
    persistConfig({ ...config, [activeType]: { ...pyramid, baseGrade: GRADES[idx + 1] } });
  }

  const pyramid = config && !isAnalytics && !isBoulder ? config[activeType] : null;

  // Empty chartFilter means "no filter" (show every type); a non-empty set restricts to those types.
  const visibleChartTypes =
    chartFilter.size === 0 ? ROPE_TYPES.map((t) => t.key) : ROPE_TYPES.filter((t) => chartFilter.has(t.key)).map((t) => t.key);

  function toggleChartFilter(key) {
    setChartFilter((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Analytics only covers rope types and buckets each climb by analyticsType(), not raw
  // c.type — a lead "send" counts as redpoint, a lead take/worked counts as lead, and a
  // lead "attempt" is excluded (see analyticsType() for the full rationale).
  const chartData = useMemo(() => {
    if (!climbs) return [];
    const visible = chartFilter.size === 0 ? ROPE_TYPES.map((t) => t.key) : ROPE_TYPES.filter((t) => chartFilter.has(t.key)).map((t) => t.key);
    const bucketed = climbs
      .map((c) => ({ climb: c, bucket: analyticsType(c) }))
      .filter(({ bucket }) => bucket && visible.includes(bucket));
    const gradesPresent = GRADES.filter((g) => bucketed.some(({ climb }) => climb.grade === g));
    if (gradesPresent.length === 0) return [];
    // Fill in every grade between the lowest and highest logged climb, even ones
    // with zero climbs, so the chart shows a continuous range rather than gaps.
    const minIdx = gIndex(gradesPresent[0]);
    const maxIdx = gIndex(gradesPresent[gradesPresent.length - 1]);
    return GRADES.slice(minIdx, maxIdx + 1).map((g) => {
      const row = { grade: g };
      ROPE_TYPES.forEach((t) => {
        row[t.key] = bucketed.filter(({ climb, bucket }) => climb.grade === g && bucket === t.key).length;
      });
      return row;
    });
  }, [climbs, chartFilter]);

  const cutoff = useMemo(() => sixMonthsAgoStr(), []);
  const cutoffBoulder = useMemo(() => threeMonthsAgoStr(), []);
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
        // Redpoints are lead sends, so they show up in the lead list, and a lead
        // "send" is itself a redpoint by definition, so it shows up in that list too.
        .filter(
          (c) =>
            c.type === activeType ||
            (activeType === "lead" && c.type === "redpoint") ||
            (activeType === "redpoint" && c.type === "lead" && c.outcome === "send")
        )
        .filter((c) => !isBoulder || boulderFilterMode === "all" || c.date >= cutoffBoulder)
        .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    : [];

  // Unlike the rope pyramid's 6mo filter (which never touches the climb list), the boulder
  // 3mo/All toggle scopes both the chart and the list below it — an intentional difference.
  const boulderChartData = useMemo(() => {
    if (!isBoulder) return [];
    // Only show the range of grades actually logged (lowest through highest),
    // not the full VB-V9 scale — gaps within that range still show as zero.
    const gradesLogged = BOULDER_GRADES.filter((g) => allClimbsForType.some((c) => c.grade === g));
    if (gradesLogged.length === 0) return [];
    const minIdx = BOULDER_GRADES.indexOf(gradesLogged[0]);
    const maxIdx = BOULDER_GRADES.indexOf(gradesLogged[gradesLogged.length - 1]);
    return BOULDER_GRADES.slice(minIdx, maxIdx + 1).map((g) => ({
      grade: g,
      send: allClimbsForType.filter((c) => c.grade === g && c.outcome === "send").length,
      attempt: allClimbsForType.filter((c) => c.grade === g && c.outcome === "attempt").length,
    }));
  }, [allClimbsForType, isBoulder]);

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
            {isAnalytics
              ? "Climb analytics"
              : isBoulder
              ? "Boulders"
              : `${topGrade} ${typeLabel(activeType)} pyramid`}
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
              {ROPE_TYPES.map((t) => {
                const active = visibleChartTypes.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => toggleChartFilter(t.key)}
                    style={{ ...S.legendItem, opacity: active ? 1 : 0.4 }}
                  >
                    <span style={{ ...S.dot, background: CHART_COLORS[t.key] }} />
                    <span style={S.legendLabel}>{t.label}</span>
                  </button>
                );
              })}
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
                    {ROPE_TYPES.map((t) => (
                      <Bar
                        key={t.key}
                        dataKey={t.key}
                        stackId="climbs"
                        fill={CHART_COLORS[t.key]}
                        name={t.label}
                        barSize={16}
                        shape={endRoundedBarShape(
                          ROPE_TYPES.map((rt) => rt.key),
                          t.key
                        )}
                        activeBar={false}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        ) : (
          <>
            {!isBoulder && (
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
                          const boxOutcome = activeType === "lead" ? "take" : "send";
                          return (
                            <button
                              key={i}
                              aria-label={isGreen ? `${t.grade} sent` : `Log a ${boxOutcome} at ${t.grade}`}
                              onClick={isGreen ? undefined : () => logClimb(t.grade, activeType, todayStr(), boxOutcome)}
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
            )}

            {isBoulder && (
              <div style={{ ...S.card, position: "relative" }}>
                <div style={S.filterToggle}>
                  {[
                    { key: "recent", label: "3 mo" },
                    { key: "all", label: "All" },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setBoulderFilterMode(opt.key)}
                      style={{
                        ...S.filterToggleBtn,
                        background: boulderFilterMode === opt.key ? C.gold : "transparent",
                        color: boulderFilterMode === opt.key ? "#FFFDF8" : C.textMuted,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {boulderChartData.every((r) => r.send === 0 && r.attempt === 0) ? (
                  <div style={{ color: C.textMuted, fontSize: 14, marginTop: 8 }}>
                    Nothing logged yet. Tap a grade below to start.
                  </div>
                ) : (
                  <div style={{ width: "100%", height: 220 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={boulderChartData} margin={{ top: 4, right: 4, left: -20, bottom: 4 }}>
                        <CartesianGrid stroke={C.cardBorder} vertical={false} />
                        <XAxis dataKey="grade" tick={{ fontSize: 11, fill: C.textMuted }} interval={0} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.textMuted }} width={28} />
                        <Bar
                          dataKey="send"
                          stackId="boulders"
                          fill={C.green}
                          name="Send"
                          barSize={18}
                          shape={endRoundedBarShape(["send", "attempt"], "send")}
                          activeBar={false}
                        />
                        <Bar
                          dataKey="attempt"
                          stackId="boulders"
                          fill={C.yellow}
                          name="Attempt"
                          barSize={18}
                          shape={endRoundedBarShape(["send", "attempt"], "attempt")}
                          activeBar={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div style={S.quickGradeRow}>
                  {BOULDER_QUICK_GRADES.map((g) => (
                    <button
                      key={g}
                      aria-label={`Log a send at ${g}`}
                      style={S.quickGradeBtn}
                      onClick={() => logClimb(g, activeType, todayStr(), "send")}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button style={S.logToggle} onClick={() => setShowLog((v) => !v)}>
              <span>Log a specific grade</span>
              {showLog ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showLog && (
              <div style={S.card}>
                <div style={S.formRow}>
                  <label style={S.formLabel}>Grade</label>
                  <select style={S.select} value={logGrade} onChange={(e) => setLogGrade(e.target.value)}>
                    {(isBoulder ? BOULDER_GRADES : LOG_GRADES).map((g) => (
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
                {!isRedpoint && (
                  <div style={{ marginBottom: 10 }}>
                    <label style={{ ...S.formLabel, display: "block", marginBottom: 6 }}>Result</label>
                    <div style={S.segmented}>
                      {(isBoulder ? BOULDER_OUTCOMES : OUTCOMES).map((o) => {
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
                )}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <label style={S.formLabel}>Notes</label>
                    <span style={S.notesCounter}>
                      {logNotes.length}/{NOTES_MAX_LENGTH}
                    </span>
                  </div>
                  <textarea
                    style={S.textarea}
                    value={logNotes}
                    maxLength={NOTES_MAX_LENGTH}
                    placeholder="Location, color…"
                    onChange={(e) => setLogNotes(e.target.value)}
                  />
                </div>
                <button
                  style={S.submitBtn}
                  onClick={() => {
                    if (logClimb(logGrade, activeType, logDate, logOutcome, logNotes)) setLogNotes("");
                  }}
                >
                  <Plus size={16} />
                  Add climb
                </button>
              </div>
            )}

            {!isBoulder && (
              <button style={S.logToggle} onClick={() => setShowLevel((v) => !v)}>
                <span>Set pyramid level</span>
                {showLevel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            )}

            {!isBoulder && showLevel && (
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
                <div style={{ color: C.textMuted, fontSize: 14 }}>
                  Nothing logged yet. Tap a {isBoulder ? "grade" : "box"} above to start.
                </div>
              ) : (
                pagedClimbs.map((c) => (
                  <div key={c.id} style={S.climbRow}>
                    <div style={S.climbRowMain}>
                      <span
                        style={{
                          ...S.dot,
                          background: c.outcome === "send" ? C.green : c.outcome === "attempt" ? C.red : C.yellow,
                        }}
                      />
                      <span style={S.climbGrade}>{c.grade}</span>
                      <span style={S.climbDate}>{c.date}</span>
                      {editingClimbId !== c.id && (
                        <button aria-label="Edit notes" style={S.deleteBtn} onClick={() => startEditNotes(c)}>
                          <Pencil size={14} />
                        </button>
                      )}
                      <button aria-label="Delete climb" style={S.deleteBtn} onClick={() => removeClimbById(c.id)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {editingClimbId === c.id ? (
                      <div style={S.editNotesWrap}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <label style={S.formLabel}>Notes</label>
                          <span style={S.notesCounter}>
                            {editNotes.length}/{NOTES_MAX_LENGTH}
                          </span>
                        </div>
                        <textarea
                          style={S.textarea}
                          value={editNotes}
                          maxLength={NOTES_MAX_LENGTH}
                          placeholder="Location, color…"
                          autoFocus
                          onChange={(e) => setEditNotes(e.target.value)}
                        />
                        <div style={S.editActions}>
                          <button style={S.editCancelBtn} onClick={cancelEditNotes}>
                            <X size={14} />
                            Cancel
                          </button>
                          <button style={S.editSaveBtn} onClick={() => saveEditNotes(c.id)}>
                            <Check size={14} />
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      c.notes && <div style={S.climbNotes}>{c.notes}</div>
                    )}
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
            {t.navLabel || t.label}
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
    zIndex: 1,
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
  quickGradeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
    marginTop: 16,
  },
  quickGradeBtn: {
    minWidth: 52,
    padding: "10px 8px",
    borderRadius: 10,
    border: `1px solid ${C.cardBorder}`,
    background: C.inputBg,
    color: C.text,
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
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
  textarea: {
    width: "100%",
    background: C.inputBg,
    color: C.text,
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 8,
    padding: "8px 10px",
    fontSize: 14,
    resize: "vertical",
    minHeight: 60,
  },
  notesCounter: { fontSize: 11, color: C.textMuted },
  editNotesWrap: { marginTop: 8 },
  editActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  editCancelBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: "transparent",
    border: `1px solid ${C.cardBorder}`,
    borderRadius: 8,
    color: C.textMuted,
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 10px",
    cursor: "pointer",
  },
  editSaveBtn: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    background: C.gold,
    border: "none",
    borderRadius: 8,
    color: "#FFFDF8",
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 10px",
    cursor: "pointer",
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
    padding: "8px 0",
    borderBottom: `1px solid ${C.cardBorder}`,
    fontSize: 14,
  },
  climbRowMain: { display: "flex", alignItems: "center", gap: 10 },
  climbNotes: {
    marginTop: 4,
    marginLeft: 18,
    color: C.textMuted,
    fontSize: 13,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  dot: { width: 8, height: 8, borderRadius: "50%", flexShrink: 0 },
  legendRow: { display: "flex", gap: 16, marginBottom: 14 },
  legendItem: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "none",
    padding: 0,
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s ease",
  },
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
