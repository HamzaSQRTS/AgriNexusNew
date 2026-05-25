// frontend/src/app/farmer/page.js
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logout, apiRequest } from '@/lib/api';

// Recharts for visualization
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#10b981', '#3b82f6', '#fbbf24', '#f87171', '#8b5cf6'];

export default function FarmerDashboard() {
  const router = useRouter();
  const [activeView, setActiveView] = useState('view-upload');
  const [pipelineStep, setPipelineStep] = useState(1);
  const [pipelineMessage, setPipelineMessage] = useState('');
  const [user, setUser] = useState(null);
  
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  // 8-Category Report Engine
  const [reportBundle, setReportBundle] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [selectedReportCat, setSelectedReportCat] = useState('weather_microclimate');
  const [farmContext, setFarmContext] = useState({
    latitude: 31.5204,
    longitude: 74.3587,
    crop: 'wheat',
    acreage_hectares: 10,
    growth_stage: 'flowering',
  });
  
  // Chat State
  const [chatMessages, setChatMessages] = useState([
    { id: '1', sender: 'ai', html: 'Hello! I am your AgriNexus AI Advisor. I can analyze soil reports, diagnose plant diseases from images, and recommend precision fertilizer schedules. How can I assist you today?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatHistoryRef = useRef(null);

  useEffect(() => {
    const currentUser = getCurrentUser();
    if (!currentUser) {
      router.push('/login');
      return;
    }
    setUser(currentUser);

    let cancelled = false;
    (async () => {
      try {
        await apiRequest('/auth/me');
      } catch (e) {
        if (!cancelled && e?.status === 401) {
          logout();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (chatHistoryRef.current) {
      chatHistoryRef.current.scrollTop = chatHistoryRef.current.scrollHeight;
    }
  }, [chatMessages, activeView]);

  const uploadsToFileRows = (recent) =>
    (recent || []).map((u, i) => ({
      id: `srv-${u.filename}-${i}`,
      name: u.filename || 'unknown',
      size: 'â€”',
      date: u.timestamp
        ? new Date(u.timestamp).toLocaleDateString()
        : new Date().toLocaleDateString(),
      status: 'Processed',
      report_type: u.report_type || 'â€”',
      confidence: u.confidence ? `${(u.confidence * 100).toFixed(0)}%` : 'â€”',
    }));

  const showToast = (message, isError = false) => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : 'success'}`;
    const icon = isError
      ? '<i class="fa-solid fa-circle-exclamation" style="color: var(--red-500); font-size: 1.25rem;"></i>'
      : '<i class="fa-solid fa-circle-check" style="color: var(--emerald-400); font-size: 1.25rem;"></i>';
    toast.innerHTML = `${icon}<div>${message}</div>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
  };

  const refreshAnalytics = useCallback(async () => {
    try {
      const a = await apiRequest('/farmer/analytics');
      setAnalytics(a);
      if (a.report_engine?.reports) {
        setReportBundle({
          reports: a.report_engine.reports,
          categories_meta: a.category_cards?.map((c) => ({
            id: c.id,
            index: c.index,
            title: c.title,
            icon: c.icon,
            description: '',
          })),
          generated_at: a.report_engine.generated_at,
          farm_context: a.report_engine.farm_context,
        });
        if (a.report_engine.farm_context) {
          setFarmContext((prev) => ({ ...prev, ...a.report_engine.farm_context }));
        }
      }
      if (a.recent_uploads?.length) {
        setFiles(uploadsToFileRows(a.recent_uploads));
      }
      if (a.pipeline_ready) setPipelineStep(3);
    } catch {
      setAnalytics({
        upload_count: 0,
        summary: null,
        charts: null,
        recent_uploads: [],
      });
    }
  }, []);

  const runReportPipeline = useCallback(async () => {
    setReportLoading(true);
    setPipelineStep(2);
    setPipelineMessage('Running 8-category report engineâ€¦');
    setActiveView('view-reports');
    try {
      const chatHints = chatMessages
        .filter((m) => m.sender === 'user')
        .map((m) => m.html.replace(/<[^>]+>/g, ''))
        .slice(-5);
      const result = await apiRequest('/farmer/pipeline/process', {
        method: 'POST',
        body: JSON.stringify({ farm: farmContext, chat_hints: chatHints }),
      });
      setReportBundle(result.report_bundle);
      setAnalytics(result.analytics);
      setPipelineStep(3);
      setPipelineMessage('');
      setActiveView('view-analytics');
      showToast('Pipeline complete â€” dashboard updated with all analytics.');
    } catch (err) {
      showToast(err.message || 'Report pipeline failed', true);
      setPipelineMessage('');
    } finally {
      setReportLoading(false);
    }
  }, [farmContext, chatMessages]);

  useEffect(() => {
    if (!user) return;
    refreshAnalytics();
  }, [user, refreshAnalytics]);


  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsgId = Date.now().toString();
    const newMessages = [...chatMessages, { id: userMsgId, sender: 'user', html: chatInput }];
    setChatMessages(newMessages);
    const sentMsg = chatInput;
    setChatInput('');

    const aiMsgId = (Date.now() + 1).toString();
    setChatMessages([...newMessages, { id: aiMsgId, sender: 'ai', html: '<i class="fa-solid fa-ellipsis fa-bounce"></i>' }]);

    try {
      const response = await apiRequest('/chat/query', {
        method: 'POST',
        body: JSON.stringify({ query: sentMsg })
      });
      
      const replyHtml = `
        <div style="margin-bottom: 8px;"><strong>Analysis:</strong> ${response.diagnosis} <span class="badge badge-green" style="font-size:0.7rem; padding: 2px 6px;">${(response.confidence * 100).toFixed(0)}% Confidence</span></div>
        <div style="margin-bottom: 8px;"><strong>Recommendations:</strong>
          <ul style="margin-left: 20px; margin-top: 4px;">
            ${(response.recommendations || []).map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-muted);">
          <strong>Citations:</strong> ${(response.citations || []).join(', ')}
        </div>
      `;
      setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, html: replyHtml } : m));
    } catch (err) {
      setChatMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, html: `Connection Error: ${err.message}` } : m));
    }
  };

  const handleSuggestion = (text) => setChatInput(text);

  const generateComprehensiveReports = () => runReportPipeline();

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const handleFileInput = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      addFiles(e.target.files);
    }
  };

  const addFiles = async (newFiles) => {
    const arr = Array.from(newFiles);
    if (!arr.length) return;
    setUploadBusy(true);
    setPipelineStep(1);
    setPipelineMessage('Uploading and parsing farm dataâ€¦');
    setActiveView('view-upload');
    let uploaded = 0;
    try {
      for (const f of arr) {
        const fd = new FormData();
        fd.append('file', f);
        try {
          await apiRequest('/upload/file', { method: 'POST', body: fd });
          uploaded += 1;
          showToast(`${f.name} processed successfully.`);
        } catch (err) {
          showToast(err.message || 'Upload failed', true);
        }
      }
      await refreshAnalytics();
      if (uploaded > 0) {
        await runReportPipeline();
      }
    } finally {
      setUploadBusy(false);
      setPipelineMessage('');
    }
  };

  const renderChartSection = (data, type, title, iconClass, color) => {
    // FIX 6 â€” NULL GUARD (UPDATED)
    const hasData = data && data.length > 0 && data.some(d => d.value !== null && d.value > 0);
    if (!hasData) {
      return (
        <div className="chart-card">
          <div className="chart-header">
            <h4 className="chart-title"><i className={iconClass}></i> {title}</h4>
          </div>
          <div className="p-8 text-center text-muted text-sm">Data unavailable for this section</div>
        </div>
      );
    }

    // FIX 5 â€” Y-AXIS DOMAIN (CRITICAL)
    const maxVal = Math.max(...data.map(d => d.value || 0));
    const domain = [0, Math.ceil(maxVal * 1.2) || 10];

    return (
      <div className="chart-card animate-fade-in">
        <div className="chart-header">
          <h4 className="chart-title"><i className={iconClass}></i> {title}</h4>
        </div>
        <div style={{ width: '100%', height: 250 }}>
          <ResponsiveContainer width="100%" height="100%">
            {type === 'bar' ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} domain={domain} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: color }}
                />
                <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            ) : type === 'pie' ? (
              <PieChart>
                <Pie 
                  data={data} 
                  innerRadius={60} 
                  outerRadius={80} 
                  paddingAngle={5} 
                  dataKey="value"
                  animationBegin={0}
                  animationDuration={1000}
                >
                  {data.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} iconType="circle"/>
              </PieChart>
            ) : null}
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  if (!user) return null;
  const initial = user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();

  return (
    <div className="dashboard-layout">
      <div id="toast-container"></div>
      
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo">
            <div className="sidebar-logo-icon" style={{ color: 'var(--teal-400)' }}><i className="fa-solid fa-leaf"></i></div>
            <div className="sidebar-logo-text">AgriNexus<span>.Ai</span></div>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${activeView === 'view-upload' ? 'active' : ''}`} onClick={() => setActiveView('view-upload')}>
            <i className="fa-solid fa-cloud-arrow-up nav-icon"></i> 1. Data Upload
          </button>
          <button className={`nav-item ${activeView === 'view-reports' ? 'active' : ''}`} onClick={() => setActiveView('view-reports')}>
            <i className="fa-solid fa-file-lines nav-icon"></i> 2. Report Engine
          </button>
          <button className={`nav-item ${activeView === 'view-analytics' ? 'active' : ''}`} onClick={() => setActiveView('view-analytics')}>
            <i className="fa-solid fa-chart-pie nav-icon"></i> 3. Farm Analytics
          </button>
          <button className={`nav-item ${activeView === 'view-chat' ? 'active' : ''}`} onClick={() => setActiveView('view-chat')}>
            <i className="fa-solid fa-message nav-icon"></i> AI Advisory
          </button>
          <button className={`nav-item ${activeView === 'view-history' ? 'active' : ''}`} onClick={() => setActiveView('view-history')}>
            <i className="fa-solid fa-clock-rotate-left nav-icon"></i> Query History
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar" style={{ background: 'var(--teal-500)' }}>{initial}</div>
            <div className="user-info">
              <div className="user-name truncate">{user.name || user.email}</div>
              <div className="user-role">Farmer Account</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign Out">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            {activeView === 'view-analytics' && <><i className="fa-solid fa-chart-pie text-emerald-400 mr-2"></i> Farm Analytics</>}
            {activeView === 'view-chat' && <><i className="fa-solid fa-message text-emerald-400 mr-2"></i> AI Advisory</>}
            {activeView === 'view-upload' && <><i className="fa-solid fa-cloud-arrow-up text-emerald-400 mr-2"></i> Data Upload</>}
            {activeView === 'view-reports' && <><i className="fa-solid fa-file-lines text-emerald-400 mr-2"></i> 8-Category Report Engine</>}
            {activeView === 'view-history' && <><i className="fa-solid fa-clock-rotate-left text-emerald-400 mr-2"></i> Query History</>}
          </div>
        </header>

        <div className="content-area">
          <div className="pipeline-stepper">
            <div className={`pipeline-step ${pipelineStep >= 1 ? (pipelineStep === 1 ? 'active' : 'done') : ''}`}>
              <span className="pipeline-step-num">1</span> Upload Data
            </div>
            <div className={`pipeline-connector ${pipelineStep >= 2 ? 'done' : ''}`} />
            <div className={`pipeline-step ${pipelineStep >= 2 ? (pipelineStep === 2 ? 'active' : 'done') : ''}`}>
              <span className="pipeline-step-num">2</span> Report Engine
            </div>
            <div className={`pipeline-connector ${pipelineStep >= 3 ? 'done' : ''}`} />
            <div className={`pipeline-step ${pipelineStep >= 3 ? 'active' : ''}`}>
              <span className="pipeline-step-num">3</span> Analytics Dashboard
            </div>
            {pipelineMessage && (
              <span className="text-sm text-emerald-400 ml-auto"><i className="fa-solid fa-spinner fa-spin mr-2"></i>{pipelineMessage}</span>
            )}
          </div>

          {activeView === 'view-analytics' && (
            <section className="view-section active animate-fade-in">
              {!analytics || !analytics.pipeline_ready ? (
                <div className="empty-state">
                  <i className="fa-solid fa-chart-pie icon text-muted"></i>
                  <h4>Awaiting Farm Data</h4>
                  <p>Start at <strong>Data Upload</strong> — files run through the report engine, then analytics appear here.</p>
                  <button type="button" className="btn btn-primary mt-4" onClick={() => setActiveView('view-upload')}>
                    Go to Data Upload
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <h3 className="text-xl font-bold">Dynamic Farm Intelligence</h3>
                      <p className="text-secondary text-sm">Based on <strong>{analytics.upload_count}</strong> documents. Latest: <span className="badge badge-blue ml-2">{analytics.summary?.latest_report_type?.replace('_', ' ')}</span></p>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowRawJson(!showRawJson)}>
                      <i className={`fa-solid ${showRawJson ? 'fa-chart-column' : 'fa-code'} mr-2`}></i>
                      {showRawJson ? 'Show Visuals' : 'View Raw JSON'}
                    </button>
                  </div>

                  {showRawJson ? (
                    <div className="bg-surface-elevated p-6 rounded-xl border border-muted/20 animate-slide-up">
                      <pre className="text-xs overflow-auto max-h-[600px] text-teal-400 font-mono">
                        {JSON.stringify(analytics, null, 2)}
                      </pre>
                    </div>
                  ) : (
                    <>
                      {/* NEATER AI CONTEXTUAL SUMMARY */}
                      <div className="bg-surface-elevated border border-emerald-500/30 p-6 rounded-2xl mb-8 shadow-lg shadow-emerald-500/5 animate-slide-down">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="bg-emerald-500/20 text-emerald-400 p-2 rounded-lg"><i className="fa-solid fa-wand-magic-sparkles"></i></div>
                          <h4 className="font-bold text-lg text-emerald-400">AI Farm Intelligence</h4>
                        </div>
                        <p className="text-sm leading-relaxed text-secondary whitespace-pre-line border-l-2 border-emerald-500/30 pl-4 py-1">
                          {analytics.summary?.report_engine_overview || analytics.summary?.latest_ai_summary || 'Processing intelligence...'}
                        </p>
                      </div>

                      {analytics.category_cards?.length > 0 && (
                        <div className="category-cards-grid mb-8">
                          {analytics.category_cards.map((card) => (
                            <div key={card.id} className="category-summary-card">
                              <h5><i className={`fa-solid ${card.icon} text-emerald-400`}></i> {card.title}</h5>
                              <p>{card.summary}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="charts-grid">
                        {renderChartSection(analytics.charts?.agriculture_soil, 'bar', 'Soil NPK Profile', 'fa-solid fa-seedling text-emerald-400', '#10b981')}
                        {renderChartSection(analytics.charts?.weather_rainfall, 'bar', '7-Day Rainfall', 'fa-solid fa-cloud-rain text-blue-400', '#3b82f6')}
                        {renderChartSection(analytics.charts?.irrigation_moisture, 'bar', 'Moisture vs Target', 'fa-solid fa-droplet text-cyan-400', '#06b6d4')}
                        {renderChartSection(analytics.charts?.financial_inputs, 'bar', 'Input Costs', 'fa-solid fa-coins text-yellow-400', '#fbbf24')}
                        {renderChartSection(analytics.charts?.yield_forecast, 'bar', 'Yield Forecast', 'fa-solid fa-wheat-awn text-emerald-400', '#10b981')}
                        {renderChartSection(analytics.charts?.crop_health, 'bar', 'Pest Severity', 'fa-solid fa-bug text-red-400', '#f87171')}
                        {analytics.summary?.latest_report_type === 'geotechnical_soil' && (
                          <>
                            {renderChartSection(analytics.charts?.geotechnical_bar, 'bar', 'Physical Analysis', 'fa-solid fa-mountain-sun text-blue-400', '#3b82f6')}
                            {renderChartSection(analytics.charts?.geotechnical_composition, 'pie', 'Grain Size Analysis', 'fa-solid fa-chart-pie text-emerald-400')}
                            {renderChartSection(analytics.charts?.geotechnical_limits, 'bar', 'Atterberg Limits', 'fa-solid fa-vial text-yellow-400', '#fbbf24')}
                          </>
                        )}
                        {analytics.summary?.latest_report_type === 'agriculture_soil' && (
                          renderChartSection(analytics.charts?.agriculture_soil, 'bar', 'Soil Nutrient Profile', 'fa-solid fa-seedling text-emerald-400', '#10b981')
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          {activeView === 'view-chat' && (
            <section className="view-section active animate-fade-in">
              <div className="chat-container">
                <div className="chat-history" ref={chatHistoryRef}>
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`chat-msg ${msg.sender} animate-slide-down`}>
                      <div className="chat-avatar" style={msg.sender === 'user' ? { background: 'var(--bg-surface-elevated)' } : { background: 'rgba(20, 184, 166, 0.1)', color: 'var(--teal-400)' }}>
                        <i className={`fa-solid ${msg.sender === 'ai' ? 'fa-robot' : 'fa-user'}`}></i>
                      </div>
                      <div className="chat-bubble" dangerouslySetInnerHTML={{ __html: msg.html }}></div>
                    </div>
                  ))}
                </div>
                <div className="chat-input-area">
                  <div className="chat-suggestions">
                    <button className="suggestion-chip" onClick={() => handleSuggestion('Diagnose late blight')}>Diagnose late blight</button>
                    <button className="suggestion-chip" onClick={() => handleSuggestion('Analyze my soil NPK')}>Analyze my soil NPK</button>
                  </div>
                  <form className="chat-form" onSubmit={handleChatSubmit}>
                    <textarea className="chat-input" placeholder="Ask about crops, diseases, or soil..." rows="1" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleChatSubmit(e); } }}></textarea>
                    <button type="submit" className="btn btn-primary btn-icon"><i className="fa-solid fa-paper-plane"></i></button>
                  </form>
                </div>
              </div>
            </section>
          )}

          {activeView === 'view-upload' && (
            <section className="view-section active animate-fade-in">
              <div 
                className={`upload-zone ${isDragging ? 'dragover' : ''} ${uploadBusy ? 'opacity-70' : ''}`}
                onClick={() => !uploadBusy && document.getElementById('file-input').click()}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
              >
                <i className="fa-solid fa-cloud-arrow-up upload-icon"></i>
                <h3 className="upload-title">{uploadBusy ? 'Step 1: Processing farm data…' : 'Step 1: Upload Farm Data & Reports'}</h3>
                <p className="upload-subtitle">After upload, reports generate automatically, then the analytics dashboard opens.</p>
                <input type="file" id="file-input" className="hidden" multiple onChange={handleFileInput} disabled={uploadBusy} />
              </div>

              <div className="file-manager">
                <div className="file-manager-header">
                  <h4 className="font-bold text-sm">Uploaded Documents</h4>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFiles([])}>Clear list</button>
                </div>
                <table className="file-table">
                  <thead>
                    <tr>
                      <th>File Name</th>
                      <th>Report Type</th>
                      <th>Confidence</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.length === 0 ? (
                      <tr className="empty-row"><td colSpan="5" className="text-center text-muted">No files in this session.</td></tr>
                    ) : (
                      files.map((file) => (
                        <tr key={file.id}>
                          <td><i className="fa-solid fa-file text-emerald-400 mr-2"></i> {file.name}</td>
                          <td className="capitalize">{file.report_type.replace('_', ' ')}</td>
                          <td><span className="badge badge-green">{file.confidence}</span></td>
                          <td className="text-secondary">{file.date}</td>
                          <td><span className="badge badge-green">Processed</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeView === 'view-reports' && (
            <section className="view-section active animate-fade-in">
              <div className="report-engine-header">
                <div>
                  <h3 className="text-xl font-bold">8-Category Report Generator Engine</h3>
                  <p className="text-secondary text-sm">Comprehensive farm intelligence from GPS, uploads, and AI advisory context.</p>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={generateComprehensiveReports}
                  disabled={reportLoading}
                >
                  <i className={`fa-solid ${reportLoading ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-2`}></i>
                  {reportLoading ? 'Generatingâ€¦' : 'Generate All 8 Reports'}
                </button>
              </div>

              <div className="report-farm-form">
                <label>
                  Latitude (GPS)
                  <input
                    type="number"
                    step="0.0001"
                    value={farmContext.latitude}
                    onChange={(e) => setFarmContext({ ...farmContext, latitude: parseFloat(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  Longitude (GPS)
                  <input
                    type="number"
                    step="0.0001"
                    value={farmContext.longitude}
                    onChange={(e) => setFarmContext({ ...farmContext, longitude: parseFloat(e.target.value) || 0 })}
                  />
                </label>
                <label>
                  Crop
                  <select value={farmContext.crop} onChange={(e) => setFarmContext({ ...farmContext, crop: e.target.value })}>
                    <option value="wheat">Wheat</option>
                    <option value="rice">Rice</option>
                    <option value="corn">Corn</option>
                    <option value="potato">Potato</option>
                    <option value="tomato">Tomato</option>
                  </select>
                </label>
                <label>
                  Acreage (ha)
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={farmContext.acreage_hectares}
                    onChange={(e) => setFarmContext({ ...farmContext, acreage_hectares: parseFloat(e.target.value) || 1 })}
                  />
                </label>
                <label>
                  Growth stage
                  <select value={farmContext.growth_stage} onChange={(e) => setFarmContext({ ...farmContext, growth_stage: e.target.value })}>
                    <option value="germination">Germination</option>
                    <option value="vegetative">Vegetative</option>
                    <option value="flowering">Flowering</option>
                    <option value="maturity">Maturity</option>
                  </select>
                </label>
              </div>

              <div className="report-categories-grid">
                {(reportBundle?.categories_meta || [
                  { id: 'weather_microclimate', index: 1, title: 'Weather & Micro-Climate', icon: 'fa-cloud-sun', description: '7â€“14 day GPS forecasts and alerts.' },
                  { id: 'soil_health_nutrient', index: 2, title: 'Soil Health & Nutrient', icon: 'fa-seedling', description: 'NPK, pH, amendments.' },
                  { id: 'crop_health_pest', index: 3, title: 'Crop Health & Pest', icon: 'fa-bug', description: 'Disease spread and treatment zones.' },
                  { id: 'irrigation_water', index: 4, title: 'Irrigation & Water', icon: 'fa-droplet', description: 'Moisture and watering schedule.' },
                  { id: 'fertilizer_chemical', index: 5, title: 'Fertilizer & Chemical', icon: 'fa-flask', description: 'Applications and compliance.' },
                  { id: 'yield_forecast_harvest', index: 6, title: 'Yield & Harvest', icon: 'fa-wheat-awn', description: 'Output forecast and harvest dates.' },
                  { id: 'market_price_financial', index: 7, title: 'Market & Financial', icon: 'fa-chart-line', description: 'Prices, ROI, profit margins.' },
                  { id: 'farm_operations_labor', index: 8, title: 'Operations & Labor', icon: 'fa-tractor', description: 'Machinery, fuel, daily tasks.' },
                ]).map((cat) => (
                  <div
                    key={cat.id}
                    className={`report-category-card ${selectedReportCat === cat.id ? 'active' : ''}`}
                    onClick={() => setSelectedReportCat(cat.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && setSelectedReportCat(cat.id)}
                  >
                    <div className="cat-index">Category {cat.index}</div>
                    <div className="cat-title">
                      <i className={`fa-solid ${cat.icon} text-emerald-400`}></i>
                      {cat.title}
                    </div>
                    <p className="cat-desc">{cat.description}</p>
                  </div>
                ))}
              </div>

              {reportBundle?.reports?.[selectedReportCat] && (
                <>
                  <p className="report-summary-line">{reportBundle.reports[selectedReportCat].summary}</p>
                  <div className="report-detail-panel">
                    <pre>{JSON.stringify(reportBundle.reports[selectedReportCat], null, 2)}</pre>
                  </div>
                </>
              )}

              {!reportBundle && !reportLoading && (
                <div className="empty-state" style={{ marginTop: '1rem' }}>
                  <i className="fa-solid fa-file-lines icon text-muted"></i>
                  <h4>No Reports Yet</h4>
                  <p className="text-sm text-muted">Configure farm GPS and crop, then click Generate All 8 Reports.</p>
                </div>
              )}
            </section>
          )}

          {activeView === 'view-history' && (
            <section className="view-section active animate-fade-in">
              <div className="empty-state">
                <i className="fa-solid fa-clock-rotate-left icon text-muted"></i>
                <h4>No Query History</h4>
                <p className="text-sm text-muted">Your past AI conversations and generated reports will appear here.</p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
