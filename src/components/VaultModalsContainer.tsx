/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { ResourceItem, DiagnosticLog, RawFileItem, NavCategory } from "../types";
import { User, enableNetwork, db } from "../lib/firebase";
import { saveQuotaExceededStatus } from "../lib/cacheManager";
import { ResourceModal } from "./ResourceModal";
import { KnowledgeReader } from "./KnowledgeReader";
import { KnowledgeUploadDialog } from "./KnowledgeUploadDialog";
import { AddResourceDialog } from "./AddResourceDialog";
import { DiagnosticDrawer } from "./DiagnosticDrawer";
import { ExportBackupDialog } from "./ExportBackupDialog";
import { PrintPreviewModal } from "./PrintPreviewModal";
import { ConflictResolutionModal } from "./ConflictResolutionModal";
import { GoogleDriveModal } from "./GoogleDriveModal";
import { RecoveryModal } from "./RecoveryModal";
import { PersistenceStatusModal } from "./PersistenceStatusModal";
import { CekikjInspectorModal } from "./CekikjInspectorModal";
import { VaultIntelligenceDrawer } from "./VaultIntelligenceDrawer";
import { DiscrepancyInspectorModal } from "./DiscrepancyInspectorModal";
import { VaultHealthCheckDrawer } from "./VaultHealthCheckDrawer";
import { FeedItem } from "./RssFeedViewer";

export interface VaultModalsContainerProps {
  // Vault Health Check Diagnostic Drawer
  isVaultHealthCheckOpen?: boolean;
  setIsVaultHealthCheckOpen?: (open: boolean) => void;

  // Discrepancy & Lifecycle Inspector
  isDiscrepancyInspectorOpen?: boolean;
  setIsDiscrepancyInspectorOpen?: (open: boolean) => void;

  // Detail Modal
  selectedResourceForDetail: ResourceItem | null;
  setSelectedResourceForDetail: React.Dispatch<React.SetStateAction<ResourceItem | null>>;
  isInitialEditForDetail?: boolean;
  setIsInitialEditForDetail?: (val: boolean) => void;
  resources: ResourceItem[];
  handleUpdateResource: (id: string, updatedData: Partial<ResourceItem>) => Promise<boolean>;
  handleDeleteResource: (id: string) => Promise<boolean>;
  handleToggleFavorite: (id: string, currentFav: boolean) => Promise<void>;
  onToggleReadLater?: (id: string, currentlyInQueue: boolean) => void;
  
  // Reader Modal
  selectedKnowledgeForReader: ResourceItem | null;
  setSelectedKnowledgeForReader: React.Dispatch<React.SetStateAction<ResourceItem | null>>;
  onOpenComparison?: (resource: ResourceItem) => void;

  // Print & Export
  printPreviewResource: ResourceItem | null;
  setPrintPreviewResource: (res: ResourceItem | null) => void;
  isPrintDossierOpen: boolean;
  setIsPrintDossierOpen: (open: boolean) => void;
  filteredResources: ResourceItem[];
  handleExportGoogleDoc: (res: ResourceItem) => void;

  // Knowledge Upload & Add Resource
  isKnowledgeUploadOpen: boolean;
  setIsKnowledgeUploadOpen: (open: boolean) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  handleManualAdd: (newResource: Omit<ResourceItem, "id" | "userId" | "createdAt" | "updatedAt">) => Promise<boolean>;
  analyzeWithAI: (input: string, explicitType?: any) => Promise<any>;

  // Diagnostics & Logs
  isDiagnosticOpen: boolean;
  setIsDiagnosticOpen: (open: boolean) => void;
  logs: DiagnosticLog[];
  setLogs: React.Dispatch<React.SetStateAction<DiagnosticLog[]>>;
  addLog: (level: DiagnosticLog["level"], category: DiagnosticLog["category"], message: string, details?: any) => void;
  userId?: string;
  rawFiles: RawFileItem[];
  quotaExceeded: boolean;
  setQuotaExceeded: (val: boolean) => void;
  handleTriggerSync: () => void;
  setStatusMessage: (msg: string | null) => void;

  // Export Dialog
  isExportOpen: boolean;
  setIsExportOpen: (open: boolean) => void;
  currentCategory: NavCategory;
  selectedTag: string | null;
  searchQuery: string;

