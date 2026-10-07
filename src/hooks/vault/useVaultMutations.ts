/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Micro-Hook per la gestione atomica delle mutazioni sulle risorse del Vault
 */

import { User } from "../../lib/firebase";
import {
  db,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  disableNetwork,
  signInAnonymously,
  auth,
} from "../../lib/firebase";
import { ResourceItem, DiagnosticLog } from "../../types";
import {
  recordFirestoreWrite,
  recordFirestoreDelete,
  recordFirestoreError,
} from "../../lib/quotaTelemetry";
import { recordLifecycleEvent } from "../../lib/resourceLifecycleTracker";
import { saveQuotaExceededStatus } from "../../lib/cacheManager";
import {
  sanitizeForFirestore,
  withFirestoreTimeout,
  recordDeletedResourceId,
  saveLocalResources,
  isQuotaError,
  isNetworkOrTimeoutError,
} from "./vaultCommon";

export interface VaultMutationsProps {
  resources: ResourceItem[];
  setResources: (
    updater: ResourceItem[] | ((prev: ResourceItem[]) => ResourceItem[]),
    context?: any
  ) => void;
  user: User | null;
  setUser: (user: User | null) => void;
  quotaExceeded: boolean;
  setQuotaExceeded: (exceeded: boolean) => void;
  wasQuotaExceededRef: React.MutableRefObject<boolean>;
  addLog: (level: "info" | "warn" | "error" | "success", category: DiagnosticLog["category"], message: string, data?: any) => void;
  setStatusMessage: (msg: string | null) => void;
  setErrorMessage: (msg: string | null) => void;
}

