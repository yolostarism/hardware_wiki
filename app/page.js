'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { 
  Folder, FolderOpen, FileText, Search, PlusCircle, LogOut, 
  Edit2, Save, Trash2, FilePlus, FolderPlus, Edit, MoveRight,
  Sun, Moon // 新增了太阳和月亮图标
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import nextDynamic from 'next/dynamic'; 
import { getDirectories, getDocument, addNode, deleteNode, updateDocument, renameNode, moveNode } from './actions';

const MDEditor = nextDynamic(() => import('@uiw/react-md-editor'), { ssr: false });
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function Home() {
  const [userRole, setUserRole] = useState(null);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [activeFileId, setActiveFileId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [markdownContent, setMarkdownContent] = useState("");
  const [activeTitle, setActiveTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [movingNode, setMovingNode] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // === 新增：暗色模式状态 ===
  const [theme, setTheme] = useState('light');

  // 初始化：检查登录状态 & 暗色模式设置
  useEffect(() => {
    const savedRole = localStorage.getItem('pzp_wiki_role');
    if (savedRole) setUserRole(savedRole);
    else setIsLoading(false);

    // 读取本地保存的暗黑模式，并应用到 html 标签
    const savedTheme = localStorage.getItem('pzp_wiki_theme');
    const initTheme = savedTheme === 'dark' ? 'dark' : 'light';
    setTheme(initTheme);
    document.documentElement.classList.toggle('dark', initTheme === 'dark');
  }, []);

  useEffect(() => {
    if (userRole) loadTreeData();
  }, [userRole]);

  // === 新增：切换暗色模式 ===
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('pzp_wiki_theme', nextTheme);
    document.documentElement.classList.toggle('dark', nextTheme === 'dark');
  };

  const loadTreeData = async () => {
    setIsLoading(true);
    const res = await getDirectories();
    if (res.success) setDirectories(buildTree(res.data, null));
    setIsLoading(false);
  };

  const buildTree = (nodes, parentId) => {
    return nodes.filter(node => node.parent_id === parentId).map(node => ({
      ...node, isExpanded: true, children: buildTree(nodes, node.id)
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
    setDirectories([]); setActiveFileId(null); setMovingNode(null);
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

  const handleItemClick = async (node) => {
    if (movingNode) {
      if (node.id === movingNode.id) return;
      if (node.type !== 'folder') return alert('只能移动到文件夹里面哦！');
      await moveNode(movingNode.id, node.id);
      await loadTreeData(); setMovingNode(null); return;
    }
    if (node.type === 'folder') {
      const toggleNode = (items) => items.map(item => {
        if (item.id === node.id) return { ...item, isExpanded: !item.isExpanded };
        if (item.children) return { ...item, children: toggleNode(item.children) }; return item;
      });
      setDirectories(toggleNode(directories));
    } else {
      setActiveFileId(node.id); setActiveTitle(node.name); setIsEditing(false);
      setMarkdownContent("加载云端数据中...");
      const res = await getDocument(node.id);
      if (res.success) setMarkdownContent(res.content);
    }
  };

  const handleAddNode = async (parentId, type) => {
    if (!isAdmin) return;
    const name = prompt(`请输入新${type === 'folder' ? '目录' : '文章'}的名称:`);
    if (!name) return;
    const newId = generateId();
    await addNode(newId, name, type, parentId === 'root' ? null : parentId);
    await loadTreeData();
  };

  const handleDeleteNode = async (id, nodeName) => {
    if (!isAdmin) return;
    if (!confirm(`确定要删除 "${nodeName}" 吗？`)) return;
    await deleteNode(id); await loadTreeData();
    if (activeFileId === id) setActiveFileId(null);
  };

  const handleRenameNode = async (id, oldName) => {
    if (!isAdmin) return;
    const newName = prompt('请输入新名称:', oldName);
    if (!newName || newName === oldName) return;
    await renameNode(id, newName); await loadTreeData();
    if (activeFileId === id) setActiveTitle(newName);
  };

  const moveToRoot = async () => {
    await moveNode(movingNode.id, null); await loadTreeData(); setMovingNode(null);
  };

  const handleSave = async () => {
    await updateDocument(activeFileId, markdownContent);
    alert("云端保存成功！"); setIsEditing(false);
  };

  const renderTree = (nodes, level = 0) => {
    return nodes.map((node) => (
      <div key={node.id} style={{ paddingLeft: `${level * 16}px` }} className="mt-1">
        <div className={`flex items-center justify-between px-2 py-1.5 hover:bg-gray-200 dark:hover:bg-zinc-800 rounded cursor-pointer text-sm group ${activeFileId === node.id ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300'} ${movingNode?.id === node.id ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => handleItemClick(node)}>
            {node.type === 'folder' ? (node.isExpanded ? <FolderOpen size={16} className="text-blue-500 shrink-0" /> : <Folder size={16} className="text-gray-500 shrink-0" />) : (<FileText size={16} className={`${activeFileId === node.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'} shrink-0`} />)}
            <span className="truncate select-none">{node.name}</span>
          </div>
          {isAdmin && !movingNode && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2 bg-gray-200 dark:bg-zinc-800 pl-2 rounded">
              {node.type === 'folder' && (
                <><button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'file'); }} className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-green-600 dark:text-green-400"><FilePlus size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'folder'); }} className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-blue-600 dark:text-blue-400"><FolderPlus size={14} /></button></>
              )}
              <button onClick={(e) => { e.stopPropagation(); handleRenameNode(node.id, node.name); }} className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-gray-600 dark:text-gray-400"><Edit size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); setMovingNode(node); }} className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-purple-600 dark:text-purple-400"><MoveRight size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id, node.name); }} className="p-1 hover:bg-white dark:hover:bg-zinc-700 rounded text-red-500 dark:text-red-400"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
        {node.type === 'folder' && node.isExpanded && node.children && (<div>{renderTree(node.children, level + 1)}</div>)}
      </div>
    ));
  };

  return (
    <div className="flex h-screen bg-white dark:bg-zinc-950 text-black dark:text-zinc-100 transition-colors">
      
      {/* === 左侧目录树区域 === */}
      <div className="w-72 bg-gray-50 dark:bg-zinc-900 border-r border-gray-200 dark:border-zinc-800 p-4 flex flex-col select-none transition-colors">
        <h1 className="text-lg font-bold mb-6 text-gray-800 dark:text-gray-100 tracking-wide">⚙️ PZP 知识库</h1>
        {movingNode && (
          <div className="bg-yellow-100 dark:bg-yellow-900/30 border-l-4 border-yellow-500 p-3 mb-4 text-xs rounded shadow-sm">
            <p className="text-gray-700 dark:text-gray-300 mb-2">正在移动: <strong className="text-black dark:text-white">{movingNode.name}</strong></p>
            <div className="flex gap-2">
              <button onClick={moveToRoot} className="bg-white dark:bg-zinc-800 border border-gray-300 dark:border-zinc-600 px-2 py-1 rounded flex-1 dark:text-white">移至最外层</button>
              <button onClick={() => setMovingNode(null)} className="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 px-2 py-1 rounded">取消</button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto pr-2">{isLoading ? <p className="text-gray-400 text-sm">加载中...</p> : renderTree(directories)}</div>
        {isAdmin && !movingNode && (<button onClick={() => handleAddNode('root', 'folder')} className="mt-4 flex flex-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"><PlusCircle size={18} /><span>添加根目录</span></button>)}
      </div>

      {/* === 右侧主内容区域 === */}
      <div className="flex-1 flex flex-col">
        {/* 顶部导航栏 */}
        <div className="h-16 border-b border-gray-200 dark:border-zinc-800 flex items-center justify-between px-6 bg-white dark:bg-zinc-900 shrink-0 transition-colors">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
            <input type="text" placeholder="搜索芯片..." className="pl-10 pr-4 py-2 border dark:border-zinc-700 rounded-md text-sm bg-transparent focus:outline-none focus:border-blue-500" />
          </div>
          
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500 dark:text-gray-400 hidden sm:block">当前：<span className={isAdmin ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-green-600 dark:text-green-400 font-bold'}>{isAdmin ? '管理员' : '游客'}</span></span>
            
            {/* 新增：暗黑模式切换按钮 */}
            <button onClick={toggleTheme} className="flex gap-2 text-sm bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-3 py-2 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700 transition" title="切换显示模式">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
              <span className="hidden md:inline">{theme === 'dark' ? '浅色' : '暗色'}</span>
            </button>
            
            {/* 退出登录按钮 */}
            <button onClick={handleLogout} className="flex gap-2 text-sm bg-gray-100 dark:bg-zinc-800 text-gray-700 dark:text-gray-300 px-4 py-2 rounded-md hover:bg-gray-200 dark:hover:bg-zinc-700 transition"><LogOut size={16} />退出</button>
          </div>
        </div>

        {/* 文章阅读/编辑区 */}
        <div className="flex-1 p-8 overflow-y-auto bg-white dark:bg-zinc-950 transition-colors">
          {!activeFileId ? (<div className="flex h-full items-center justify-center text-gray-400 dark:text-gray-600">👈 请在左侧选择文章</div>) : (
            <>
              <div className="flex justify-between items-start mb-6 border-b dark:border-zinc-800 pb-4">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{activeTitle}</h2>
                  {isUploading && <span className="text-sm text-blue-500 mt-2 block animate-pulse">图片拼命上传中，请稍候...</span>}
                </div>
                {isAdmin && (<button onClick={() => isEditing ? handleSave() : setIsEditing(true)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${isEditing ? 'bg-green-600 text-white dark:bg-green-700' : 'bg-gray-100 text-gray-800 dark:bg-zinc-800 dark:text-gray-200'}`}>{isEditing ? <><Save size={16} /> 保存</> : <><Edit2 size={16} /> 编辑</>}</button>)}
              </div>
              {isEditing ? (
                // 给编辑器传递 color-mode 以便自动适应暗色
                <div data-color-mode={theme} className="h-[calc(100vh-200px)]" onPaste={handlePaste} onDrop={handleDrop}>
                  <MDEditor value={markdownContent || ' '} onChange={setMarkdownContent} height="100%" />
                </div>
              ) : (
                // 重点：增加 dark:prose-invert 让阅读模式的字体变为白色系
                <div className="prose prose-blue dark:prose-invert max-w-none pb-20">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent || ' '}</ReactMarkdown>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
