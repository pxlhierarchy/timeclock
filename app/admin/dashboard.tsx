"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = { id: number; name: string; pin: string; active: boolean };

type Session = {
  employeeId: number;
  name: string;
  in: string;
  out: string | null;
  minutes: number | null;
};

type Total = { employeeId: number; name: string; minutes: number; sessions: number };

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
  const [mErr, setMErr] = useState("");
  const [mMsg, setMMsg] = useState("");
  const [mBusy, setMBusy] = useState(false);

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
        body: JSON.stringify({ employeeId: Number(mEmpId), inTs: inISO, outTs: outISO }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMErr(data.error || "Could not add hours.");
      } else {
        setMMsg(`Added ${fmtHours(data.minutes)} for ${data.employee.name}.`);
        setMIn("");
        setMOut("");
        await loadReport(days);
      }
    } finally {
      setMBusy(false);
    }
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
                <th>Total hours</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.employeeId}>
                  <td>{t.name}</td>
                  <td>{t.sessions}</td>
                  <td className="mono-num">{fmtHours(t.minutes)}</td>
                </tr>
              ))}
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
              </tr>
            </thead>
            <tbody>
              {sessions.map((s, i) => (
                <tr key={i}>
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
