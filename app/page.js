'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { Folder, FolderOpen, FileText, Search, PlusCircle, LogOut, Edit2, Save, Trash2, FilePlus, FolderPlus, Edit, MoveRight } from 'lucide-react';
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
  
  // 新增：图片上传中的状态，用来给用户提示
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const savedRole = localStorage.getItem('pzp_wiki_role');
    if (savedRole) setUserRole(savedRole);
    else setIsLoading(false);
  }, []);

  useEffect(() => {
    if (userRole) loadTreeData();
  }, [userRole]);

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
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <div className="bg-white p-10 rounded-xl shadow-lg w-[400px]">
          <div className="text-center mb-8"><h1 className="text-3xl font-bold text-gray-800">⚙️ PZP</h1><p className="text-gray-500 mt-2">个人硬件知识库</p></div>
          <form onSubmit={handleLogin} className="flex flex-col gap-5">
            <input type="text" placeholder="用户名" className="border p-3 rounded-md" value={loginUser} onChange={e => setLoginUser(e.target.value)} required />
            <input type="password" placeholder="密码" className="border p-3 rounded-md" value={loginPass} onChange={e => setLoginPass(e.target.value)} required />
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md">进入知识库</button>
          </form>
        </div>
      </div>
    );
  }

  // === 新增核心逻辑：上传图片并插入 Markdown ===
  const uploadImage = async (file) => {
    setIsUploading(true);
    try {
      // 调用我们刚才写的 /api/upload 接口
      const response = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        body: file,
      });
      const data = await response.json();
      if (data.url) {
        // 拿到 Vercel Blob 返回的永久图片链接，拼成 Markdown 格式
        const imageMarkdown = `\n![${file.name}](${data.url})\n`;
        // 追加到当前文章的末尾 (其实 react-md-editor 默认不支持光标处插入，我们追加到末尾最简单稳定)
        setMarkdownContent(prev => prev + imageMarkdown);
      }
    } catch (error) {
      alert("图片上传失败：" + error.message);
    }
    setIsUploading(false);
  };

  // 拦截粘贴事件
  const handlePaste = async (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        event.preventDefault(); // 阻止默认粘贴
        const file = items[i].getAsFile();
        if (file) await uploadImage(file);
      }
    }
  };

  // 拦截拖拽事件
  const handleDrop = async (event) => {
    const files = event.dataTransfer?.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.indexOf('image') !== -1) {
        event.preventDefault(); // 阻止浏览器直接打开图片
        await uploadImage(files[i]);
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
        <div className={`flex items-center justify-between px-2 py-1.5 hover:bg-gray-200 rounded cursor-pointer text-sm group ${activeFileId === node.id ? 'bg-blue-100 text-blue-800' : 'text-gray-700'} ${movingNode?.id === node.id ? 'opacity-50' : ''}`}>
          <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => handleItemClick(node)}>
            {node.type === 'folder' ? (node.isExpanded ? <FolderOpen size={16} className="text-blue-500 shrink-0" /> : <Folder size={16} className="text-gray-500 shrink-0" />) : (<FileText size={16} className={`${activeFileId === node.id ? 'text-blue-600' : 'text-gray-400'} shrink-0`} />)}
            <span className="truncate select-none">{node.name}</span>
          </div>
          {isAdmin && !movingNode && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2 bg-gray-200 pl-2 rounded">
              {node.type === 'folder' && (
                <><button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'file'); }} className="p-1 hover:bg-white rounded text-green-600"><FilePlus size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'folder'); }} className="p-1 hover:bg-white rounded text-blue-600"><FolderPlus size={14} /></button></>
              )}
              <button onClick={(e) => { e.stopPropagation(); handleRenameNode(node.id, node.name); }} className="p-1 hover:bg-white rounded text-gray-600"><Edit size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); setMovingNode(node); }} className="p-1 hover:bg-white rounded text-purple-600"><MoveRight size={14} /></button>
              <button onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id, node.name); }} className="p-1 hover:bg-white rounded text-red-500"><Trash2 size={14} /></button>
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
        {movingNode && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 p-3 mb-4 text-xs rounded shadow-sm">
            <p className="text-gray-700 mb-2">正在移动: <strong className="text-black">{movingNode.name}</strong></p>
            <div className="flex gap-2">
              <button onClick={moveToRoot} className="bg-white border border-gray-300 px-2 py-1 rounded hover:bg-gray-100 flex-1">移至最外层</button>
              <button onClick={() => setMovingNode(null)} className="bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded">取消</button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto pr-2">{isLoading ? <p className="text-gray-400 text-sm">加载中...</p> : renderTree(directories)}</div>
        {isAdmin && !movingNode && (<button onClick={() => handleAddNode('root', 'folder')} className="mt-4 flex flex-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"><PlusCircle size={18} /><span>添加根目录</span></button>)}
      </div>

      <div className="flex-1 flex flex-col">
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="搜索..." className="pl-10 pr-4 py-2 border rounded-md text-sm" />
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">当前：<span className={isAdmin ? 'text-blue-600 font-bold' : 'text-green-600 font-bold'}>{isAdmin ? '管理员' : '游客'}</span></span>
            <button onClick={handleLogout} className="flex gap-2 text-sm bg-gray-100 text-gray-700 px-4 py-2 rounded-md"><LogOut size={16} />退出</button>
          </div>
        </div>

        <div className="flex-1 p-8 overflow-y-auto bg-white">
          {!activeFileId ? (<div className="flex h-full items-center justify-center text-gray-400">👈 请在左侧选择文章</div>) : (
            <>
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">{activeTitle}</h2>
                  {/* 显示图片上传进度 */}
                  {isUploading && <span className="text-sm text-blue-500 mt-2 block animate-pulse">图片拼命上传中，请稍候...</span>}
                </div>
                {isAdmin && (<button onClick={() => isEditing ? handleSave() : setIsEditing(true)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm transition ${isEditing ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-800'}`}>{isEditing ? <><Save size={16} /> 保存</> : <><Edit2 size={16} /> 编辑</>}</button>)}
              </div>
              {isEditing ? (
                <div data-color-mode="light" className="h-[calc(100vh-200px)]" onPaste={handlePaste} onDrop={handleDrop}>
                  <MDEditor value={markdownContent} onChange={setMarkdownContent} height="100%" />
                </div>
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
