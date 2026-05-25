// frontend/src/app/admin/page.js
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getCurrentUser, logout, apiRequest } from '@/lib/api';

// Only load Chart.js on client side
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);

export default function AdminDashboard() {
  const router = useRouter();
  const [activeView, setActiveView] = useState('view-dashboard');
  const [user, setUser] = useState(null);
  const [users, setUsers] = useState([]);
  
  const activityChartRef = useRef(null);
  const queryTypeChartRef = useRef(null);
  const activityCanvasRef = useRef(null);
  const queryTypeCanvasRef = useRef(null);

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

    setUsers([
      { id: 1, name: 'Alice Farmer', email: 'alice@example.com', role: 'farmer', date: '2026-05-10', status: 'Active' },
      { id: 2, name: 'Bob Admin', email: 'bob@agrinexus.ai', role: 'admin', date: '2026-05-01', status: 'Active' },
      { id: 3, name: 'Charlie Green', email: 'charlie@farm.com', role: 'farmer', date: '2026-05-12', status: 'Pending' }
    ]);
    return () => { cancelled = true; };
  }, [router]);

  useEffect(() => {
    if (activeView === 'view-dashboard') {
      if (activityCanvasRef.current && !activityChartRef.current) {
        activityChartRef.current = new Chart(activityCanvasRef.current, {
          type: 'line',
          data: {
            labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
            datasets: [{
              label: 'Active Users',
              data: [65, 59, 80, 81, 56, 120],
              borderColor: '#10b981',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              tension: 0.4,
              fill: true
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } },
              x: { grid: { display: false }, border: { display: false } }
            }
          }
        });
      }
      
      if (queryTypeCanvasRef.current && !queryTypeChartRef.current) {
        queryTypeChartRef.current = new Chart(queryTypeCanvasRef.current, {
          type: 'doughnut',
          data: {
            labels: ['Disease OCR', 'Soil Analysis', 'Yield Forecast', 'General Chat'],
            datasets: [{
              data: [30, 45, 15, 10],
              backgroundColor: ['#3b82f6', '#10b981', '#f97316', '#8b5cf6'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '75%',
            plugins: { legend: { position: 'bottom', labels: { color: '#a1a1aa', padding: 20 } } }
          }
        });
      }
    }

    return () => {
      if (activityChartRef.current) { activityChartRef.current.destroy(); activityChartRef.current = null; }
      if (queryTypeChartRef.current) { queryTypeChartRef.current.destroy(); queryTypeChartRef.current = null; }
    };
  }, [activeView]);

  if (!user) return null; // Wait until mounted and user is loaded

  const initial = user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase();

  return (
    <div className="dashboard-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <Link href="/" className="sidebar-logo">
            <div className="sidebar-logo-icon"><i className="fa-solid fa-leaf"></i></div>
            <div className="sidebar-logo-text">AgriNexus<span>.Admin</span></div>
          </Link>
        </div>

        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activeView === 'view-dashboard' ? 'active' : ''}`} 
            onClick={() => setActiveView('view-dashboard')}
          >
            <i className="fa-solid fa-chart-line nav-icon"></i> System Overview
          </button>
          <button 
            className={`nav-item ${activeView === 'view-users' ? 'active' : ''}`} 
            onClick={() => setActiveView('view-users')}
          >
            <i className="fa-solid fa-users-gear nav-icon"></i> User Management
          </button>
          <button 
            className={`nav-item ${activeView === 'view-settings' ? 'active' : ''}`} 
            onClick={() => setActiveView('view-settings')}
          >
            <i className="fa-solid fa-sliders nav-icon"></i> AI Parameters
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-profile">
            <div className="user-avatar">{initial}</div>
            <div className="user-info">
              <div className="user-name truncate">{user.name || user.email}</div>
              <div className="user-role">Administrator</div>
            </div>
            <button className="logout-btn" onClick={logout} title="Sign Out">
              <i className="fa-solid fa-right-from-bracket"></i>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-title">
            {activeView === 'view-dashboard' && <><i className="fa-solid fa-chart-line text-emerald-400"></i> System Overview</>}
            {activeView === 'view-users' && <><i className="fa-solid fa-users-gear text-emerald-400"></i> User Management</>}
            {activeView === 'view-settings' && <><i className="fa-solid fa-sliders text-emerald-400"></i> AI Parameters</>}
          </div>
          <div className="flex items-center gap-3">
            <span className="badge badge-green"><div className="status-dot online"></div> System Online</span>
          </div>
        </header>

        <div className="content-area">
          {/* View: Overview Dashboard */}
          {activeView === 'view-dashboard' && (
            <section className="view-section active">
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon green"><i className="fa-solid fa-users"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">{users.length}</div>
                    <div className="stat-label">Total Users</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon blue"><i className="fa-solid fa-tractor"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">{users.filter(u => u.role === 'farmer').length}</div>
                    <div className="stat-label">Active Farmers</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon purple"><i className="fa-solid fa-message"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">1,429</div>
                    <div className="stat-label">AI Queries Today</div>
                  </div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon orange"><i className="fa-solid fa-file-invoice"></i></div>
                  <div className="stat-content">
                    <div className="stat-value">342</div>
                    <div className="stat-label">Files Processed</div>
                  </div>
                </div>
              </div>

              <div className="charts-grid">
                <div className="chart-card">
                  <div className="chart-header">
                    <h4 className="chart-title">System Activity (30 Days)</h4>
                  </div>
                  <div className="chart-container-wrapper">
                    <canvas ref={activityCanvasRef}></canvas>
                  </div>
                </div>
                <div className="chart-card">
                  <div className="chart-header">
                    <h4 className="chart-title">Query Types</h4>
                  </div>
                  <div className="chart-container-wrapper">
                    <canvas ref={queryTypeCanvasRef}></canvas>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* View: User Management */}
          {activeView === 'view-users' && (
            <section className="view-section active">
              <div className="table-card">
                <div className="table-toolbar">
                  <h4 className="font-bold text-sm">Registered Accounts</h4>
                  <div className="table-search">
                    <i className="fa-solid fa-magnifying-glass search-icon"></i>
                    <input type="text" className="form-input" placeholder="Search by name or email..." />
                  </div>
                </div>
                
                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Role</th>
                        <th>Joined Date</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map(u => (
                        <tr key={u.id}>
                          <td>
                            <div className="user-row-info">
                              <div className="user-row-avatar">{u.name.charAt(0)}</div>
                              <div>
                                <div className="font-bold">{u.name}</div>
                                <div className="text-sm text-muted">{u.email}</div>
                              </div>
                            </div>
                          </td>
                          <td><span className={`badge ${u.role === 'admin' ? 'badge-purple' : 'badge-green'}`}>{u.role}</span></td>
                          <td className="text-secondary">{u.date}</td>
                          <td>
                            <span className={`badge ${u.status === 'Active' ? 'badge-blue' : 'badge-yellow'}`}>
                              <div className={`status-dot ${u.status === 'Active' ? 'online' : ''}`} style={u.status !== 'Active' ? {background:'var(--orange-500)',boxShadow:'none'} : {}}></div> 
                              {u.status}
                            </span>
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" title="Edit User"><i className="fa-solid fa-pen"></i></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {/* View: Settings */}
          {activeView === 'view-settings' && (
            <section className="view-section active">
              <div className="empty-state">
                <i className="fa-solid fa-sliders icon text-muted"></i>
                <h4>AI Parameters</h4>
                <p>LLM temperature, retrieval bounds, and prompt templates can be configured here.</p>
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
