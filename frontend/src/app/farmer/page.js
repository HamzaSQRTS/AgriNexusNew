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
  const [activeView, setActiveView] = useState('view-analytics');
  const [user, setUser] = useState(null);
  
  const [files, setFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [selectedReportIdx, setSelectedReportIdx] = useState(0);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  useEffect(() => {
    setSelectedReportIdx(0);
  }, [analytics]);
  
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
      size: '—',
      date: u.timestamp
        ? new Date(u.timestamp).toLocaleDateString()
        : new Date().toLocaleDateString(),
      status: 'Processed',
      report_type: u.report_type || '—',
      confidence: u.confidence ? `${(u.confidence * 100).toFixed(0)}%` : '—',
    }));

  const refreshAnalytics = useCallback(async () => {
    try {
      const a = await apiRequest('/farmer/analytics');
      setAnalytics(a);
      if (a.recent_uploads?.length) {
        setFiles(uploadsToFileRows(a.recent_uploads));
      }
    } catch {
      setAnalytics({
        upload_count: 0,
        summary: null,
        charts: null,
        recent_uploads: [],
      });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshAnalytics();
  }, [user, refreshAnalytics]);

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
    try {
      for (const f of arr) {
        const fd = new FormData();
        fd.append('file', f);
        try {
          await apiRequest('/upload/file', { method: 'POST', body: fd });
          showToast(`${f.name} processed successfully.`);
        } catch (err) {
          showToast(err.message || 'Upload failed', true);
        }
      }
      await refreshAnalytics();
    } finally {
      setUploadBusy(false);
    }
  };

  const renderWeatherForecast = (forecast) => {
    if (!forecast || forecast.length === 0) return null;
    
    const getWeatherIcon = (cond) => {
      const c = cond.toLowerCase();
      if (c.includes('sunny') || c.includes('clear')) return 'fa-solid fa-sun text-yellow-400';
      if (c.includes('scattered') || c.includes('passing') || c.includes('cloud')) return 'fa-solid fa-cloud-sun text-teal-300';
      if (c.includes('rain') || c.includes('shower')) return 'fa-solid fa-cloud-showers-heavy text-blue-400';
      return 'fa-solid fa-cloud text-secondary';
    };

    return (
      <div className="w-full bg-slate-900/50 p-6 rounded-2xl border border-teal-500/20 mb-6 shadow-lg shadow-teal-500/5 animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="bg-teal-500/20 text-teal-400 p-2 rounded-lg"><i className="fa-solid fa-cloud-sun"></i></div>
          <h4 className="font-bold text-lg text-teal-400">7-Day Weather Forecast</h4>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4">
          {forecast.map((day, idx) => (
            <div key={idx} className="flex flex-col items-center p-4 bg-slate-950/60 rounded-xl border border-slate-800 hover:border-teal-500/30 transition-all duration-300">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{day.day}</span>
              <div className="my-3 text-2xl">
                <i className={getWeatherIcon(day.condition)}></i>
              </div>
              <span className="text-xs text-slate-300 text-center truncate w-full mb-2">{day.condition}</span>
              <div className="flex gap-2 text-sm font-bold mt-auto">
                <span className="text-teal-400">{day.High}°</span>
                <span className="text-slate-500">{day.Low}°</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderChartSection = (data, type, title, iconClass, color) => {
    const hasData = data && data.length > 0 && (type === 'bar_multi' ? data.some(d => d.High > 0) : data.some(d => d.value !== null && d.value > 0));
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

    const maxVal = type === 'bar_multi' 
      ? Math.max(...data.map(d => Math.max(d.High || 0, d.Low || 0)))
      : Math.max(...data.map(d => d.value || 0));
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
            ) : type === 'bar_multi' ? (
              <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} domain={domain} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }}
                />
                <Legend verticalAlign="top" height={36} iconType="circle"/>
                <Bar dataKey="High" fill={color[0]} radius={[4, 4, 0, 0]} barSize={15} name="High Temp (°F)" />
                <Bar dataKey="Low" fill={color[1]} radius={[4, 4, 0, 0]} barSize={15} name="Low Temp (°F)" />
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
          <button className={`nav-item ${activeView === 'view-analytics' ? 'active' : ''}`} onClick={() => setActiveView('view-analytics')}>
            <i className="fa-solid fa-chart-pie nav-icon"></i> Farm Analytics
          </button>
          <button className={`nav-item ${activeView === 'view-chat' ? 'active' : ''}`} onClick={() => setActiveView('view-chat')}>
            <i className="fa-solid fa-message nav-icon"></i> AI Advisory
          </button>
          <button className={`nav-item ${activeView === 'view-upload' ? 'active' : ''}`} onClick={() => setActiveView('view-upload')}>
            <i className="fa-solid fa-cloud-arrow-up nav-icon"></i> Data Upload
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
            {activeView === 'view-history' && <><i className="fa-solid fa-clock-rotate-left text-emerald-400 mr-2"></i> Query History</>}
          </div>
        </header>

        <div className="content-area">
          {activeView === 'view-analytics' && (() => {
            const activeReport = analytics?.reports && analytics.reports[selectedReportIdx] ? analytics.reports[selectedReportIdx] : null;
            return (
              <section className="view-section active animate-fade-in">
                {!analytics || analytics.upload_count === 0 ? (
                  <div className="empty-state">
                    <i className="fa-solid fa-chart-pie icon text-muted"></i>
                    <h4>Awaiting Farm Data</h4>
                    <p>Upload soil reports, weather CSVs, or disease images in <strong>Data Upload</strong>.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="text-xl font-bold">Dynamic Farm Intelligence</h3>
                        <p className="text-secondary text-sm">Based on <strong>{analytics.upload_count}</strong> documents. Active Report: <span className="badge badge-blue ml-2">{activeReport ? activeReport.report_type.replace('_', ' ') : analytics.summary?.latest_report_type?.replace('_', ' ')}</span></p>
                      </div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setShowRawJson(!showRawJson)}>
                        <i className={`fa-solid ${showRawJson ? 'fa-chart-column' : 'fa-code'} mr-2`}></i>
                        {showRawJson ? 'Show Visuals' : 'View Raw JSON'}
                      </button>
                    </div>

                    {/* REPORT SELECTION TABS */}
                    {analytics.reports && analytics.reports.length > 1 && (
                      <div className="chrome-tabs-container">
                        {analytics.reports.map((rep, idx) => {
                          const isActive = selectedReportIdx === idx;
                          return (
                            <button
                              key={idx}
                              onClick={() => setSelectedReportIdx(idx)}
                              className={`chrome-tab ${isActive ? 'active' : ''}`}
                            >
                              <div className="chrome-tab-icon">
                                <i className={`fa-solid ${
                                  rep.report_type === 'weather' ? 'fa-cloud-sun' :
                                  rep.report_type === 'geotechnical_soil' ? 'fa-mountain-sun' : 'fa-seedling'
                                }`}></i>
                              </div>
                              <div className="chrome-tab-details">
                                <span className="chrome-tab-filename">{rep.filename}</span>
                                <span className="chrome-tab-type">
                                  {rep.report_type.replace('_', ' ')}
                                </span>
                              </div>
                              {isActive && (
                                <span className="chrome-tab-status"></span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}

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
                            <h4 className="font-bold text-lg text-emerald-400">AI Farm Intelligence ({activeReport?.filename || 'Latest'})</h4>
                          </div>
                          <p className="text-sm leading-relaxed text-secondary whitespace-pre-line border-l-2 border-emerald-500/30 pl-4 py-1">
                            {(activeReport ? activeReport.ai_summary : analytics.summary?.latest_ai_summary) || "Processing intelligence..."}
                          </p>
                        </div>

                        <div className="charts-grid">
                          {activeReport?.report_type === 'weather' && (
                            <>
                              {renderWeatherForecast(activeReport.charts?.weather_forecast)}
                              {renderChartSection(activeReport.charts?.weather_forecast_chart, 'bar_multi', 'Weekly Temperature Trend', 'fa-solid fa-temperature-half text-teal-400', ['#2dd4bf', '#38bdf8'])}
                            </>
                          )}
                          {activeReport?.report_type === 'geotechnical_soil' && (
                            <>
                              {renderChartSection(activeReport.charts?.geotechnical_bar, 'bar', 'Physical Analysis', 'fa-solid fa-mountain-sun text-blue-400', '#3b82f6')}
                              {renderChartSection(activeReport.charts?.geotechnical_composition, 'pie', 'Grain Size Analysis', 'fa-solid fa-chart-pie text-emerald-400')}
                              {renderChartSection(activeReport.charts?.geotechnical_limits, 'bar', 'Atterberg Limits', 'fa-solid fa-vial text-yellow-400', '#fbbf24')}
                            </>
                          )}
                          {activeReport?.report_type === 'agriculture_soil' && (
                            renderChartSection(activeReport.charts?.agriculture_soil, 'bar', 'Soil Nutrient Profile', 'fa-solid fa-seedling text-emerald-400', '#10b981')
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </section>
            );
          })()}

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
                <h3 className="upload-title">{uploadBusy ? 'Processing Farm Data...' : 'Upload Farm Data & Reports'}</h3>
                <p className="upload-subtitle">Drag and drop files here, or click to browse</p>
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
