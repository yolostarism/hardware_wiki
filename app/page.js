'use client';
export const dynamic = 'force-dynamic';
import { useState, useEffect } from 'react';
import { Folder, FolderOpen, FileText, Search, PlusCircle, LogOut, Edit2, Save, Trash2, FilePlus, FolderPlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';
import { getDirectories, getDocument, addNode, deleteNode, updateDocument } from './actions';

const MDEditor = dynamic(() => import('@uiw/react-md-editor'), { ssr: false });
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function Home() {
  // === 登录拦截状态 ===
  const [userRole, setUserRole] = useState(null); // 'admin', 'guest', 或 null(未登录)
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  
  // 以前的状态
  const [activeFileId, setActiveFileId] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [directories, setDirectories] = useState([]);
  const [markdownContent, setMarkdownContent] = useState("");
  const [activeTitle, setActiveTitle] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  // 1. 网页刚打开时，检查之前是否登录过
  useEffect(() => {
    const savedRole = localStorage.getItem('pzp_wiki_role');
    if (savedRole) {
      setUserRole(savedRole);
    } else {
      setIsLoading(false); // 如果没登录，直接取消加载状态，显示登录框
    }
  }, []);

  // 2. 只有在确认登录后，才去云端拉取你的私密目录
  useEffect(() => {
    if (userRole) {
      setIsLoading(true);
      async function loadData() {
        const res = await getDirectories();
        if (res.success) {
          const tree = buildTree(res.data, null);
          setDirectories(tree);
        }
        setIsLoading(false);
      }
      loadData();
    }
  }, [userRole]);

  const buildTree = (nodes, parentId) => {
    return nodes.filter(node => node.parent_id === parentId).map(node => ({
      ...node, isExpanded: true, children: buildTree(nodes, node.id)
    }));
  };

  // === 真实的登录验证逻辑 ===
  const handleLogin = (e) => {
    e.preventDefault(); // 阻止表单默认提交刷新
    if (loginUser === 'pzpadmin' && loginPass === 'p986960440105++') {
      setUserRole('admin');
      localStorage.setItem('pzp_wiki_role', 'admin');
    } else if (loginUser === 'guest' && loginPass === '123456') {
      setUserRole('guest');
      localStorage.setItem('pzp_wiki_role', 'guest');
    } else {
      alert('账号或密码错误！请检查后重试。');
    }
  };

  // 退出登录
  const handleLogout = () => {
    setUserRole(null);
    localStorage.removeItem('pzp_wiki_role');
    setDirectories([]); // 清空屏幕上的私密数据
    setActiveFileId(null);
  };

  // 一键判断当前是不是管理员
  const isAdmin = userRole === 'admin';

  // --- 如果没登录，就渲染这个占据全屏的“登录大门” ---
  if (!userRole) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-10 rounded-xl shadow-lg w-[400px]">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 tracking-wider">⚙️ PZP</h1>
            <p className="text-gray-500 mt-2">个人硬件知识库</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <input 
              type="text" placeholder="用户名" 
              className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={loginUser} onChange={e => setLoginUser(e.target.value)} required
            />
            <input 
              type="password" placeholder="密码" 
              className="border border-gray-300 p-3 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value={loginPass} onChange={e => setLoginPass(e.target.value)} required
            />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md transition shadow-md mt-2">
              进入知识库
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 下面是登录成功后的核心系统代码 (无需修改) ---
  const handleItemClick = async (node) => {
    if (node.type === 'folder') {
      const toggleNode = (items) => items.map(item => {
        if (item.id === node.id) return { ...item, isExpanded: !item.isExpanded };
        if (item.children) return { ...item, children: toggleNode(item.children) };
        return item;
      });
      setDirectories(toggleNode(directories));
    } else {
      setActiveFileId(node.id);
      setActiveTitle(node.name);
      setIsEditing(false);
      setMarkdownContent("加载云端数据中...");
      const res = await getDocument(node.id);
      if (res.success) setMarkdownContent(res.content);
    }
  };

  const handleAddNode = async (parentId, type) => {
    if (!isAdmin) return alert("请先登录管理员账号！");
    const name = prompt(`请输入新${type === 'folder' ? '目录' : '文章'}的名称:`);
    if (!name) return;
    const newId = generateId();
    await addNode(newId, name, type, parentId === 'root' ? null : parentId);
    const newNode = { id: newId, name, type, parent_id: parentId === 'root' ? null : parentId, children: type === 'folder' ? [] : undefined, isExpanded: true };
    if (parentId === 'root') setDirectories([...directories, newNode]);
    else {
      const addNodeToParent = (items) => items.map(item => {
        if (item.id === parentId) return { ...item, isExpanded: true, children: [...(item.children || []), newNode] };
        if (item.children) return { ...item, children: addNodeToParent(item.children) };
        return item;
      });
      setDirectories(addNodeToParent(directories));
    }
  };

  const handleDeleteNode = async (id, nodeName) => {
    if (!isAdmin) return alert("请先登录管理员账号！");
    if (!confirm(`确定要删除 "${nodeName}" 吗？`)) return;
    await deleteNode(id);
    const removeNode = (items) => items.filter(item => item.id !== id).map(item => {
      if (item.children) return { ...item, children: removeNode(item.children) };
      return item;
    });
    setDirectories(removeNode(directories));
    if (activeFileId === id) setActiveFileId(null);
  };

  const handleSave = async () => {
    await updateDocument(activeFileId, markdownContent);
    alert("云端保存成功！");
    setIsEditing(false);
  };

  const renderTree = (nodes, level = 0) => {
    return nodes.map((node) => (
      <div key={node.id} style={{ paddingLeft: `${level * 16}px` }} className="mt-1">
        <div className={`flex items-center justify-between px-2 py-1.5 hover:bg-gray-200 rounded cursor-pointer text-sm group ${activeFileId === node.id ? 'bg-blue-100 text-blue-800' : 'text-gray-700'}`}>
          <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => handleItemClick(node)}>
            {node.type === 'folder' ? (node.isExpanded ? <FolderOpen size={16} className="text-blue-500 shrink-0" /> : <Folder size={16} className="text-gray-500 shrink-0" />) : (<FileText size={16} className={`${activeFileId === node.id ? 'text-blue-600' : 'text-gray-400'} shrink-0`} />)}
            <span className="truncate select-none">{node.name}</span>
          </div>
          {isAdmin && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2">
              {node.type === 'folder' && (
                <><button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'file'); }} className="p-1 hover:bg-white rounded text-green-600" title="添加文章"><FilePlus size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'folder'); }} className="p-1 hover:bg-white rounded text-blue-600" title="添加文件夹"><FolderPlus size={14} /></button></>
              )}
              <button onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id, node.name); }} className="p-1 hover:bg-white rounded text-red-500" title="删除"><Trash2 size={14} /></button>
            </div>
          )}
        </div>
        {node.type === 'folder' && node.isExpanded && node.children && (<div>{renderTree(node.children, level + 1)}</div>)}
      </div>
    ));
  };

  return (
    <div className="flex h-screen bg-white text-black">
      <div className="w-64 bg-gray-50 border-r border-gray-200 p-4 flex flex-col select-none">
        <h1 className="text-lg font-bold mb-6 text-gray-800 tracking-wide">⚙️ PZP 知识库</h1>
        <div className="flex-1 overflow-y-auto pr-2">
           {isLoading ? <p className="text-gray-400 text-sm">加载中...</p> : renderTree(directories)}
        </div>
        {isAdmin && (<button onClick={() => handleAddNode('root', 'folder')} className="mt-4 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"><PlusCircle size={18} /><span>添加根目录</span></button>)}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="搜索芯片..." className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-72 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          
          {/* 右上角的状态显示和退出按钮 */}
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              当前身份：<span className={isAdmin ? 'text-blue-600 font-bold' : 'text-green-600 font-bold'}>{isAdmin ? '系统管理员' : '游客'}</span>
            </span>
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition">
              <LogOut size={16} /><span>退出</span>
            </button>
          </div>
        </div>

        <div className="flex-1 p-8 overflow-y-auto bg-white">
          {!activeFileId ? (<div className="flex h-full items-center justify-center text-gray-400">👈 请在左侧选择一篇文章进行阅读{isAdmin ? '或编辑' : ''}</div>) : (
            <>
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <div><h2 className="text-3xl font-bold text-gray-900">{activeTitle}</h2></div>
                {isAdmin && (<button onClick={() => isEditing ? handleSave() : setIsEditing(true)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'}`}>{isEditing ? <><Save size={16} /> 保存修改</> : <><Edit2 size={16} /> 编辑模式</>}</button>)}
              </div>
              {isEditing ? (
                <div data-color-mode="light" className="h-[calc(100vh-200px)]"><MDEditor value={markdownContent} onChange={setMarkdownContent} height="100%" /></div>
              ) : (
                <div className="prose prose-blue max-w-none pb-20"><ReactMarkdown remarkPlugins={[remarkGfm]}>{markdownContent}</ReactMarkdown></div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
