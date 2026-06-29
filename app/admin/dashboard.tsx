"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = { id: number; name: string; pin: string; active: boolean };

type Session = {
  employeeId: number;
  name: string;
  inId: number;
  outId: number | null;
  in: string;
  out: string | null;
  minutes: number | null;
  note: string | null;
  paid: boolean;
  paidAt: string | null;
};

type Total = {
  employeeId: number;
  name: string;
  minutes: number;
  paidMinutes: number;
  unpaidMinutes: number;
  sessions: number;
};

const TZ_KEY = "timeclock.tz";

// Full IANA list when the browser supports it, else a sensible curated fallback.
function timeZoneList(): string[] {
  const sv = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
    .supportedValuesOf;
  if (typeof sv === "function") {
    try {
      return sv("timeZone");
    } catch {
      /* fall through */
    }
  }
  return [
    "America/New_York",
    "America/Chicago",
    "America/Denver",
    "America/Los_Angeles",
    "America/Anchorage",
    "Pacific/Honolulu",
    "UTC",
    "Europe/London",
    "Europe/Paris",
    "Asia/Tokyo",
    "Australia/Sydney",
  ];
}

function browserTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function fmtHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function fmtDateTime(iso: string, tz: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz || undefined,
  });
}

// How far (ms) the given zone is ahead of UTC at `date`.
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const map: Record<string, number> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = Number(p.value);
  }
  const hour = map.hour === 24 ? 0 : map.hour;
  const asUTC = Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second);
  return asUTC - date.getTime();
}

// Interpret a "YYYY-MM-DDTHH:mm" wall-clock string as a time in `timeZone`
// and return the corresponding UTC ISO instant. Falls back to browser-local
// interpretation if no zone is given.
function zonedWallTimeToISO(localStr: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(localStr);
  if (!m) return null;
  if (!timeZone) {
    const d = new Date(localStr);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const [, y, mo, d, h, mi] = m.map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = tzOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset).toISOString();
}

// UTC ISO instant -> "YYYY-MM-DDTHH:mm" wall-clock string in `timeZone`,
// suitable for a <input type="datetime-local"> value.
function isoToZonedInput(iso: string, timeZone: string): string {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || undefined,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(new Date(iso))) {
    if (p.type !== "literal") m[p.type] = p.value;
  }
  const hour = m.hour === "24" ? "00" : m.hour;
  return `${m.year}-${m.month}-${m.day}T${hour}:${m.minute}`;
}

