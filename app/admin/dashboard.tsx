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

type Total = { employeeId: number; name: string; minutes: number };

function fmtHours(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

        <h3 style={{ fontSize: 16, marginTop: 20 }}>Total hours</h3>
        {totals.length === 0 ? (
          <p className="muted">No completed sessions in this period.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              {totals.map((t) => (
                <tr key={t.employeeId}>
                  <td>{t.name}</td>
                  <td>{fmtHours(t.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 style={{ fontSize: 16, marginTop: 24 }}>Sessions</h3>
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
                  <td>{fmtDateTime(s.in)}</td>
                  <td>
                    {s.out ? (
                      fmtDateTime(s.out)
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