  // Conflict Resolution
  isConflictModalOpen: boolean;
  setIsConflictModalOpen: (open: boolean) => void;
  conflictAnalysis: any;
  handleApplyConflictMerge: (resolved: ResourceItem[], toUpload: ResourceItem[]) => Promise<void>;
  isApplyingMerge: boolean;

  // Google Drive
  isGoogleDriveOpen: boolean;
  setIsGoogleDriveOpen: (open: boolean) => void;
  googleDriveExportResource: ResourceItem | null;
  setGoogleDriveExportResource: (res: ResourceItem | null) => void;
  handleCapture: (input: string, explicitType?: any, extraMetadata?: Record<string, any>) => Promise<boolean>;

  // Recovery & Discrepancy
  isRecoveryModalOpen: boolean;
  setIsRecoveryModalOpen: (open: boolean) => void;
  setCurrentCategory: (cat: NavCategory) => void;
  setSelectedTag: (tag: string | null) => void;
  setSearchQuery: (q: string) => void;
  setResources: React.Dispatch<React.SetStateAction<ResourceItem[]>>;
  saveLocalResources: (items: ResourceItem[], uid?: string, currentRawFiles?: RawFileItem[]) => void;
  setStorageDiscrepancyNotice: (notice: any) => void;

  // Persistence Status
  isPersistenceModalOpen: boolean;
  setIsPersistenceModalOpen: (open: boolean) => void;
  user: User | null;
  handleGoogleSignIn: () => Promise<void>;
  handleUploadUnsyncedResources: () => Promise<void>;
  isSyncing: boolean;

  // Cekikj Inspector
  isCekikjModalOpen: boolean;
  setIsCekikjModalOpen: (open: boolean) => void;

  // Intelligence Drawer
  isIntelligenceDrawerOpen: boolean;
  setIsIntelligenceDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
  intelligencePrefilledQuery: string;
  setIntelligencePrefilledQuery: (query: string) => void;
  setViewMode: (mode: any) => void;
  onNavigateToGraphNode?: (resourceId: string) => void;
}

