'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
// 引入了新图标 Edit 和 MoveRight
import { Folder, FolderOpen, FileText, Search, PlusCircle, LogOut, Edit2, Save, Trash2, FilePlus, FolderPlus, Edit, MoveRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import nextDynamic from 'next/dynamic'; 
// 引入新加的后台函数
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

  // === 新增：正在移动的节点状态 ===
  const [movingNode, setMovingNode] = useState(null);

  useEffect(() => {
    const savedRole = localStorage.getItem('pzp_wiki_role');
    if (savedRole) setUserRole(savedRole);
    else setIsLoading(false);
  }, []);

  useEffect(() => {
    if (userRole) {
      loadTreeData();
    }
  }, [userRole]);

  // 把拉取树状目录单独抽成一个函数，方便移动后刷新
  const loadTreeData = async () => {
    setIsLoading(true);
    const res = await getDirectories();
    if (res.success) {
      setDirectories(buildTree(res.data, null));
    }
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
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-10 rounded-xl shadow-lg w-[400px]">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-800 tracking-wider">⚙️ PZP</h1>
            <p className="text-gray-500 mt-2">个人硬件知识库</p>
          </div>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <input type="text" placeholder="用户名" className="border border-gray-300 p-3 rounded-md" value={loginUser} onChange={e => setLoginUser(e.target.value)} required />
            <input type="password" placeholder="密码" className="border border-gray-300 p-3 rounded-md" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md shadow-md mt-2">进入知识库</button>
          </form>
        </div>
      </div>
    );
  }

  // === 点击左侧菜单项时的综合处理 ===
  const handleItemClick = async (node) => {
    // 1. 如果当前处于“移动模式”
    if (movingNode) {
      if (node.id === movingNode.id) return; // 不能移动到自己身上
      if (node.type !== 'folder') return alert('只能移动到文件夹里面哦！');
      
      await moveNode(movingNode.id, node.id); // 后端移动
      await loadTreeData(); // 刷新树
      setMovingNode(null); // 结束移动模式
      return;
    }

    // 2. 正常的展开/打开文件逻辑
    if (node.type === 'folder') {
      const toggleNode = (items) => items.map(item => {
        if (item.id === node.id) return { ...item, isExpanded: !item.isExpanded };
        if (item.children) return { ...item, children: toggleNode(item.children) };
        return item;
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
    await loadTreeData(); // 直接从后台刷新更稳妥
  };

  const handleDeleteNode = async (id, nodeName) => {
    if (!isAdmin) return;
    if (!confirm(`确定要删除 "${nodeName}" 吗？`)) return;
    await deleteNode(id);
    await loadTreeData();
    if (activeFileId === id) setActiveFileId(null);
  };

  // === 新增：重命名逻辑 ===
  const handleRenameNode = async (id, oldName) => {
    if (!isAdmin) return;
    const newName = prompt('请输入新名称:', oldName);
    if (!newName || newName === oldName) return;
    
    await renameNode(id, newName);
    await loadTreeData(); // 从后台刷新
    if (activeFileId === id) setActiveTitle(newName);
  };

  // === 新增：移动到根目录 ===
  const moveToRoot = async () => {
    await moveNode(movingNode.id, null);
    await loadTreeData();
    setMovingNode(null);
  };

  const handleSave = async () => {
    await updateDocument(activeFileId, markdownContent);
    alert("云端保存成功！"); setIsEditing(false);
  };

  const renderTree = (nodes, level = 0) => {
    return nodes.map((node) => (
      <div key={node.id} style={{ paddingLeft: `${level * 16}px` }} className="mt-1">
        <div className={`flex items-center justify-between px-2 py-1.5 hover:bg-gray-200 rounded cursor-pointer text-sm group ${activeFileId === node.id ? 'bg-blue-100 text-blue-800' : 'text-gray-700'} ${movingNode?.id === node.id ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => handleItemClick(node)}>
            {node.type === 'folder' ? (node.isExpanded ? <FolderOpen size={16} className="text-blue-500 shrink-0" /> : <Folder size={16} className="text-gray-500 shrink-0" />) : (<FileText size={16} className={`${activeFileId === node.id ? 'text-blue-600' : 'text-gray-400'} shrink-0`} />)}
            <span className="truncate select-none">{node.name}</span>
          </div>
          
          {/* 修改后的右侧工具栏 */}
          {isAdmin && !movingNode && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2 bg-gray-200 pl-2 rounded">
              {node.type === 'folder' && (
                <><button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'file'); }} className="p-1 hover:bg-white rounded text-green-600" title="添加文章"><FilePlus size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'folder'); }} className="p-1 hover:bg-white rounded text-blue-600" title="添加文件夹"><FolderPlus size={14} /></button></>
              )}
              <button onClick={(e) => { e.stopPropagation(); handleRenameNode(node.id, node.name); }} className="p-1 hover:bg-white rounded text-gray-600" title="重命名"><Edit size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); setMovingNode(node); }} className="p-1 hover:bg-white rounded text-purple-600" title="移动到..."><MoveRight size={14} /></button>
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
      <div className="w-72 bg-gray-50 border-r border-gray-200 p-4 flex flex-col select-none">
        <h1 className="text-lg font-bold mb-6 text-gray-800 tracking-wide">⚙️ PZP 知识库</h1>
        
        {/* 新增：移动状态提示横幅 */}
        {movingNode && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 mb-4 text-xs rounded shadow-sm">
            <p className="text-gray-700 mb-2">正在移动: <strong className="text-black">{movingNode.name}</strong></p>
            <p className="text-gray-500 mb-3">👉 请在下方点击目标文件夹</p>
            <div className="flex gap-2">
              <button onClick={moveToRoot} className="bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 flex-1">移至最外层</button>
              <button onClick={() => setMovingNode(null)} className="bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100">取消</button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto pr-2">
           {isLoading ? <p className="text-gray-400 text-sm">加载中...</p> : renderTree(directories)}
        </div>
        
        {isAdmin && !movingNode && (<button onClick={() => handleAddNode('root', 'folder')} className="mt-4 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"><PlusCircle size={18} /><span>添加根目录</span></button>)}
      </div>

      <div className="flex-1 flex flex-col">
        {/* 顶部导航保持不变 */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="搜索芯片..." className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-72 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              当前身份：<span className={isAdmin ? 'text-blue-600 font-bold' : 'text-green-600 font-bold'}>{isAdmin ? '系统管理员' : '游客'}</span>
            </span>
            <button onClick={handleLogout} className="flex items-center gap-2 text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 transition">
              <LogOut size={16} /><span>退出</span>
            </button>
          </div>
        </div>

        {/* 右侧编辑器区域保持不变 */}
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
