'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect,useMemo } from 'react';
import { 
  Folder, FolderOpen, FileText, Search, PlusCircle, LogOut, 
  Edit2, Save, FilePlus, FolderPlus,
  Sun, Moon, Clock, Star, Home as HomeIcon, ChevronLeft, ChevronRight, MapPin
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import nextDynamic from 'next/dynamic'; 
import { getDirectories, getDocument, addNode, updateDocument, moveNode } from './actions';

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

export default function Home() {
  const [userRole, setUserRole] = useState(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [activeFileId, setActiveFileId] = useState(null);
  const [activeFolderId, setActiveFolderId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [markdownContent, setMarkdownContent] = useState("");
  const [activeTitle, setActiveTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [movingNode, setMovingNode] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [theme, setTheme] = useState('light');
  const [recentDocs, setRecentDocs] = useState([]);
  const [favoriteDocs, setFavoriteDocs] = useState([]);

  useEffect(() => {
    const savedRole = localStorage.getItem('pzp_wiki_role');
    if (savedRole) setUserRole(savedRole);
    else setIsLoading(false);

    const savedTheme = localStorage.getItem('pzp_wiki_theme');
    const initTheme = savedTheme === 'dark' ? 'dark' : 'light';
    setTheme(initTheme);
    document.documentElement.classList.toggle('dark', initTheme === 'dark');

    setRecentDocs(JSON.parse(localStorage.getItem(RECENT_DOCS_KEY) || '[]'));
    setFavoriteDocs(JSON.parse(localStorage.getItem(FAVORITE_DOCS_KEY) || '[]'));
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

  const isFavorite = activeFile ? favoriteDocs.some(doc => doc.id === activeFile.id) : false;

  const loadTreeData = async () => {
    setIsLoading(true);
    const res = await getDirectories();
    if (res.success) setDirectories(buildTree(res.data, null));
    setIsLoading(false);
  };

  const buildTree = (nodes, parentId, level = 0) => {
    return nodes.filter(node => node.parent_id === parentId).map(node => ({
      ...node, isExpanded: level < 2, children: buildTree(nodes, node.id, level + 1)
    }));
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (loginUser === 'pzpadmin' && loginPass === 'p986960440105++') {
      setUserRole('admin'); localStorage.setItem('pzp_wiki_role', 'admin');
    } else if (loginUser === 'guest' && loginPass === '123456') {
      setUserRole('guest'); localStorage.setItem('pzp_wiki_role', 'guest');
    } else alert('账号或密码错误！');
  };

  const handleLogout = () => {
    setUserRole(null); localStorage.removeItem('pzp_wiki_role');
    setDirectories([]); setActiveFileId(null); setActiveFolderId(null); setMovingNode(null);
  };

  const isAdmin = userRole === 'admin';

  if (!userRole) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100 dark:bg-zinc-950 transition-colors">
        <div className="bg-white dark:bg-zinc-900 p-10 rounded-xl shadow-lg w-[400px] border dark:border-zinc-800">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">⚙️ PZP</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">个人硬件知识库</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <input type="text" placeholder="用户名" className="border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" value={loginUser} onChange={e => setLoginUser(e.target.value)} required />
            <input type="password" placeholder="密码" className="border dark:border-zinc-700 dark:bg-zinc-800 dark:text-white p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md shadow-md mt-2">进入知识库</button>
          </form>
        </div>
      </div>
    );
  }

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
    setActiveTitle(file.name);
    setIsEditing(false);
    setMarkdownContent("加载云端数据中...");
    persistRecentDoc(file);
    const res = await getDocument(file.id);
    if (res.success) {
      setMarkdownContent(res.content);
      restoreReadingPosition(file.id);
    }
  };

  const handleAddNode = async (parentId, type) => {
    if (!isAdmin) return;
    const name = prompt(`请输入新${type === 'folder' ? '目录' : '文章'}的名称:`);
    if (!name) return;
    const newId = generateId();
    await addNode(newId, name, type, parentId === 'root' ? null : parentId);
    await loadTreeData();
    if (parentId !== 'root') setActiveFolderId(parentId);
    setActiveFileId(null);
  };

  const moveToRoot = async () => {
    await moveNode(movingNode.id, null); await loadTreeData(); setMovingNode(null);
  };

  const handleSave = async () => {
    await updateDocument(activeFileId, markdownContent);
    alert("云端保存成功！"); setIsEditing(false);
  };

  const openFolder = (folder) => {
    if (!folder) return;
    setActiveFolderId(folder.id);
    setActiveFileId(null);
    setIsEditing(false);
  };

  const openHome = () => {
    setActiveFileId(null);
    setActiveFolderId(null);
    setIsEditing(false);
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

    return (
      <div className="h-full overflow-y-auto p-8 bg-white dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <button type="button" onClick={() => setActiveFolderId(null)} className="mb-4 inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400">
              <ChevronLeft size={16} /> 返回学习首页
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
                  <button type="button" onClick={() => handleAddNode(activeFolder.id, 'file')} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600 transition">
                    <FilePlus size={16} /> 新文章
                  </button>
                  <button type="button" onClick={() => handleAddNode(activeFolder.id, 'folder')} className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-gray-100 text-gray-800 hover:bg-gray-200 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700 transition">
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
                {childFolders.map(folder => (
                  <button key={folder.id} type="button" onClick={() => openFolder(allFolders.find(item => item.id === folder.id) || folder)} className="flex items-center justify-between gap-3 border border-gray-200 dark:border-zinc-800 rounded-lg px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-900 transition">
                    <span className="flex items-center gap-3 min-w-0">
                      <Folder size={17} className="text-blue-500 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{folder.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400">{folder.children?.length || 0} 项</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-green-600 dark:text-green-400" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">文章</h3>
            </div>
            {childFiles.length > 0 ? (
              <div className="border border-gray-200 dark:border-zinc-800 rounded-lg divide-y divide-gray-200 dark:divide-zinc-800 overflow-hidden">
                {childFiles.map(file => (
                  <button key={file.id} type="button" onClick={() => openFile(file)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-900 transition">
                    <span className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className="text-gray-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{file.path || activeFolder.path}</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-gray-300 dark:border-zinc-700 rounded-lg px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                这个目录下暂时没有文章。
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  const renderSearchResults = () => {
    const query = searchQuery.trim().toLowerCase();
    const matchedFolders = allFolders.filter(folder => folder.name.toLowerCase().includes(query));
    const matchedFiles = allFiles.filter(file => file.name.toLowerCase().includes(query));

    return (
      <div className="h-full overflow-y-auto p-8 bg-white dark:bg-zinc-950">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-2">搜索</p>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">“{searchQuery}”</h2>
            <p className="text-gray-500 dark:text-gray-400 mt-2">
              找到 {matchedFolders.length} 个目录，{matchedFiles.length} 篇文章
            </p>
          </div>

          {matchedFolders.length > 0 && (
            <section className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <FolderOpen size={18} className="text-blue-500" />
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">目录</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {matchedFolders.map(folder => (
                  <button key={folder.id} type="button" onClick={() => openFolder(folder)} className="flex items-center justify-between gap-3 border border-gray-200 dark:border-zinc-800 rounded-lg px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-900 transition">
                    <span className="flex items-center gap-3 min-w-0">
                      <Folder size={17} className="text-blue-500 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{folder.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{folder.path}</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center gap-2 mb-3">
              <FileText size={18} className="text-green-600 dark:text-green-400" />
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">文章</h3>
            </div>
            {matchedFiles.length > 0 ? (
              <div className="border border-gray-200 dark:border-zinc-800 rounded-lg divide-y divide-gray-200 dark:divide-zinc-800 overflow-hidden">
                {matchedFiles.map(file => (
                  <button key={file.id} type="button" onClick={() => openFile(file)} className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-900 transition">
                    <span className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className="text-gray-400 shrink-0" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</span>
                        <span className="block text-xs text-gray-500 dark:text-gray-400 truncate">{file.path}</span>
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-gray-400 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="border border-dashed border-gray-300 dark:border-zinc-700 rounded-lg px-4 py-8 text-sm text-gray-500 dark:text-gray-400">
                没有匹配的文章。
              </div>
            )}
          </section>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 transition-colors">
      
      {/* === 左侧导航入口区域 === */}
      <div className="w-72 bg-gray-50 dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 flex flex-col select-none transition-colors">
        <div className="p-4 border-b border-gray-200 dark:border-zinc-800">
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100 tracking-wide">⚙️ PZP 知识库</h1>
          <button type="button" onClick={openHome} className={`mt-4 w-full flex items-center gap-2 px-3 py-2 rounded-md text-left text-sm transition ${!activeFileId && !activeFolderId && !searchQuery ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'bg-white text-gray-800 hover:bg-gray-100 dark:bg-zinc-800 dark:text-gray-200 dark:hover:bg-zinc-700'}`}>
            <HomeIcon size={16} /> 学习首页
          </button>
        </div>
        {movingNode && (
          <div className="px-4 py-2">
            <div className="bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 p-3 text-xs rounded shadow-sm">
              <p className="text-gray-700 dark:text-gray-300 mb-2">正在移动: <strong className="text-black dark:text-white">{movingNode.name}</strong></p>
              <div className="flex gap-2">
                <button onClick={moveToRoot} className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 px-2 py-1 rounded flex-1 dark:text-white">移至最外层</button>
                <button onClick={() => setMovingNode(null)} className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-2 py-1 rounded">取消</button>
              </div>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {isLoading ? (
            <p className="text-gray-400 text-sm">加载中...</p>
          ) : (
            <>
              <section>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <Clock size={14} /> 最近打开
                </div>
                <div className="space-y-1">
                  {recentDocs.length > 0 ? recentDocs.slice(0, 5).map(doc => renderSidebarDoc(doc, <Clock size={14} />)) : (
                    <p className="px-2 py-1.5 text-xs text-gray-400">还没有打开记录</p>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  <Star size={14} /> 收藏
                </div>
                <div className="space-y-1">
                  {favoriteDocs.length > 0 ? favoriteDocs.slice(0, 6).map(doc => renderSidebarDoc(doc, <Star size={14} />)) : (
                    <p className="px-2 py-1.5 text-xs text-gray-400">收藏后会出现在这里</p>
                  )}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <Folder size={14} /> 目录
                  </div>
                  {isAdmin && !movingNode && (
                    <button type="button" onClick={() => handleAddNode('root', 'folder')} className="p-1 rounded text-blue-600 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-zinc-800" title="添加根目录">
                      <PlusCircle size={15} />
                    </button>
                  )}
                </div>
                <div className="space-y-1">
                  {rootFolders.length > 0 ? rootFolders.map(renderSidebarFolder) : (
                    <p className="px-2 py-1.5 text-xs text-gray-400">暂无根目录</p>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
        {isAdmin && activeFolder && !movingNode && (
          <div className="p-4 border-t border-gray-200 dark:border-zinc-800">
            <button onClick={() => handleAddNode(activeFolder.id, 'file')} className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600">
              <FilePlus size={18} /><span>在当前目录新建文章</span>
            </button>
          </div>
        )}
      </div>

      {/* === 右侧主内容区域 === */}
      <div className="flex-1 flex flex-col">
        {/* 顶部导航栏 */}
        <div className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 bg-white dark:bg-zinc-900 shrink-0 transition-colors">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input 
              type="text" 
              placeholder="搜索芯片..." 
              className="pl-10 pr-4 py-2 border dark:border-zinc-700 rounded-md text-sm bg-transparent focus:outline-none focus:border-blue-500" 
              // === 新增以下两行 ===
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">当前：<span className={isAdmin ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-green-600 dark:text-green-400 font-bold'}>{isAdmin ? '管理员' : '游客'}</span></span>
            
            <button onClick={toggleTheme} className="flex gap-2 text-sm bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700 transition" title="切换显示模式">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden md:inline">{theme === 'dark' ? '浅色' : '暗色'}</span>
            </button>
            
            <button onClick={handleLogout} className="flex gap-2 text-sm bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700 transition"><LogOut size={16} />退出</button>
          </div>
        </div>

        {/* 文章阅读/编辑区 */}
        <div id="article-scroll-area" onScroll={saveReadingPosition} className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-zinc-950 transition-colors">
          {searchQuery.trim() ? renderSearchResults() : !activeFileId ? (activeFolder ? renderFolderPanel() : renderLearningHome()) : (
            <div className="p-8">
              <div className="flex justify-between items-start mb-6 border-b dark:border-zinc-800 pb-4">
                <div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <MapPin size={14} />
                    <span>{activeFile?.path || activeTitle}</span>
                  </div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{activeTitle}</h2>
                  {isUploading && <span className="text-sm text-blue-500 mt-2 block animate-pulse">图片拼命上传中，请稍候...</span>}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button onClick={toggleFavoriteDoc} className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition ${isFavorite ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200' : 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-gray-200'}`}>
                    <Star size={16} /> {isFavorite ? '已收藏' : '收藏'}
                  </button>
                  {previousFile && (
                    <button onClick={() => openFile(previousFile)} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-gray-200">
                      <ChevronLeft size={16} /> 上一篇
                    </button>
                  )}
                  {nextFile && (
                    <button onClick={() => openFile(nextFile)} className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-gray-200">
                      下一篇 <ChevronRight size={16} />
                    </button>
                  )}
                  {isAdmin && (<button onClick={() => isEditing ? handleSave() : setIsEditing(true)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${isEditing ? 'bg-green-600 text-white dark:bg-green-700' : 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-gray-200'}`}>{isEditing ? <><Save size={16} /> 保存</> : <><Edit2 size={16} /> 编辑</>}</button>)}
                </div>
              </div>
              {isEditing ? (
                <div data-color-mode={theme} className="h-[calc(100vh-220px)]" onPaste={handlePaste} onDrop={handleDrop}>
                  <MDEditor 
                    value={markdownContent || ' '} 
                    onChange={setMarkdownContent} 
                    height="100%" 
                    previewOptions={{
                      remarkPlugins: [remarkGfm, remarkMath],
                      rehypePlugins: [rehypeRaw, rehypeKatex]
                    }}
                  />
                </div>
              ) : (
                <div className="prose prose-blue dark:prose-invert max-w-none">
                  <ReactMarkdown 
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeRaw, rehypeKatex]}
                  >
                    {markdownContent || ' '}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
