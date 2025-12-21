import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent,
} from "react";
import {
  apiCreateFolder,
  apiDeleteFile,
  apiDeleteFolder,
  apiDownloadFile as apiDownloadUrl,
  apiFetchState,
  apiUpdateFile,
  apiUpdateFolder,
  apiUploadFile,
  type DriveFile,
  type DriveFolder,
  type DriveState,
} from "./api";

type ItemId = number;
type ViewMode = "grid" | "list";
type SortBy = "name" | "modifiedAt";
type SortDir = "asc" | "desc";
type Section = "my-drive" | "starred" | "shared" | "trash";

interface Props {
  token: string;
  email: string | null;
  onLogout: () => void;
}

function FileBrowser({ token, email, onLogout }: Props) {
  const [state, setState] = useState<DriveState | null>(null);
  const [section, setSection] = useState<Section>("my-drive");
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<ItemId[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  const loadState = async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await apiFetchState(token);
      setState(s);
      setCurrentFolderId(s.rootFolderId);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadState();
  }, [token]);

  const folders = state?.folders ?? [];
  const files = state?.files ?? [];
  const rootFolderId = state?.rootFolderId ?? null;

  const currentFolder = useMemo(
    () =>
      section === "my-drive"
        ? folders.find(f => f.id === currentFolderId) ?? null
        : null,
    [folders, currentFolderId, section]
  );

  const breadcrumb = useMemo(() => {
    if (section !== "my-drive" || !currentFolder) return [];
    const result: DriveFolder[] = [];
    let folder: DriveFolder | null = currentFolder;
    while (folder) {
      result.unshift(folder);
      folder =
        folders.find(f => f.id === folder!.parentId && !f.trashed) ?? null;
    }
    return result;
  }, [folders, currentFolder, section]);

  const visibleFolders = useMemo(() => {
    if (section === "my-drive") {
      return folders.filter(
        f => !f.trashed && f.parentId === currentFolderId
      );
    }
    if (section === "trash") {
      return folders.filter(f => f.trashed);
    }
    return [];
  }, [folders, currentFolderId, section]);

  const visibleFiles = useMemo(() => {
    let list: DriveFile[] = [];

    if (section === "my-drive") {
      list = files.filter(
        f => !f.trashed && f.parentId === currentFolderId
      );
    } else if (section === "starred") {
      list = files.filter(f => f.starred && !f.trashed);
    } else if (section === "shared") {
      list = files.filter(f => f.isShared && !f.trashed);
    } else if (section === "trash") {
      list = files.filter(f => f.trashed);
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q));
    }

    list = list.slice().sort((a, b) => {
      if (sortBy === "name") {
        const aStr = a.name.toLowerCase();
        const bStr = b.name.toLowerCase();
        if (aStr < bStr) return sortDir === "asc" ? -1 : 1;
        if (aStr > bStr) return sortDir === "asc" ? 1 : -1;
        return 0;
      }
      const aDate = new Date(a.modifiedAt).getTime();
      const bDate = new Date(b.modifiedAt).getTime();
      if (aDate < bDate) return sortDir === "asc" ? -1 : 1;
      if (aDate > bDate) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return list;
  }, [files, currentFolderId, search, sortBy, sortDir, section]);

  const hasTrash = useMemo(
    () =>
      folders.some(f => f.trashed) || files.some(f => f.trashed),
    [folders, files]
  );

  const toggleSort = (field: SortBy) => {
    if (sortBy === field) {
      setSortDir(prev => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const toggleSelect = (id: ItemId) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    const ids: ItemId[] = [
      ...visibleFolders.map(f => f.id),
      ...visibleFiles.map(f => f.id),
    ];
    setSelectedIds(ids);
  };

  const clearSelection = () => setSelectedIds([]);

  const isSelected = (id: ItemId) => selectedIds.includes(id);

  const handleOpenFolder = (id: number) => {
    setSection("my-drive");
    setCurrentFolderId(id);
    setSelectedIds([]);
  };

  const handleStarToggle = async (fileId: number) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    const next = !file.starred;

    setState(prev =>
      prev
        ? {
            ...prev,
            files: prev.files.map(f =>
              f.id === fileId ? { ...f, starred: next } : f
            ),
          }
        : prev
    );

    try {
      await apiUpdateFile(token, fileId, { starred: next });
    } catch (err) {
      console.error(err);
      void loadState(); 
    }
  };

  const handleShareToggle = async (fileId: number) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;
    const next = !file.isShared;

    setState(prev =>
      prev
        ? {
            ...prev,
            files: prev.files.map(f =>
              f.id === fileId ? { ...f, isShared: next } : f
            ),
          }
        : prev
    );

    try {
      await apiUpdateFile(token, fileId, { isShared: next });
    } catch (err) {
      console.error(err);
      void loadState();
    }
  };

  const handleCreateFolder = async () => {
    if (!state) return;
    const name = window.prompt("Имя новой папки", "Новая папка");
    if (!name) return;
    const trimmed = name.trim();
    if (!trimmed) return;

    const parentId =
      section === "my-drive"
        ? currentFolderId ?? state.rootFolderId
        : state.rootFolderId;

    try {
      const created = await apiCreateFolder(token, {
        name: trimmed,
        parentId,
      });
      setState(prev =>
        prev
          ? {
              ...prev,
              folders: [...prev.folders, created],
            }
          : prev
      );
      setNewMenuOpen(false);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleFilesInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length || !state) return;

    const parentId =
      section === "my-drive"
        ? currentFolderId ?? state.rootFolderId
        : state.rootFolderId;

    setBusy(true);
    try {
      for (const file of fileList) {
        const created = await apiUploadFile(token, file, parentId);
        setState(prev =>
          prev
            ? {
                ...prev,
                files: [...prev.files, created],
              }
            : prev
        );
      }
      setNewMenuOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleFolderInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (!fileList.length || !state) return;

    const baseFolderId =
      section === "my-drive"
        ? currentFolderId ?? state.rootFolderId
        : state.rootFolderId;

    const pathToFolderId = new Map<string, number>();
    pathToFolderId.set("", baseFolderId);

    const ensureFolderPath = async (
      path: string
    ): Promise<number> => {
      if (pathToFolderId.has(path)) {
        return pathToFolderId.get(path)!;
      }
      const segments = path.split("/").filter(Boolean);
      let currentPath = "";
      let parentId = baseFolderId;

      for (const segment of segments) {
        currentPath = currentPath ? `${currentPath}/${segment}` : segment;
        if (pathToFolderId.has(currentPath)) {
          parentId = pathToFolderId.get(currentPath)!;
          continue;
        }
        const created = await apiCreateFolder(token, {
          name: segment,
          parentId,
        });
        setState(prev =>
          prev
            ? { ...prev, folders: [...prev.folders, created] }
            : prev
        );
        parentId = created.id;
        pathToFolderId.set(currentPath, parentId);
      }
      return parentId;
    };

    setBusy(true);
    try {
      for (const file of fileList) {
        const anyFile = file as any;
        const relPath: string = anyFile.webkitRelativePath || file.name;
        const segments = relPath.split("/").filter(Boolean);
        const fileName = segments.pop() || file.name;
        const folderPath = segments.join("/");

        const parentId = await ensureFolderPath(folderPath);

        const created = await apiUploadFile(token, new File([file], fileName, { type: file.type }), parentId);
        setState(prev =>
          prev
            ? { ...prev, files: [...prev.files, created] }
            : prev
        );
      }
      setNewMenuOpen(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };

  const handleMoveToTrashSelected = async () => {
    if (!state || !selectedIds.length) return;
    if (
      !window.confirm(
        "Переместить в корзину выбранные файлы и папки?"
      )
    )
      return;

    const folderIds = new Set<number>();
    const fileIds = new Set<number>();

    state.folders.forEach(f => {
      if (!f.trashed && selectedIds.includes(f.id)) {
        folderIds.add(f.id);
      }
    });

    state.files.forEach(f => {
      if (!f.trashed && selectedIds.includes(f.id)) {
        fileIds.add(f.id);
      }
    });

    const collectChildren = (folderId: number) => {
      state.folders.forEach(f => {
        if (!f.trashed && f.parentId === folderId) {
          if (!folderIds.has(f.id)) {
            folderIds.add(f.id);
            collectChildren(f.id);
          }
        }
      });
      state.files.forEach(file => {
        if (!file.trashed && file.parentId === folderId) {
          fileIds.add(file.id);
        }
      });
    };

    Array.from(folderIds).forEach(collectChildren);

    setState(prev =>
      prev
        ? {
            ...prev,
            folders: prev.folders.map(f =>
              folderIds.has(f.id)
                ? {
                    ...f,
                    trashed: true,
                    originalParentId:
                      f.originalParentId ?? f.parentId,
                  }
                : f
            ),
            files: prev.files.map(f =>
              fileIds.has(f.id)
                ? {
                    ...f,
                    trashed: true,
                    originalParentId:
                      f.originalParentId ?? f.parentId,
                  }
                : f
            ),
          }
        : prev
    );
    setSelectedIds([]);

    // отправляем на бэк (без ожидания)
    folderIds.forEach(id => {
      const folder = state.folders.find(f => f.id === id);
      if (!folder) return;
      void apiUpdateFolder(token, id, {
        trashed: true,
        originalParentId: folder.originalParentId ?? folder.parentId,
      });
    });

    fileIds.forEach(id => {
      const file = state.files.find(f => f.id === id);
      if (!file) return;
      void apiUpdateFile(token, id, {
        trashed: true,
        originalParentId:
          file.originalParentId ?? file.parentId,
      });
    });

    if (currentFolderId && folderIds.has(currentFolderId)) {
      setCurrentFolderId(rootFolderId);
      setSection("my-drive");
    }
  };
  const handleRestoreSelected = () => {
    if (!state || !selectedIds.length) return;

    const folderIds = new Set<number>();
    const fileIds = new Set<number>();

    const collectChildren = (folderId: number) => {
      state.folders.forEach(f => {
        if (f.parentId === folderId && f.trashed) {
          if (!folderIds.has(f.id)) {
            folderIds.add(f.id);
            collectChildren(f.id);
          }
        }
      });
      state.files.forEach(file => {
        if (file.parentId === folderId && file.trashed) {
          fileIds.add(file.id);
        }
      });
    };

    state.folders.forEach(f => {
      if (f.trashed && selectedIds.includes(f.id)) {
        folderIds.add(f.id);
        collectChildren(f.id);
      }
    });

    state.files.forEach(file => {
      if (file.trashed && selectedIds.includes(file.id)) {
        fileIds.add(file.id);
      }
    });

    setState(prev =>
      prev
        ? {
            ...prev,
            folders: prev.folders.map(f => {
              if (!folderIds.has(f.id)) return f;
              const parent =
                f.originalParentId ?? f.parentId ?? rootFolderId;
              return {
                ...f,
                trashed: false,
                parentId: parent,
                originalParentId: null,
              };
            }),
            files: prev.files.map(f => {
              if (!fileIds.has(f.id)) return f;
              const parent =
                f.originalParentId ?? f.parentId ?? rootFolderId;
              return {
                ...f,
                trashed: false,
                parentId: parent,
                originalParentId: null,
              };
            }),
          }
        : prev
    );
    setSelectedIds([]);
    setSection("my-drive");

    folderIds.forEach(id => {
      const folder = state.folders.find(f => f.id === id);
      if (!folder) return;
      void apiUpdateFolder(token, id, {
        trashed: false,
        parentId: folder.originalParentId ?? folder.parentId ?? rootFolderId,
        originalParentId: null,
      });
    });

    fileIds.forEach(id => {
      const file = state.files.find(f => f.id === id);
      if (!file) return;
      void apiUpdateFile(token, id, {
        trashed: false,
        parentId: file.originalParentId ?? file.parentId ?? rootFolderId,
        originalParentId: null,
      });
    });
  };

  const handlePermanentDeleteSelected = async () => {
    if (!state || !selectedIds.length) return;
    if (
      !window.confirm(
        "Окончательно удалить выбранные элементы без возможности восстановления?"
      )
    )
      return;

    const foldersToDelete = new Set<number>();
    const filesToDelete = new Set<number>();

    const markFolderAndChildren = (folderId: number) => {
      if (foldersToDelete.has(folderId)) return;
      foldersToDelete.add(folderId);
      state.folders.forEach(f => {
        if (f.parentId === folderId) {
          markFolderAndChildren(f.id);
        }
      });
      state.files.forEach(file => {
        if (file.parentId === folderId) {
          filesToDelete.add(file.id);
        }
      });
    };

    state.folders.forEach(f => {
      if (selectedIds.includes(f.id)) {
        markFolderAndChildren(f.id);
      }
    });

    state.files.forEach(file => {
      if (selectedIds.includes(file.id)) {
        filesToDelete.add(file.id);
      }
    });

    setState(prev =>
      prev
        ? {
            ...prev,
            folders: prev.folders.filter(
              f => !foldersToDelete.has(f.id)
            ),
            files: prev.files.filter(
              f => !filesToDelete.has(f.id)
            ),
          }
        : prev
    );
    setSelectedIds([]);

    filesToDelete.forEach(id => {
      void apiDeleteFile(token, id);
    });
    foldersToDelete.forEach(id => {
      void apiDeleteFolder(token, id);
    });
  };

  const handleEmptyTrash = async () => {
    if (!state || !hasTrash) return;
    if (!window.confirm("Очистить корзину полностью?")) return;

    const foldersToDelete = state.folders
      .filter(f => f.trashed)
      .map(f => f.id);
    const filesToDelete = state.files
      .filter(f => f.trashed)
      .map(f => f.id);

    setState(prev =>
      prev
        ? {
            ...prev,
            folders: prev.folders.filter(f => !f.trashed),
            files: prev.files.filter(f => !f.trashed),
          }
        : prev
    );
    setSelectedIds([]);

    filesToDelete.forEach(id => void apiDeleteFile(token, id));
    foldersToDelete.forEach(id => void apiDeleteFolder(token, id));
  };

  const sortIndicator = (field: SortBy) =>
    sortBy === field ? (sortDir === "asc" ? "▲" : "▼") : "";

  if (loading || !state) {
    return (
      <div className="app-shell">
        <header className="drive__topbar">
          <div className="drive__topbar-left">Загрузка...</div>
        </header>
      </div>
    );
  }

  return (
    <div className="drive">
      {/* скрытые инпуты */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: "none" }}
        onChange={handleFilesInputChange}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-ignore
        webkitdirectory=""
        // @ts-ignore
        directory=""
        style={{ display: "none" }}
        onChange={handleFolderInputChange}
      />

      {/* Верхний бар */}
      <header className="drive__topbar">
        <div className="drive__topbar-left">
          <button
            className="drive__icon-button"
            onClick={() => setSidebarCollapsed(s => !s)}
          >
            ☰
          </button>
          <div className="drive__brand">
            <div className="drive__brand-logo">▢</div>
            <span className="drive__brand-text">Мой диск</span>
          </div>
        </div>

        <div className="drive__search">
          <span className="drive__search-icon">🔍</span>
          <input
            type="text"
            placeholder="Поиск в диске"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="drive__topbar-right">
          {error && <span className="drive__error">{error}</span>}
          <span className="drive__user-email">{email}</span>
          <button className="drive__icon-button" onClick={onLogout}>
            Выйти
          </button>
        </div>
      </header>

      <div className="drive__body">
        {/* Сайдбар */}
        <aside
          className={
            "drive__sidebar" +
            (sidebarCollapsed ? " drive__sidebar--collapsed" : "")
          }
        >
          <div className="drive__new">
            <button
              className="drive__new-button"
              onClick={() => setNewMenuOpen(o => !o)}
              disabled={busy}
            >
              + Создать
            </button>
            {newMenuOpen && (
              <div className="drive__new-menu">
                <button
                  className="drive__new-menu-item"
                  onClick={handleCreateFolder}
                >
                  📁 Новая папка
                </button>
                <button
                  className="drive__new-menu-item"
                  onClick={() => fileInputRef.current?.click()}
                >
                  📄 Загрузить файлы
                </button>
                <button
                  className="drive__new-menu-item"
                  onClick={() => folderInputRef.current?.click()}
                >
                  🗂️ Загрузить папку
                </button>
              </div>
            )}
          </div>

          <nav className="drive__nav">
            <button
              className={
                "drive__nav-item" +
                (section === "my-drive"
                  ? " drive__nav-item--active"
                  : "")
              }
              onClick={() => {
                setSection("my-drive");
                setSelectedIds([]);
              }}
            >
              <span className="drive__nav-icon">📁</span>
              <span>Мой диск</span>
            </button>
            <button
              className={
                "drive__nav-item" +
                (section === "starred"
                  ? " drive__nav-item--active"
                  : "")
              }
              onClick={() => {
                setSection("starred");
                setSelectedIds([]);
              }}
            >
              <span className="drive__nav-icon">⭐</span>
              <span>Помеченные</span>
            </button>
            <button
              className={
                "drive__nav-item" +
                (section === "shared"
                  ? " drive__nav-item--active"
                  : "")
              }
              onClick={() => {
                setSection("shared");
                setSelectedIds([]);
              }}
            >
              <span className="drive__nav-icon">🌐</span>
              <span>Общие</span>
            </button>
            <button
              className={
                "drive__nav-item" +
                (section === "trash" ? " drive__nav-item--active" : "")
              }
              onClick={() => {
                setSection("trash");
                setSelectedIds([]);
              }}
            >
              <span className="drive__nav-icon">🗑️</span>
              <span>Корзина</span>
            </button>
          </nav>

          <div className="drive__sidebar-section">
            <div className="drive__sidebar-section-title">Папки</div>
            <ul className="drive__folder-tree">
              {folders
                .filter(f => !f.trashed && f.parentId === rootFolderId)
                .map(f => (
                  <li key={f.id}>
                    <button
                      className={
                        "drive__folder-tree-item" +
                        (section === "my-drive" &&
                        currentFolderId === f.id
                          ? " drive__folder-tree-item--active"
                          : "")
                      }
                      onClick={() => handleOpenFolder(f.id)}
                    >
                      📁 {f.name}
                    </button>
                  </li>
                ))}
            </ul>
          </div>
        </aside>

        {/* Основная область */}
        <main className="drive__main">
          {/* Панель действий */}
          <div className="drive__toolbar">
            <div className="drive__toolbar-left">
              <span className="drive__toolbar-title">
                {section === "my-drive"
                  ? currentFolder?.name || "Мой диск"
                  : section === "starred"
                  ? "Помеченные"
                  : section === "shared"
                  ? "Общие файлы"
                  : "Корзина"}
              </span>

              <div className="drive__toolbar-breadcrumb">
                {section === "my-drive" && breadcrumb.length > 0 ? (
                  breadcrumb.map((folder, index) => (
                    <span key={folder.id} className="drive__breadcrumb-item">
                      {index > 0 && (
                        <span className="drive__breadcrumb-sep">/</span>
                      )}
                      <button onClick={() => handleOpenFolder(folder.id)}>
                        {folder.name}
                      </button>
                    </span>
                  ))
                ) : section === "starred" ? (
                  <span className="drive__breadcrumb-item">
                    Все помеченные файлы
                  </span>
                ) : section === "shared" ? (
                  <span className="drive__breadcrumb-item">
                    Файлы, доступные всем
                  </span>
                ) : (
                  <span className="drive__breadcrumb-item">
                    Удалённые файлы и папки
                  </span>
                )}
              </div>
            </div>

            <div className="drive__toolbar-right">
              <button
                className={
                  "drive__view-toggle" +
                  (viewMode === "list"
                    ? " drive__view-toggle--active"
                    : "")
                }
                onClick={() => setViewMode("list")}
              >
                ☷
              </button>
              <button
                className={
                  "drive__view-toggle" +
                  (viewMode === "grid"
                    ? " drive__view-toggle--active"
                    : "")
                }
                onClick={() => setViewMode("grid")}
              >
                ☐
              </button>
            </div>
          </div>

          {/* Вспомогательная панель */}
          <div className="drive__subtoolbar">
            <div className="drive__subtoolbar-left">
              <button className="drive__text-button" onClick={selectAll}>
                Выделить всё
              </button>

              {section === "trash" &&
                selectedIds.length === 0 &&
                hasTrash && (
                  <>
                    <span className="drive__subtoolbar-sep">•</span>
                    <button
                      className="drive__text-button drive__text-button--danger"
                      onClick={handleEmptyTrash}
                    >
                      Очистить корзину
                    </button>
                  </>
                )}

              {selectedIds.length > 0 && (
                <>
                  <span className="drive__subtoolbar-sep">•</span>
                  <span>{selectedIds.length} выбрано</span>

                  {section === "trash" ? (
                    <>
                      <button
                        className="drive__text-button"
                        onClick={handleRestoreSelected}
                      >
                        Восстановить
                      </button>
                      <button
                        className="drive__text-button drive__text-button--danger"
                        onClick={handlePermanentDeleteSelected}
                      >
                        Удалить навсегда
                      </button>
                    </>
                  ) : (
                    <button
                      className="drive__text-button drive__text-button--danger"
                      onClick={handleMoveToTrashSelected}
                    >
                      Удалить
                    </button>
                  )}

                  <button
                    className="drive__text-button"
                    onClick={clearSelection}
                  >
                    Снять выделение
                  </button>
                </>
              )}
            </div>

            <div className="drive__subtoolbar-right">
              <button
                className="drive__text-button"
                onClick={() => toggleSort("name")}
              >
                Имя {sortIndicator("name")}
              </button>
              <button
                className="drive__text-button"
                onClick={() => toggleSort("modifiedAt")}
              >
                Изменено {sortIndicator("modifiedAt")}
              </button>
            </div>
          </div>

          {/* Содержимое */}
          {viewMode === "grid" ? (
            <div className="drive__grid">
              {visibleFolders.map(folder => (
                <FileCard
                  key={folder.id}
                  item={folder}
                  isFolder
                  selected={isSelected(folder.id)}
                  onClick={() =>
                    section === "my-drive" && handleOpenFolder(folder.id)
                  }
                  onToggleSelect={() => toggleSelect(folder.id)}
                />
              ))}
              {visibleFiles.map(file => (
                <FileCard
                  key={file.id}
                  item={file}
                  isFolder={false}
                  selected={isSelected(file.id)}
                  onClick={async () => {
                    apiDownloadUrl(token, file.id, file.name);
                  }}
                  onToggleSelect={() => toggleSelect(file.id)}
                  onToggleStar={() => handleStarToggle(file.id)}
                  onToggleShare={() => handleShareToggle(file.id)}
                />
              ))}
              {!visibleFiles.length && !visibleFolders.length && (
                <div className="drive__empty">
                  {section === "starred"
                    ? "Нет помеченных файлов."
                    : section === "shared"
                    ? "Нет общих файлов."
                    : section === "trash"
                    ? "Корзина пуста."
                    : "Здесь пока пусто. Создайте или загрузите файлы."}
                </div>
              )}
            </div>
          ) : (
            <table className="drive__table">
              <thead>
                <tr>
                  <th />
                  <th onClick={() => toggleSort("name")}>
                    Имя {sortIndicator("name")}
                  </th>
                  <th>Размер</th>
                  <th>Доступ</th>
                  <th onClick={() => toggleSort("modifiedAt")}>
                    Изменено {sortIndicator("modifiedAt")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleFolders.map(folder => (
                  <tr
                    key={folder.id}
                    className={
                      isSelected(folder.id)
                        ? "drive__row--selected"
                        : ""
                    }
                    onClick={() => toggleSelect(folder.id)}
                    onDoubleClick={() =>
                      section === "my-drive" &&
                      handleOpenFolder(folder.id)
                    }
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected(folder.id)}
                        onChange={() => toggleSelect(folder.id)}
                        onClick={(e: MouseEvent<HTMLInputElement>) =>
                          e.stopPropagation()
                        }
                      />
                    </td>
                    <td className="drive__cell-name">📁 {folder.name}</td>
                    <td>—</td>
                    <td>—</td>
                    <td>—</td>
                  </tr>
                ))}
                {visibleFiles.map(file => (
                  <tr
                    key={file.id}
                    className={
                      isSelected(file.id)
                        ? "drive__row--selected"
                        : ""
                    }
                    onClick={() => toggleSelect(file.id)}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={isSelected(file.id)}
                        onChange={() => toggleSelect(file.id)}
                        onClick={(e: MouseEvent<HTMLInputElement>) =>
                          e.stopPropagation()
                        }
                      />
                    </td>
                    <td className="drive__cell-name">
                      {fileIcon(file.type)} {file.name}
                    </td>
                    <td>{formatSize(file.sizeBytes)}</td>
                    <td>
                      <button
                        className="drive__icon-button"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          handleStarToggle(file.id);
                        }}
                      >
                        {file.starred ? "⭐" : "☆"}
                      </button>
                      <button
                        className="drive__icon-button"
                        onClick={(e: MouseEvent<HTMLButtonElement>) => {
                          e.stopPropagation();
                          handleShareToggle(file.id);
                        }}
                      >
                        {file.isShared ? "🌐" : "🔒"}
                      </button>
                    </td>
                    <td>
                      {new Date(file.modifiedAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
                {!visibleFiles.length && !visibleFolders.length && (
                  <tr>
                    <td colSpan={5}>
                      <div className="drive__empty">
                        {section === "starred"
                          ? "Нет помеченных файлов."
                          : section === "shared"
                          ? "Нет общих файлов."
                          : section === "trash"
                          ? "Корзина пуста."
                          : "Здесь пока пусто. Создайте или загрузите файлы."}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </main>
      </div>
    </div>
  );
}

interface FileCardProps {
  item: DriveFile | DriveFolder;
  isFolder: boolean;
  selected: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  onToggleStar?: () => void;
  onToggleShare?: () => void;
}

function FileCard({
  item,
  isFolder,
  selected,
  onClick,
  onToggleSelect,
  onToggleStar,
  onToggleShare,
}: FileCardProps) {
  const isFile = !isFolder;

  return (
    <div
      className={
        "drive__card" + (selected ? " drive__card--selected" : "")
      }
      onClick={onToggleSelect}
      onDoubleClick={onClick}
    >
      <div className="drive__card-header">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          onClick={(e: MouseEvent<HTMLInputElement>) =>
            e.stopPropagation()
          }
        />
        {isFile && (
          <div className="drive__card-header-actions">
            <button
              className="drive__icon-button"
              onClick={(e: MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                onToggleStar && onToggleStar();
              }}
            >
              {"starred" in item && (item as DriveFile).starred
                ? "⭐"
                : "☆"}
            </button>
            <button
              className="drive__icon-button"
              onClick={(e: MouseEvent<HTMLButtonElement>) => {
                e.stopPropagation();
                onToggleShare && onToggleShare();
              }}
            >
              {"isShared" in item && (item as DriveFile).isShared
                ? "🌐"
                : "🔒"}
            </button>
          </div>
        )}
      </div>
      <div className="drive__card-icon">
        {isFolder ? "📁" : fileIcon((item as DriveFile).type)}
      </div>
      <div className="drive__card-name" title={item.name}>
        {item.name}
      </div>
      {isFile && (
        <div className="drive__card-meta">
          <span>{formatSize((item as DriveFile).sizeBytes)}</span>
          <span>
            {new Date((item as DriveFile).modifiedAt).toLocaleDateString()}
          </span>
        </div>
      )}
    </div>
  );
}

function fileIcon(type: string): string {
  switch (type) {
    case "doc":
      return "📄";
    case "pdf":
      return "📕";
    case "ppt":
      return "📊";
    case "img":
      return "🖼️";
    case "txt":
      return "📝";
    default:
      return "📄";
  }
}

function formatSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = bytes / Math.pow(k, i);
  const fixed = size >= 10 || i === 0 ? size.toFixed(0) : size.toFixed(1);
  return `${fixed} ${units[i]}`;
}

export default FileBrowser;
