import React from 'react';
import { TransformData } from '../types/transform';
import './FigureManagerPanel.css';

interface Props {
  transforms: TransformData[];
  selectedIndexes: number[];
  setSelectedIndexes: (indexes: number[]) => void;
}

export default function FigureManagerPanel({
  transforms,
  selectedIndexes,
  setSelectedIndexes,
}: Props) {
  // 提取所有的立绘和背景
  const figures: Array<{ index: number; transform: TransformData; isBg: boolean }> = [];
  
  transforms.forEach((transform, index) => {
    if (transform.type === 'changeFigure' || transform.type === 'changeBg') {
      figures.push({
        index,
        transform,
        isBg: transform.type === 'changeBg' || transform.target === 'bg-main',
      });
    }
  });

  const handleItemClick = (transform: TransformData, originalIndex: number, e: React.MouseEvent) => {
    // 优先选中对应的 setTransform（如果有的话）
    const setTransformIndex = transforms.findIndex(
      (t) => t.type === 'setTransform' && t.target === transform.target
    );
    
    // 如果找到了 setTransform，使用它的索引；否则使用原始索引（changeFigure/changeBg）
    const targetIndex = setTransformIndex !== -1 ? setTransformIndex : originalIndex;
    
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      // 多选模式
      if (selectedIndexes.includes(targetIndex)) {
        setSelectedIndexes(selectedIndexes.filter(i => i !== targetIndex));
      } else {
        setSelectedIndexes([...selectedIndexes, targetIndex]);
      }
    } else {
      // 单选模式
      setSelectedIndexes([targetIndex]);
    }
  };

  const getDisplayName = (transform: TransformData): string => {
    if (transform.type === 'changeBg') {
      return '背景';
    }
    // 从路径中提取文件名
    if (transform.path) {
      const pathParts = transform.path.split('/');
      const fileName = pathParts[pathParts.length - 1];
      // 移除扩展名
      const nameWithoutExt = fileName.replace(/\.(json|jsonl|png|jpg|jpeg|gif|webm|mp4)$/i, '');
      return nameWithoutExt || transform.target;
    }
    return transform.target || '未知立绘';
  };

  const getDisplayPath = (transform: TransformData): string => {
    if (transform.path) {
      return transform.path;
    }
    return '';
  };

  return (
    <div className="figure-manager-panel">
      <div className="figure-manager-header">
        <h3>📋 立绘与背景管理</h3>
        <div className="figure-manager-count">
          {figures.length} 个项目
        </div>
      </div>
      
      <div className="figure-manager-list">
        {figures.length === 0 ? (
          <div className="figure-manager-empty">
            <p>暂无立绘或背景</p>
            <p className="figure-manager-hint">添加立绘或背景后将显示在这里</p>
          </div>
        ) : (
          figures.map(({ index, transform, isBg }) => {
            // 检查是否选中（包括对应的 setTransform）
            const setTransformIndex = transforms.findIndex(
              (t) => t.type === 'setTransform' && t.target === transform.target
            );
            const targetIndex = setTransformIndex !== -1 ? setTransformIndex : index;
            const isSelected = selectedIndexes.includes(targetIndex) || selectedIndexes.includes(index);
            
            return (
              <div
                key={index}
                className={`figure-manager-item ${isSelected ? 'selected' : ''} ${isBg ? 'is-bg' : ''}`}
                onClick={(e) => handleItemClick(transform, index, e)}
              >
                <div className="figure-manager-item-icon">
                  {isBg ? '🖼️' : '👤'}
                </div>
                <div className="figure-manager-item-content">
                  <div className="figure-manager-item-name">
                    {getDisplayName(transform)}
                  </div>
                  <div className="figure-manager-item-path">
                    {getDisplayPath(transform)}
                  </div>
                  <div className="figure-manager-item-target">
                    ID: {transform.target}
                  </div>
                </div>
                {isSelected && (
                  <div className="figure-manager-item-checkmark">✓</div>
                )}
              </div>
            );
          })
        )}
      </div>
      
      <div className="figure-manager-footer">
        <div className="figure-manager-hint">
          💡 提示：点击项目可选中，按住 Shift/Ctrl 可多选
        </div>
      </div>
    </div>
  );
}
