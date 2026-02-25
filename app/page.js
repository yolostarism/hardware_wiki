'use client';
import { useState } from 'react';
import { Folder, FolderOpen, FileText, Search, PlusCircle, User, Edit2, Save, Trash2, FilePlus, FolderPlus } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import dynamic from 'next/dynamic';

const MDEditor = dynamic(
  () => import('@uiw/react-md-editor').then((mod) => mod.default),
  { ssr: false }
);

// 生成唯一ID的简单工具
const generateId = () => Math.random().toString(36).substr(2, 9);

export default function Home() {
  // --- 1. 状态管理 ---
  const [isAdmin, setIsAdmin] = useState(false); // 模拟是否登录
  const [activeFileId, setActiveFileId] = useState(null); // 当前正在看的文章ID
  const [isEditing, setIsEditing] = useState(false);
  
  // 核心状态：目录树数据
  const [directories, setDirectories] = useState([
    {
      id: "root-1", name: "微控制器 (MCU)", type: "folder", isExpanded: true,
      children: [{ id: "file-1", name: "I2C 硬件踩坑记录", type: "file", content: "## STM32 I2C 死锁\n这里是初始内容..." }]
    }
  ]);

  // 当前正在阅读/编辑的文章内容
  const [markdownContent, setMarkdownContent] = useState("");
  const [activeTitle, setActiveTitle] = useState("");

  // --- 2. 核心交互函数 ---

  // 模拟登录/登出
  const toggleLogin = () => setIsAdmin(!isAdmin);

  // 点击左侧某一项时触发
  const handleItemClick = (node) => {
    if (node.type === 'folder') {
      // 如果是文件夹，就切换展开/收起状态
      const toggleNode = (items) => items.map(item => {
        if (item.id === node.id) return { ...item, isExpanded: !item.isExpanded };
        if (item.children) return { ...item, children: toggleNode(item.children) };
        return item;
      });
      setDirectories(toggleNode(directories));
    } else {
      // 如果是文件，就在右侧打开它
      setActiveFileId(node.id);
      setActiveTitle(node.name);
      setMarkdownContent(node.content || "");
      setIsEditing(false); // 每次打开新文件都默认进入阅读模式
    }
  };

  // 在指定文件夹下添加新节点（文件或文件夹）
  const handleAddNode = (parentId, type) => {
    if (!isAdmin) return alert("请先登录管理员账号！");
    
    const name = prompt(`请输入新${type === 'folder' ? '目录' : '文章'}的名称:`);
    if (!name) return;

    const newNode = {
      id: generateId(),
      name: name,
      type: type,
      ...(type === 'folder' ? { children: [], isExpanded: true } : { content: "# 新文章\n在此输入内容..." })
    };

    if (parentId === 'root') {
      // 添加在最外层
      setDirectories([...directories, newNode]);
    } else {
      // 递归寻找父节点并添加进去
      const addNodeToParent = (items) => items.map(item => {
        if (item.id === parentId) {
          return { ...item, isExpanded: true, children: [...(item.children || []), newNode] };
        }
        if (item.children) return { ...item, children: addNodeToParent(item.children) };
        return item;
      });
      setDirectories(addNodeToParent(directories));
    }
  };

  // 删除节点
  const handleDeleteNode = (id, nodeName) => {
    if (!isAdmin) return alert("请先登录管理员账号！");
    if (!confirm(`确定要删除 "${nodeName}" 吗？这无法撤销！`)) return;

    const removeNode = (items) => items.filter(item => item.id !== id).map(item => {
      if (item.children) return { ...item, children: removeNode(item.children) };
      return item;
    });
    setDirectories(removeNode(directories));
    
    // 如果删除的是当前正在看的文章，清空右侧
    if (activeFileId === id) {
      setActiveFileId(null);
    }
  };

  // 保存右侧编辑的内容
  const handleSave = () => {
    const updateContent = (items) => items.map(item => {
      if (item.id === activeFileId) return { ...item, content: markdownContent };
      if (item.children) return { ...item, children: updateContent(item.children) };
      return item;
    });
    setDirectories(updateContent(directories));
    setIsEditing(false);
  };

  // --- 3. 渲染目录树结构 ---
  const renderTree = (nodes, level = 0) => {
    return nodes.map((node) => (
      <div key={node.id} style={{ paddingLeft: `${level * 16}px` }} className="mt-1">
        <div 
          className={`flex items-center justify-between px-2 py-1.5 hover:bg-gray-200 rounded cursor-pointer text-sm group ${activeFileId === node.id ? 'bg-blue-100 text-blue-800' : 'text-gray-700'}`}
        >
          {/* 左侧图标和名字 */}
          <div className="flex items-center gap-2 overflow-hidden flex-1" onClick={() => handleItemClick(node)}>
            {node.type === 'folder' ? (
               node.isExpanded ? <FolderOpen size={16} className="text-blue-500 shrink-0" /> : <Folder size={16} className="text-gray-500 shrink-0" />
            ) : (
              <FileText size={16} className={`${activeFileId === node.id ? 'text-blue-600' : 'text-gray-400'} shrink-0`} />
            )}
            <span className="truncate select-none">{node.name}</span>
          </div>

          {/* 右侧悬浮操作按钮 (仅管理员可见) */}
          {isAdmin && (
            <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2">
              {node.type === 'folder' && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'file'); }} className="p-1 hover:bg-white rounded text-green-600" title="新建文章"><FilePlus size={14} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleAddNode(node.id, 'folder'); }} className="p-1 hover:bg-white rounded text-blue-600" title="新建子目录"><FolderPlus size={14} /></button>
                </>
              )}
              <button onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id, node.name); }} className="p-1 hover:bg-white rounded text-red-500" title="删除"><Trash2 size={14} /></button>
            </div>
          )}
        </div>

        {/* 递归渲染子节点 */}
        {node.type === 'folder' && node.isExpanded && node.children && (
          <div>{renderTree(node.children, level + 1)}</div>
        )}
      </div>
    ));
  };

  // --- 4. 页面主体 ---
  return (
    <div className="flex h-screen bg-white text-black">
      
      {/* 左侧侧边栏 */}
      <div className="w-64 bg-gray-50 border-r border-gray-200 p-4 flex flex-col select-none">
        <h1 className="text-lg font-bold mb-6 text-gray-800 tracking-wide">⚙️ PZP 知识库</h1>
        <div className="flex-1 overflow-y-auto pr-2">{renderTree(directories)}</div>
        
        {isAdmin && (
          <button onClick={() => handleAddNode('root', 'folder')} className="mt-4 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition">
            <PlusCircle size={18} /><span>添加根目录</span>
          </button>
        )}
      </div>

      {/* 右侧主体 */}
      <div className="flex-1 flex flex-col">
        {/* 顶部导航 */}
        <div className="h-16 border-b border-gray-200 flex items-center justify-between px-6 bg-white shrink-0">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="text" placeholder="搜索芯片、用法..." className="pl-10 pr-4 py-2 border border-gray-300 rounded-md w-72 text-sm" />
          </div>
          <button 
            onClick={toggleLogin}
            className={`flex items-center gap-2 text-sm px-4 py-2 rounded-md transition ${isAdmin ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
          >
            <User size={16} /><span>{isAdmin ? '退出管理员' : 'pzpadmin 登录 (测试点击)'}</span>
          </button>
        </div>

        {/* 文章内容区 */}
        <div className="flex-1 p-8 overflow-y-auto bg-white">
          {!activeFileId ? (
            <div className="flex h-full items-center justify-center text-gray-400">
              👈 请在左侧选择一篇文章，或创建一个新文章
            </div>
          ) : (
            <>
              <div className="flex justify-between items-start mb-6 border-b pb-4">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">{activeTitle}</h2>
                  <div className="text-gray-500 mt-2 text-sm">正在查看文件 ID: {activeFileId}</div>
                </div>
                
                {isAdmin && (
                  <button 
                    onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                      isEditing ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                    }`}
                  >
                    {isEditing ? <><Save size={16} /> 保存修改</> : <><Edit2 size={16} /> 编辑模式</>}
                  </button>
                )}
              </div>
              
              {isEditing ? (
                <div data-color-mode="light" className="h-[calc(100vh-200px)]">
                   <MDEditor
                      value={markdownContent}
                      onChange={setMarkdownContent}
                      height="100%"
                   />
                </div>
              ) : (
                <div className="prose prose-blue max-w-none pb-20">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {markdownContent}
                  </ReactMarkdown>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