export function useVaultMutations({
  resources,
  setResources,
  user,
  setUser,
  quotaExceeded,
  setQuotaExceeded,
  wasQuotaExceededRef,
  addLog,
  setStatusMessage,
  setErrorMessage,
}: VaultMutationsProps) {
  // 1. Toggle Favorite
  const handleToggleFavorite = async (id: string) => {
    const resource = resources.find((r) => r.id === id);
    const currentFav = Boolean(resource?.isFavorite ?? resource?.metadata?.isFavorite);
    const newFav = !currentFav;

    setResources((prev) => {
      const updated = prev.map((item) =>
        item.id === id
          ? { ...item, isFavorite: newFav, metadata: { ...item.metadata, isFavorite: newFav } }
          : item
      );
      saveLocalResources(updated, user?.uid);
      return updated;
    }, {
      operation: "TOGGLE_FAVORITE",
      callerDescription: `${newFav ? "Aggiunto ai" : "Rimosso dai"} preferiti: "${resource?.title || id}"`,
      details: { id, isFavorite: newFav },
    });

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-")) {
      return;
    }

    try {
      const docRef = doc(db, "resources", id);
      const updatedMetadata = {
        ...(resource?.metadata || {}),
        isFavorite: newFav,
      };

      await withFirestoreTimeout(
        setDoc(
          docRef,
          sanitizeForFirestore({
            metadata: updatedMetadata,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ),
        20000
      );

      addLog("info", "FIRESTORE", `Preferito aggiornato nel cloud per "${resource?.title || id}": ${newFav ? "SI" : "NO"}`);
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Preferito memorizzato in locale; sincronizzazione remota in corso (latenza di rete).`);
        console.warn("Favorite toggle saved locally (network latency):", err?.message || err);
        return;
      }
      console.warn("Favorite toggle cloud error, local state preserved:", err?.message || err);
    }
  };

  // 2. Update Reading Progress
  const handleUpdateReadingProgress = async (id: string, progress: number) => {
    try {
      const resource = resources.find((r) => r.id === id);
      const clamped = Math.max(0, Math.min(100, Math.round(progress)));
      const status: "unread" | "in_progress" | "completed" = clamped === 100 ? "completed" : clamped > 0 ? "in_progress" : "unread";

      setResources((prev) => {
        const updated = prev.map((item) =>
          item.id === id
            ? { ...item, metadata: { ...item.metadata, readingProgress: clamped, readingStatus: status } }
            : item
        );
        saveLocalResources(updated, user?.uid);
        return updated;
      }, {
        operation: "READING_PROGRESS",
        callerDescription: `Avanzamento lettura per "${resource?.title || id}": ${clamped}%`,
        details: { id, clamped, status },
      });

      if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-")) {
        return;
      }

      const docRef = doc(db, "resources", id);
      const updatedMetadata = {
        ...(resource?.metadata || {}),
        readingProgress: clamped,
        readingStatus: status,
      };

      await withFirestoreTimeout(
        setDoc(
          docRef,
          sanitizeForFirestore({
            metadata: updatedMetadata,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ),
        20000
      );

      addLog("info", "FIRESTORE", `Avanzamento lettura aggiornato per "${resource?.title || id}": ${clamped}%`);
    } catch (err: any) {
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Avanzamento lettura memorizzato in locale; sincronizzazione remota differita.`);
        console.warn("Reading progress saved locally (network latency):", err?.message || err);
        return;
      }
      console.warn("Reading progress update non-fatal issue:", err?.message || err);
    }
  };

  // 3. Update Resource
  const handleUpdateResource = async (id: string, updatedData: Partial<ResourceItem>): Promise<boolean> => {
    setResources((prev) => {
      const updated = prev.map((item) =>
        item.id === id
          ? {
              ...item,
              ...updatedData,
              metadata: {
                ...(item.metadata || {}),
                ...(updatedData.metadata || {}),
              },
            }
          : item
      );
      saveLocalResources(updated, user?.uid);
      return updated;
    }, {
      operation: "UPDATE_RESOURCE",
      callerDescription: `Aggiornamento risorsa ${id}`,
      details: { id, fields: Object.keys(updatedData) },
    });

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-") || id.startsWith("conv-")) {
      return true;
    }

    try {
      const existing = resources.find((r) => r.id === id);
      const mergedMetadata = updatedData.metadata
        ? { ...(existing?.metadata || {}), ...updatedData.metadata }
        : undefined;

      const docRef = doc(db, "resources", id);
      const dataToClean = {
        ...updatedData,
        ...(mergedMetadata ? { metadata: mergedMetadata } : {}),
        ...(updatedData.url !== undefined ? { url: updatedData.url.trim() } : {}),
        updatedAt: serverTimestamp(),
      };
      delete (dataToClean as any).id;
      const sanitized = sanitizeForFirestore(dataToClean);
      await withFirestoreTimeout(setDoc(docRef, sanitized, { merge: true }), 20000);
      recordFirestoreWrite(1, "Aggiornamento Risorsa", (updatedData as any).title || id);
      return true;
    } catch (err: any) {
      recordFirestoreError(err, "Aggiornamento Risorsa");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        return true;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Aggiornamento risorsa "${(updatedData as any).title || id}" salvato in locale; sincronizzazione cloud in attesa.`);
        console.warn("Update saved locally, cloud sync deferred due to network latency:", err?.message || err);
        return true;
      }
      console.warn("Update non-fatal error, local data preserved:", err?.message || err);
      return true;
    }
  };

  // 4. Delete Resource
  const handleDeleteResource = async (id: string): Promise<boolean> => {
    let activeUser = user || auth.currentUser;
    if (!activeUser) {
      try {
        const anonCred = await signInAnonymously(auth);
        activeUser = anonCred.user;
        setUser(activeUser);
      } catch (authErr: any) {
        addLog("warn", "FIRESTORE", "Tentativo di eliminazione senza utente autenticato.");
        setErrorMessage("Errore di autenticazione. Riprova tra un istante.");
        setTimeout(() => setErrorMessage(null), 4000);
        return false;
      }
    }

    const targetItem = resources.find((r) => r.id === id);
    recordLifecycleEvent({
      stage: "RESOURCE_DELETED",
      resourceId: id,
      resourceTitle: targetItem?.title || id,
      resourceType: targetItem?.type,
      status: "info",
      message: `Eliminazione richiesta per risorsa "${targetItem?.title || id}" (ID: ${id})`,
      details: { id, title: targetItem?.title, type: targetItem?.type },
    });

    const previousResources = [...resources];
    recordDeletedResourceId(id);

    setResources((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveLocalResources(updated, activeUser?.uid);
      return updated;
    }, {
      operation: "DELETE_RESOURCE",
      callerDescription: `Eliminazione risorsa "${targetItem?.title || id}" (ID: ${id})`,
      details: { id, title: targetItem?.title },
    });

    if (quotaExceeded || id.startsWith("local-") || id.startsWith("seed-") || id.startsWith("sample-") || id.startsWith("conv-")) {
      setStatusMessage("Risorsa rimossa dal Vault.");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    }

    try {
      addLog("info", "FIRESTORE", `Eliminazione risorsa ID: ${id}...`);
      await withFirestoreTimeout(deleteDoc(doc(db, "resources", id)), 20000);
      recordFirestoreDelete(1, "Eliminazione Risorsa", id);
      addLog("success", "FIRESTORE", `Risorsa eliminata con successo dal Vault (ID: ${id})`);
      setStatusMessage("Risorsa eliminata con successo!");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    } catch (err: any) {
      recordFirestoreError(err, "Eliminazione Risorsa");
      if (isQuotaError(err)) {
        setQuotaExceeded(true);
        wasQuotaExceededRef.current = true;
        saveQuotaExceededStatus(true);
        disableNetwork(db).catch(() => {});
        setStatusMessage("Risorsa rimossa dalla memoria locale.");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      if (isNetworkOrTimeoutError(err)) {
        addLog("warn", "FIRESTORE", `Risorsa rimossa in locale; eliminazione cloud differita per latenza di rete.`);
        console.warn("Delete completed locally, remote deletion queued/deferred:", err?.message || err);
        setStatusMessage("Risorsa rimossa dal Vault.");
        setTimeout(() => setStatusMessage(null), 3000);
        return true;
      }
      console.warn("Delete non-fatal error, local deletion preserved:", err);
      setStatusMessage("Risorsa rimossa in locale.");
      setTimeout(() => setStatusMessage(null), 3000);
      return true;
    }
  };

  return {
    handleToggleFavorite,
    handleUpdateReadingProgress,
    handleUpdateResource,
    handleDeleteResource,
  };
}
