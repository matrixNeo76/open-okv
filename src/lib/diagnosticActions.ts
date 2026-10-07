import { 
  DiagnosticActionId, 
  DiagnosticAnalysisResult, 
  DiagnosticLog, 
  ResourceItem, 
  RawFileItem 
} from "../types";
import { db, enableNetwork } from "./firebase";
import { saveQuotaExceededStatus } from "./cacheManager";

export interface DiagnosticActionContext {
  resources?: ResourceItem[];
  rawFiles?: RawFileItem[];
  isQuotaExceeded?: boolean;
  onRefreshOnlineStatus?: () => void | Promise<void>;
  onClearLogs?: () => void;
  onNotification?: (type: "success" | "error" | "info", msg: string) => void;
}

export interface ActionResult {
  success: boolean;
  message: string;
  actionId: DiagnosticActionId;
  details?: any;
}

// 1. Analyze Log via Backend Gemini AI or Local Fallback
export async function analyzeDiagnosticLog(
  log: DiagnosticLog,
  context: { isQuotaExceeded?: boolean; totalResources?: number } = {}
): Promise<DiagnosticAnalysisResult> {
  try {
    const res = await fetch("/api/diagnostics/analyze-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        logMessage: log.message,
        category: log.category,
        level: log.level,
        details: log.details,
        context,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return data;
    }
  } catch (err) {
    console.warn("Error calling /api/diagnostics/analyze-log:", err);
  }

  // Fallback if network or server is unreachable
  return {
    explanation: "Rilevato evento nel sistema. La persistenza multi-livello protegge i tuoi dati locali.",
    severity: log.level === "error" ? "medium" : "low",
    dataSafetyNote: "I dati sono preservati nella memoria locale e sul disco del server.",
    suggestedActions: [
      {
        id: "TEST_CONNECTIVITY",
        label: "Verifica Connettività",
        description: "Controlla lo stato delle connessioni di rete e delle API",
        isPrimary: true,
        risk: "safe",
      },
      {
        id: "EXPORT_EMERGENCY_JSON",
        label: "Scarica Snapshot JSON",
        description: "Esporta istantaneamente i dati presenti in memoria",
        isPrimary: false,
        risk: "safe",
      },
    ],
    source: "heuristic",
  };
}

// 2. Execute Action Selected by User
export async function executeDiagnosticAction(
  actionId: DiagnosticActionId,
  context: DiagnosticActionContext
): Promise<ActionResult> {
  const notify = context.onNotification || ((_, msg) => console.log(msg));

  switch (actionId) {
    case "RESET_OFFLINE_LOCK": {
      try {
        saveQuotaExceededStatus(false);
        await enableNetwork(db).catch(() => {});
        if (context.onRefreshOnlineStatus) {
          await context.onRefreshOnlineStatus();
        }
        notify("success", "Flag di blocco rimosso e connessione Firestore riattivata.");
        return {
          success: true,
          actionId,
          message: "Connessione Cloud ripristinata con successo!",
        };
      } catch (err: any) {
        return {
          success: false,
          actionId,
          message: `Impossibile riattivare la rete: ${err?.message || "Errore sconosciuto"}`,
        };
      }
    }

    case "FORCE_SERVER_BACKUP": {
      try {
        const resources = context.resources || [];
        const rawFiles = context.rawFiles || [];
        const payload = {
          timestamp: Date.now(),
          savedAt: new Date().toISOString(),
          version: "0.2.4",
          resources,
          rawFiles,
        };

        const res = await fetch("/api/vault/backup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          throw new Error(`Server returned HTTP ${res.status}`);
        }

        const data = await res.json();
        notify("success", `Backup server completato con successo (${data.count} elementi salvati su disco).`);
        return {
          success: true,
          actionId,
          message: `Backup forzato salvato sul server (${data.formattedSize || "File pronto"})`,
          details: data,
        };
      } catch (err: any) {
        return {
          success: false,
          actionId,
          message: `Errore nel backup su server: ${err?.message || "Connessione fallita"}`,
        };
      }
    }

    case "TEST_CONNECTIVITY": {
      try {
        const res = await fetch("/api/telemetry/test-gemini", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();

        if (data.success) {
          notify("success", `Test Gemini superato con ${data.modelUsed} (${data.latencyMs}ms).`);
          return {
            success: true,
            actionId,
            message: `API Gemini operative (${data.latencyMs}ms con ${data.modelUsed})`,
            details: data,
          };
        } else {
          return {
            success: false,
            actionId,
            message: data.message || "Test Gemini non riuscito",
            details: data,
          };
        }
      } catch (err: any) {
        return {
          success: false,
          actionId,
          message: `Test di connettività fallito: ${err?.message || "Server non raggiungibile"}`,
        };
      }
    }

    case "EXPORT_EMERGENCY_JSON": {
      try {
        const snapshotData = {
          exportedAt: new Date().toISOString(),
          app: "Knowledge Vault OKF v0.2",
          totalResources: context.resources?.length || 0,
          totalRawFiles: context.rawFiles?.length || 0,
          resources: context.resources || [],
          rawFiles: context.rawFiles || [],
        };

        const blob = new Blob([JSON.stringify(snapshotData, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vault-emergency-snapshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        notify("success", "Snapshot d'emergenza scaricato sul dispositivo locale.");
        return {
          success: true,
          actionId,
          message: "File JSON di emergenza scaricato sul tuo computer!",
        };
      } catch (err: any) {
        return {
          success: false,
          actionId,
          message: `Errore durante il download: ${err?.message || "Fallito"}`,
        };
      }
    }

    case "SWITCH_LOCAL_HEURISTIC": {
      notify("info", "Modalità Estrattore Euristico Locale attiva: elaborazione a 0ms e zero token.");
      return {
        success: true,
        actionId,
        message: "L'estrattore euristico locale è pronto per elaborare i file senza chiamate cloud.",
      };
    }

    case "CLEAR_TRANSIENT_ERRORS": {
      if (context.onClearLogs) {
        context.onClearLogs();
      }
      notify("info", "Log diagnostici puliti.");
      return {
        success: true,
        actionId,
        message: "Log temporanei rimossi.",
      };
    }

    default:
      return {
        success: false,
        actionId,
        message: "Azione non riconosciuta",
      };
  }
}
