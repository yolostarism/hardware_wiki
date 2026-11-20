'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect,useMemo,useRef } from 'react';
import { 
  Folder, FolderOpen, FileText, Search, PlusCircle, LogOut, 
  Edit2, Save, FilePlus, FolderPlus, MoveRight, Trash2, Pencil, GripVertical, MoreHorizontal,
  Sun, Moon, Clock, Star, Home as HomeIcon, ChevronLeft, ChevronRight, MapPin
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import nextDynamic from 'next/dynamic'; 
import { getDirectories, getDocument, addNode, updateDocument, moveNode, renameNode, deleteNode, searchDocuments, login, logout, getSessionRole, getLibraryStats } from './actions';

// === 新增：引入数学公式和 HTML 解析插件 ===
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import 'katex/dist/katex.min.css'; // 公式所需样式

const MDEditor = nextDynamic(() => import('@uiw/react-md-editor'), { ssr: false });
const generateId = () => Math.random().toString(36).substr(2, 9);
const RECENT_DOCS_KEY = 'pzp_wiki_recent_docs';
const FAVORITE_DOCS_KEY = 'pzp_wiki_favorite_docs';
const READING_POSITIONS_KEY = 'pzp_wiki_reading_positions';
const AUTO_SPACING_KEY = 'pzp_wiki_auto_spacing';

const addCjkAsciiSpacing = (text) => {
  if (!text) return '';
  return text
    .replace(/([\p{Script=Han}])([A-Za-z0-9])/gu, '$1 $2')
    .replace(/([A-Za-z0-9])([\p{Script=Han}])/gu, '$1 $2');
};

const formatMarkdownSpacing = (markdown) => {
  if (!markdown) return '';
  return markdown
    .split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g)
    .map((block, index) => {
      if (index % 2 === 1) return block;
      return block
        .split(/(`[^`\n]*`)/g)
        .map((part, partIndex) => partIndex % 2 === 1 ? part : addCjkAsciiSpacing(part))
        .join('');
    })
    .join('');
};

export default function Home() {
  const [userRole, setUserRole] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [libraryStats, setLibraryStats] = useState(null);
  const [markdownContent, setMarkdownContent] = useState("");
  const [activeTitle, setActiveTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [movingNode, setMovingNode] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedFolderIds, setExpandedFolderIds] = useState([]);
  const [moveTargetQuery, setMoveTargetQuery] = useState('');
  const [autoSaveStatus, setAutoSaveStatus] = useState('idle');
  const [autoSpacingEnabled, setAutoSpacingEnabled] = useState(true);
  const lastSavedContentRef = useRef('');
  const [navOpen, setNavOpen] = useState({});
  const [draftNode, setDraftNode] = useState(null);
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [dragId, setDragId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const [menuState, setMenuState] = useState(null);
  const [toast, setToast] = useState('');
  const [contentHits, setContentHits] = useState([]);
  
  const [theme, setTheme] = useState('light');
  const [recentDocs, setRecentDocs] = useState([]);
  const [favoriteDocs, setFavoriteDocs] = useState([]);

  useEffect(() => {
    // 角色由服务器的会话 cookie 决定，前端不再存任何凭据
    (async () => {
      const res = await getSessionRole();
      setUserRole(res.role === 'admin' ? 'admin' : 'guest');
      setIsLoading(false);
    })();

    const savedTheme = localStorage.getItem('pzp_wiki_theme');
    const initTheme = savedTheme === 'dark' ? 'dark' : 'light';
    setTheme(initTheme);
    document.documentElement.classList.toggle('dark', initTheme === 'dark');

    setRecentDocs(JSON.parse(localStorage.getItem(RECENT_DOCS_KEY) || '[]'));
    setFavoriteDocs(JSON.parse(localStorage.getItem(FAVORITE_DOCS_KEY) || '[]'));
    setAutoSpacingEnabled(localStorage.getItem(AUTO_SPACING_KEY) !== 'false');
  }, []);

  useEffect(() => {
    if (userRole) loadTreeData();
  }, [userRole]);

  const flattenFiles = (nodes, parents = []) => {
    return nodes.flatMap(node => {
      const pathParts = [...parents, node.name];
      if (node.type === 'file') {
        return [{ ...node, path: pathParts.join(' / '), parentKey: node.parent_id || 'root' }];
      }
      return flattenFiles(node.children || [], pathParts);
    });
  };

  const allFiles = useMemo(() => flattenFiles(directories), [directories]);
  const activeFile = allFiles.find(file => file.id === activeFileId);
  const siblingFiles = activeFile ? allFiles.filter(file => file.parentKey === activeFile.parentKey) : [];
  const activeSiblingIndex = siblingFiles.findIndex(file => file.id === activeFileId);
  const previousFile = activeSiblingIndex > 0 ? siblingFiles[activeSiblingIndex - 1] : null;
  const nextFile = activeSiblingIndex >= 0 && activeSiblingIndex < siblingFiles.length - 1 ? siblingFiles[activeSiblingIndex + 1] : null;
  const rootFolders = directories.filter(node => node.type === 'folder');

  const flattenFolders = (nodes, parents = []) => {
    return nodes.flatMap(node => {
      if (node.type !== 'folder') return [];
      const pathParts = [...parents, node.name];
      return [
        { ...node, path: pathParts.join(' / ') },
        ...flattenFolders(node.children || [], pathParts)
      ];
    });
  };

  const allFolders = useMemo(() => flattenFolders(directories), [directories]);
  const activeFolder = allFolders.find(folder => folder.id === activeFolderId);
  const activeFolderParent = activeFolder?.parent_id ? allFolders.find(folder => folder.id === activeFolder.parent_id) : null;

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('pzp_wiki_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const persistRecentDoc = (file) => {
    if (!file) return;
    const next = [
      { id: file.id, name: file.name, path: file.path, openedAt: Date.now() },
      ...recentDocs.filter(doc => doc.id !== file.id)
    ].slice(0, 8);
    setRecentDocs(next);
    localStorage.setItem(RECENT_DOCS_KEY, JSON.stringify(next));
  };

  const toggleFavoriteDoc = () => {
    if (!activeFile) return;
    const exists = favoriteDocs.some(doc => doc.id === activeFile.id);
    const next = exists
      ? favoriteDocs.filter(doc => doc.id !== activeFile.id)
      : [{ id: activeFile.id, name: activeFile.name, path: activeFile.path }, ...favoriteDocs].slice(0, 12);
    setFavoriteDocs(next);
    localStorage.setItem(FAVORITE_DOCS_KEY, JSON.stringify(next));
  };

  const restoreReadingPosition = (id) => {
    requestAnimationFrame(() => {
      const positions = JSON.parse(localStorage.getItem(READING_POSITIONS_KEY) || '{}');
      const container = document.getElementById('article-scroll-area');
      if (container) container.scrollTop = positions[id] || 0;
    });
  };

  const saveReadingPosition = () => {
    if (!activeFileId || isEditing) return;
    const container = document.getElementById('article-scroll-area');
    if (!container) return;
    const positions = JSON.parse(localStorage.getItem(READING_POSITIONS_KEY) || '{}');
    positions[activeFileId] = container.scrollTop;
    localStorage.setItem(READING_POSITIONS_KEY, JSON.stringify(positions));
  };

  useEffect(() => {
    if (!isEditing || !activeFileId) return;
    if (markdownContent === lastSavedContentRef.current) {
      setAutoSaveStatus('saved');
      return;
    }

    setAutoSaveStatus('pending');
    const timer = setTimeout(async () => {
      setAutoSaveStatus('saving');
      const contentToSave = autoSpacingEnabled ? formatMarkdownSpacing(markdownContent) : markdownContent;
      if (contentToSave !== markdownContent) setMarkdownContent(contentToSave);
      const res = await updateDocument(activeFileId, contentToSave);
      if (res.success) {
        lastSavedContentRef.current = contentToSave;
        setAutoSaveStatus('saved');
      } else {
        setAutoSaveStatus('error');
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [isEditing, activeFileId, markdownContent, autoSpacingEnabled]);

  const isFavorite = activeFile ? favoriteDocs.some(doc => doc.id === activeFile.id) : false;
  const autoSaveLabel = {
    idle: '',
    pending: '等待自动保存',
    saving: '自动保存中...',
    saved: '已保存',
    error: '自动保存失败'
  }[autoSaveStatus] || '';

  const loadTreeData = async () => {
    setIsLoading(true);
    const res = await getDirectories();
    if (res.success) setDirectories(buildTree(res.data, null));
    const stats = await getLibraryStats();
    if (stats.success) setLibraryStats(stats);
    setIsLoading(false);
  };

  const buildTree = (nodes, parentId, level = 0) => {
    return nodes.filter(node => node.parent_id === parentId).map(node => ({
      ...node, isExpanded: level < 2, children: buildTree(nodes, node.id, level + 1)
    }));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginBusy(true);
    setLoginError('');
    const res = await login(loginPass);
    setLoginBusy(false);
    if (res.success) {
      setUserRole('admin');
      setShowLogin(false);
      setLoginPass('');
      await loadTreeData();
    } else {
      setLoginError(res.error || '口令不对');
    }
  };

  const handleLogout = async () => {
    await logout();
    setUserRole('guest');
    setIsEditing(false);
    setActiveFileId(null);
    setActiveFolderId(null);
    setMovingNode(null);
  };

  const isAdmin = userRole === 'admin';

  // 会话还没问出来时先给个空架子，避免闪一下登录页
  // 点击任意处关闭右键菜单（必须放在早返回之前，否则 hooks 顺序会变）
  useEffect(() => {
    if (!menuState) return;
    const close = () => setMenuState(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menuState]);

  // 编辑中快捷键：Ctrl/Cmd+S 保存，Esc 退出（放在早返回之前，保证 hooks 顺序稳定）
  useEffect(() => {
    if (!isEditing) return;
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSave(true);
      } else if (event.key === 'Escape') {
        setIsEditing(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isEditing, markdownContent, autoSpacingEnabled, activeFileId]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setContentHits([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const res = await searchDocuments(q);
      if (!cancelled && res && res.success) setContentHits(res.data || []);
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery]);

  if (!userRole) {
    return <div className="h-screen bg-white dark:bg-zinc-950" />;
  }

  const loginDialog = showLogin ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={() => setShowLogin(false)}>
      <div className="w-full max-w-[340px] rounded-lg border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900" onMouseDown={e => e.stopPropagation()}>
        <h2 className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-50">编辑口令</h2>
        <p className="mt-1 text-[12.5px] text-zinc-500 dark:text-zinc-400">输入口令后才能编辑，浏览不需要。</p>
        <form onSubmit={handleLogin} className="mt-4 flex flex-col gap-3">
          <input
            type="password"
            autoFocus
            placeholder="口令"
            className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-[13.5px] text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            value={loginPass}
            onChange={e => setLoginPass(e.target.value)}
          />
          {loginError ? <p className="text-[12.5px] text-red-600 dark:text-red-400">{loginError}</p> : null}
          <div className="mt-1 flex justify-end gap-2">
            <button type="button" onClick={() => setShowLogin(false)} className="rounded-md px-3 py-1.5 text-[13px] text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800">取消</button>
            <button type="submit" disabled={loginBusy} className="rounded-md bg-blue-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-blue-700 disabled:opacity-60">{loginBusy ? '验证中…' : '登录'}</button>
          </div>
        </form>
      </div>
    </div>
  ) : null;

  const uploadImage = async (file) => {
    setIsUploading(true);
    try {
      const response = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST', body: file,
      });
      const data = await response.json();
      if (data.url) setMarkdownContent(prev => prev + `\n![${file.name}](${data.url})\n`);
    } catch (error) {
      alert("图片上传失败：" + error.message);
    }
    setIsUploading(false);
  };

  const handlePaste = async (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        event.preventDefault();
        const file = items[i].getAsFile();
        if (file) await uploadImage(file);
      }
    }
  };

  const handleDrop = async (event) => {
    const files = event.dataTransfer?.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.indexOf('image') !== -1) {
        event.preventDefault(); await uploadImage(files[i]);
      }
    }
  };

  const openFile = async (file) => {
    if (!file) return;
    setActiveFileId(file.id);
    setActiveFolderId(file.parentKey || file.parent_id || null);
    setSearchQuery('');
    setActiveTitle(file.name);
    setIsEditing(false);
    setMarkdownContent("加载云端数据中...");
    persistRecentDoc(file);
    const res = await getDocument(file.id);
    if (res.success) {
      setMarkdownContent(res.content);
      lastSavedContentRef.current = res.content;
      setAutoSaveStatus('saved');
      restoreReadingPosition(file.id);
    }
  };


  const startMovingFile = (file) => {
    if (!isAdmin || !file) return;
    setMovingNode(file);
    setMoveTargetQuery('');
  };

  const cancelMovingFile = () => {
    setMovingNode(null);
    setMoveTargetQuery('');
  };

  const confirmMoveFile = async (targetFolder) => {
    if (!isAdmin || !movingNode || !targetFolder) return;
    if (movingNode.parentKey === targetFolder.id || movingNode.parent_id === targetFolder.id) {
      cancelMovingFile();
      return;
    }
    const res = await moveNode(movingNode.id, targetFolder.id);
    if (!res?.success) {
      alert(`移动失败：${res?.error || '未知错误'}`);
      return;
    }
    await loadTreeData();
    if (activeFileId === movingNode.id) setActiveFolderId(targetFolder.id);
    cancelMovingFile();
  };

  const handleSave = async (keepEditing = false) => {
    const contentToSave = autoSpacingEnabled ? formatMarkdownSpacing(markdownContent) : markdownContent;
    if (contentToSave !== markdownContent) setMarkdownContent(contentToSave);
    const res = await updateDocument(activeFileId, contentToSave);
    if (res.success) {
      lastSavedContentRef.current = contentToSave;
      setAutoSaveStatus('saved');
      showToast('已保存');
      if (!keepEditing) setIsEditing(false);
    } else {
      setAutoSaveStatus('error');
      showToast('保存失败：' + (res.error || '未知错误'));
    }
  };

  const toggleAutoSpacing = () => {
    const next = !autoSpacingEnabled;
    setAutoSpacingEnabled(next);
    localStorage.setItem(AUTO_SPACING_KEY, String(next));
  };

  const openFolder = (folder) => {
    if (!folder) return;
    setActiveFolderId(folder.id);
    setActiveFileId(null);
    setSearchQuery('');
    setIsEditing(false);
  };

  const openHome = () => {
    setActiveFileId(null);
    setActiveFolderId(null);
    setSearchQuery('');
    setIsEditing(false);
  };

  const goToParentFolder = () => {
    if (activeFolderParent) openFolder(activeFolderParent);
    else openHome();
  };

  const returnFromArticle = () => {
    setActiveFileId(null);
    setIsEditing(false);
    if (!activeFolder) openHome();
  };

  const toggleInlineFolder = (folderId) => {
    setExpandedFolderIds(current =>
      current.includes(folderId)
        ? current.filter(id => id !== folderId)
        : [...current, folderId]
    );
  };

  const renderDocShortcut = (doc, icon = <FileText size={15} />) => (
    <button
      key={doc.id}
      onClick={() => openFile(allFiles.find(file => file.id === doc.id) || doc)}
      className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-left hover:bg-gray-100 dark:hover:bg-zinc-800 transition"
    >
      <span className="text-blue-500 shrink-0">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{doc.name}</span>
        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{doc.path || '未记录路径'}</span>
      </span>
    </button>
  );

  const renderSidebarDoc = (doc, icon = <FileText size={14} />) => (
    <button
      key={doc.id}
      type="button"
      onClick={() => openFile(allFiles.find(file => file.id === doc.id) || doc)}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-gray-100 dark:hover:bg-zinc-800 transition ${activeFileId === doc.id ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}
    >
      <span className="text-gray-400 shrink-0">{icon}</span>
      <span className="truncate">{doc.name}</span>
    </button>
  );

  const renderSidebarFolder = (folder) => (
    <button
      key={folder.id}
      type="button"
      onClick={() => openFolder(allFolders.find(item => item.id === folder.id) || folder)}
      className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-sm hover:bg-gray-100 dark:hover:bg-zinc-800 transition ${activeFolderId === folder.id ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Folder size={14} className="text-gray-500 shrink-0" />
        <span className="truncate">{folder.name}</span>
      </span>
      <span className="text-xs text-gray-400 shrink-0">{folder.children?.length || 0}</span>
    </button>
  );

  const renderArticleRow = (file) => (
    <div key={file.id} className="flex items-stretch hover:bg-gray-50 dark:hover:bg-zinc-900 transition">
      <button type="button" onClick={() => openFile(file)} className="min-w-0 flex-1 flex items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-3 min-w-0">
          <FileText size={16} className="text-gray-400 shrink-0" />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{file.path || activeFolder?.path}</span>
          </span>
        </span>
        <ChevronRight size={16} className="text-gray-400 shrink-0" />
      </button>
      {isAdmin && (
        <button
          type="button"
          onClick={() => startMovingFile(file)}
          className={`w-24 border-l border-gray-200 dark:border-zinc-800 flex items-center justify-center gap-1 text-sm transition ${movingNode?.id === file.id ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-300'}`}
          title="移动到其他目录"
        >
          <MoveRight size={15} /> 移动
        </button>
      )}
    </div>
  );

  const renderMoveTargetPanel = () => {
    if (!isAdmin || !movingNode) return null;

    const query = moveTargetQuery.trim().toLowerCase();
    const candidateFolders = allFolders
      .filter(folder => folder.id !== movingNode.id && !isDescendant(folder.id, movingNode.id))
      .filter(folder => !query || folder.name.toLowerCase().includes(query) || folder.path.toLowerCase().includes(query))
      .slice(0, 60);

    return (
      <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/25 p-4 pt-[12vh]" onMouseDown={cancelMovingFile}>
        <div
          className="w-full max-w-[560px] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
            <div className="min-w-0">
              <p className="text-[11.5px] font-medium uppercase tracking-wide text-zinc-400">移动到</p>
              <p className="mt-0.5 truncate text-[14px] font-medium text-zinc-900 dark:text-zinc-50">{movingNode.name}</p>
            </div>
            <button type="button" onClick={cancelMovingFile} className="shrink-0 rounded-md px-2 py-1 text-[12.5px] text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">Esc</button>
          </div>

          <div className="relative px-5 py-3">
            <Search size={15} className="absolute left-8 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              autoFocus
              value={moveTargetQuery}
              onChange={(event) => setMoveTargetQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); cancelMovingFile(); } }}
              placeholder="搜索目标目录…"
              className="w-full rounded-md border border-zinc-200 bg-transparent py-2 pl-8 pr-3 text-[13px] outline-none focus:border-blue-400 dark:border-zinc-700"
            />
          </div>

          <div className="max-h-[46vh] divide-y divide-zinc-100 overflow-y-auto border-t border-zinc-100 dark:divide-zinc-800 dark:border-zinc-800">
            {candidateFolders.length > 0 ? candidateFolders.map(folder => {
              const isCurrentFolder = movingNode.parentKey === folder.id || movingNode.parent_id === folder.id;
              return (
                <button
                  key={folder.id}
                  type="button"
                  disabled={isCurrentFolder}
                  onClick={() => confirmMoveFile(folder)}
                  className={cx('flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left transition', isCurrentFolder ? 'cursor-not-allowed opacity-55' : 'hover:bg-blue-50 dark:hover:bg-zinc-800')}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Folder size={14} className="shrink-0 text-blue-500" />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] text-zinc-800 dark:text-zinc-100">{folder.name}</span>
                      <span className="block truncate text-[11.5px] text-zinc-400">{folder.path}</span>
                    </span>
                  </span>
                  <span className="shrink-0 text-[11.5px] text-zinc-400">{isCurrentFolder ? '当前位置' : '移到这里'}</span>
                </button>
              );
            }) : (
              <p className="px-5 py-8 text-center text-[13px] text-zinc-400">没有匹配的目录。</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderNestedFolderPreview = (folder) => {
    const fullFolder = allFolders.find(item => item.id === folder.id) || folder;
    const nestedFolders = (fullFolder.children || []).filter(child => child.type === 'folder');
    const nestedFiles = (fullFolder.children || [])
      .filter(child => child.type === 'file')
      .map(file => allFiles.find(item => item.id === file.id) || file);
    const isExpanded = expandedFolderIds.includes(folder.id);

    return (
      <div key={folder.id} className="border border-gray-200 dark:border-zinc-800 rounded-lg overflow-hidden">
        <div className="flex items-stretch">
          <button type="button" onClick={() => openFolder(fullFolder)} className="flex-1 flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-900 transition">
            <span className="flex items-center gap-3 min-w-0">
              <Folder size={17} className="text-blue-500 shrink-0" />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{folder.name}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{folder.children?.length || 0} 项</span>
              </span>
            </span>
            <span className="text-xs text-gray-400 shrink-0">进入</span>
          </button>
          <button type="button" onClick={() => toggleInlineFolder(folder.id)} className="w-12 border-l border-gray-200 dark:border-zinc-800 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-zinc-900 transition" aria-label={isExpanded ? `收起 ${folder.name}` : `展开 ${folder.name}`}>
            <ChevronRight size={16} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
          </button>
        </div>

        {isExpanded && (
          <div className="border-t border-gray-200 dark:border-zinc-800 bg-gray-50/70 dark:bg-zinc-900/60 px-3 py-2 space-y-1">
            {nestedFolders.map(childFolder => (
              <button key={childFolder.id} type="button" onClick={() => openFolder(allFolders.find(item => item.id === childFolder.id) || childFolder)} className="w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-white dark:hover:bg-zinc-800 transition">
                <span className="flex items-center gap-2 min-w-0">
                  <Folder size={15} className="text-blue-500 shrink-0" />
                  <span className="text-sm text-gray-800 dark:text-gray-100 truncate">{childFolder.name}</span>
                </span>
                <ChevronRight size={14} className="text-gray-400 shrink-0" />
              </button>
            ))}
            {nestedFiles.map(file => (
              renderArticleRow(file)
            ))}
            {nestedFolders.length === 0 && nestedFiles.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">这个子目录暂时是空的。</p>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLearningHome = () => (
    <div className="h-full overflow-y-auto p-8 bg-white dark:bg-zinc-950">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">学习入口</p>
          <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">继续你的硬件知识库</h2>
          <p className="text-gray-500 dark:text-gray-400 mt-2">从最近打开、收藏文章或根目录开始，不需要每次都从目录树里重新翻。</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <section className="border border-gray-200 dark:border-zinc-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock size={18} className="text-blue-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">最近打开</h3>
            </div>
            {recentDocs.length > 0 ? (
              <div className="space-y-1">{recentDocs.map(doc => renderDocShortcut(doc, <Clock size={15} />))}</div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">打开几篇文章后，这里会自动记录。</p>
            )}
          </section>

          <section className="border border-gray-200 dark:border-zinc-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star size={18} className="text-yellow-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">收藏文章</h3>
            </div>
            {favoriteDocs.length > 0 ? (
              <div className="space-y-1">{favoriteDocs.map(doc => renderDocShortcut(doc, <Star size={15} />))}</div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">在文章页点击收藏，常用资料会出现在这里。</p>
            )}
          </section>

          <section className="border border-gray-200 dark:border-zinc-800 rounded-lg p-5">
            <div className="flex items-center gap-2 mb-4">
              <HomeIcon size={18} className="text-green-500" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">根目录概览</h3>
            </div>
            {rootFolders.length > 0 ? (
              <div className="space-y-2">
                {rootFolders.slice(0, 8).map(folder => (
                  <button key={folder.id} type="button" onClick={() => openFolder(folder)} className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-gray-50 dark:bg-zinc-900 hover:bg-gray-100 dark:hover:bg-zinc-800 text-left transition">
                    <span className="flex items-center gap-2 min-w-0">
                      <Folder size={15} className="text-gray-500 shrink-0" />
                      <span className="text-sm truncate">{folder.name}</span>
                    </span>
                    <span className="flex items-center gap-1 text-xs text-gray-500 shrink-0">
                      {folder.children?.length || 0} 项 <ChevronRight size={13} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400">左侧目录加载后，这里会显示根目录。</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );

  const renderFolderPanel = () => {
    if (!activeFolder) return renderLearningHome();

    const childFolders = (activeFolder.children || []).filter(child => child.type === 'folder');
    const childFiles = (activeFolder.children || [])
      .filter(child => child.type === 'file')
      .map(file => allFiles.find(item => item.id === file.id) || file);
    const descendantFiles = allFiles.filter(file =>
      file.id !== activeFileId &&
      file.path?.startsWith(`${activeFolder.path} / `) &&
      file.parentKey !== activeFolder.id
    );

    return (
      <div className="h-full overflow-y-auto p-8 bg-white dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <button type="button" onClick={goToParentFolder} className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
              <ChevronLeft size={16} /> {activeFolderParent ? `返回 ${activeFolderParent.name}` : '返回学习首页'}
            </button>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">目录浏览</p>
                <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{activeFolder.name}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-2">
                  <MapPin size={14} />
                  <span className="truncate">{activeFolder.path}</span>
                </div>
              </div>
              {isAdmin && (
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button type="button" onClick={() => handleCreateNode(activeFolder.id, 'file')} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition">
                    <FilePlus size={16} /> 新文章
                  </button>
                  <button type="button" onClick={() => handleCreateNode(activeFolder.id, 'folder')} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 transition">
                    <FolderPlus size={16} /> 新子目录
                  </button>
                </div>
              )}
            </div>
          </div>


          {childFolders.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={18} className="text-blue-500" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">子目录</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {childFolders.map(folder => renderNestedFolderPreview(folder))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-green-600 dark:text-green-400" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">当前目录文章</h3>
            </div>
            {childFiles.length > 0 ? (
              <div className="border border-gray-200 dark:border-zinc-800 rounded-lg divide-y divide-gray-200 dark:divide-zinc-800 overflow-hidden">
                {childFiles.map(file => renderArticleRow(file))}
              </div>
            ) : (
              <div className="border border-dashed border-gray-300 dark:border-zinc-700 rounded-lg px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                这个目录下暂时没有文章。
              </div>
            )}
          </section>

          {descendantFiles.length > 0 && (
            <section className="mt-8">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={18} className="text-blue-500" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">子目录文章</h3>
              </div>
              <div className="border border-gray-200 dark:border-zinc-800 rounded-lg divide-y divide-gray-200 dark:divide-zinc-800 overflow-hidden">
                {descendantFiles.map(file => renderArticleRow(file))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  };



  // ===== Fumadocs 式三栏渲染层 =====
  const cx = (...args) => args.filter(Boolean).join(' ');

  const slugifyHeading = (text) =>
    text.trim().toLowerCase().replace(/[^\p{Script=Han}\w\s-]/gu, '').replace(/\s+/g, '-').slice(0, 40) || 'section';

  const extractHeadings = (md) => {
    const result = [];
    const seen = {};
    let inFence = false;
    String(md || '').split(/\r?\n/).forEach(line => {
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
      if (inFence) return;
      const m = /^(#{1,3})\s+(.+)$/.exec(line);
      if (!m) return;
      const text = m[2].replace(/[*_`]/g, '').trim();
      let id = slugifyHeading(text);
      if (seen[id]) { seen[id] += 1; id = id + '-' + seen[id]; } else { seen[id] = 1; }
      result.push({ level: m[1].length, text, id });
    });
    return result;
  };

  const activeHeadings = extractHeadings(markdownContent);
  const headingIdByText = {};
  activeHeadings.forEach(h => { headingIdByText[h.text] = h.id; });

  const flattenText = (node) => {
    if (node == null || node === false) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(flattenText).join('');
    if (node.props && node.props.children) return flattenText(node.props.children);
    return '';
  };

  const mdComponents = {
    h1: ({ children }) => {
      const id = headingIdByText[flattenText(children).trim()];
      return <h1 id={id} style={{ scrollMarginTop: 96 }}>{children}</h1>;
    },
    h2: ({ children }) => {
      const id = headingIdByText[flattenText(children).trim()];
      return <h2 id={id} style={{ scrollMarginTop: 96 }}>{children}</h2>;
    },
    h3: ({ children }) => {
      const id = headingIdByText[flattenText(children).trim()];
      return <h3 id={id} style={{ scrollMarginTop: 96 }}>{children}</h3>;
    },
  };

  // ===== 左栏树操作：提示 / 就地重命名 / 删除 / 新建 / 拖拽 / 右键菜单 =====
  const showToast = (message) => {
    setToast(message);
    window.clearTimeout(showToast._timer);
    showToast._timer = window.setTimeout(() => setToast(''), 2600);
  };

  const beginRename = (node) => {
    if (!isAdmin || !node) return;
    setMenuState(null);
    setRenamingId(node.id);
    setRenameValue(node.name);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const submitRename = async (node) => {
    const nextName = renameValue.trim();
    if (!nextName || nextName === node.name) {
      cancelRename();
      return;
    }
    const res = await renameNode(node.id, nextName);
    if (!res?.success) {
      showToast('重命名失败：' + (res?.error || '未知错误'));
      return;
    }
    cancelRename();
    await loadTreeData();
    if (activeFileId === node.id) setActiveTitle(nextName);
    showToast('已改名：' + nextName);
  };

  const handleDeleteNode = async (node) => {
    if (!isAdmin || !node) return;
    setMenuState(null);
    const isFolder = node.type === 'folder';
    const confirmed = window.confirm(
      isFolder
        ? '删除目录「' + node.name + '」？里面的子目录和文章会一起删掉，不能撤销。'
        : '删除文章「' + node.name + '」？正文会一起删掉，不能撤销。'
    );
    if (!confirmed) return;
    const res = await deleteNode(node.id);
    if (!res?.success) {
      showToast('删除失败：' + (res?.error || '未知错误'));
      return;
    }
    if (activeFileId === node.id) {
      setActiveFileId(null);
      setIsEditing(false);
    }
    if (activeFolderId === node.id) setActiveFolderId(null);
    await loadTreeData();
    showToast(isFolder ? '已删除目录：' + node.name + (res.deleted ? '（连同 ' + (res.deleted - 1) + ' 项）' : '') : '已删除：' + node.name);
  };

  const isDescendant = (candidateId, ancestorId) => {
    if (!candidateId || !ancestorId || candidateId === ancestorId) return false;
    let cursor = allFolders.find(folder => folder.id === candidateId);
    let guard = 0;
    while (cursor && cursor.parent_id && guard < 40) {
      if (cursor.parent_id === ancestorId) return true;
      cursor = allFolders.find(folder => folder.id === cursor.parent_id);
      guard += 1;
    }
    return false;
  };

  const handleDropOn = async (targetFolder) => {
    const dragged = dragId ? (allFolders.find(f => f.id === dragId) || allFiles.find(f => f.id === dragId)) : null;
    setDropTargetId(null);
    if (!isAdmin || !dragged || !targetFolder) { setDragId(null); return; }
    if (dragged.id === targetFolder.id) { setDragId(null); return; }
    if (dragged.type === 'folder' && isDescendant(targetFolder.id, dragged.id)) {
      showToast('不能把目录移动到它自己的子目录里');
      setDragId(null);
      return;
    }
    if (dragged.parent_id === targetFolder.id) {
      showToast('它已经在「' + targetFolder.name + '」里了');
      setDragId(null);
      return;
    }
    const res = await moveNode(dragged.id, targetFolder.id);
    setDragId(null);
    if (!res?.success) {
      showToast('移动失败：' + (res?.error || '未知错误'));
      return;
    }
    await loadTreeData();
    showToast('已移动到「' + targetFolder.name + '」');
  };

  const handleCreateNode = (parentId, type) => {
    if (!isAdmin) return;
    setMenuState(null);
    if (parentId !== 'root') setNavOpen(prev => ({ ...prev, [parentId]: true }));
    setDraftNode({ parentId, type, name: '' });
    setRenamingId(null);
  };

  const cancelDraft = () => setDraftNode(null);

  const commitDraft = async () => {
    if (!draftNode) return;
    const name = draftNode.name.trim();
    if (!name) { setDraftNode(null); return; }
    const newId = generateId();
    const parentId = draftNode.parentId;
    const res = await addNode(newId, name, draftNode.type, parentId === 'root' ? null : parentId);
    if (!res?.success) {
      showToast('新建失败：' + (res?.error || '未知错误'));
      return;
    }
    setDraftNode(null);
    await loadTreeData();
    if (parentId !== 'root') {
      setActiveFolderId(parentId);
      setActiveFileId(null);
    }
    showToast('已新建：' + name);
  };

  const openNodeMenu = (event, node) => {
    if (!isAdmin || !node) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setMenuState({ id: node.id, node, x: rect.left, y: rect.bottom + 4 });
  };


  const renderNodeMenu = () => {
    if (!menuState) return null;
    const node = menuState.node;
    const item = (label, icon, onClick, danger) => (
      <button
        key={label}
        type="button"
        onClick={(event) => { event.stopPropagation(); onClick(); }}
        className={cx(
          'flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition',
          danger
            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30'
            : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
        )}
      >
        {icon}
        {label}
      </button>
    );
    return (
      <div
        className="fixed z-50 w-[168px] overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        style={{ left: menuState.x, top: menuState.y }}
        onClick={(event) => event.stopPropagation()}
      >
        {item('重命名', <Pencil size={13} />, () => beginRename(node))}
        {item('移动到…', <MoveRight size={13} />, () => startMovingFile(node))}
        {node.type === 'folder' && item('新建子目录', <FolderPlus size={13} />, () => handleCreateNode(node.id, 'folder'))}
        {node.type === 'folder' && item('新建文章', <FilePlus size={13} />, () => handleCreateNode(node.id, 'file'))}
        {item('删除', <Trash2 size={13} />, () => handleDeleteNode(node), true)}
      </div>
    );
  };

  const toggleNav = (id, open) => setNavOpen(prev => ({ ...prev, [id]: !open }));

  const treeInputProps = (node) => ({
    autoFocus: true,
    value: renameValue,
    onChange: (event) => setRenameValue(event.target.value),
    onBlur: () => submitRename(node),
    onKeyDown: (event) => {
      if (event.key === 'Enter') { event.preventDefault(); submitRename(node); }
      if (event.key === 'Escape') { event.preventDefault(); cancelRename(); }
    },
    onClick: (event) => event.stopPropagation(),
    onDoubleClick: (event) => event.stopPropagation()
  });

  const renderDraftRow = (depth = 0) => {
    if (!draftNode) return null;
    const isFolder = draftNode.type === 'folder';
    return (
      <div className="flex items-center rounded-md bg-blue-50/60 dark:bg-blue-500/5">
        {isFolder ? (
          <span style={{ marginLeft: 2 + depth * 13 }} className="shrink-0 p-1 text-zinc-400"><Folder size={13} /></span>
        ) : (
          <span style={{ marginLeft: 8 + depth * 13 }} className="shrink-0 p-1 text-zinc-400"><FileText size={13} /></span>
        )}
        <input
          autoFocus
          value={draftNode.name}
          placeholder={isFolder ? '目录名，回车确定' : '文章名，回车确定'}
          onChange={(event) => setDraftNode(prev => (prev ? { ...prev, name: event.target.value } : prev))}
          onBlur={() => { if (draftNode.name.trim()) commitDraft(); else setDraftNode(null); }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); commitDraft(); }
            if (event.key === 'Escape') { event.preventDefault(); cancelDraft(); }
          }}
          className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1.5 py-[3px] text-[13.5px] outline-none dark:bg-zinc-900"
        />
      </div>
    );
  };

  const renderNavTree = (nodes, depth = 0) => nodes.map(node => {
    const isFolder = node.type === 'folder';
    const dropping = dropTargetId === node.id;
    const dragProps = isAdmin && renamingId !== node.id ? {
      draggable: true,
      onDragStart: (event) => {
        setDragId(node.id);
        event.dataTransfer.effectAllowed = 'move';
        try { event.dataTransfer.setData('text/plain', node.id); } catch (e) {}
      },
      onDragEnd: () => { setDragId(null); setDropTargetId(null); }
    } : {};
    const dropProps = isFolder && isAdmin ? {
      onDragOver: (event) => {
        if (!dragId || dragId === node.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        if (dropTargetId !== node.id) setDropTargetId(node.id);
      },
      onDragLeave: () => { if (dropTargetId === node.id) setDropTargetId(null); },
      onDrop: (event) => { event.preventDefault(); event.stopPropagation(); handleDropOn(node); }
    } : {};

    if (!isFolder) {
      const active = activeFileId === node.id;
      return (
        <div
          key={node.id}
          {...dragProps}
          onContextMenu={(event) => openNodeMenu(event, node)}
          className={cx('group flex items-center rounded-md transition', dragId === node.id && 'opacity-40')}
        >
          {renamingId === node.id ? (
            <input
              {...treeInputProps(node)}
              style={{ marginLeft: 8 + depth * 13 }}
              className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1.5 py-[3px] text-[13.5px] outline-none dark:bg-zinc-900"
            />
          ) : (
            <button
              type="button"
              onClick={() => openFile(node)}
              onDoubleClick={(event) => { event.stopPropagation(); beginRename(node); }}
              style={{ paddingLeft: 8 + depth * 13 }}
              className={cx(
                'flex min-w-0 flex-1 items-center gap-2 rounded-md py-[5px] pr-2 text-left text-[13.5px] leading-5 transition',
                active
                  ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60'
              )}
            >
              <FileText size={13} className={cx('shrink-0', active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-400')} />
              <span className="truncate">{node.name}</span>
              {isAdmin && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => openNodeMenu(event, node)}
                  className="ml-auto shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <MoreHorizontal size={14} />
                </span>
              )}
            </button>
          )}
        </div>
      );
    }

    const open = navOpen[node.id] !== undefined ? navOpen[node.id] : depth < 2;
    const active = activeFolderId === node.id;
    return (
      <div key={node.id}>
        <div
          {...dragProps}
          {...dropProps}
          onContextMenu={(event) => openNodeMenu(event, node)}
          className={cx(
            'group flex items-center rounded-md transition',
            dropping && 'bg-blue-100 ring-1 ring-inset ring-blue-400 dark:bg-blue-900/40',
            !dropping && 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60',
            dragId === node.id && 'opacity-40'
          )}
        >
          <button
            type="button"
            onClick={() => toggleNav(node.id, open)}
            style={{ marginLeft: 2 + depth * 13 }}
            className="shrink-0 rounded p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            aria-label={open ? '收起' : '展开'}
          >
            <ChevronRight size={13} className={cx('transition-transform', open && 'rotate-90')} />
          </button>
          {renamingId === node.id ? (
            <input
              {...treeInputProps(node)}
              className="min-w-0 flex-1 rounded border border-blue-400 bg-white px-1.5 py-[3px] text-[13.5px] outline-none dark:bg-zinc-900"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => openFolder(allFolders.find(item => item.id === node.id) || node)}
                onDoubleClick={(event) => { event.stopPropagation(); beginRename(node); }}
                className={cx(
                  'min-w-0 flex-1 truncate py-[5px] pr-2 text-left text-[13.5px] leading-5',
                  active ? 'font-medium text-blue-700 dark:text-blue-300' : 'text-zinc-700 dark:text-zinc-300'
                )}
              >
                {node.name}
              </button>
              {isAdmin && (
                <span
                  role="button"
                  tabIndex={-1}
                  onClick={(event) => openNodeMenu(event, node)}
                  className="mr-1 shrink-0 rounded p-0.5 text-zinc-300 opacity-0 transition hover:text-zinc-600 group-hover:opacity-100 dark:text-zinc-600 dark:hover:text-zinc-300"
                >
                  <MoreHorizontal size={14} />
                </span>
              )}
            </>
          )}
        </div>
        {open && node.children && node.children.length > 0 && renderNavTree(node.children, depth + 1)}
        {open && draftNode && draftNode.parentId === node.id && renderDraftRow(depth + 1)}
      </div>
    );
  });

  const countDocs = (folder) => {
    if (!folder) return 0;
    const kids = folder.children || [];
    return kids.reduce((sum, child) => sum + (child.type === 'file' ? 1 : countDocs(child)), 0);
  };

  // 首页的知识分布图：角度按分类数均分，圆直径按篇数比例，全部由数据算出，加分类自动重排
  const renderKnowledgeMap = (categories) => {
    if (!categories.length) return null;
    const W = 480, H = 440, cx0 = 240, cy0 = 216, ORB = 148;
    const maxN = Math.max(...categories.map(c => countDocs(c)), 1);
    const total = categories.reduce((sum, c) => sum + countDocs(c), 0);
    const nodes = categories.map((c, i) => {
      const ang = (i / categories.length) * Math.PI * 2 - Math.PI / 2;
      const n = countDocs(c);
      return { c, n, ang, cos: Math.cos(ang), x: cx0 + Math.cos(ang) * ORB, y: cy0 + Math.sin(ang) * ORB, r: 10 + (n / maxN) * 12 };
    });
    const subDots = nodes.flatMap(nd => (nd.c.children || []).filter(k => k.type === 'folder').map((k, j, arr) => {
      const cnt = countDocs(k);
      const a2 = nd.ang + (j - (arr.length - 1) / 2) * 0.42;
      const d2 = 34 + Math.min(cnt, 12) * 2.2;
      const px = nd.x + Math.cos(a2) * d2, py = nd.y + Math.sin(a2) * d2;
      return { key: k.id, x1: nd.x, y1: nd.y, x: px, y: py, r: 2.4 + Math.min(cnt, 10) * 0.42 };
    }));
    return (
      <svg viewBox={'0 0 ' + W + ' ' + H} className="block h-auto w-full overflow-visible">
        {nodes.map(nd => (
          <line key={'l' + nd.c.id} x1={cx0} y1={cy0} x2={nd.x} y2={nd.y} strokeWidth={1 + (nd.n / maxN) * 2} className="stroke-blue-200 dark:stroke-blue-900" />
        ))}
        {subDots.map(d => (
          <g key={'s' + d.key}>
            <line x1={d.x1} y1={d.y1} x2={d.x} y2={d.y} strokeWidth={1} className="stroke-blue-100 dark:stroke-blue-950" />
            <circle cx={d.x} cy={d.y} r={d.r} className="fill-blue-300 dark:fill-blue-800" opacity={0.9} />
          </g>
        ))}
        {nodes.map(nd => {
          const side = nd.cos > 0.4 ? 'start' : nd.cos < -0.4 ? 'end' : 'middle';
          const lx = nd.x + (nd.cos > 0.4 ? nd.r + 8 : nd.cos < -0.4 ? -nd.r - 8 : 0);
          const ly = nd.y + (Math.abs(nd.cos) <= 0.4 ? (nd.y < cy0 ? -nd.r - 9 : nd.r + 16) : 4);
          return (
            <g key={nd.c.id} role="button" tabIndex={0} onClick={() => openFolder(allFolders.find(item => item.id === nd.c.id) || nd.c)} className="cursor-pointer">
              <title>{nd.c.name + ' · ' + nd.n + ' 篇'}</title>
              <circle cx={nd.x} cy={nd.y} r={nd.r} strokeWidth={1.5} className="fill-blue-100 stroke-blue-500 dark:fill-blue-950 dark:stroke-blue-500" />
              <text x={nd.x} y={nd.y + 3.8} textAnchor="middle" fontSize={10.5} fontWeight={700} className="fill-blue-700 dark:fill-blue-300">{nd.n}</text>
              <text x={lx} y={ly} textAnchor={side} fontSize={11.5} className="fill-zinc-500 dark:fill-zinc-400">{nd.c.name}</text>
            </g>
          );
        })}
        <circle cx={cx0} cy={cy0} r={30} className="fill-blue-600" />
        <text x={cx0} y={cy0 + 5} textAnchor="middle" fontSize={12.5} fontWeight={700} className="fill-white">{total}</text>
      </svg>
    );
  };

  const renderHomePage = () => {
    const categories = rootFolders.flatMap(folder => folder.children || []).filter(child => child.type === 'folder');
    const totalDocs = allFiles.length;
    const recent = (libraryStats && libraryStats.recent) || [];
    const thin = (libraryStats && libraryStats.thin) || [];
    const filled = totalDocs - thin.length;
    const categoryOf = (path) => {
      const parts = String(path || '').split(' / ');
      return parts.length > 1 ? parts[1] : '—';
    };
    const shortDate = (iso) => {
      if (!iso) return '—';
      const d = new Date(iso);
      return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    };
    const continueFile = (recent[0] && allFiles.find(f => f.id === recent[0].id)) || allFiles.find(f => f.id === (recentDocs[0] && recentDocs[0].id)) || null;
    const continueMeta = recent[0] ? (categoryOf(continueFile && continueFile.path) + ' · ' + recent[0].len + ' 字 · ' + shortDate(recent[0].updated_at) + ' 改过') : '';
    const maxCount = Math.max(...categories.map(c => countDocs(c)), 1);

    return (
      <div className="mx-auto max-w-[1120px] px-8 py-10">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">硬件知识库</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
          <span><b className="font-semibold text-zinc-700 dark:text-zinc-200">{categories.length}</b> 个分类</span>
          <span><b className="font-semibold text-zinc-700 dark:text-zinc-200">{totalDocs}</b> 篇</span>
          <span><b className="font-semibold text-zinc-700 dark:text-zinc-200">{filled}</b> 篇有内容</span>
          {recent[0] && <span>最近更新 {shortDate(recent[0].updated_at)}</span>}
        </div>

        {continueFile && (
          <button type="button" onClick={() => openFile(continueFile)} className="mt-6 flex w-full items-center gap-4 rounded-xl border border-blue-100 bg-gradient-to-r from-blue-50/70 to-white px-5 py-3.5 text-left transition hover:border-blue-300 dark:border-blue-900 dark:from-blue-950/40 dark:to-zinc-950">
            <span className="flex-none text-[11.5px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">继续</span>
            <span className="min-w-0">
              <span className="block truncate text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">{continueFile.name}</span>
              {continueMeta && <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">{continueMeta}</span>}
            </span>
            <span className="ml-auto flex-none text-[12.5px] text-blue-600 dark:text-blue-400">打开 ›</span>
          </button>
        )}

        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)]">
          <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="mb-1 flex items-center gap-2 text-[12.5px] text-zinc-500 dark:text-zinc-400">
              <span>知识分布</span>
            </div>
            {renderKnowledgeMap(categories)}
          </div>

          <div>
            <div className="rounded-xl border border-zinc-200 px-4 py-3 dark:border-zinc-800">
              <div className="mb-1 flex items-center gap-2 text-[12.5px] text-zinc-500 dark:text-zinc-400">
                <span>最近更新</span>
              </div>
              <div className="flex flex-col">
                {recent.length === 0 && <p className="py-4 text-[13px] text-zinc-400">还没有写过正文</p>}
                {recent.map(item => {
                  const file = allFiles.find(f => f.id === item.id);
                  if (!file) return null;
                  return (
                    <button key={item.id} type="button" onClick={() => openFile(file)} className="flex items-center gap-3 border-b border-zinc-100 py-2 text-left last:border-0 dark:border-zinc-900">
                      <span className="w-[52px] flex-none text-[11.5px] tabular-nums text-zinc-400 dark:text-zinc-500">{shortDate(item.updated_at)}</span>
                      <span className="min-w-0 truncate text-[13.5px] text-zinc-800 hover:text-blue-600 dark:text-zinc-200">{item.name}</span>
                      <span className="ml-auto flex-none rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">{categoryOf(file.path)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {thin.length > 0 && (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-200 px-4 py-3 dark:border-zinc-800">
                <div className="mb-2 text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">待写 {thin.length}</div>
                <div className="flex flex-wrap gap-1.5">
                  {thin.map(item => {
                    const file = allFiles.find(f => f.id === item.id);
                    if (!file) return null;
                    return (
                      <button key={item.id} type="button" onClick={() => openFile(file)} className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[12px] text-amber-800 transition hover:border-amber-300 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300">{item.name}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <h2 className="mt-8 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">分类</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map(folder => {
            const n = countDocs(folder);
            const subs = (folder.children || []).filter(child => child.type === 'folder').map(child => child.name);
            return (
              <button key={folder.id} type="button" onClick={() => openFolder(allFolders.find(item => item.id === folder.id) || folder)} className="rounded-xl border border-zinc-200 px-4 py-3 text-left transition hover:border-blue-300 hover:shadow-sm dark:border-zinc-800 dark:hover:border-blue-800">
                <div className="flex items-baseline gap-2">
                  <span className="text-[14.5px] font-semibold text-zinc-900 dark:text-zinc-100">{folder.name}</span>
                  <span className="ml-auto text-[12px] tabular-nums text-zinc-400 dark:text-zinc-500">{n}</span>
                </div>
                <div className="my-2 h-[3px] overflow-hidden rounded bg-zinc-100 dark:bg-zinc-800">
                  <i className="block h-full rounded bg-blue-600 opacity-85" style={{ width: Math.round((n / maxCount) * 100) + '%' }} />
                </div>
                <div className="text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{subs.join(' · ') || '—'}</div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };
  const renderFolderPage = () => {
    if (!activeFolder) return renderHomePage();
    const childFolders = (activeFolder.children || []).filter(child => child.type === 'folder');
    const childFiles = (activeFolder.children || [])
      .filter(child => child.type === 'file')
      .map(file => allFiles.find(item => item.id === file.id) || file);
    const descendantFiles = allFiles.filter(file =>
      file.id !== activeFileId &&
      file.path &&
      file.path.indexOf(activeFolder.path + ' / ') === 0 &&
      file.parentKey !== activeFolder.id
    );

    return (
      <div className="mx-auto max-w-[900px] px-8 py-12">
        <button type="button" onClick={goToParentFolder} className="mb-5 inline-flex items-center gap-1 text-[13px] text-zinc-500 hover:text-blue-600 dark:text-zinc-400">
          <ChevronLeft size={14} /> {activeFolderParent ? activeFolderParent.name : '学习首页'}
        </button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[30px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{activeFolder.name}</h1>
            <p className="mt-2 text-[13px] text-zinc-500 dark:text-zinc-400">{activeFolder.path}</p>
          </div>
          {isAdmin && (
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => handleCreateNode(activeFolder.id, 'file')} className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-[13px] text-white hover:bg-blue-700">
                <FilePlus size={14} /> 新文章
              </button>
              <button type="button" onClick={() => handleCreateNode(activeFolder.id, 'folder')} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-3 py-1.5 text-[13px] text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-900">
                <FolderPlus size={14} /> 新子目录
              </button>
            </div>
          )}
        </div>


        {childFolders.length > 0 && (
          <section className="mt-4">
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">子目录</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {childFolders.map(folder => renderNestedFolderPreview(folder))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">本目录文章</h2>
          {childFiles.length > 0 ? (
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {childFiles.map(file => renderArticleRow(file))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-[13px] text-zinc-400 dark:border-zinc-800">这个目录下暂时没有文章。</p>
          )}
        </section>

        {descendantFiles.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">子目录文章</h2>
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {descendantFiles.map(file => renderArticleRow(file))}
            </div>
          </section>
        )}
      </div>
    );
  };

  const renderSearchPage = () => {
    const query = searchQuery.trim().toLowerCase();
    const matchedFolders = allFolders.filter(folder => folder.name.toLowerCase().includes(query) || folder.path.toLowerCase().includes(query));
    const matchedFiles = allFiles.filter(file => file.name.toLowerCase().includes(query) || file.path.toLowerCase().includes(query));

    return (
      <div className="mx-auto max-w-[900px] px-8 py-12">
        <h1 className="text-[26px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">“{searchQuery}”</h1>
        <p className="mt-2 text-[13px] text-zinc-500 dark:text-zinc-400">找到 {matchedFolders.length} 个目录，{matchedFiles.length} 篇文章{contentHits.length > 0 ? '，另有 ' + contentHits.length + ' 篇正文命中' : ''}。</p>

        {matchedFolders.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">目录</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {matchedFolders.map(folder => (
                <button key={folder.id} type="button" onClick={() => openFolder(folder)} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 px-4 py-3 text-left transition hover:border-blue-300 dark:border-zinc-800">
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] text-zinc-800 dark:text-zinc-100">{folder.name}</span>
                    <span className="block truncate text-[12px] text-zinc-400">{folder.path}</span>
                  </span>
                  <ChevronRight size={14} className="shrink-0 text-zinc-300" />
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">文章</h2>
          {matchedFiles.length > 0 ? (
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {matchedFiles.map(file => renderArticleRow(file))}
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-zinc-300 px-4 py-8 text-center text-[13px] text-zinc-400 dark:border-zinc-800">没有匹配的文章。</p>
          )}
        </section>

        {contentHits.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-[13px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">正文命中 · {contentHits.length}</h2>
            <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
              {contentHits.filter(hit => !matchedFiles.some(f => f.id === hit.id)).map(hit => {
                const file = allFiles.find(item => item.id === hit.id);
                return (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => file && openFile(file)}
                    className="block w-full px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900"
                  >
                    <span className="block truncate text-[13.5px] font-medium text-zinc-800 dark:text-zinc-100">{hit.name}</span>
                    <span className="mt-1 block text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">{String(hit.snippet || '').replace(/\s+/g, ' ').trim()}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  };

  const renderArticlePage = () => (
    <div className={cx('mx-auto flex gap-10 px-8', isEditing ? 'max-w-[1500px] py-6' : 'max-w-[1120px] py-12')}>
      <article className={cx('min-w-0 flex-1', isEditing ? 'max-w-none' : 'max-w-[760px]')}>
        <div className="flex items-center gap-1.5 text-[12.5px] text-zinc-400">
          <button type="button" onClick={returnFromArticle} className="hover:text-blue-600">{activeFolder ? activeFolder.name : '学习首页'}</button>
          <ChevronRight size={12} />
          <span className="truncate text-zinc-500 dark:text-zinc-400">{activeTitle}</span>
        </div>

        <h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50">{activeTitle}</h1>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          {isUploading && <span className="animate-pulse text-[12px] text-blue-500">图片上传中…</span>}
          {isEditing && autoSaveLabel && (
            <span className={cx('text-[12px]', autoSaveStatus === 'error' ? 'text-red-500' : 'text-zinc-400')}>{autoSaveLabel}</span>
          )}
          <button type="button" onClick={toggleFavoriteDoc} className={cx('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] transition', isFavorite ? 'border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-900 dark:bg-yellow-900/20 dark:text-yellow-200' : 'border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900')}>
            <Star size={13} /> {isFavorite ? '已收藏' : '收藏'}
          </button>
          {isEditing && (
            <button type="button" onClick={toggleAutoSpacing} className={cx('inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[12.5px] transition', autoSpacingEnabled ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200' : 'border-zinc-200 text-zinc-500 dark:border-zinc-800 dark:text-zinc-400')}>
              Auto spacing {autoSpacingEnabled ? 'ON' : 'OFF'}
            </button>
          )}
          {isAdmin && activeFile && !isEditing && (
            <button type="button" onClick={() => startMovingFile(activeFile)} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1.5 text-[12.5px] text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900">
              <MoveRight size={13} /> 移动
            </button>
          )}
          {isAdmin && activeFile && !isEditing && (
            <button type="button" onClick={() => handleDeleteNode(activeFile)} title="删除这篇文章" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1.5 text-[12.5px] text-zinc-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-red-900 dark:hover:bg-red-950/30">
              <Trash2 size={13} />
            </button>
          )}
          {isAdmin && (
            <button type="button" onClick={() => (isEditing ? handleSave() : setIsEditing(true))} className={cx(isEditing ? 'ml-auto' : '', 'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] transition', isEditing ? 'bg-green-600 text-white' : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300')}>
              {isEditing ? <><Save size={13} /> 保存</> : <><Edit2 size={13} /> 编辑</>}
            </button>
          )}
        </div>

        {isEditing ? (
          <div data-color-mode={theme} className="mt-5" style={{ height: 'calc(100vh - 232px)', minHeight: 420 }} onPaste={handlePaste} onDrop={handleDrop}>
            <MDEditor
              value={markdownContent || ' '}
              onChange={setMarkdownContent}
              height="100%"
              previewOptions={{ remarkPlugins: [remarkGfm, remarkMath], rehypePlugins: [rehypeRaw, rehypeKatex] }}
            />
          </div>
        ) : (
          <div className="prose prose-zinc dark:prose-invert mt-6 max-w-none prose-headings:tracking-tight prose-a:text-blue-600 prose-pre:bg-[#18181b] prose-pre:text-zinc-100 prose-h1:mt-10 prose-h1:mb-4 prose-h1:border-b prose-h1:border-zinc-200 prose-h1:pb-2 prose-h1:text-[20px] prose-h1:font-semibold dark:prose-h1:border-zinc-800">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeRaw, rehypeKatex]} components={mdComponents}>
              {markdownContent || ' '}
            </ReactMarkdown>
          </div>
        )}

        {!isEditing && (<div className="mt-12 flex items-center justify-between gap-4 border-t border-zinc-200 pt-5 dark:border-zinc-800">
          {previousFile ? (
            <button type="button" onClick={() => openFile(previousFile)} className="min-w-0 text-left text-[13px] text-zinc-500 hover:text-blue-600">
              <span className="flex items-center gap-1 text-[11.5px] text-zinc-400"><ChevronLeft size={12} /> 上一篇</span>
              <span className="mt-1 block truncate font-medium text-zinc-800 dark:text-zinc-200">{previousFile.name}</span>
            </button>
          ) : <span />}
          {nextFile ? (
            <button type="button" onClick={() => openFile(nextFile)} className="min-w-0 text-right text-[13px] text-zinc-500 hover:text-blue-600">
              <span className="flex items-center justify-end gap-1 text-[11.5px] text-zinc-400">下一篇 <ChevronRight size={12} /></span>
              <span className="mt-1 block truncate font-medium text-zinc-800 dark:text-zinc-200">{nextFile.name}</span>
            </button>
          ) : <span />}
        </div>)}
      </article>

      {!isEditing && activeHeadings.length > 0 && (
        <aside className="hidden w-[220px] shrink-0 xl:block">
          <div className="sticky top-12">
            <p className="mb-3 text-[12px] font-medium uppercase tracking-wide text-zinc-400">本页目录</p>
            <div className="space-y-1 border-l border-zinc-200 dark:border-zinc-800">
              {activeHeadings.map(heading => (
                <button
                  key={heading.id}
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(heading.id);
                    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  style={{ paddingLeft: heading.level === 1 ? 12 : heading.level === 2 ? 18 : 26 }}
                  className="-ml-px block w-full border-l border-transparent py-0.5 text-left text-[12.5px] leading-5 text-zinc-500 transition hover:border-blue-400 hover:text-blue-600 dark:text-zinc-400"
                >
                  {heading.text}
                </button>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100">
      {renderNodeMenu()}
      {renderMoveTargetPanel()}
      {toast && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-zinc-900 px-3.5 py-2 text-[13px] text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900">
          {toast}
        </div>
      )}
      {loginDialog}
      <header className="z-30 flex h-14 shrink-0 items-center gap-4 border-b border-zinc-200 px-5 dark:border-zinc-800">
        <button type="button" onClick={openHome} className="flex shrink-0 items-center gap-2">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-blue-600 text-[12px] font-bold text-white">P</span>
          <span className="text-[14.5px] font-semibold tracking-tight">PZP 硬件知识库</span>
        </button>

        <div className="relative ml-2 w-full max-w-[260px]">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索芯片、器件、协议…"
            className="w-full rounded-md border border-zinc-200 bg-transparent py-1.5 pl-8 pr-3 text-[13px] outline-none transition focus:border-blue-400 dark:border-zinc-800"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {isAdmin ? (
            <span className="rounded-md bg-blue-50 px-2 py-1 text-[11.5px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">可编辑</span>
          ) : (
            <button type="button" onClick={() => setShowLogin(true)} className="rounded-md px-2 py-1 text-[12px] text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">登录</button>
          )}
          <button type="button" onClick={toggleTheme} title="切换显示模式" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          {isAdmin && (
            <button type="button" onClick={handleLogout} title="退出编辑" className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800">
              <LogOut size={15} />
            </button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[260px] shrink-0 flex-col overflow-hidden border-r border-zinc-200 md:flex dark:border-zinc-800">
          <div className="flex items-center justify-between px-3 pb-1 pt-3">
            <button type="button" onClick={openHome} className={cx('flex-1 rounded-md px-2 py-1.5 text-left text-[13.5px] transition', !activeFileId && !activeFolderId && !searchQuery.trim() ? 'bg-blue-50 font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60')}>
              学习首页
            </button>
            {isAdmin && !movingNode && (
              <button type="button" onClick={() => handleCreateNode('root', 'folder')} title="添加根目录" className="rounded p-1 text-zinc-400 hover:text-blue-600">
                <PlusCircle size={14} />
              </button>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6 pt-2">
            {isLoading ? (
              <p className="px-3 py-2 text-[13px] text-zinc-400">加载中…</p>
            ) : rootFolders.length > 0 ? (
              <>
                {renderNavTree(rootFolders, 0)}
                {draftNode && draftNode.parentId === 'root' && renderDraftRow(0)}
              </>
            ) : (
              <p className="px-3 py-2 text-[13px] text-zinc-400">暂无目录</p>
            )}
          </div>

          {isAdmin && activeFolder && !movingNode && (
            <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
              <button type="button" onClick={() => handleCreateNode(activeFolder.id, 'file')} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-[13px] text-white hover:bg-blue-700">
                <FilePlus size={14} /> 在当前目录新建文章
              </button>
            </div>
          )}
        </aside>

        <main id="article-scroll-area" onScroll={saveReadingPosition} className="min-w-0 flex-1 overflow-y-auto">
          {searchQuery.trim() ? renderSearchPage() : activeFileId ? renderArticlePage() : renderFolderPage()}
        </main>
      </div>
    </div>
  );
}
