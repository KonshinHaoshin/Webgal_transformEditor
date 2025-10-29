import { useState } from 'react';

interface WebGALModeProps {
    onFolderSelect: (folderPath: string | null) => void;
    onFileSelect: (type: 'figure' | 'background', filename: string) => void;
    selectedFolder: string | null;
    availableFigures: string[];
    availableBackgrounds: string[];
}

export default function WebGALMode({ 
    onFolderSelect, 
    onFileSelect, 
    selectedFolder, 
    availableFigures, 
    availableBackgrounds 
}: WebGALModeProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [figureSearch, setFigureSearch] = useState("");
    const [backgroundSearch, setBackgroundSearch] = useState("");

    // 过滤文件
    const filteredFigures = availableFigures.filter(file => 
        file.toLowerCase().includes(figureSearch.toLowerCase())
    );
    const filteredBackgrounds = availableBackgrounds.filter(file => 
        file.toLowerCase().includes(backgroundSearch.toLowerCase())
    );

    const handleCheckboxChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const isChecked = e.target.checked;
        
        if (isChecked) {
            // 勾选：打开文件夹选择对话框
            try {
                const dialog = await import('@tauri-apps/plugin-dialog');
                const result = await dialog.open({
                    directory: true,
                    title: "选择WebGAL游戏文件夹",
                    defaultPath: ""
                });
                
                if (result && typeof result === 'string') {
                    onFolderSelect(result);
                } else {
                    // 用户取消了选择，将勾选框重置为未选中状态
                    e.target.checked = false;
                }
            } catch (error) {
                console.error('选择文件夹失败:', error);
                alert('选择文件夹失败: ' + error);
                e.target.checked = false;
            }
        } else {
            // 取消勾选：清除选择
            onFolderSelect(null);
        }
    };

    return (
        <div style={{
            margin: '10px 0',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '5px',
            backgroundColor: '#f9f9f9'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <label>
                    <input 
                        type="checkbox" 
                        checked={!!selectedFolder}
                        onChange={handleCheckboxChange}
                    />
                    WebGAL模式
                </label>
                
                {selectedFolder && (
                    <button 
                        onClick={() => setIsExpanded(!isExpanded)}
                        style={{
                            padding: '4px 12px',
                            fontSize: '14px',
                            border: '1px solid #ccc',
                            borderRadius: '3px',
                            backgroundColor: '#fff',
                            color: '#333',
                            cursor: 'pointer'
                        }}
                    >
                        {isExpanded ? '收起' : '展开'}
                    </button>
                )}
            </div>

            {selectedFolder && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                    已选择文件夹: {selectedFolder}
                </div>
            )}

            {isExpanded && selectedFolder && (
                <div style={{ marginTop: '10px' }}>
                    <div style={{ marginBottom: '10px' }}>
                        <strong>立绘文件:</strong>
                        {/* 搜索框 */}
                        <input
                            type="text"
                            placeholder="搜索立绘文件..."
                            value={figureSearch}
                            onChange={(e) => setFigureSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '4px 8px',
                                marginBottom: '8px',
                                border: '1px solid #ddd',
                                borderRadius: '3px',
                                fontSize: '12px'
                            }}
                        />
                        <div style={{ 
                            maxHeight: '150px', 
                            overflowY: 'auto', 
                            border: '1px solid #ddd', 
                            padding: '8px',
                            backgroundColor: '#fff',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '4px'
                        }}>
                            {filteredFigures.length > 0 ? (
                                filteredFigures.map((file, index) => (
                                    <div 
                                        key={index}
                                        onClick={() => onFileSelect('figure', file)}
                                        style={{
                                            padding: '4px 8px',
                                            cursor: 'pointer',
                                            border: '1px solid #eee',
                                            borderRadius: '3px',
                                            fontSize: '11px',
                                            backgroundColor: '#f9f9f9',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                                    >
                                        {file}
                                    </div>
                                ))
                            ) : (
                                <div style={{ color: '#999', gridColumn: 'span 2', textAlign: 'center' }}>
                                    {figureSearch ? '未找到匹配的立绘文件' : '未找到立绘文件'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div>
                        <strong>背景文件:</strong>
                        {/* 搜索框 */}
                        <input
                            type="text"
                            placeholder="搜索背景文件..."
                            value={backgroundSearch}
                            onChange={(e) => setBackgroundSearch(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '4px 8px',
                                marginBottom: '8px',
                                border: '1px solid #ddd',
                                borderRadius: '3px',
                                fontSize: '12px'
                            }}
                        />
                        <div style={{ 
                            maxHeight: '150px', 
                            overflowY: 'auto', 
                            border: '1px solid #ddd', 
                            padding: '8px',
                            backgroundColor: '#fff',
                            display: 'grid',
                            gridTemplateColumns: '1fr 1fr',
                            gap: '4px'
                        }}>
                            {filteredBackgrounds.length > 0 ? (
                                filteredBackgrounds.map((file, index) => (
                                    <div 
                                        key={index}
                                        onClick={() => onFileSelect('background', file)}
                                        style={{
                                            padding: '4px 8px',
                                            cursor: 'pointer',
                                            border: '1px solid #eee',
                                            borderRadius: '3px',
                                            fontSize: '11px',
                                            backgroundColor: '#f9f9f9',
                                            transition: 'background-color 0.2s'
                                        }}
                                        onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f0f0f0'}
                                        onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                                    >
                                        {file}
                                    </div>
                                ))
                            ) : (
                                <div style={{ color: '#999', gridColumn: 'span 2', textAlign: 'center' }}>
                                    {backgroundSearch ? '未找到匹配的背景文件' : '未找到背景文件'}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
