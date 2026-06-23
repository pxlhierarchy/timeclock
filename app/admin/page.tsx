import { isAuthed } from "@/app/lib/auth";
import Login from "./login";
import Dashboard from "./dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await isAuthed();
  return authed ? <Dashboard /> : <Login />;
}
