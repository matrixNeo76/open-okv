/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Micro-Hook per la registrazione diagnostica e l'audit trail delle operazioni sul Vault
 */

import { useState, useCallback } from "react";
import { DiagnosticLog, ResourceItem } from "../../types";
import { auditSetResourcesOperation, SetResourcesTraceContext } from "../../lib/vaultSyncAudit";

export function useVaultAuditTrail(userUid?: string) {
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);

  // Registrazione log strutturati per console e inspector
  const addLog = useCallback(
    (
      level: "info" | "warn" | "error" | "success",
      category: DiagnosticLog["category"],
      message: string,
      data?: any
    ) => {
      let details: string | undefined;
      if (data) {
        try {
          details = typeof data === "string" ? data : JSON.stringify(data, null, 2);
        } catch {
          details = String(data);
        }
      }
      const newLog: DiagnosticLog = {
        id: "log-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        timestamp: new Date().toLocaleTimeString(),
        level,
        category,
        message,
        details,
      };
      setLogs((prev) => [...prev.slice(-150), newLog]);
    },
    []
  );

  // Wrapper controllato per setResources con audit di consistenza
  const createAuditedSetResources = useCallback(
    (setResourcesRaw: React.Dispatch<React.SetStateAction<ResourceItem[]>>) => {
      return (
        action: React.SetStateAction<ResourceItem[]>,
        traceContext?: Partial<SetResourcesTraceContext>
      ) => {
        setResourcesRaw((prev) => {
          const next =
            typeof action === "function"
              ? (action as (prev: ResourceItem[]) => ResourceItem[])(prev)
              : action;

          const ctx: SetResourcesTraceContext = {
            operation: traceContext?.operation || "EXTERNAL_CALLER",
            callerDescription: traceContext?.callerDescription,
            remoteCount: traceContext?.remoteCount,
            docChangesCount: traceContext?.docChangesCount,
            remoteDocIds: traceContext?.remoteDocIds,
            userUid: traceContext?.userUid ?? userUid,
            details: traceContext?.details,
          };

          // Audit dell'operazione per prevenire sovrascritture stantie
          auditSetResourcesOperation(prev, next, ctx, addLog);

          return next;
        });
      };
    },
    [userUid, addLog]
  );

  return {
    logs,
    setLogs,
    addLog,
    createAuditedSetResources,
  };
}
