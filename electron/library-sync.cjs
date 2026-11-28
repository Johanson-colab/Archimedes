const { canonicalTitleKey, identifier, titleIdentity } = require("./bibliography-records.cjs");

function titleFingerprint(paper) {
  if (!paper.canonical_key.startsWith("title:") || Object.entries(identifier).some(([key, normalize]) => normalize(paper[key]))) return null;
  const fingerprint = canonicalTitleKey(paper);
  return fingerprint === canonicalTitleKey({ title: paper.title }) ? null : fingerprint;
}

function authorNames(authors) {
  return (Array.isArray(authors) ? authors : []).map((author) => {
    const raw = String(author).trim();
    const split = /^(.+?),\s*(.+)$/.exec(raw);
    return (split ? `${split[2]} ${split[1]}` : raw).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  }).filter(Boolean).sort();
}

function metadataCompatible(left, right) {
  if (left.year && right.year && left.year !== right.year) return false;
  const saved = authorNames(left.authors), imported = authorNames(right.authors);
  if (!saved.length || !imported.length) return true;
  if (saved.join("|") === imported.join("|")) return true;
  const prefix = (names) => names.at(-1) === "others" ? names.slice(0, -1) : null;
  const savedPrefix = prefix(saved), importedPrefix = prefix(imported);
  return Boolean(savedPrefix && imported.join(" ").startsWith(savedPrefix.join(" ")))
    || Boolean(importedPrefix && saved.join(" ").startsWith(importedPrefix.join(" ")));
}

function identifiersCompatible(left, right) {
  return Object.entries(identifier).every(([field, normalize]) => {
    const a = normalize(left[field]), b = normalize(right[field]);
    return !a || !b || a === b;
  });
}

function hasInitialPaperState(paper) {
  return paper.state_updated_at === paper.created_at && paper.reading_status === "unread"
    && !paper.starred && !paper.notes && !paper.tags.length;
}

function createLibrarySync({ store, api } = {}) {
  if (!store || !api) throw new Error("Store and collaboration API are required.");

  async function syncProjectLibraries(projectId) {
    const project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!project.cloud_project_id) throw new Error("Share this project before syncing libraries.");
    const warnings = [];
    const remoteLibraries = await api.listLibraries(project.cloud_project_id);
    const remoteById = new Map(remoteLibraries.map((library) => [library.id, library]));
    let localLibraries = store.listLibraries(projectId);
    let visiblePapers;
    const claimedCloudIds = new Set();

    async function matchingCloudTitlePaper(paper) {
      const fingerprint = titleFingerprint(paper);
      // Read existing cloud references before uploading a title-only identity.
      // Enrichment can leave the saved key behind the current bibliographic metadata.
      visiblePapers ??= Promise.all(remoteLibraries.map(library => api.listPapers(library.id)))
        .then(lists => {
          const byKey = new Map(lists.flat().map(item => [item.canonical_key, item]));
          const byFingerprint = new Map();
          const byTitle = new Map();
          for (const item of byKey.values()) {
            const identity = titleFingerprint(item);
            if (identity) byFingerprint.set(identity, byFingerprint.has(identity) ? null : item);
            const titleKey = titleIdentity(item.title);
            if (titleKey) byTitle.set(titleKey, [...(byTitle.get(titleKey) || []), item]);
          }
          return { byKey, byFingerprint, byTitle };
        });
      const { byKey, byFingerprint, byTitle } = await visiblePapers;
      if (byKey.has(paper.canonical_key)) return null;
      const fingerprintMatch = fingerprint ? byFingerprint.get(fingerprint) : null;
      if (fingerprintMatch && !claimedCloudIds.has(fingerprintMatch.id)) return fingerprintMatch;
      // A legacy cloud row may have only a title, or may lack author/year
      // metadata that the fresh import now has. Fall back to an unambiguous
      // metadata-compatible title match instead of uploading a duplicate.
      const titleKey = titleIdentity(paper.title);
      const legacy = titleKey ? (byTitle.get(titleKey) || []).filter((item) =>
        !claimedCloudIds.has(item.id) && identifiersCompatible(item, paper) && metadataCompatible(item, paper)) : [];
      return legacy.length === 1 ? legacy[0] : null;
    }

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
          const match = await matchingCloudTitlePaper(paper);
          const cloudPaper = await api.addPaper(cloudLibraryId, {
            canonical_key: match?.canonical_key ?? paper.canonical_key,
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
          const linked = store.linkPaperToCloud(paper.id, cloudPaper.id);
          claimedCloudIds.add(cloudPaper.id);
          if (match?.state_updated_at && match.id === cloudPaper.id && hasInitialPaperState(linked)) {
            // A fresh import has a timestamp even though nobody edited its defaults.
            store.applyCloudPaperState(linked.id, match);
          }
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
          const localPaper = store.syncPaperFromCloud(localLibrary.id, remotePaper);
          const remotePaperId = String(remotePaper.id || "").trim();
          if (!remotePaperId) continue;
          const localUpdated = Date.parse(localPaper.state_updated_at || "") || 0;
          const remoteUpdated = Date.parse(remotePaper.state_updated_at || "") || 0;
          const stateDiffers = localPaper.reading_status !== remotePaper.reading_status
            || localPaper.starred !== remotePaper.starred
            || localPaper.notes !== remotePaper.notes
            || JSON.stringify(localPaper.tags) !== JSON.stringify(remotePaper.tags || []);
          if (localUpdated > remoteUpdated && stateDiffers) {
            try {
              await api.updatePaperState(remotePaperId, {
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
      } catch (error) {
        warnings.push(`${cloudLibrary.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { project: store.getResearchProject(projectId), libraries: store.listLibraries(projectId), warnings };
  }

  return { syncProjectLibraries };
}

module.exports = { createLibrarySync };
