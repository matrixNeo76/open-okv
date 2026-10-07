/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Micro-Hook per la riconciliazione conflitti a tre vie tra Firestore e Storage locale
 */

import { useState } from "react";
import { User } from "../../lib/firebase";
import {
  db,
  doc,
  addDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  enableNetwork,
  disableNetwork,
} from "../../lib/firebase";
import { ResourceItem, DiagnosticLog } from "../../types";
import { analyzeResourceConflicts, ConflictAnalysisResult } from "../../lib/conflictResolver";
import { parseDate } from "../../lib/dateUtils";
import { recordFirestoreError } from "../../lib/quotaTelemetry";
import { updateCacheTimestamp } from "../../lib/cacheManager";
import {
  sanitizeForFirestore,
  withFirestoreTimeout,
  saveLocalResources,
  isQuotaError,
} from "./vaultCommon";

export interface VaultConflictResolverProps {
  resources: ResourceItem[];
  resourcesRef: React.MutableRefObject<ResourceItem[]>;
  setResources: (
    updater: ResourceItem[] | ((prev: ResourceItem[]) => ResourceItem[]),
    context?: any
  ) => void;
  user: User | null;
  quotaExceeded: boolean;
  setQuotaExceeded: (exceeded: boolean) => void;
  wasQuotaExceededRef: React.MutableRefObject<boolean>;
  setLastSyncTime: (date: Date) => void;
  addLog: (level: "info" | "warn" | "error" | "success", category: DiagnosticLog["category"], message: string, data?: any) => void;
  setStatusMessage: (msg: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
  setIsSyncing: (syncing: boolean) => void;
}

export function useVaultConflictResolver({
  resources,
  resourcesRef,
  setResources,
  user,
  quotaExceeded,
  setQuotaExceeded,
  wasQuotaExceededRef,
  setLastSyncTime,
  addLog,
  setStatusMessage,
  setErrorMessage,
  setIsSyncing,
}: VaultConflictResolverProps) {
  const [conflictAnalysis, setConflictAnalysis] = useState<ConflictAnalysisResult | null>(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [isApplyingMerge, setIsApplyingMerge] = useState(false);
  const [storageDiscrepancyNotice, setStorageDiscrepancyNotice] = useState<string | null>(null);

  // Check Conflicts between local memory and Firestore
  const handleCheckConflicts = async () => {
    if (!user) return;
    try {
      const resourcesRefCollection = collection(db, "resources");
      const q = query(resourcesRefCollection, where("userId", "==", user.uid));
      const snap = await getDocs(q);
      const items: ResourceItem[] = [];
      snap.forEach((docSnap) => {
        const rawData = docSnap.data() as Omit<ResourceItem, "id">;
        const validatedCreatedAt = parseDate(rawData.createdAt) || parseDate(rawData.updatedAt) || new Date();
        items.push({
          id: docSnap.id,
          ...rawData,
          createdAt: rawData.createdAt ? (parseDate(rawData.createdAt) ? rawData.createdAt : validatedCreatedAt) : validatedCreatedAt,
        });
      });
      const analysis = analyzeResourceConflicts(resourcesRef.current, items);
      setConflictAnalysis(analysis);
      setIsConflictModalOpen(true);
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        setErrorMessage("Quota Firestore esaurita.");
      }
    }
  };

  // Apply resolved merge back to Firestore and local state
  const handleApplyConflictMerge = async (resolvedItems: ResourceItem[], toUpload: ResourceItem[]) => {
    if (!user) return;
    setIsApplyingMerge(true);
    addLog("info", "FIRESTORE", `Avvio applicazione merge: ${resolvedItems.length} risorse totali, ${toUpload.length} da inviare a Firestore...`);
    
    try {
      let uploadCount = 0;
      if (toUpload.length > 0) {
        for (const item of toUpload) {
          const docRef = doc(db, "resources", item.id);
          const cleanPayload = sanitizeForFirestore({
            userId: user.uid,
            type: item.type,
            title: item.title,
            url: item.url || "",
            rawInput: item.rawInput || "",
            summary: item.summary,
            tags: item.tags || [],
            isFavorite: item.isFavorite || false,
            rating: item.rating,
            metadata: item.metadata || {},
            createdAt: parseDate(item.createdAt) || new Date(),
            updatedAt: serverTimestamp(),
          });
          await setDoc(docRef, cleanPayload);
          uploadCount++;
        }
        addLog("success", "FIRESTORE", `Caricate ${uploadCount} risorse su Firestore durante la riconciliazione.`);
      }

      setResources(resolvedItems, {
        operation: "CONFLICT_MERGE_APPLY",
        callerDescription: `Applicazione manuale/guidata merge conflitti (${resolvedItems.length} risorse unificate)`,
        details: { count: resolvedItems.length, uploadedCount: uploadCount },
      });
      saveLocalResources(resolvedItems, user.uid);
      setQuotaExceeded(false);
      wasQuotaExceededRef.current = false;
      setLastSyncTime(new Date());
      updateCacheTimestamp();
      setIsConflictModalOpen(false);
      setConflictAnalysis(null);
      setStatusMessage(`Merge completato: ${resolvedItems.length} risorse unificate e sincronizzate con il cloud.`);
      setTimeout(() => setStatusMessage(null), 5000);
      addLog("success", "FIRESTORE", `Riconciliazione conflitti completata con successo (${resolvedItems.length} risorse totali).`);
    } catch (err: any) {
      console.error("Conflict merge error:", err);
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        addLog("warn", "FIRESTORE", "Quota Firestore ancora esaurita durante il merge. Le modifiche rimangono protette in locale.");
        setErrorMessage("Quota Firestore non ancora reimpostata. Le modifiche rimangono protette in memoria locale e su disco.");
      } else {
        addLog("error", "FIRESTORE", `Errore applicazione merge: ${err.message}`, err);
        setErrorMessage(`Errore merge: ${err.message}`);
      }
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsApplyingMerge(false);
    }
  };

