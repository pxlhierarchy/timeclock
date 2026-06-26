"use client";

import { useCallback, useEffect, useState } from "react";

type Employee = {
  id: number;
  name: string;
  status: "in" | "out";
  since: string | null;
};

type Result = {
  name: string;
  action: "in" | "out";
  ts: string;
};

type Hours = {
  name: string;
  status: "in" | "out";
  openSince: string | null;
  todayMinutes: number;
  weekMinutes: number;
  timezone: string;
};

function fmtHM(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export default function Kiosk() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/employees", { cache: "no-store" });
      const data = await res.json();
      setEmployees(data.employees ?? []);
    } catch {
      // network hiccup — keep prior list
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onPunched(r: Result) {
    setSelected(null);
    setResult(r);
    load();
    setTimeout(() => setResult(null), 3200);
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">⏱ Time Clock</div>
        <div className="clock">
          <div className="time">
            {now
              ? now.toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "--:--"}
          </div>
          <div className="date">
            {now
              ? now.toLocaleDateString([], {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
              : ""}
          </div>
        </div>
      </div>
      <p className="subtitle">Tap your name to punch in or out.</p>

      {loading ? (
        <p className="muted">Loading…</p>
      ) : employees.length === 0 ? (
        <div className="empty">
          No employees yet. An administrator can add them in the{" "}
          <a href="/admin">admin area</a>.
        </div>
      ) : (
        <div className="grid">
          {employees.map((e) => (
            <button key={e.id} className="emp-card" onClick={() => setSelected(e)}>
              <span className="emp-name">{e.name}</span>
              <span className={`badge ${e.status}`}>
                {e.status === "in" ? "● Clocked in" : "Clocked out"}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="footer-link">
        <a href="/admin">Admin</a>
      </p>

      {selected && (
        <PinPad
          employee={selected}
          onCancel={() => setSelected(null)}
          onPunched={onPunched}
        />
      )}

      {result && (
        <div className="result">
          <div className={`result-card ${result.action}`}>
            <p className="big">
              {result.action === "in" ? "Clocked In ✓" : "Clocked Out ✓"}
            </p>
            <p className="who">
              {result.action === "in" ? "Welcome" : "Goodbye"}, {result.name}!
            </p>
            <span className="at">
              {new Date(result.ts).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

function PinPad({
  employee,
  onCancel,
  onPunched,
}: {
  employee: Employee;
  onCancel: () => void;
  onPunched: (r: Result) => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hours, setHours] = useState<Hours | null>(null);

  const complete = pin.length === 4;

  const punch = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setPin("");
        setBusy(false);
        return;
      }
      onPunched(data as Result);
    } catch {
      setError("Network error. Try again.");
      setPin("");
      setBusy(false);
    }
  }, [employee.id, pin, onPunched]);

  const viewHours = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/my-hours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: employee.id, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        setPin("");
      } else {
        setHours(data as Hours);
      }
    } catch {
      setError("Network error. Try again.");
      setPin("");
    } finally {
      setBusy(false);
    }
  }, [employee.id, pin]);

  function press(digit: string) {
    if (busy || pin.length >= 4) return;
    setError("");
    setPin((p) => p + digit);
  }

  function back() {
    if (busy) return;
    setError("");
    setPin((p) => p.slice(0, -1));
  }

  // Running-total view (shown after a correct PIN + "My hours").
  if (hours) {
    return (
      <div className="overlay" onClick={onCancel}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <h2>{hours.name}</h2>
          <p className="hint">
            {hours.status === "in" && hours.openSince
              ? `Clocked in since ${new Date(hours.openSince).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}`
              : "Clocked out"}
          </p>

          <div className="hours-grid">
            <div className="hours-stat">
              <span className="hours-label">Today</span>
              <span className="hours-value">{fmtHM(hours.todayMinutes)}</span>
            </div>
            <div className="hours-stat">
              <span className="hours-label">This week</span>
              <span className="hours-value">{fmtHM(hours.weekMinutes)}</span>
            </div>
          </div>
          {hours.status === "in" && (
            <p className="muted" style={{ fontSize: 12 }}>
              Includes time on your current shift, still running.
            </p>
          )}

          <button className="btn" style={{ width: "100%" }} onClick={punch} disabled={busy}>
            {employee.status === "in" ? "Clock out now" : "Clock in now"}
          </button>
          <button className="modal-cancel" onClick={onCancel}>
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{employee.name}</h2>
        <p className="hint">Enter your 4-digit PIN</p>

        <div className="pin-dots">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`pin-dot ${i < pin.length ? "filled" : ""}`} />
          ))}
        </div>

        <div className="keypad">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button key={d} className="key" onClick={() => press(d)} disabled={busy}>
              {d}
            </button>
          ))}
          <button className="key wide" onClick={back} disabled={busy}>
            ⌫
          </button>
          <button className="key" onClick={() => press("0")} disabled={busy}>
            0
          </button>
          <button className="key wide" onClick={onCancel} disabled={busy}>
            Esc
          </button>
        </div>

        <p className="modal-error">{error}</p>

        <div className="pin-actions">
          <button className="btn" onClick={punch} disabled={!complete || busy}>
            {employee.status === "in" ? "Clock out" : "Clock in"}
          </button>
          <button className="btn ghost" onClick={viewHours} disabled={!complete || busy}>
            My hours
          </button>
        </div>
        <button className="modal-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