export default function Dashboard() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [totals, setTotals] = useState<Total[]>([]);
  const [days, setDays] = useState(14);

  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [tz, setTz] = useState("");

  // Manual time entry (forgot-to-punch correction).
  const [mEmpId, setMEmpId] = useState("");
  const [mIn, setMIn] = useState("");
  const [mOut, setMOut] = useState("");
  const [mNote, setMNote] = useState("");
  const [mErr, setMErr] = useState("");
  const [mMsg, setMMsg] = useState("");
  const [mBusy, setMBusy] = useState(false);

  // Inline editing of an existing session (keyed by its clock-in punch id).
  const [editId, setEditId] = useState<number | null>(null);
  const [editIn, setEditIn] = useState("");
  const [editOut, setEditOut] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editErr, setEditErr] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  // Load the saved timezone (or fall back to the browser's) once on mount.
  useEffect(() => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem(TZ_KEY) : null;
    setTz(saved || browserTz());
  }, []);

  function changeTz(next: string) {
    setTz(next);
    if (typeof window !== "undefined") localStorage.setItem(TZ_KEY, next);
  }

  const loadEmployees = useCallback(async () => {
    const res = await fetch("/api/admin/employees", { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setEmployees(data.employees ?? []);
    }
  }, []);

  const loadReport = useCallback(async (d: number) => {
    const res = await fetch(`/api/admin/report?days=${d}`, { cache: "no-store" });
    if (res.ok) {
      const data = await res.json();
      setSessions(data.sessions ?? []);
      setTotals(data.totals ?? []);
    }
  }, []);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    loadReport(days);
  }, [loadReport, days]);

  async function addEmployee(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Enter a name.");
    if (!/^\d{4}$/.test(pin)) return setError("PIN must be exactly 4 digits.");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Could not add employee.");
      } else {
        setName("");
        setPin("");
        await loadEmployees();
      }
    } finally {
      setBusy(false);
    }
  }

  async function addManualHours(e: React.FormEvent) {
    e.preventDefault();
    setMErr("");
    setMMsg("");
    if (!mEmpId) return setMErr("Choose an employee.");
    if (!mIn || !mOut) return setMErr("Enter both a clock-in and clock-out time.");
    const inISO = zonedWallTimeToISO(mIn, tz);
    const outISO = zonedWallTimeToISO(mOut, tz);
    if (!inISO || !outISO) return setMErr("Invalid date/time.");
    setMBusy(true);
    try {
      const res = await fetch("/api/admin/punches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: Number(mEmpId),
          inTs: inISO,
          outTs: outISO,
          note: mNote.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMErr(data.error || "Could not add hours.");
      } else {
        setMMsg(`Added ${fmtHours(data.minutes)} for ${data.employee.name}.`);
        setMIn("");
        setMOut("");
        setMNote("");
        await loadReport(days);
      }
    } finally {
      setMBusy(false);
    }
  }

  function startEdit(s: Session) {
    setEditErr("");
    setEditId(s.inId);
    setEditIn(isoToZonedInput(s.in, tz));
    setEditOut(s.out ? isoToZonedInput(s.out, tz) : "");
    setEditNote(s.note ?? "");
  }

  function cancelEdit() {
    setEditId(null);
    setEditErr("");
  }

  async function saveEdit(s: Session) {
    setEditErr("");
    if (!editIn) return setEditErr("Clock-in time is required.");
    const inISO = zonedWallTimeToISO(editIn, tz);
    const outISO = editOut ? zonedWallTimeToISO(editOut, tz) : null;
    if (!inISO || (editOut && !outISO)) return setEditErr("Invalid date/time.");
    setEditBusy(true);
    try {
      const res = await fetch("/api/admin/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inId: s.inId,
          outId: s.outId,
          inTs: inISO,
          outTs: outISO,
          note: editNote.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditErr(data.error || "Could not save.");
      } else {
        setEditId(null);
        await loadReport(days);
      }
    } finally {
      setEditBusy(false);
    }
  }

  async function removeSession(s: Session) {
    if (!confirm(`Remove this ${s.name} entry? This can't be undone.`)) return;
    const res = await fetch("/api/admin/sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inId: s.inId, outId: s.outId }),
    });
    if (res.ok) {
      if (editId === s.inId) setEditId(null);
      await loadReport(days);
    }
  }

  // Mark one or many sessions paid/unpaid (per-row toggle or per-employee bulk).
  const [paidBusy, setPaidBusy] = useState(false);
  async function markPaid(inIds: number[], paid: boolean) {
    if (inIds.length === 0) return;
    setPaidBusy(true);
    try {
      const res = await fetch("/api/admin/paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inIds, paid }),
      });
      if (res.ok) await loadReport(days);
    } finally {
      setPaidBusy(false);
    }
  }

  // All completed, still-unpaid sessions for one employee in the current view.
  function unpaidInIdsFor(employeeId: number): number[] {
    return sessions
      .filter((s) => s.employeeId === employeeId && s.minutes != null && !s.paid)
      .map((s) => s.inId);
  }

  async function removeEmployee(emp: Employee) {
    if (!confirm(`Remove ${emp.name}? Their past records are kept for reports.`)) {
      return;
    }
    await fetch(`/api/admin/employees/${emp.id}`, { method: "DELETE" });
    await loadEmployees();
    await loadReport(days);
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <div className="admin-shell">
      <div className="topbar" style={{ marginBottom: 24 }}>
        <div className="brand">Admin Dashboard</div>
        <div className="row" style={{ alignItems: "center" }}>
          <a href="/" className="btn ghost" style={{ textDecoration: "none" }}>
            Time clock
          </a>
          <button className="btn ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </div>

      <section className="panel">
        <h2>Add employee</h2>
        <form className="row" onSubmit={addEmployee}>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Maria Lopez"
            />
          </div>
          <div className="field">
            <label>4-digit PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              inputMode="numeric"
              style={{ width: 120 }}
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Adding…" : "Add"}
          </button>
        </form>
        <p className="err">{error}</p>
      </section>

      <section className="panel">
        <h2>Employees ({employees.length})</h2>
        {employees.length === 0 ? (
          <p className="muted">No employees yet. Add your first one above.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>PIN</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((emp) => (
                <tr key={emp.id}>
                  <td>{emp.name}</td>
                  <td className="muted">{emp.pin}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="btn danger" onClick={() => removeEmployee(emp)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="panel">
        <h2>Add manual hours</h2>
        <p className="muted" style={{ marginTop: -8, marginBottom: 14, fontSize: 12 }}>
          For someone who forgot to punch. Times are entered in{" "}
          <span className="mono-num">{tz || "…"}</span> (change it in Settings below).
        </p>
        <form className="row" onSubmit={addManualHours}>
          <div className="field" style={{ minWidth: 160 }}>
            <label>Employee</label>
            <select value={mEmpId} onChange={(e) => setMEmpId(e.target.value)}>
              <option value="">Select…</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Clock in</label>
            <input
              type="datetime-local"
              value={mIn}
              onChange={(e) => setMIn(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Clock out</label>
            <input
              type="datetime-local"
              value={mOut}
              onChange={(e) => setMOut(e.target.value)}
            />
          </div>
          <div className="field" style={{ flex: 1, minWidth: 180 }}>
            <label>Note (optional)</label>
            <input
              value={mNote}
              onChange={(e) => setMNote(e.target.value)}
              placeholder="e.g. covered the closing shift"
            />
          </div>
          <button className="btn" type="submit" disabled={mBusy}>
            {mBusy ? "Adding…" : "Add hours"}
          </button>
        </form>
        <p className="err">{mErr}</p>
        {mMsg && (
          <p style={{ color: "var(--green)", fontSize: 13, margin: 0 }}>{mMsg}</p>
        )}
      </section>

      <section className="panel">
        <h2>Settings</h2>
        <div className="field" style={{ maxWidth: 360 }}>
          <label>Time zone (applies to the timesheet below)</label>
          <select value={tz} onChange={(e) => changeTz(e.target.value)}>
            {tz && !timeZoneList().includes(tz) && <option value={tz}>{tz}</option>}
            {timeZoneList().map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </div>
        <p className="muted" style={{ fontSize: 12, marginBottom: 0 }}>
          Saved in this browser. Times below are shown in{" "}
          <span className="mono-num">{tz || "…"}</span>.
        </p>
      </section>

      <section className="panel">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Timesheet</h2>
          <div className="field">
            <label>Period</label>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                color: "var(--text)",
                padding: "10px 12px",
                fontSize: 15,
              }}
            >
              <option value={1}>Today / last 24h</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>
        </div>

        <h3 style={{ marginTop: 20 }}>Total hours by employee</h3>
        {totals.length === 0 ? (
          <p className="muted">No completed sessions in this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Sessions</th>
                <th>Unpaid</th>
                <th>Paid</th>
                <th>Total hours</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => {
                const unpaidIds = unpaidInIdsFor(t.employeeId);
                return (
                  <tr key={t.employeeId}>
                    <td>{t.name}</td>
                    <td>{t.sessions}</td>
                    <td className="mono-num">
                      {t.unpaidMinutes > 0 ? (
                        fmtHours(t.unpaidMinutes)
                      ) : (
                        <span className="muted">0h 0m</span>
                      )}
                    </td>
                    <td className="mono-num muted">{fmtHours(t.paidMinutes)}</td>
                    <td className="mono-num">{fmtHours(t.minutes)}</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      {unpaidIds.length > 0 && (
                        <button
                          className="btn ghost"
                          style={{ padding: "7px 12px", fontSize: 12 }}
                          onClick={() => markPaid(unpaidIds, true)}
                          disabled={paidBusy}
                        >
                          Mark {unpaidIds.length} paid
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <h3 style={{ marginTop: 24 }}>Sessions</h3>
        {sessions.length === 0 ? (
          <p className="muted">No punches in this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Duration</th>
                <th>Note</th>
                <th>Paid</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) =>
                editId === s.inId ? (
                  <tr key={s.inId}>
                    <td>{s.name}</td>
                    <td>
                      <input
                        type="datetime-local"
                        value={editIn}
                        onChange={(e) => setEditIn(e.target.value)}
                        style={{ fontSize: 13, padding: "7px 8px" }}
                      />
                    </td>
                    <td>
                      <input
                        type="datetime-local"
                        value={editOut}
                        onChange={(e) => setEditOut(e.target.value)}
                        style={{ fontSize: 13, padding: "7px 8px" }}
                      />
                      {!s.out && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                          Set a time to close this open session.
                        </div>
                      )}
                    </td>
                    <td className="muted">—</td>
                    <td>
                      <input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        placeholder="Add a note…"
                        style={{ fontSize: 13, padding: "7px 8px", minWidth: 140 }}
                      />
                    </td>
                    <td className="muted">—</td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="btn"
                        style={{ padding: "7px 12px", fontSize: 12 }}
                        onClick={() => saveEdit(s)}
                        disabled={editBusy}
                      >
                        {editBusy ? "Saving…" : "Save"}
                      </button>{" "}
                      <button
                        className="btn ghost"
                        style={{ padding: "7px 12px", fontSize: 12 }}
                        onClick={cancelEdit}
                        disabled={editBusy}
                      >
                        Cancel
                      </button>
                      {editErr && (
                        <div className="err" style={{ textAlign: "left", marginTop: 6 }}>
                          {editErr}
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  <tr key={s.inId}>
                    <td>{s.name}</td>
                    <td>{fmtDateTime(s.in, tz)}</td>
                    <td>
                      {s.out ? (
                        fmtDateTime(s.out, tz)
                      ) : (
                        <span className="pill open">Still clocked in</span>
                      )}
                    </td>
                    <td>{s.minutes != null ? fmtHours(s.minutes) : "—"}</td>
                    <td style={{ maxWidth: 220, whiteSpace: "normal" }}>
                      {s.note ? (
                        s.note
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {s.minutes == null ? (
                        <span className="muted">—</span>
                      ) : s.paid ? (
                        <button
                          className="pill in"
                          title={
                            s.paidAt
                              ? `Paid ${fmtDateTime(s.paidAt, tz)} — click to undo`
                              : "Click to mark unpaid"
                          }
                          onClick={() => markPaid([s.inId], false)}
                          disabled={paidBusy}
                          style={{ cursor: "pointer", appearance: "none", font: "inherit" }}
                        >
                          ✓ Paid
                        </button>
                      ) : (
                        <button
                          className="btn ghost"
                          style={{ padding: "7px 12px", fontSize: 12 }}
                          onClick={() => markPaid([s.inId], true)}
                          disabled={paidBusy}
                        >
                          Mark paid
                        </button>
                      )}
                    </td>
                    <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                      <button
                        className="btn ghost"
                        style={{ padding: "7px 12px", fontSize: 12 }}
                        onClick={() => startEdit(s)}
                      >
                        Edit
                      </button>{" "}
                      <button
                        className="btn danger"
                        onClick={() => removeSession(s)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