  // Upload local-only resources directly to Firestore
  const handleUploadUnsyncedResources = async () => {
    if (!user) {
      setErrorMessage("Nessun utente attivo per inviare a Firestore. Accedi con Google.");
      setTimeout(() => setErrorMessage(null), 4000);
      return;
    }

    const localOnly = resources.filter(
      (r) =>
        r.id.startsWith("local-") ||
        r.id.startsWith("conv-") ||
        r.id.startsWith("seed-") ||
        r.id.startsWith("okf-sync-") ||
        r.id.startsWith("spec-")
    );

    if (localOnly.length === 0) {
      setStatusMessage("Tutte le risorse sono già collegate a Firestore!");
      setTimeout(() => setStatusMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    addLog("info", "FIRESTORE", `Caricamento di ${localOnly.length} risorse locali su Firestore...`);

    try {
      await enableNetwork(db).catch(() => {});
      const updatedResources = [...resources];
      let uploadedCount = 0;

      for (const item of localOnly) {
        const rawData = {
          userId: user.uid,
          type: item.type,
          title: item.title,
          url: item.url || "",
          rawInput: item.rawInput || "",
          summary: item.summary,
          tags: item.tags || [],
          isFavorite: item.isFavorite || false,
          rating: item.rating,
          metadata: item.metadata || {},
          createdAt: parseDate(item.createdAt) || new Date(),
          updatedAt: serverTimestamp(),
        };

        const docRef = await withFirestoreTimeout(
          addDoc(collection(db, "resources"), sanitizeForFirestore(rawData)),
          8000
        );

        const targetIdx = updatedResources.findIndex((r) => r.id === item.id);
        if (targetIdx !== -1) {
          updatedResources[targetIdx] = {
            ...item,
            id: (docRef as any).id,
            userId: user.uid,
            createdAt: item.createdAt || new Date(),
            updatedAt: new Date(),
          };
        }
        uploadedCount++;
      }

      setResources(updatedResources, {
        operation: "UPLOAD_UNSYNCED_LOCAL",
        callerDescription: `Caricamento di ${uploadedCount} risorse locali in Firestore`,
        details: { uploadedCount, totalItems: updatedResources.length },
      });
      saveLocalResources(updatedResources, user.uid);
      setQuotaExceeded(false);
      wasQuotaExceededRef.current = false;
      setLastSyncTime(new Date());
      updateCacheTimestamp();
      addLog("success", "FIRESTORE", `Caricate con successo ${uploadedCount} risorse su Firestore!`);
      setStatusMessage(`Caricate con successo ${uploadedCount} risorse su Firestore!`);
      setTimeout(() => setStatusMessage(null), 4000);
    } catch (err: any) {
      recordFirestoreError(err, "Caricamento Risorse Locali");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        disableNetwork(db).catch(() => {});
        addLog("warn", "FIRESTORE", "Quota Firestore esaurita durante l'invio. Le risorse rimangono protette in memoria locale.");
        setErrorMessage("Quota Firestore esaurita. Le risorse rimangono protette in locale.");
      } else {
        addLog("error", "FIRESTORE", `Errore durante caricamento su Firestore: ${err.message}`, err);
        setErrorMessage(`Errore caricamento: ${err.message}`);
      }
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  return {
    conflictAnalysis,
    setConflictAnalysis,
    isConflictModalOpen,
    setIsConflictModalOpen,
    isApplyingMerge,
    storageDiscrepancyNotice,
    setStorageDiscrepancyNotice,
    handleCheckConflicts,
    handleApplyConflictMerge,
    handleUploadUnsyncedResources,
  };
}
