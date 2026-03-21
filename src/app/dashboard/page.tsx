import { Suspense } from "react";
import DashboardClient from "./DashboardClient";

export default function DashboardPage() {
  return (
    <Suspense fallback={<main style={{ padding: 40, fontFamily: "Arial" }}>Chargement...</main>}>
      <DashboardClient />
    </Suspense>
  );
}