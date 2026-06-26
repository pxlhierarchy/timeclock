// Shared in->out punch pairing. Used by the admin report and the employee
// "my hours" endpoint so they always agree on what a "session" is.

export type PunchRow = {
  id: number;
  employee_id: number;
  kind: "in" | "out";
  ts: string;
};

export type PairedSession = {
  employeeId: number;
  inId: number;
  outId: number | null;
  in: string;
  out: string | null;
  minutes: number | null;
};

// Pair each 'in' punch with the following 'out' punch, per employee. Rows MUST
// be sorted by (employee_id, ts) ascending. An unmatched 'in' becomes an open
// session (out/minutes null = still clocked in).
export function pairPunches(rows: PunchRow[]): PairedSession[] {
  const sessions: PairedSession[] = [];
  const open = new Map<number, PunchRow>();

  for (const r of rows) {
    if (r.kind === "in") {
      open.set(r.employee_id, r);
    } else {
      const o = open.get(r.employee_id);
      if (o) {
        sessions.push({
          employeeId: r.employee_id,
          inId: o.id,
          outId: r.id,
          in: o.ts,
          out: r.ts,
          minutes: Math.round(
            (new Date(r.ts).getTime() - new Date(o.ts).getTime()) / 60000
          ),
        });
        open.delete(r.employee_id);
      }
    }
  }

  for (const o of open.values()) {
    sessions.push({
      employeeId: o.employee_id,
      inId: o.id,
      outId: null,
      in: o.ts,
      out: null,
      minutes: null,
    });
  }

  return sessions;
}
