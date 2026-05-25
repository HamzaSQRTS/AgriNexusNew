// admin.js
import { setupCommonUI, apiRequest, showToast } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  setupCommonUI();

  // Sidebar Navigation
  const navItems = document.querySelectorAll('.sidebar-nav .nav-item');
  const viewSections = document.querySelectorAll('.view-section');
  const topbarTitle = document.getElementById('topbar-title');

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // Remove active from all nav items and views
      navItems.forEach(nav => nav.classList.remove('active'));
      viewSections.forEach(view => view.classList.remove('active'));

      // Add active to clicked item
      item.classList.add('active');
      const targetId = item.dataset.target;
      document.getElementById(targetId).classList.add('active');

      // Update Topbar Title
      topbarTitle.innerHTML = item.innerHTML;
    });
  });

  // Init Charts
  initCharts();
  
  // Load Users (Mock data for now, since we don't have an admin/users endpoint shown in auth.py)
  loadUsers();
});

function initCharts() {
  const ctxActivity = document.getElementById('activityChart');
  const ctxQuery = document.getElementById('queryTypeChart');

  if (ctxActivity) {
    new Chart(ctxActivity, {
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
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, border: { display: false } },
          x: { grid: { display: false }, border: { display: false } }
        }
      }
    });
  }

  if (ctxQuery) {
    new Chart(ctxQuery, {
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
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
          legend: { position: 'bottom', labels: { color: '#a1a1aa', padding: 20 } }
        }
      }
    });
  }
}

async function loadUsers() {
  const tableBody = document.getElementById('users-table-body');
  if (!tableBody) return;

  // Mock fetching users, since the backend might not have this endpoint implemented yet
  const mockUsers = [
    { id: 1, name: 'Alice Farmer', email: 'alice@example.com', role: 'farmer', date: '2026-05-10', status: 'Active' },
    { id: 2, name: 'Bob Admin', email: 'bob@agrinexus.ai', role: 'admin', date: '2026-05-01', status: 'Active' },
    { id: 3, name: 'Charlie Green', email: 'charlie@farm.com', role: 'farmer', date: '2026-05-12', status: 'Pending' }
  ];

  tableBody.innerHTML = '';
  document.getElementById('stat-total-users').textContent = mockUsers.length;
  document.getElementById('stat-farmers').textContent = mockUsers.filter(u => u.role === 'farmer').length;

  mockUsers.forEach(user => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="user-row-info">
          <div class="user-row-avatar">${user.name.charAt(0)}</div>
          <div>
            <div class="font-bold">${user.name}</div>
            <div class="text-sm text-muted">${user.email}</div>
          </div>
        </div>
      </td>
      <td><span class="badge ${user.role === 'admin' ? 'badge-purple' : 'badge-green'}">${user.role}</span></td>
      <td class="text-secondary">${user.date}</td>
      <td>
        <span class="badge ${user.status === 'Active' ? 'badge-blue' : 'badge-yellow'}">
          <div class="status-dot ${user.status === 'Active' ? 'online' : ''}" style="${user.status !== 'Active' ? 'background:var(--orange-500);box-shadow:none;' : ''}"></div> 
          ${user.status}
        </span>
      </td>
      <td>
        <button class="btn btn-ghost btn-sm" title="Edit User"><i class="fa-solid fa-pen"></i></button>
      </td>
    `;
    tableBody.appendChild(tr);
  });
}