export function VaultModalsContainer({
  isVaultHealthCheckOpen = false,
  setIsVaultHealthCheckOpen,
  isDiscrepancyInspectorOpen = false,
  setIsDiscrepancyInspectorOpen,
  selectedResourceForDetail,
  setSelectedResourceForDetail,
  isInitialEditForDetail = false,
  setIsInitialEditForDetail,
  resources,
  handleUpdateResource,
  handleDeleteResource,
  handleToggleFavorite,
  onToggleReadLater,
  selectedKnowledgeForReader,
  setSelectedKnowledgeForReader,
  onOpenComparison,
  printPreviewResource,
  setPrintPreviewResource,
  isPrintDossierOpen,
  setIsPrintDossierOpen,
  filteredResources,
  handleExportGoogleDoc,
  isKnowledgeUploadOpen,
  setIsKnowledgeUploadOpen,
  isAddModalOpen,
  setIsAddModalOpen,
  handleManualAdd,
  analyzeWithAI,
  isDiagnosticOpen,
  setIsDiagnosticOpen,
  logs,
  setLogs,
  addLog,
  userId,
  rawFiles,
  quotaExceeded,
  setQuotaExceeded,
  handleTriggerSync,
  setStatusMessage,
  isExportOpen,
  setIsExportOpen,
  currentCategory,
  selectedTag,
  searchQuery,
  isConflictModalOpen,
  setIsConflictModalOpen,
  conflictAnalysis,
  handleApplyConflictMerge,
  isApplyingMerge,
  isGoogleDriveOpen,
  setIsGoogleDriveOpen,
  googleDriveExportResource,
  setGoogleDriveExportResource,
  handleCapture,
  isRecoveryModalOpen,
  setIsRecoveryModalOpen,
  setCurrentCategory,
  setSelectedTag,
  setSearchQuery,
  setResources,
  saveLocalResources,
  setStorageDiscrepancyNotice,
  isPersistenceModalOpen,
  setIsPersistenceModalOpen,
  user,
  handleGoogleSignIn,
  handleUploadUnsyncedResources,
  isSyncing,
  isCekikjModalOpen,
  setIsCekikjModalOpen,
  isIntelligenceDrawerOpen,
  setIsIntelligenceDrawerOpen,
  intelligencePrefilledQuery,
  setIntelligencePrefilledQuery,
  setViewMode,
  onNavigateToGraphNode,
}: VaultModalsContainerProps) {
  const handleIngestFeedItem = async (item: FeedItem) => {
    const isArxiv = item.link.includes("arxiv.org") || Boolean(item.pdfUrl);
    const arxivMatch = item.link.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]+\.[0-9]+(?:v[0-9]+)?)/i);

    const success = await handleManualAdd({
      type: isArxiv ? "paper" : "article",
      title: item.title,
      url: item.link,
      summary: item.summary || `Articolo importato dal feed RSS: ${item.title}`,
      rawInput: `${item.title}\n\n${item.summary}\n\nLink: ${item.link}`,
      tags: Array.from(new Set(["feed-item", ...(isArxiv ? ["arxiv", "paper"] : ["article"]), ...(item.categories || [])])),
      metadata: {
        authors: item.author ? [item.author] : undefined,
        arxivId: arxivMatch ? arxivMatch[1] : undefined,
        pdfUrl: item.pdfUrl,
        publishedYear: item.pubDate ? new Date(item.pubDate).getFullYear() : new Date().getFullYear(),
        domain: isArxiv ? "Artificial Intelligence & Computer Science" : "Software & Technology",
        docType: isArxiv ? "research" : "guide",
        markdownContent: `# ${item.title}\n\n**Autore**: ${item.author || "N/D"}\n**Fonte**: [${item.link}](${item.link})\n**Data**: ${item.pubDate || "N/D"}\n\n## Abstract / Sommario\n\n${item.summary}\n\n${item.content ? `## Contenuto del Feed\n\n${item.content}` : ""}`,
      },
    });

    if (success) {
      setStatusMessage(`"${item.title.slice(0, 35)}..." salvato con successo nel Vault!`);
      setTimeout(() => setStatusMessage(null), 4000);
    }
  };

  return (
    <>
      {/* Resource Detail & Edit Modal */}
      <ResourceModal
        resource={selectedResourceForDetail}
        allResources={resources}
        initialEdit={isInitialEditForDetail}
        onClose={() => {
          setSelectedResourceForDetail(null);
          setIsInitialEditForDetail?.(false);
        }}
        onUpdate={handleUpdateResource}
        onDelete={handleDeleteResource}
        onToggleFavorite={handleToggleFavorite}
        onToggleReadLater={onToggleReadLater}
        onPrintPreview={(res) => setPrintPreviewResource(res)}
        onExportGoogleDoc={handleExportGoogleDoc}
        onIngestFeedItem={handleIngestFeedItem}
        onViewInGraph={(res) => {
          setSelectedResourceForDetail(null);
          onNavigateToGraphNode?.(res.id);
        }}
        onNavigateToResource={(res) => {
          setSelectedResourceForDetail(res);
        }}
      />

      {/* OKF Knowledge Markdown Reader & Explorer Modal */}
      {selectedKnowledgeForReader && (
        <KnowledgeReader
          resource={selectedKnowledgeForReader}
          allResources={resources}
          onClose={() => setSelectedKnowledgeForReader(null)}
          onOpenEdit={(res) => {
            setSelectedKnowledgeForReader(null);
            setIsInitialEditForDetail?.(true);
            setSelectedResourceForDetail(res);
          }}
          onUpdate={handleUpdateResource}
          onPrintPreview={(res) => setPrintPreviewResource(res)}
          onExportGoogleDoc={handleExportGoogleDoc}
          onOpenComparison={onOpenComparison}
          onViewInGraph={(res) => {
            setSelectedKnowledgeForReader(null);
            onNavigateToGraphNode?.(res.id);
          }}
          onNavigateToResource={(res) => {
            if (res.type === "knowledge") {
              setSelectedKnowledgeForReader(res);
            } else {
              setSelectedKnowledgeForReader(null);
              setSelectedResourceForDetail(res);
            }
          }}
        />
      )}

      {/* Knowledge Upload Dialog (OKF v0.2 Converter) */}
      <KnowledgeUploadDialog
        isOpen={isKnowledgeUploadOpen}
        onClose={() => setIsKnowledgeUploadOpen(false)}
        onUploadProcessedDoc={handleManualAdd}
        existingResources={resources}
        onAddLog={addLog}
      />

      {/* Manual / AI Add Dialog */}
      <AddResourceDialog
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleManualAdd}
        onAnalyzeWithAI={analyzeWithAI}
        existingResources={resources}
        onOpenIntelligence={(query) => {
          if (query) setIntelligencePrefilledQuery(query);
          setIsAddModalOpen(false);
          setIsIntelligenceDrawerOpen(true);
        }}
        onAddLog={addLog}
      />

      {/* Live System Activity & Diagnostic Drawer */}
      <DiagnosticDrawer
        isOpen={isDiagnosticOpen}
        onClose={() => setIsDiagnosticOpen(false)}
        logs={logs}
        onClearLogs={() => setLogs([])}
        userId={userId}
        totalResources={resources.length}
        resources={resources}
        rawFiles={rawFiles}
        isQuotaExceeded={quotaExceeded}
        onRefreshOnlineStatus={async () => {
          setQuotaExceeded(false);
          saveQuotaExceededStatus(false);
          await enableNetwork(db).catch(() => {});
          addLog("success", "FIRESTORE", "Rete Firestore ripristinata dal centro di auto-risoluzione.");
          handleTriggerSync();
        }}
        onNotification={(type, msg) => {
          addLog(type === "success" ? "success" : type === "error" ? "error" : "info", "SYSTEM", msg);
          setStatusMessage(msg);
          setTimeout(() => setStatusMessage(null), 4000);
        }}
      />

      {/* Export / Backup Dialog (JSON, CSV, Markdown, Server Snapshot) */}
      <ExportBackupDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        resources={resources}
        currentCategory={currentCategory}
        selectedTag={selectedTag}
        searchQuery={searchQuery}
        onAddLog={addLog}
        rawFiles={rawFiles}
        userId={userId}
      />

      {/* Single Resource Print Preview Modal */}
      <PrintPreviewModal
        isOpen={!!printPreviewResource}
        onClose={() => setPrintPreviewResource(null)}
        resource={printPreviewResource}
      />

      {/* Multi-Resource / Collection Print Dossier Preview Modal */}
      <PrintPreviewModal
        isOpen={isPrintDossierOpen}
        onClose={() => setIsPrintDossierOpen(false)}
        resources={filteredResources}
        title={`Dossier Knowledge Vault (${filteredResources.length} schede)`}
      />

      {/* Local vs Firestore Conflict Resolution & Auto-Merge Modal */}
      <ConflictResolutionModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
        analysis={conflictAnalysis}
        onApplyMerge={handleApplyConflictMerge}
        isApplying={isApplyingMerge}
      />

      {/* Google Drive & Docs Hub (Cartella 'knowledge') */}
      <GoogleDriveModal
        isOpen={isGoogleDriveOpen}
        onClose={() => {
          setIsGoogleDriveOpen(false);
          setGoogleDriveExportResource(null);
        }}
        vaultResources={resources}
        onIngestContent={handleCapture}
        selectedResourceForExport={googleDriveExportResource}
        onResourceExported={(resourceId, exportResult) => {
          handleUpdateResource(resourceId, {
            metadata: {
              gdocId: exportResult.docId,
              gdocUrl: exportResult.docUrl,
              gdocExportedAt: new Date().toISOString(),
              gdriveSourceId: exportResult.folderId,
            },
          });
          setStatusMessage(`Esportato con successo in Google Doc: "${exportResult.title}"`);
          setTimeout(() => setStatusMessage(null), 4000);
        }}
      />

      {/* Centro di Recupero & Protezione Dati Multi-Livello */}
      <RecoveryModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setIsRecoveryModalOpen(false)}
        currentResources={resources}
        currentCategory={currentCategory}
        selectedTag={selectedTag}
        searchQuery={searchQuery}
        onResetFilters={() => {
          setCurrentCategory("all");
          setSelectedTag(null);
          setSearchQuery("");
        }}
        currentUserId={userId}
        rawFiles={rawFiles}
        onApplyRestoredResources={(recovered) => {
          setResources(recovered);
          saveLocalResources(recovered, userId, rawFiles);
          setStatusMessage(`Ripristinate con successo ${recovered.length} risorse nel Knowledge Vault!`);
          setStorageDiscrepancyNotice(null);
          addLog("success", "BACKUP", `Ripristino completato: ${recovered.length} risorse attive nel Vault.`);
          setTimeout(() => setStatusMessage(null), 5000);
        }}
      />

      {/* Stato Persistenza & Architettura a 3 Livelli Modal */}
      <PersistenceStatusModal
        isOpen={isPersistenceModalOpen}
        onClose={() => setIsPersistenceModalOpen(false)}
        user={user}
        onSignInWithGoogle={handleGoogleSignIn}
        resources={resources}
        onUploadUnsynced={handleUploadUnsyncedResources}
        isSyncing={isSyncing}
        quotaExceeded={quotaExceeded}
        onApplyRestoredResources={(restored) => {
          setResources(restored);
          saveLocalResources(restored);
          setStatusMessage(`Ripristinate con successo ${restored.length} schede dal backup.`);
          addLog("success", "BACKUP", `Ripristinate ${restored.length} risorse attive nel Vault.`);
          setTimeout(() => setStatusMessage(null), 5000);
        }}
      />

      {/* Epistemic Zero-Guessing Architecture Inspector (Trilogia Cekikj) */}
      <CekikjInspectorModal
        isOpen={isCekikjModalOpen}
        onClose={() => setIsCekikjModalOpen(false)}
        resources={resources}
        onNotification={(typeOrMsg, maybeMsg) => {
          const text = maybeMsg || typeOrMsg;
          setStatusMessage(text);
          setTimeout(() => setStatusMessage(null), 4000);
        }}
      />

      {/* Slide-over Intelligence Drawer with Multi-Agent Orchestrator */}
      <VaultIntelligenceDrawer
        isOpen={isIntelligenceDrawerOpen}
        onClose={() => {
          setIsIntelligenceDrawerOpen(false);
          setIntelligencePrefilledQuery("");
        }}
        initialQuery={intelligencePrefilledQuery}
        onClearInitialQuery={() => setIntelligencePrefilledQuery("")}
        resources={resources}
        activeCategory={currentCategory}
        activeTag={selectedTag}
        onOpenCekikjModal={() => setIsCekikjModalOpen(true)}
        onOpenResource={(res) => {
          if (res.type === "knowledge") {
            setSelectedKnowledgeForReader(res);
          } else {
            setSelectedResourceForDetail(res);
          }
        }}
        onShowInGraph={(_nodeIds) => {
          setViewMode("graph");
          setIsIntelligenceDrawerOpen(false);
        }}
        onSaveAsNote={async (payload) => {
          return await handleManualAdd({
            title: payload.title,
            type: "knowledge",
            summary: payload.summary,
            tags: payload.tags,
            metadata: {
              okfVersion: "0.2",
              domain: payload.domain || "AI Intelligence Synthesis",
              docType: "concept",
              markdownContent: payload.markdown,
              entities: payload.entities || [],
              relations: payload.relations || [],
            },
          });
        }}
      />

      {/* Discrepancy & Lifecycle Inspector Modal */}
      {isDiscrepancyInspectorOpen && setIsDiscrepancyInspectorOpen && (
        <DiscrepancyInspectorModal
          isOpen={isDiscrepancyInspectorOpen}
          onClose={() => setIsDiscrepancyInspectorOpen(false)}
          resources={resources}
          filteredResources={filteredResources}
          rawFiles={rawFiles}
          currentCategory={currentCategory}
          setCurrentCategory={setCurrentCategory}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onOpenRecoveryModal={() => {
            setIsRecoveryModalOpen(true);
          }}
          onOpenDiagnostic={() => {
            setIsDiagnosticOpen(true);
          }}
          onOpenVaultHealthCheck={
            setIsVaultHealthCheckOpen
              ? () => setIsVaultHealthCheckOpen(true)
              : undefined
          }
        />
      )}

      {/* Dedicated Vault Health Check Diagnostic Drawer */}
      {isVaultHealthCheckOpen && setIsVaultHealthCheckOpen && (
        <VaultHealthCheckDrawer
          isOpen={isVaultHealthCheckOpen}
          onClose={() => setIsVaultHealthCheckOpen(false)}
          resources={resources}
          user={user}
          quotaExceeded={quotaExceeded}
          onTriggerSync={handleTriggerSync}
          onOpenDiscrepancyInspector={
            setIsDiscrepancyInspectorOpen
              ? () => setIsDiscrepancyInspectorOpen(true)
              : undefined
          }
          onNotification={(type, msg) => {
            setStatusMessage(msg);
          }}
        />
      )}
    </>
  );
}
