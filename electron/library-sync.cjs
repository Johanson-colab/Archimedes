function createLibrarySync({ store: providedStore, api } = {}) {
  if (!providedStore || !api) throw new Error("Store and collaboration API are required.");

  async function syncLegacy(store, projectId) {
    const project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!project.cloud_project_id) throw new Error("Share this project before syncing libraries.");
    const warnings = [];
    if (store.listCloudLibraryChanges?.(projectId).some(change => change.pending)) warnings.push('The cloud server needs sync migration 0013 before pending deletions can be delivered. They remain queued locally.');
    const remoteLibraries = await api.listLibraries(project.cloud_project_id);
    const remoteById = new Map(remoteLibraries.map((library) => [library.id, library]));
    let localLibraries = store.listLibraries(projectId);

    // Local -> cloud: create missing cloud libraries and attach papers.
    for (const library of localLibraries) {
      let cloudLibraryId = library.cloud_library_id;
      try {
        if (!cloudLibraryId) {
          const cloud = await api.createLibrary(project.cloud_project_id, {
            name: library.name,
            description: library.description,
            color: library.color,
          });
          cloudLibraryId = cloud.id;
          store.linkLibraryToCloud(library.id, cloudLibraryId);
          remoteById.set(cloudLibraryId, { ...cloud, paper_count: 0 });
        } else {
          const cloud = remoteById.get(cloudLibraryId);
          if (cloud && (cloud.name !== library.name || cloud.description !== library.description || cloud.color !== library.color)) {
            await api.updateLibrary(cloudLibraryId, { name: library.name, description: library.description, color: library.color });
          }
        }
      } catch (error) {
        warnings.push(`${library.name}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      for (const paper of store.listPapers(library.id)) {
        if (paper.cloud_paper_id) continue;
        try {
          const cloudPaper = await api.addPaper(cloudLibraryId, {
            canonical_key: paper.canonical_key,
            title: paper.title,
            authors: paper.authors,
            year: paper.year,
            venue: paper.venue,
            abstract: paper.abstract,
            url: paper.url,
            pdf_url: paper.pdf_url,
            doi: paper.doi,
            arxiv_id: paper.arxiv_id,
            s2_id: paper.s2_id,
            source: paper.source,
            citation_count: paper.citation_count,
            github_url: paper.github_url,
            github_stars: paper.github_stars,
            conference: paper.conference,
          });
          store.linkPaperToCloud(paper.id, cloudPaper.id);
        } catch (error) {
          warnings.push(`${paper.title}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Cloud -> local: import shared libraries and canonical papers.
    localLibraries = store.listLibraries(projectId);
    const localByCloud = new Map(localLibraries.filter((library) => library.cloud_library_id).map((library) => [library.cloud_library_id, library]));
    for (const cloudLibrary of remoteLibraries) {
      try {
        if (store.cloudLibraryIsDeleted?.(cloudLibrary.id)) continue;
        if (!localByCloud.has(cloudLibrary.id)) {
          const imported = store.importCloudLibrary(projectId, {
            cloudLibraryId: cloudLibrary.id,
            name: cloudLibrary.name,
            description: cloudLibrary.description,
            color: cloudLibrary.color,
          });
          if (imported) localByCloud.set(cloudLibrary.id, imported);
        }
        const localLibrary = localByCloud.get(cloudLibrary.id);
        if (!localLibrary) continue;
        const remotePapers = await api.listPapers(cloudLibrary.id);
        for (const remotePaper of remotePapers) {
          if (store.cloudLibraryIsDeleted?.(cloudLibrary.id, remotePaper.id)) continue;
          const localPaper = store.syncPaperFromCloud(localLibrary.id, remotePaper);
          if (!localPaper) continue;
          const localUpdated = Date.parse(localPaper.state_updated_at || "") || 0;
          const remoteUpdated = Date.parse(remotePaper.state_updated_at || "") || 0;
          if (localPaper.cloud_paper_id) {
            const stateDiffers = localPaper.reading_status !== remotePaper.reading_status
              || localPaper.starred !== remotePaper.starred
              || localPaper.notes !== remotePaper.notes
              || JSON.stringify(localPaper.tags) !== JSON.stringify(remotePaper.tags || []);
            if (localUpdated > remoteUpdated && stateDiffers) {
              try {
                await api.updatePaperState(localPaper.cloud_paper_id, {
                  reading_status: localPaper.reading_status,
                  starred: localPaper.starred,
                  notes: localPaper.notes,
                  tags: localPaper.tags,
                });
              } catch (error) {
                warnings.push(`${localPaper.title}: ${error instanceof Error ? error.message : String(error)}`);
              }
            } else {
              store.applyCloudPaperState(localPaper.id, remotePaper);
            }
          }
        }
      } catch (error) {
        warnings.push(`${cloudLibrary.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { project: store.getResearchProject(projectId), libraries: store.listLibraries(projectId), warnings };
  }

  async function syncVersioned(store, projectId, initial) {
    const project = store.getResearchProject(projectId);
    const warnings = [];
    let snapshot = initial;
    const canWrite = !store.canAccessProject || store.canAccessProject(projectId, 'editor');
    const attemptedDeletes = new Set();
    const apply = () => store.applyCloudLibrarySnapshot(projectId, snapshot);
    apply();
    // Delete intent is durable until a versioned acknowledgement arrives.
    const flushDeletes = async () => {
      if (!canWrite) return;
      for (const change of store.listCloudLibraryChanges(projectId).filter(row => row.pending === 'delete')) {
        if (change.cloud_paper_id.startsWith('canonical:')) continue;
        if (attemptedDeletes.has(change.mutation_id)) continue;
        attemptedDeletes.add(change.mutation_id);
        try {
          const result = change.cloud_paper_id
            ? await api.removePaper(change.cloud_library_id, change.cloud_paper_id)
            : await api.deleteLibrary(change.cloud_library_id);
          store.ackCloudLibraryChange(change, result);
        } catch (error) { warnings.push(`Deletion: ${error.message || String(error)}`); }
      }
    };
    await flushDeletes();
    const remoteById = new Map(snapshot.libraries.map(library => [library.id, library]));
    for (const library of canWrite ? store.listLibraries(projectId) : []) {
      let cloudId = library.cloud_library_id;
      try {
        if (cloudId && store.cloudLibraryIsDeleted(cloudId)) continue;
        // Stable identity is persisted before network delivery. A concurrent
        // local delete can therefore queue a tombstone even if POST is delayed.
        if (!cloudId) cloudId = store.prepareCloudLibraryUpload(library.id);
        if (!remoteById.has(cloudId)) {
          const pending = store.listCloudLibraryChanges(projectId).find(row => row.cloud_library_id === cloudId && !row.cloud_paper_id && row.pending === 'create');
          // Migration cannot reconstruct old hard deletes. An already-linked
          // unknown ID is therefore never silently recreated as a new library.
          if (!pending) { warnings.push(`${library.name}: the linked cloud library is missing. Create a new library to share these local papers again.`); continue; }
          const uploaded = await api.createLibrary(project.cloud_project_id, { ...library, id: cloudId });
          store.ackCloudLibraryChange(pending, uploaded);
        } else {
          const remote = remoteById.get(cloudId);
          if (remote.deleted_at) continue;
          if (remote.name !== library.name || remote.description !== library.description || remote.color !== library.color) {
            await api.updateLibrary(cloudId, { name: library.name, description: library.description, color: library.color });
          }
        }
        if (store.cloudLibraryIsDeleted(cloudId)) continue;
        const members = snapshot.items.filter(item => item.library_id === cloudId);
        for (const paper of store.listPapers(library.id)) {
          const change = store.listCloudLibraryChanges(projectId).find(row => row.cloud_library_id === cloudId && row.canonical_key === paper.canonical_key && row.cloud_paper_id);
          if (change?.pending === 'delete') continue;
          const remote = members.find(item => item.canonical_key === paper.canonical_key || item.item_id === paper.cloud_paper_id);
          if (remote && !remote.deleted_at && change?.pending !== 'add') {
            if (!paper.cloud_paper_id) store.linkPaperToCloud(paper.id, remote.item_id);
            continue;
          }
          if (remote?.deleted_at && change?.pending !== 'add') continue;
          try {
            const uploaded = await api.addPaper(cloudId, { ...paper,
              ...(change?.pending === 'add' ? { restore_revision: change.revision, mutation_id: change.mutation_id } : {}) });
            // The local paper may have been removed while the request waited.
            // The persisted membership journal, rather than the ACK, owns that intent.
            if (store.getPaper(paper.id)) store.linkPaperToCloud(paper.id, uploaded.id);
            if (change?.pending === 'add') store.ackCloudLibraryChange(change, { sync_revision: uploaded.membership_revision, deleted_at: uploaded.membership_deleted_at });
          } catch (error) { warnings.push(`${paper.title}: ${error.message || String(error)}`); }
        }
      } catch (error) { warnings.push(`${library.name}: ${error.message || String(error)}`); }
    }
    snapshot = await api.librarySyncSnapshot(project.cloud_project_id);
    apply();
    await flushDeletes();
    snapshot = await api.librarySyncSnapshot(project.cloud_project_id);
    apply();
    const byCloud = new Map(store.listLibraries(projectId).filter(library => library.cloud_library_id).map(library => [library.cloud_library_id, library]));
    for (const remote of snapshot.libraries) {
      if (remote.deleted_at || store.cloudLibraryIsDeleted(remote.id)) continue;
      try {
        const local = byCloud.get(remote.id) || store.importCloudLibrary(projectId, { cloudLibraryId: remote.id, ...remote }, { cloudImport: true });
        if (!local) continue;
        for (const paper of await api.listPapers(remote.id)) {
          if (store.cloudLibraryIsDeleted(remote.id, paper.id)) continue;
          const imported = store.syncPaperFromCloud(local.id, paper, { cloudImport: true });
          if (!imported) continue;
          const localUpdated = Date.parse(imported.state_updated_at || '') || 0, remoteUpdated = Date.parse(paper.state_updated_at || '') || 0;
          const differs = imported.reading_status !== paper.reading_status || imported.starred !== paper.starred
            || imported.notes !== paper.notes || JSON.stringify(imported.tags) !== JSON.stringify(paper.tags || []);
          if (canWrite && localUpdated > remoteUpdated && differs) await api.updatePaperState(imported.cloud_paper_id, {
            reading_status: imported.reading_status, starred: imported.starred, notes: imported.notes, tags: imported.tags });
          else store.applyCloudPaperState(imported.id, paper);
        }
      } catch (error) { warnings.push(`${remote.name}: ${error.message || String(error)}`); }
    }
    return { project: store.getResearchProject(projectId), libraries: store.listLibraries(projectId), warnings };
  }

  async function syncProjectLibraries(projectId) {
    const captured = providedStore.captureStore?.();
    const owner = captured?.store || providedStore;
    const execute = async () => {
      const project = owner.getResearchProject(projectId);
      if (!project?.cloud_project_id) throw new Error('Share this project before syncing libraries.');
      if (api.librarySyncSnapshot && owner.applyCloudLibrarySnapshot) {
        let snapshot;
        try { snapshot = await api.librarySyncSnapshot(project.cloud_project_id); }
        catch (error) {
          const result = await syncLegacy(owner, projectId);
          result.warnings.push(`Versioned cloud sync is unavailable; apply server migration 0013. ${error.message || String(error)}`);
          return result;
        }
        if (snapshot?.protocol !== 2) throw new Error('The cloud server returned an unsupported library sync protocol.');
        return syncVersioned(owner, projectId, snapshot);
      }
      return syncLegacy(owner, projectId);
    };
    try { return await (owner.run ? owner.run(execute) : execute()); }
    finally { captured?.release(); }
  }

  return { syncProjectLibraries };
}

module.exports = { createLibrarySync };
