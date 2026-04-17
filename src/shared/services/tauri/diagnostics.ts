import { exportDiagnostics, openPath } from "@/shared/api/config";

export async function exportDiagnosticsAndOpen(): Promise<void> {
  const result = await exportDiagnostics();
  if (result.path) {
    await openPath(result.path);
  }
}
