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

  const submit = useCallback(
    async (value: string) => {
      setBusy(true);
      setError("");
      try {
        const res = await fetch("/api/punch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: employee.id, pin: value }),
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
    },
    [employee.id, onPunched]
  );

  function press(digit: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === 4) submit(next);
  }

  function back() {
    if (busy) return;
    setError("");
    setPin((p) => p.slice(0, -1));
  }

  return (
    <div className="overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{employee.name}</h2>
        <p className="hint">
          {employee.status === "in"
            ? "Enter PIN to clock out"
            : "Enter PIN to clock in"}
        </p>

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
        <button className="modal-cancel" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
