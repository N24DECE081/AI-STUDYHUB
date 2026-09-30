import React, { useState } from 'react';
import { generateMindmap } from '../../api';
import './roadmap-mindmap.css';

export default function RoadmapMindmap({ topic, context }) {
  const [mindmap, setMindmap] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await generateMindmap(topic, context);
      setMindmap(data);
    } catch (err) {
      setError(err.message || 'Lỗi tạo mindmap');
    } finally {
      setLoading(false);
    }
  };

  const renderNode = (node) => {
    if (!node) return null;
    return (
      <div className="mindmap-node" key={node.id}>
        <div className="mindmap-node-label">{node.label}</div>
        {node.children && node.children.length > 0 && (
          <div className="mindmap-children">
            {node.children.map(child => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  if (!mindmap && !loading && !error) {
    return (
      <div className="roadmap-mindmap-launcher">
        <button className="button is-primary" onClick={handleGenerate}>
          Tạo Sơ đồ tư duy (Mindmap)
        </button>
      </div>
    );
  }

  return (
    <div className="roadmap-mindmap-container">
      {loading && <div className="mindmap-loading">Đang phân tích tài liệu và tạo mindmap...</div>}
      {error && <div className="mindmap-error">{error}</div>}
      {mindmap && mindmap.root && (
        <div className="mindmap-wrapper">
          <h4 className="mindmap-title">{mindmap.title || 'Sơ đồ tư duy'}</h4>
          <div className="mindmap-tree">
            {renderNode(mindmap.root)}
          </div>
        </div>
      )}
    </div>
  );
}
