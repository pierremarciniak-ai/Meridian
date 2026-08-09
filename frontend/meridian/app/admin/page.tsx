import { AdminDashboard } from "@/components/admin/AdminDashboard";

export default function AdminPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
      <div>
        <h1 className="text-2xl font-semibold text-foam">Administration</h1>
        <p className="mt-1 text-sm text-muted">Réservé au owner du contrat Meridian.</p>
      </div>
      <AdminDashboard />
    </div>
  );
}
